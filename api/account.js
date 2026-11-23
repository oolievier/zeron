// HTTP-laag voor accounts. GET is alleen voor 'me'; alle mutaties gaan via POST.
// Fouten met status 400/401/403/409 komen uit api/lib/accounts.js en lopen via
// handleErrors netjes als { ok:false, message } naar de client.

import { send, body, handleErrors } from './lib/http.js';
import {
  registerAccount,
  verifyAccount,
  resendVerification,
  loginAccount,
  getSessionAccount,
  logoutSession,
  saveRun,
  publicAccount,
} from './lib/accounts.js';

function sessionTokenFrom(req, payload) {
  const header = req.headers?.['x-zeron-session'];
  const rawHeader = Array.isArray(header) ? header[0] : header;
  if (typeof rawHeader === 'string' && rawHeader.trim()) return rawHeader.trim();

  // Gemak voor clients die de sessie liever in de body meesturen.
  const candidate = payload?.session;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  if (candidate && typeof candidate === 'object' && typeof candidate.token === 'string' && candidate.token.trim()) {
    return candidate.token.trim();
  }
  return null;
}

// In dev (zonder Resend-key) krijgt de UI een werkende verificatieknop mee.
function withDevVerification(result, verification) {
  if (!verification || verification.sent || !verification.devToken) return result;
  return { ...result, devToken: verification.devToken, devLink: verification.devLink };
}

export default async function handler(req, res) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      return send(res, 405, { ok: false, message: 'Method not allowed.' });
    }

    const url = new URL(req.url || '/', 'http://localhost');
    let payload = {};
    if (method === 'POST') {
      const parsed = await body(req);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
    }

    const action = (method === 'POST'
      ? payload.action || url.searchParams.get('action')
      : url.searchParams.get('action') || 'me') || 'me';

    if (method === 'GET') {
      if (action !== 'me') return send(res, 400, { ok: false, message: 'Onbekende actie.' });
      const { account, key } = await getSessionAccount(sessionTokenFrom(req, payload));
      return send(res, 200, { ok: true, account: publicAccount(account, key) });
    }

    const sessionToken = sessionTokenFrom(req, payload);

    switch (action) {
      case 'register': {
        const { account, verification } = await registerAccount(payload);
        return send(res, 200, withDevVerification({
          ok: true,
          account,
          verification,
          message: verification.sent
            ? 'Controleer je inbox om je account te bevestigen.'
            : 'Gebruik de knop hieronder om je account te bevestigen.',
        }, verification));
      }
      case 'verify': {
        const result = await verifyAccount(payload.token || url.searchParams.get('token'));
        return send(res, 200, { ok: true, ...result });
      }
      case 'resend': {
        const result = await resendVerification(payload);
        return send(res, 200, withDevVerification({ ok: true, ...result }, result.verification));
      }
      case 'login': {
        const result = await loginAccount(payload);
        return send(res, 200, { ok: true, ...result });
      }
      case 'me': {
        const { account, key } = await getSessionAccount(sessionToken);
        return send(res, 200, { ok: true, account: publicAccount(account, key) });
      }
      case 'saveRun': {
        const result = await saveRun(payload, sessionToken);
        return send(res, 200, { ok: true, ...result });
      }
      case 'logout': {
        await logoutSession(sessionToken);
        return send(res, 200, { ok: true });
      }
      default:
        return send(res, 400, { ok: false, message: 'Onbekende actie.' });
    }
  } catch (error) {
    return handleErrors(res, error);
  }
}
