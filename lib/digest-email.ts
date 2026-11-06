// Daily digest email (SPEC pipeline stage 6): the top matches, as HTML and
// plain text. Every value comes from a public job board or an LLM, so all of
// it is escaped; a job title must not be able to inject markup or links.

export type DigestItem = {
  title: string;
  company: string | null;
  location: string | null;
  fitScore: number;
  reasoning: string | null;
  url: string | null;
};

export function buildDigestEmail(items: DigestItem[], appUrl: string, date = new Date()) {
  const day = date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
  const subject = `Matchie: ${items.length} new job match${items.length === 1 ? "" : "es"} for ${day}`;
  const dashboardUrl = `${appUrl.replace(/\/+$/, "")}/dashboard`;
  const trackerUrl = `${appUrl.replace(/\/+$/, "")}/tracker`;

  const rows = items
    .map((item) => {
      const meta = [item.company, item.location]
        .filter((part): part is string => !!part)
        .map(escapeHtml)
        .join(" · ");
      const title = safeUrl(item.url)
        ? `<a href="${escapeHtml(item.url!)}" style="color:#ea580c;text-decoration:none">${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #e5e7eb">
  <div style="font-size:16px;font-weight:600">${title}</div>
  ${meta ? `<div style="color:#6b7280;font-size:13px;margin-top:2px">${meta}</div>` : ""}
  ${item.reasoning ? `<div style="font-size:14px;margin-top:6px">${escapeHtml(item.reasoning)}</div>` : ""}
</td><td style="padding:14px 0 14px 12px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top">
  <span style="display:inline-block;background:${scoreColor(item.fitScore)};color:#fff;border-radius:999px;padding:3px 10px;font-weight:700;font-size:14px">${item.fitScore}</span>
</td></tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <h1 style="font-size:20px;margin:0 0 4px">Your top matches today</h1>
  <p style="color:#6b7280;margin:0 0 16px;font-size:14px">New jobs from the boards Matchie watches, ranked by fit score.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:12px;padding:0 16px">
${rows}
  </table>
  <p style="margin:20px 0 0;font-size:14px">
    <a href="${escapeHtml(dashboardUrl)}" style="color:#ea580c">Open Matchie</a> ·
    <a href="${escapeHtml(trackerUrl)}" style="color:#ea580c">Your tracker</a>
  </p>
</div>
</body></html>`;

  const text = [
    "Your top matches today",
    ...items.map((item) =>
      [`[${item.fitScore}] ${item.title}`, [item.company, item.location].filter(Boolean).join(" · "), item.reasoning ?? "", safeUrl(item.url) ? item.url! : ""]
        .filter(Boolean)
        .join("\n"),
    ),
    `Open Matchie: ${dashboardUrl}`,
  ].join("\n\n");

  return { subject, html, text };
}

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Only http(s) links; a board could hand back javascript: or data: URLs.
function safeUrl(url: string | null): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

function scoreColor(score: number) {
  return score >= 80 ? "#16a34a" : score >= 65 ? "#ea580c" : "#6b7280";
}
