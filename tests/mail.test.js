import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mailProvider, sendVerificationEmail } from '../api/lib/mail.js';

const keys = [
  'RESEND_API_KEY',
  'ZERON_EMAIL_FROM',
  'ZERON_BASE_URL',
  'ZERON_SMTP_HOST',
  'ZERON_SMTP_PORT',
  'ZERON_SMTP_USER',
  'ZERON_SMTP_PASS',
  'ZERON_SMTP_FROM',
  'ZERON_SMTP_SECURE',
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function clearMailEnv() {
  for (const key of keys) delete process.env[key];
}

function setSmtpEnv() {
  Object.assign(process.env, {
    ZERON_SMTP_HOST: 'smtp.example.test',
    ZERON_SMTP_USER: 'zeron@example.test',
    ZERON_SMTP_PASS: 'app-secret-niet-loggen',
    ZERON_SMTP_FROM: 'ZERON <zeron@example.test>',
    ZERON_BASE_URL: 'https://zeron-one.vercel.app',
  });
}

after(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test('zonder configuratie werkt de directe verificatielink', async () => {
  clearMailEnv();
  assert.equal(mailProvider(), 'dev');

  const result = await sendVerificationEmail({ email: 'speler@example.test', token: 'abc.def' });
  assert.equal(result.sent, false);
  assert.equal(result.devToken, 'abc.def');
  assert.equal(result.devLink, '#/verify/abc.def');
  assert.equal(result.attempted, undefined);
});

test('alleen een Resend-key kiest Resend', () => {
  clearMailEnv();
  process.env.RESEND_API_KEY = 're_test';
  assert.equal(mailProvider(), 'resend');
});

test('complete SMTP-configuratie heeft prioriteit en verstuurt de link', async () => {
  clearMailEnv();
  process.env.RESEND_API_KEY = 're_test';
  setSmtpEnv();
  assert.equal(mailProvider(), 'smtp');

  const sent = [];
  const transport = {
    async sendMail(message) {
      sent.push(message);
      return { messageId: 'test' };
    },
  };
  const result = await sendVerificationEmail({
    email: 'speler@example.test',
    token: 'tok.123',
    transport,
  });

  assert.equal(result.sent, true);
  assert.equal(result.provider, 'smtp');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, 'ZERON <zeron@example.test>');
  assert.equal(sent[0].to, 'speler@example.test');
  assert.match(sent[0].subject, /ZERON/);
  assert.match(sent[0].html, /https:\/\/zeron-one\.vercel\.app\/#\/verify\/tok\.123/);
  assert.match(sent[0].text, /#\/verify\/tok\.123/);
  assert.equal(JSON.stringify(sent[0]).includes('app-secret-niet-loggen'), false);
});

test('SMTP-fout valt terug op de knop zonder fouttekst of geheim te lekken', async () => {
  clearMailEnv();
  setSmtpEnv();
  const transport = {
    async sendMail() {
      throw new Error('geheim: app-secret-niet-loggen');
    },
  };

  const result = await sendVerificationEmail({
    email: 'speler@example.test',
    token: 'val.123',
    transport,
  });
  assert.equal(result.sent, false);
  assert.equal(result.attempted, 'smtp');
  assert.equal(result.devLink, '#/verify/val.123');
  assert.equal(JSON.stringify(result).includes('geheim'), false);
});
