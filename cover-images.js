/* Private, per-account cover thumbnails. Original storage objects stay private. */
(() => {
  'use strict';
  const CACHE = 'bookwise-covers-v1', TTL = 30 * 86400000, LIMIT = 120;
  const memory = new Map(), pending = new Map();
  let generation = 0;
  const keyFor = (owner, path) => {
    if (!owner || typeof path !== 'string' || !path.startsWith(owner + '/')) throw new Error('invalid_cover_path');
    return new URL('__cover_cache__/' + encodeURIComponent(path), location.href).href;
  };
  async function store() {
    try { return await caches.open(CACHE); } catch (_) { return null; }
  }
  async function optimize(file) {
    let source, temporary;
    try {
      if (typeof createImageBitmap === 'function') {
        try { source = await createImageBitmap(file); } catch (_) { /* Safari decoder fallback below. */ }
      }
      if (!source) {
        temporary = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = temporary; });
      }
      const width = source.width, height = source.height;
      const scale = Math.min(1, 640 / width, 960 / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .82));
      return blob && (scale < 1 || blob.size < file.size) ? blob : file;
    } finally { source?.close?.(); if (temporary) URL.revokeObjectURL(temporary); }
  }
  async function remember(owner, path, blob, expected = generation) {
    const key = keyFor(owner, path), cache = await store();
    if (expected !== generation) throw new Error('cover_account_changed');
    if (cache) {
      try {
        await cache.put(key, new Response(blob, { headers: { 'Content-Type': blob.type, 'X-Cached-At': String(Date.now()) } }));
        if (expected !== generation) { await cache.delete(key); throw new Error('cover_account_changed'); }
        const keys = await cache.keys();
        await Promise.all(keys.slice(0, Math.max(0, keys.length - LIMIT)).map(request => cache.delete(request)));
      } catch (error) { if (expected !== generation) throw error; /* Storage quota/private browsing: use memory. */ }
    }
    if (expected !== generation) throw new Error('cover_account_changed');
    if (memory.has(key)) URL.revokeObjectURL(memory.get(key));
    const url = URL.createObjectURL(blob);
    memory.set(key, url);
    return url;
  }
  function get(owner, path, sign) {
    const key = keyFor(owner, path), expected = generation;
    if (memory.has(key)) return Promise.resolve(memory.get(key));
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const cache = await store();
      const saved = await cache?.match(key).catch(() => null);
      if (saved && Date.now() - Number(saved.headers.get('X-Cached-At') || 0) < TTL) {
        const blob = await saved.blob();
        if (expected !== generation) throw new Error('cover_account_changed');
        const url = URL.createObjectURL(blob); memory.set(key, url); return url;
      }
      const signed = await sign();
      if (expected !== generation) throw new Error('cover_account_changed');
      try {
        const response = await fetch(signed);
        if (!response.ok) throw new Error('cover_download_failed');
        const original = await response.blob();
        const thumbnail = await optimize(original).catch(() => original);
        return await remember(owner, path, thumbnail, expected);
      } catch (error) {
        if (expected !== generation) throw new Error('cover_account_changed');
        return signed; // CORS, canvas or storage unavailable: retain normal image loading.
      }
    })().finally(() => { if (pending.get(key) === task) pending.delete(key); });
    pending.set(key, task);
    return task;
  }
  async function forget(owner, path) {
    const key = keyFor(owner, path);
    if (memory.has(key)) URL.revokeObjectURL(memory.get(key));
    memory.delete(key);
    const cache = await store(); await cache?.delete(key);
  }
  function clear() {
    generation++;
    for (const url of memory.values()) URL.revokeObjectURL(url);
    memory.clear(); pending.clear();
    // Clear the private disk cache on logout, too. In-flight writes check generation.
    void store().then(cache => cache?.keys().then(keys => Promise.all(keys.map(key => cache.delete(key))))).catch(() => {});
  }
  window.BookwiseCoverImages = { optimize, remember, get, forget, clear };
})();
