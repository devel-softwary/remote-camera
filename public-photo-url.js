export function normalizePublicBaseUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function publicPhotoUrl(baseUrl, photoPath) {
  const base = normalizePublicBaseUrl(baseUrl);
  const value = String(photoPath || '');
  if (!base || !/^\/uploads\/[^?#]+$/.test(value)) return '';
  return `${base}${value}`;
}
