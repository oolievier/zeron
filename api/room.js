import { send, body, handleErrors } from './lib/http.js';
import { act, getRoom } from './lib/rooms.js';
import { storageMode } from './lib/store.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const code = url.searchParams.get('code') || '';
      const playerId = url.searchParams.get('playerId') || '';
      if (!code) return send(res, 400, { ok: false, message: 'Kamerkode ontbreekt.' });
      const result = await getRoom(code.toUpperCase(), playerId);
      if (result.error) return send(res, result.error, { ok: false, message: result.message });
      return send(res, 200, { ok: true, room: result.room, storage: storageMode });
    }
    if (req.method === 'POST') {
      const payload = await body(req);
      const result = await act(payload);
      if (result.error) return send(res, result.error, { ok: false, message: result.message });
      return send(res, 200, { ok: true, room: result.room, storage: storageMode });
    }
    return send(res, 405, { ok: false, message: 'Method not allowed.' });
  } catch (error) {
    return handleErrors(res, error);
  }
}
