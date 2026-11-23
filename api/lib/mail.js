// Verificatiemail via Resend. Bij een ontbrekende key of een falende request
// laten we de aanvraag slagen en geven we de token terug aan de UI, zodat de
// speler ook lokaal zonder e-mailprovider kan verifiëren.

const RESEND_URL = 'https://api.resend.com/emails';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function devFallback(token) {
  return { sent: false, devToken: token, devLink: `#/verify/${token}` };
}

export async function sendVerificationEmail({ email, token } = {}) {
  // De link is altijd relatief t.o.v. de SPA (hash-router), ook in dev.
  const link = `${process.env.ZERON_BASE_URL || ''}/#/verify/${token}`;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) return devFallback(token);

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.ZERON_EMAIL_FROM || 'onboarding@resend.dev',
        to: email,
        subject: 'Bevestig je ZERON-account',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#e8f7ff;background:#080d16;padding:32px;border:1px solid #1c3a4d">
            <h1 style="letter-spacing:.2em;color:#39f6ff">ZERON</h1>
            <p>Bevestig je e-mailadres om je account te activeren.</p>
            <p><a href="${escapeHtml(link)}" style="color:#39f6ff">Bevestig mijn account</a></p>
            <p>Deze link is 24 uur geldig. Als jij dit niet was, kun je deze mail negeren.</p>
          </div>`,
        text: `Bevestig je ZERON-account: ${link}\nDeze link is 24 uur geldig.`,
      }),
    });
    // Geen logging van response-body: die kan de token bevatten.
    if (!response.ok) return devFallback(token);
    return { sent: true };
  } catch {
    // Netwerkfout of timeout: nooit de aanmelding zelf laten mislukken.
    return devFallback(token);
  }
}
