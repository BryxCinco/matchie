// LLM-drafted follow-up for a ghosted application. Server and workers only
// (imports the LLM router).
//
// PII: the prompt holds only the job title, company, stage and dates. The
// candidate's name is never put in; the draft signs off with a placeholder
// the candidate fills in. knownNames still goes to callLLM, so a name that
// slipped into a job title would be scrubbed too.
//
// Imported by a worker: relative imports with .ts only (see CLAUDE.md).

import { z } from "zod";
import { callLLM } from "./llm-router.ts";
import { SIGNATURE_PLACEHOLDER, type FollowUpContext, type FollowUpDraft } from "./follow-up-template.ts";

const DraftSchema = z.object({
  subject: z.string().min(1).max(150).describe("Email subject line"),
  body: z.string().min(1).max(2_000).describe("Email body, plain text, with blank lines between paragraphs"),
});

export function buildFollowUpPrompt(context: FollowUpContext, now = new Date()) {
  const days = context.appliedAt ? Math.max(0, Math.round((now.getTime() - Date.parse(context.appliedAt)) / 86_400_000)) : null;
  return `Write a short, polite follow-up email from a job candidate who has not heard back from a company.

Facts (use only these; do not invent names, dates, interviewers or details):
- Role: ${context.title}
- Company: ${context.company ?? "not known; refer to \"your team\""}
- Last stage reached: ${context.lastStage ?? "applied"}
- Days since applying: ${days ?? "not known"}

Rules:
- 60 to 120 words. Warm and professional, not pushy, no apology for following up.
- Greet with "Hello," (the recipient's name is not known).
- Mention the role and, if the last stage was an interview or assessment, that step.
- Reaffirm interest in one sentence and ask about next steps.
- End with "Best regards," then ${SIGNATURE_PLACEHOLDER} on its own line. Do not write any other name.
- Plain text, no markdown, no placeholders other than ${SIGNATURE_PLACEHOLDER}.`;
}

export async function draftFollowUp(context: FollowUpContext, options: { knownNames?: string[] } = {}): Promise<FollowUpDraft> {
  const { result } = await callLLM(buildFollowUpPrompt(context), DraftSchema, { knownNames: options.knownNames });
  return { subject: result.subject.trim(), body: result.body.trim() };
}
