// Reminders are sent via Brevo's HTTP API (https://www.brevo.com) rather than
// SMTP, because Render's free tier blocks outbound SMTP ports (25/465/587).
// The HTTP API runs over 443, so it works on the free plan, and Brevo lets you
// send from a single verified sender address — no custom domain required.
//
// Configure with:
//   BREVO_API_KEY   a Brevo "API key" (Settings → SMTP & API → API Keys)
//   EMAIL_FROM      the verified sender, e.g. "SolveX <tratechexamsim@gmail.com>"
// Until BREVO_API_KEY + EMAIL_FROM are set, sending is a no-op.
const apiKey = process.env.BREVO_API_KEY;
const fromRaw = process.env.EMAIL_FROM;

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export function emailConfigured(): boolean {
  return Boolean(apiKey && fromRaw);
}

/** Parse `EMAIL_FROM` ("Name <email>" or "email") into Brevo's sender shape. */
function parseSender(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  if (m) return { name: m[1] || 'SolveX', email: m[2] };
  return { name: 'SolveX', email: raw.trim() };
}

export async function sendReminderEmail(params: {
  to: string;
  courseLabel: string;
  startUrl: string;
}): Promise<{ sent: boolean }> {
  if (!emailConfigured()) {
    console.log('[email] Brevo not configured; skipping email');
    return { sent: false };
  }

  const { to, courseLabel, startUrl } = params;
  const sender = parseSender(fromRaw!);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;padding:40px;max-width:560px;">
          <tr>
            <td style="font-size:18px;color:#111827;font-weight:bold;padding-bottom:16px;">
              Time to practice
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;color:#374151;line-height:1.6;padding-bottom:32px;">
              It's time for your scheduled practice — <strong>${courseLabel}</strong>.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <a href="${startUrl}"
                 style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:15px;
                        font-weight:600;text-decoration:none;padding:14px 32px;border-radius:6px;">
                Begin practice
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">
              You're receiving this because you set up a scheduled practice reminder.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': apiKey!,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject: `Time to practice — ${courseLabel}`,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo error ${res.status}: ${detail}`);
  }

  return { sent: true };
}
