// One-line error description that is safe for public logs (GitHub Actions on
// a public repo). Keeps what explains a failure (class, HTTP status, message,
// cause, a few stack frames) and redacts what could identify a person.
//
// SDK error messages (Gemini, Groq, Supabase, IMAP) describe the request, not
// its content, but some echo server responses; redaction is the safety net.

const MAX_MESSAGE_CHARS = 300;
const MAX_STACK_FRAMES = 5;

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return `non-error thrown: ${redact(String(error)).slice(0, MAX_MESSAGE_CHARS)}`;

  // constructor.name, not .name: most SDK errors leave .name as "Error".
  const kind = error.constructor?.name && error.constructor.name !== "Error" ? error.constructor.name : error.name;
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;

  const parts = [kind];
  if (typeof status === "number") parts.push(`status=${status}`);
  if (typeof code === "string" || typeof code === "number") parts.push(`code=${code}`);
  parts.push(`message="${redact(error.message).slice(0, MAX_MESSAGE_CHARS)}"`);

  // fetch failures hide the real reason (ECONNRESET, ETIMEDOUT) in .cause.
  if (error.cause instanceof Error) {
    const causeCode = (error.cause as { code?: unknown }).code;
    parts.push(`cause=${error.cause.name}${causeCode ? `(${causeCode})` : ""}: "${redact(error.cause.message).slice(0, 150)}"`);
  }

  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => line.trim().startsWith("at "))
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => line.trim().replace(/^at /, "").replace(/file:\/\/\/?[^\s)]*?(?=(lib|workers|node_modules)[\\/])/g, ""));
  if (frames.length) parts.push(`at ${frames.join(" <- ")}`);

  return parts.join(" ");
}

function redact(text: string) {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b(key|token|password|secret)=[^\s&]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ");
}
