export async function sendPasswordResetEmail(
  to: string,
  code: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const from = process.env.EMAIL_FROM || "OFFY <noreply@cloudfy.shop>";
  const digits = code.split("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:32px 16px;background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:440px;margin:0 auto;background:#111114;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px 24px;text-align:center;">
    <div style="font-size:16px;font-weight:700;letter-spacing:0.06em;margin-bottom:20px;color:#ffffff;">OFFY</div>
    <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;color:#ffffff;">Redefinição de senha</h1>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px;line-height:1.5;">
      Use o código abaixo no aplicativo OFFY para criar uma nova senha. Ele expira em <strong>15 minutos</strong>.
    </p>
    <div style="display:inline-flex;gap:8px;margin-bottom:24px;">
      ${digits
        .map(
          (d) =>
            `<span style="display:inline-block;width:42px;height:52px;line-height:52px;border-radius:10px;background:#18181b;border:1px solid rgba(255,255,255,0.12);font-family:monospace;font-size:24px;font-weight:700;color:#ffffff;">${d}</span>`,
        )
        .join("")}
    </div>
    <p style="font-size:12px;color:#71717a;margin:0;">
      Se você não solicitou a troca de senha, ignore este e-mail.
    </p>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `OFFY • Seu código de verificação: ${code}`,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend failed (${res.status}): ${errText}`);
  }
}
