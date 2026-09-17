export function photoZoomRange(naturalWidth, naturalHeight, availableWidth, availableHeight) {
  const width = Math.max(1, Number(availableWidth) || 1);
  const height = Math.max(1, Number(availableHeight) || 1);
  const fitScale = Math.min(1, width / naturalWidth, height / naturalHeight);
  return { min: fitScale, max: 1 };
}

export function clampPhotoZoom(value, range) {
  return Math.min(range.max, Math.max(range.min, Number(value) || range.min));
}
