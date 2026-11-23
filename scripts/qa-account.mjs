// Browser QA voor accounts + fout-antwoorden (mockt /api/account in het geheugen).
// Usage: npm run dev -- --port 4173, dan LD_LIBRARY_PATH=... node scripts/qa-account.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.QA_BASE || 'http://localhost:4173';
const out = '/tmp/opencode/zeron-shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

const accounts = new Map();
const sessions = new Map();
const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/api/questions') {
    return route.fulfill(json({ ok: true, items: [], library: { total: 224, base: 224, community: 0 }, categories: {} }));
  }
  if (url.pathname === '/api/health') {
    return route.fulfill(json({ ok: true, storage: 'mock', questions: 224 }));
  }
  if (url.pathname !== '/api/account') return route.fulfill(json({ ok: false, message: 'unhandled' }, 404));

  const body = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : {};
  const token = request.headers()['x-zeron-session'] || '';
  const accountFor = () => {
    const id = sessions.get(token);
    return id ? accounts.get(id) : null;
  };
  if (request.method() === 'GET') {
    const account = accountFor();
    return route.fulfill(account ? json({ ok: true, account }) : json({ ok: false, message: 'Niet ingelogd.' }, 401));
  }
  switch (body.action) {
    case 'register': {
      const email = String(body.email || '').toLowerCase();
      if (accounts.has(email)) return route.fulfill(json({ ok: false, message: 'E-mail bestaat al.' }, 409));
      const devToken = `dev-${Math.random().toString(16).slice(2)}`;
      const account = { email, name: body.name, verified: false, createdAt: new Date().toISOString(), stats: { best: 0, plays: 0, streak: 0 }, devToken };
      accounts.set(email, account);
      return route.fulfill(json({ ok: true, message: 'Verificatie verzonden.', devToken, devLink: `#/verify/${devToken}` }));
    }
    case 'verify': {
      const account = [...accounts.values()].find((item) => item.devToken === body.token);
      if (!account) return route.fulfill(json({ ok: false, message: 'Ongeldige token.' }, 403));
      account.verified = true;
      const session = `sess-${Math.random().toString(16).slice(2)}`;
      sessions.set(session, account.email);
      return route.fulfill(json({ ok: true, account, session }));
    }
    case 'login': {
      const account = accounts.get(String(body.email || '').toLowerCase());
      if (!account) return route.fulfill(json({ ok: false, message: 'Onbekende e-mail.' }, 401));
      if (!account.verified) return route.fulfill(json({ ok: false, message: 'Verifieer eerst je e-mail.' }, 403));
      const session = `sess-${Math.random().toString(16).slice(2)}`;
      sessions.set(session, account.email);
      return route.fulfill(json({ ok: true, account, session }));
    }
    case 'saveRun': {
      const account = accountFor();
      if (!account) return route.fulfill(json({ ok: false, message: 'Niet ingelogd.' }, 401));
      account.stats.plays += 1;
      account.stats.best = Math.max(account.stats.best, body.score || 0);
      return route.fulfill(json({ ok: true, account }));
    }
    case 'logout':
      sessions.delete(token);
      return route.fulfill(json({ ok: true }));
    default:
      return route.fulfill(json({ ok: false, message: 'Onbekende actie.' }, 400));
  }
});

async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(name, '→', `${out}/${name}.png`);
}

await page.goto(`${base}/#/account`, { waitUntil: 'networkidle' });
await page.waitForSelector('#register-form');
await shot('account-forms');

await page.locator('#register-form input[name="name"]').fill('NOVA_77');
await page.locator('#register-form input[name="email"]').fill('qa@grid.net');
await page.locator('#register-form input[name="password"]').fill('cyberpunk99');
await page.locator('#register-form button[type="submit"]').click();
await page.waitForSelector('.verify-box a[href^="#/verify"]');
await shot('account-verify');

await page.locator('.verify-box a[href^="#/verify"]').click();
await page.waitForSelector('.account-profile');
const pill = await page.locator('.verify-pill').textContent();
if (!pill?.includes('GEVERIFIEERD')) throw new Error(`Verificatiepill klopt niet: ${pill}`);
await shot('account-profile');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.account-profile');
console.log('session restore OK');

await page.locator('[data-act="account-logout"]').click();
await page.waitForSelector('#login-form');
console.log('logout OK');

// Fout antwoord: eerst drie retries in dezelfde vraag, pas daarna rood Fout-label.
await page.goto(`${base}/#/setup`, { waitUntil: 'networkidle' });
await page.locator('input[value="blitz"]').check();
await page.locator('button[type="submit"]').click();
await page.waitForSelector('#answer-input');
for (const left of ['3', '2', '1']) {
  await page.locator('#answer-input').fill('deze bestaat echt niet');
  await page.locator('#answer-form button[type="submit"]').click();
  await page.waitForFunction(
    (expected) => document.querySelector('.retry-count')?.textContent.trim().startsWith(expected),
    left,
  );
}
await shot('retry-feedback');
await page.locator('#answer-input').fill('deze bestaat echt niet');
await page.locator('#answer-form button[type="submit"]').click();
await page.waitForSelector('.wrong-card');
const points = await page.locator('.reveal-top .points-pop').textContent();
const label = await page.locator('.reveal-card .badge').textContent();
if (points?.trim() !== '0') throw new Error(`Fout antwoord gaf punten: ${points}`);
if (!label?.toLowerCase().includes('fout')) throw new Error(`Fout label mist: ${label}`);
await page.waitForTimeout(400);
await shot('wrong-reveal');
console.log('wrong answer OK:', points.trim(), label.trim());

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exitCode = 1;
