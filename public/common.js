export async function loadConfig() {
  const r = await fetch('/api/config', { cache: 'no-store' });
  if (!r.ok) throw new Error('Configurazione server non disponibile');
  return r.json();
}

export function wsUrl() {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}

export function setStatus(el, text, mode = '') {
  el.querySelector('.status-text').textContent = text;
  const dot = el.querySelector('.dot');
  dot.className = `dot ${mode}`.trim();
}

export function queryParam(name) {
  return new URLSearchParams(location.search).get(name) || '';
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
