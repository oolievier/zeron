// Storage adapter: Vercel Blob in production, process-local memory for `vite dev`.
// Room state is small JSON; every write is atomic at the blob level.

import { put, get, list, del } from '@vercel/blob';

const memory = new Map();
const token = process.env.BLOB_READ_WRITE_TOKEN;

export const storageMode = token ? 'blob' : 'memory';

export async function readJSON(path) {
  if (!token) return memory.has(path) ? JSON.parse(memory.get(path)) : null;
  const result = await get(path, { token, access: 'private' });
  // @vercel/blob v2 returns a stream-based response, not a Blob with .text().
  if (!result?.stream) return null;
  const text = await new Response(result.stream).text();
  return text ? JSON.parse(text) : null;
}

export async function writeJSON(path, value) {
  const serialized = JSON.stringify(value);
  if (!token) {
    memory.set(path, serialized);
    return { path };
  }
  return put(path, serialized, {
    token,
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}

// Vercel Blob is kort eventual-consistent tussen functie-instanties. Bij kamers
// wachten we daarom tot onze eigen versie weer leesbaar is vóór we antwoorden;
// zo kan een directe reveal geen net geschreven antwoord missen.
export async function writeJSONConfirmed(path, value) {
  const result = await writeJSON(path, value);
  if (token && typeof value?.version === 'number') {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await readJSON(path);
      if (current && current.version >= value.version) return result;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  return result;
}

export async function listPaths(prefix) {
  if (!token) return [...memory.keys()].filter((path) => path.startsWith(prefix));
  const result = await list({ prefix, token });
  return result.blobs.map((blob) => blob.pathname);
}

export async function removePath(path) {
  if (!token) {
    memory.delete(path);
    return;
  }
  await del(path, { token });
}
