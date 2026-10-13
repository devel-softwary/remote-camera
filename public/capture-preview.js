export function previewSize(width, height, maxEdge = 480) {
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function freezeVideoPreview(video, canvas) {
  const size = previewSize(video.videoWidth, video.videoHeight);
  if (!size) return false;
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.drawImage(video, 0, 0, size.width, size.height);
  return true;
}
