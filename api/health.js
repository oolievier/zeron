import { send } from './lib/http.js';
import { storageMode } from './lib/store.js';
import { QUESTIONS } from '../src/data/questions.js';

export default function handler(_req, res) {
  send(res, 200, { ok: true, service: 'zeron', storage: storageMode, questions: QUESTIONS.length, time: Date.now() });
}
