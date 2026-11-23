// Verificatiemail via SMTP (werkt zonder eigen domein) of via Resend.
// Zonder configuratie — of als de provider faalt — laten we de registratie
// slagen en geven we de token aan de UI, zodat verifiëren altijd kan.

import nodemailer from 'nodemailer';

const RESEND_URL = 'https://api.resend.com/emails';

function env(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function smtpConfig() {
  const host = env('ZERON_SMTP_HOST');
  const user = env('ZERON_SMTP_USER');
  const pass = env('ZERON_SMTP_PASS');
  if (!host || !user || !pass) return null;

  const port = Number(env('ZERON_SMTP_PORT') || '587');
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  const secureFlag = env('ZERON_SMTP_SECURE');
  const secure = secureFlag === null
    ? port === 465
    : /^(1|true|yes)$/i.test(secureFlag);

  return {
    host,
    port,
    secure,
    auth: { user, pass },
    from: env('ZERON_SMTP_FROM') || user,
  };
}

// SMTP heeft prioriteit: het is de enige optie die zonder eigen domein naar
// willekeurige ontvangers kan mailen. Daarna volgt Resend, dan de dev-link.
export function mailProvider() {
  if (smtpConfig()) return 'smtp';
  if (env('RESEND_API_KEY')) return 'resend';
  return 'dev';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function devFallback(token, attempted) {
  return {
    sent: false,
    devToken: token,
    devLink: `#/verify/${token}`,
    ...(attempted ? { attempted } : {}),
  };
}

function content(link) {
  return {
    subject: 'Bevestig je ZERON-account',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#e8f7ff;background:#080d16;padding:32px;border:1px solid #1c3a4d">
        <h1 style="letter-spacing:.2em;color:#39f6ff">ZERON</h1>
        <p>Bevestig je e-mailadres om je account te activeren.</p>
        <p><a href="${escapeHtml(link)}" style="color:#39f6ff">Bevestig mijn account</a></p>
        <p>Deze link is 24 uur geldig. Als jij dit niet was, kun je deze mail negeren.</p>
      </div>`,
    text: `Bevestig je ZERON-account: ${link}\nDeze link is 24 uur geldig.`,
  };
}

export async function sendVerificationEmail({ email, token, transport } = {}) {
  // De link is altijd relatief t.o.v. de SPA (hash-router), ook in dev.
  const link = `${env('ZERON_BASE_URL') || ''}/#/verify/${token}`;
  const message = content(link);

  const config = smtpConfig();
  if (config) {
    try {
      const { from, ...options } = config;
      const mailer = transport || nodemailer.createTransport(options);
      await mailer.sendMail({ from, to: email, ...message });
      return { sent: true, provider: 'smtp' };
    } catch {
      // Geen SMTP-fout naar de client lekken; de knop blijft beschikbaar.
      return devFallback(token, 'smtp');
    }
  }

  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) return devFallback(token);

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env('ZERON_EMAIL_FROM') || 'onboarding@resend.dev',
        to: email,
        ...message,
      }),
    });
    // Geen logging van response-body: die kan de token bevatten.
    if (!response.ok) return devFallback(token, 'resend');
    return { sent: true, provider: 'resend' };
  } catch {
    // Netwerkfout of timeout: nooit de aanmelding zelf laten mislukken.
    return devFallback(token, 'resend');
  }
}
