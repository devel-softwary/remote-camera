export function safeFolderName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 80) return '';
  if (/[\\/:*?"<>|\x00-\x1f]/.test(name) || name === '.' || name === '..') return '';
  return name;
}

export function photoExtension(contentType) {
  return contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
}
