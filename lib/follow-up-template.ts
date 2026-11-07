// Follow-up email for a ghosted application: the plain template. Used by the
// tracker when no LLM draft exists yet, and by the ghosting checker as the
// fallback when drafting fails. No LLM imports here: this file is bundled
// into the browser.

export type FollowUpContext = {
  title: string;
  company: string | null;
  /** Stage the application was in before it went quiet, e.g. "interview". */
  lastStage: string | null;
  /** When the candidate applied (ISO), if known. */
  appliedAt: string | null;
};

export type FollowUpDraft = { subject: string; body: string };

/** Where the candidate signs. Left for them to fill in: the name never goes through an LLM. */
export const SIGNATURE_PLACEHOLDER = "[Your name]";

export function followUpTemplate(context: FollowUpContext): FollowUpDraft {
  const company = context.company ?? "your team";
  const stage =
    context.lastStage === "interview" || context.lastStage === "final"
      ? "our recent conversation"
      : context.lastStage === "assessment"
        ? "the assessment I completed"
        : "my application";
  const when = context.appliedAt ? ` on ${formatDate(context.appliedAt)}` : "";

  return {
    subject: `Following up: ${context.title}`,
    body: [
      "Hello,",
      `I hope you're well. I'm following up on ${stage} for the ${context.title} role at ${company}${stage === "my application" ? when : ""}.`,
      `I'm still very interested in the position and would be glad to share anything else that would help. Could you let me know if there are any updates on the next steps?`,
      "Thank you for your time.",
      `Best regards,\n${SIGNATURE_PLACEHOLDER}`,
    ].join("\n\n"),
  };
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric" });
}
