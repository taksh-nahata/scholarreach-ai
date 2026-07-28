/**
 * Scalable transactional email via Resend (platform mail).
 * Not Gmail SMTP / Apps Script — those hit Google's personal daily caps.
 *
 * From: verified platform domain (RESEND_FROM)
 * Reply-To: the student's real email so professors reply to them
 */
export function isPlatformMailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendViaResend(opts: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  replyTo: string;
  fromName?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM;
  if (!apiKey || !fromAddr) {
    throw new Error(
      "Platform mail not configured. Set RESEND_API_KEY and RESEND_FROM on the server."
    );
  }

  const fromName = opts.fromName || "ScholarReach";
  const from = fromAddr.includes("<")
    ? fromAddr
    : `${fromName} <${fromAddr}>`;

  const html =
    opts.htmlBody ||
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.6;color:#222">${opts.body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")}</div>`;

  const payload: Record<string, unknown> = {
    from,
    to: [opts.to],
    subject: opts.subject,
    text: opts.body,
    html,
    reply_to: opts.replyTo,
  };
  if (opts.cc) {
    payload.cc = opts.cc.split(",").map((s) => s.trim()).filter(Boolean);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.message || data.name || `Resend error ${res.status}`
    );
  }

  return { id: data.id || `resend-${Date.now()}` };
}
