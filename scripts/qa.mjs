// Browser smoke check: screenshots + console error capture.
// Usage: npm run dev -- --port 4173  (in another terminal), then `node scripts/qa.mjs`
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.QA_BASE || 'http://localhost:4173';
const out = '/tmp/opencode/zeron-shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

async function shot(name, hash = '/') {
  await page.goto(`${base}/#${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(name, '→', `${out}/${name}.png`);
}

await shot('home', '/');
await shot('setup', '/setup');
await shot('party', '/party');
await shot('archive', '/archive');
await shot('submit', '/submit');
await shot('how', '/how');

await page.goto(`${base}/#/setup`, { waitUntil: 'networkidle' });
await page.locator('input[name="name"]').fill('NOVA_77');
await page.locator('input[value="blitz"]').check();
await page.locator('input[name="rounds"]').fill('3');
await page.locator('button[type="submit"]').click();
await page.waitForSelector('#answer-input');
await page.screenshot({ path: `${out}/game.png`, fullPage: true });
await page.locator('#answer-input').fill('een gerucht');
await page.locator('#answer-form button[type="submit"]').click();
await page.waitForSelector('.reveal-card');
await page.screenshot({ path: `${out}/reveal.png`, fullPage: true });
console.log('game/reveal →', out);

await page.setViewportSize({ width: 390, height: 844 });
await shot('mobile-home', '/');
await shot('mobile-game', '/game/solo');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exitCode = 1;
