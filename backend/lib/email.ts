import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
const resend = apiKey ? new Resend(apiKey) : null;

export function emailConfigured(): boolean {
  return Boolean(resend && from);
}

export async function sendReminderEmail(params: {
  to: string;
  courseLabel: string;
  startUrl: string;
}): Promise<{ sent: boolean }> {
  if (!emailConfigured()) {
    console.log('[email] Resend not configured; skipping email');
    return { sent: false };
  }

  const { to, courseLabel, startUrl } = params;

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

  const { data, error } = await resend!.emails.send({
    from: from!,
    to,
    subject: `Time to practice — ${courseLabel}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.name} — ${error.message}`);
  }

  void data; // id is available but not needed here
  return { sent: true };
}
