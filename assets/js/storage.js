/* Preferences only. No credentials or server sessions belong here. */
window.FBStorage = (() => {
  'use strict';
  const memory = new Map();
  let available = true;
  function fallback() { available = false; window.dispatchEvent(new Event('fb-storage-unavailable')); }
  return {
    getItem(key) { try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { fallback(); return memory.get(key) ?? null; } },
    setItem(key, value) { memory.set(key, String(value)); try { localStorage.setItem(key, value); } catch { fallback(); } },
    removeItem(key) { memory.delete(key); try { localStorage.removeItem(key); } catch { fallback(); } },
    get available() { return available; }
  };
})();
