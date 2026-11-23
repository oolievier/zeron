import { send, body, handleErrors } from './lib/http.js';
import { readJSON, writeJSON, listPaths } from './lib/store.js';
import { QUESTIONS, CATEGORIES } from '../src/data/questions.js';

function cleanList(value) {
  return String(value ?? '')
    .split(/[,;\n]/)
    .map((item) => item.replace(/[\u0000-\u001f\u007f]/g, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const paths = await listPaths('community/');
      const items = await Promise.all(paths.map((path) => readJSON(path).catch(() => null)));
      const live = items
        .filter((item) => item?.status === 'live')
        .map((item) => ({
          id: item.question.id,
          prompt: item.question.prompt,
          category: item.question.category,
          lang: item.question.lang,
          common: item.question.common,
          rare: item.question.rare,
          tags: ['community'],
          votes: item.votes || 0,
          createdAt: item.createdAt,
        }));
      return send(res, 200, {
        ok: true,
        library: { total: QUESTIONS.length + live.length, base: QUESTIONS.length, community: live.length },
        categories: CATEGORIES,
        items: live,
      });
    }

    if (req.method === 'POST') {
      const payload = await body(req);
      if (payload.website) return send(res, 400, { ok: false, message: 'Spam gedetecteerd.' });
      const prompt = String(payload.prompt ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
      const lang = payload.lang === 'en' ? 'en' : 'nl';
      const category = CATEGORIES[payload.category] ? payload.category : 'GLITCH';
      const common = cleanList(payload.common);
      const rare = cleanList(payload.rare);
      const banned = /(https?|www\.|\.com|\.nl\b|fuck|shit|kanker|neuk|nazi)/i;

      if (prompt.length < 8 || prompt.length > 140 || banned.test(prompt)) {
        return send(res, 400, { ok: false, message: 'Vraag moet 8–140 tekens zijn en geen links of scheldwoorden bevatten.' });
      }
      if (common.length < 2 || rare.length < 2 || [...common, ...rare].some((item) => item.length > 40 || banned.test(item))) {
        return send(res, 400, { ok: false, message: 'Geef minimaal 2 veelvoorkomende en 2 zeldzame antwoorden (max 40 tekens).' });
      }

      const id = `community-${crypto.randomUUID().slice(0, 8)}`;
      const record = {
        id,
        status: 'live',
        createdAt: Date.now(),
        nickname: String(payload.nickname ?? 'ANON').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18) || 'ANON',
        votes: 0,
        question: {
          id,
          lang,
          category,
          prompt: prompt.endsWith('?') ? prompt : `${prompt}?`,
          common,
          rare,
          tags: ['community'],
        },
      };
      await writeJSON(`community/${id}.json`, record);
      return send(res, 201, { ok: true, id, message: 'Vraag toegevoegd aan de bibliotheek.' });
    }

    return send(res, 405, { ok: false, message: 'Method not allowed.' });
  } catch (error) {
    return handleErrors(res, error);
  }
}
