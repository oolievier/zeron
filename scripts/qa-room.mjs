// End-to-end room check with the real room engine in-memory behind intercepted API routes.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { act, getRoom } from '../api/lib/rooms.js';
import { CATEGORIES, QUESTIONS } from '../src/data/questions.js';

const base = process.env.QA_BASE || 'http://localhost:4173';
const out = '/tmp/opencode/zeron-shots';
mkdirSync(out, { recursive: true });

function apiMock(page) {
  return page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/questions') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], library: { total: 424, base: 424, community: 0 }, categories: CATEGORIES }) });
    }
    if (url.pathname === '/api/health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, storage: 'mock', questions: 424 }) });
    }
    if (url.pathname === '/api/room') {
      try {
        if (request.method() === 'GET') {
          const result = await getRoom(url.searchParams.get('code'), url.searchParams.get('playerId'));
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, room: result.room }) });
        }
        const result = await act(JSON.parse(request.postData() || '{}'));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, room: result.room }) });
      } catch (error) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, message: error.message }) });
      }
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

const browser = await chromium.launch({ headless: true });
const host = await browser.newPage({ viewport: { width: 1440, height: 980 } });
await apiMock(host);
await host.goto(`${base}/#/party`, { waitUntil: 'networkidle' });
await host.locator('#host-form input[name="name"]').fill('HOST_1');
await host.locator('#host-form button[type="submit"]').click();
await host.waitForSelector('.room-code');
const code = (await host.locator('.room-code').textContent()).trim();
console.log('room code:', code);
await host.screenshot({ path: `${out}/room-lobby.png`, fullPage: true });

const guest = await browser.newPage({ viewport: { width: 1440, height: 980 } });
await guest.addInitScript(() => {
  localStorage.setItem('zeron:v1', JSON.stringify({ playerId: 'guest-qa', name: 'GUEST_2', lang: 'nl', sound: false, stats: { best: 0, plays: 0, streak: 0, history: [] } }));
});
await apiMock(guest);
await guest.goto(`${base}/#/party`, { waitUntil: 'networkidle' });
await guest.locator('#join-form input[name="code"]').fill(code);
await guest.locator('#join-form input[name="name"]').fill('GUEST_2');
await guest.locator('#join-form button[type="submit"]').click();
await guest.waitForSelector('.room-code');
await host.waitForFunction(() => document.querySelectorAll('.player-row').length === 2);

await host.locator('[data-act="room-start"]').click();
await host.waitForSelector('#answer-input');
await guest.waitForSelector('#answer-input');
const current = (await getRoom(code)).room;
const question = QUESTIONS.find((item) => item.id === current.question?.id);
if (!question) throw new Error('room question not found');
await host.locator('#answer-input').fill(question.common[0]);
await host.locator('#room-answer-form button[type="submit"]').click();
await guest.locator('#answer-input').fill(question.rare[0]);
await guest.locator('#room-answer-form button[type="submit"]').click();
await host.waitForSelector('.locked-answer');
await host.screenshot({ path: `${out}/room-question.png`, fullPage: true });

await host.waitForSelector('.reveal-list', { timeout: 10000 });
await guest.waitForSelector('.reveal-list', { timeout: 10000 });
const revealRows = await host.locator('.reveal-row').count();
if (revealRows !== 2) throw new Error(`expected 2 reveal rows, got ${revealRows}`);
await host.screenshot({ path: `${out}/room-reveal.png`, fullPage: true });

await host.locator('[data-act="room-next"]').click();
await host.waitForSelector('#answer-input');
console.log('room flow OK; screenshots in', out);
await browser.close();
