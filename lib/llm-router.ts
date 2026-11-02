// LLM router: Gemini first, Groq only when Gemini is rate-limited (429) or
// down (5xx). Every prompt goes through scrubPII() before it leaves the
// server, and placeholders in the answer are restored with unscrubPII().
//
// Runs in Route Handlers and in workers/, so no Next.js-only imports here.

import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import Groq, { APIError as GroqAPIError } from "groq-sdk";
import { z } from "zod";
// Relative, not "@/": workers run this file with plain Node, which does not
// know the tsconfig path alias.
import { scrubPII, unscrubPII } from "./pii-scrubber.ts";

export type LLMProvider = "gemini" | "groq";

export type CallLLMOptions = {
  /** Passed to scrubPII so the user's own name is always removed. */
  knownNames?: string[];
  /** Per request, per provider. Keep it short in Route Handlers (Vercel Hobby
   * functions time out at 10s); workers can afford longer. */
  timeoutMs?: number;
};

// Overridable so a retired model is a config change, not a deploy.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const DEFAULT_TIMEOUT_MS = 30_000;

/** The model answered, but not with JSON that matches the schema, even after one repair attempt. */
// No constructor parameter properties: Node's type stripping (workers, tests)
// does not support them.
export class LLMValidationError extends Error {
  readonly provider: LLMProvider;
  readonly issues: string;

  constructor(provider: LLMProvider, issues: string) {
    super(`${provider} returned JSON that does not match the schema: ${issues}`);
    this.name = "LLMValidationError";
    this.provider = provider;
    this.issues = issues;
  }
}

export async function callLLM<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: CallLLMOptions = {},
): Promise<{ result: T; provider: LLMProvider }> {
  // CRITICAL: nothing below this line may see the unscrubbed prompt.
  const { scrubbed, map } = scrubPII(prompt, { knownNames: options.knownNames });
  const fullPrompt = withSchemaInstructions(scrubbed, schema);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const result = await generateValidated("gemini", fullPrompt, schema, map, timeoutMs);
    return { result, provider: "gemini" };
  } catch (error) {
    if (!isRetryableUpstreamError(error)) throw error;
    console.warn(`[llm-router] gemini unavailable (${describeError(error)}), falling back to groq`);
  }

  const result = await generateValidated("groq", fullPrompt, schema, map, timeoutMs);
  return { result, provider: "groq" };
}

// Asks once, and if the answer fails validation, asks once more with the
// errors attached. The repair call goes to the same provider.
async function generateValidated<T>(
  provider: LLMProvider,
  prompt: string,
  schema: z.ZodType<T>,
  map: Record<string, string>,
  timeoutMs: number,
): Promise<T> {
  const started = Date.now();
  const first = parseAndValidate(await generate(provider, prompt, timeoutMs), schema, map);
  if (first.ok) {
    logSuccess(provider, started, 1);
    return first.value;
  }

  console.warn(`[llm-router] ${provider} response failed validation, retrying once: ${first.issues}`);
  const repairPrompt =
    `${prompt}\n\nYour previous answer was invalid: ${first.issues}\n` +
    "Return ONLY valid JSON matching the schema above. No prose, no markdown fences.";

  const second = parseAndValidate(await generate(provider, repairPrompt, timeoutMs), schema, map);
  if (second.ok) {
    logSuccess(provider, started, 2);
    return second.value;
  }
  throw new LLMValidationError(provider, second.issues);
}

async function generate(provider: LLMProvider, prompt: string, timeoutMs: number): Promise<string> {
  return provider === "gemini" ? generateGemini(prompt, timeoutMs) : generateGroq(prompt, timeoutMs);
}

async function generateGemini(prompt: string, timeoutMs: number): Promise<string> {
  const model = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY")).getGenerativeModel(
    {
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    },
    { timeout: timeoutMs },
  );
  const response = await model.generateContent(prompt);
  return response.response.text();
}

async function generateGroq(prompt: string, timeoutMs: number): Promise<string> {
  // maxRetries 1: this is already the fallback; don't stack long backoffs on
  // top of a failed Gemini call.
  const groq = new Groq({ apiKey: requireEnv("GROQ_API_KEY"), timeout: timeoutMs, maxRetries: 1 });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("groq returned an empty response");
  return content;
}

// --- Helpers ----------------------------------------------------------------

// The schema goes into the prompt as JSON Schema. Both providers' JSON modes
// only guarantee syntactically valid JSON, not this shape; Zod checks the shape.
// Groq's json_object mode also requires the word "JSON" in the prompt.
function withSchemaInstructions(prompt: string, schema: z.ZodType) {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema), null, 2);
  return `${prompt}\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n${jsonSchema}`;
}

type Validation<T> = { ok: true; value: T } | { ok: false; issues: string };

// Parse first, then unscrub string values, then validate. Unscrubbing the raw
// string before JSON.parse would break the JSON whenever an original value
// contains a quote or a newline.
function parseAndValidate<T>(raw: string, schema: z.ZodType<T>, map: Record<string, string>): Validation<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return { ok: false, issues: "response is not valid JSON" };
  }

  const result = schema.safeParse(unscrubDeep(parsed, map));
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, issues: z.prettifyError(result.error) };
}

function unscrubDeep(value: unknown, map: Record<string, string>): unknown {
  if (typeof value === "string") return unscrubPII(value, map);
  if (Array.isArray(value)) return value.map((item) => unscrubDeep(item, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unscrubDeep(v, map)]));
  }
  return value;
}

// JSON mode should prevent fences, but models occasionally add them anyway.
function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof GoogleGenerativeAIFetchError) return error.status;
  if (error instanceof GroqAPIError) return error.status;
  return undefined;
}

// Only rate limits and server errors justify a second provider. A 400 (bad
// request) or 403 (bad key) would fail on Groq for the same reason, and a
// validation failure means Gemini is up and answering.
function isRetryableUpstreamError(error: unknown) {
  const status = statusOf(error);
  return status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

function describeError(error: unknown) {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : String(error);
  return status ? `HTTP ${status}` : message;
}

// Logs provider, model, timing and attempts only. Never the prompt or the
// response: even scrubbed, they are user data.
function logSuccess(provider: LLMProvider, started: number, attempts: number) {
  const model = provider === "gemini" ? GEMINI_MODEL : GROQ_MODEL;
  console.info(`[llm-router] provider=${provider} model=${model} attempts=${attempts} ms=${Date.now() - started}`);
}

function requireEnv(name: "GEMINI_API_KEY" | "GROQ_API_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
