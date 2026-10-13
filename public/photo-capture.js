export function captureVideoFrame(video, track, createCanvas = () => document.createElement('canvas')) {
  if (!track) throw new Error('Camera non attiva');
  const settings = track.getSettings?.() || {};
  const width = video.videoWidth || settings.width || 1920;
  const height = video.videoHeight || settings.height || 1080;
  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Impossibile acquisire il fotogramma');
  context.drawImage(video, 0, 0, width, height);
  return { canvas, width, height, createdAt: new Date().toISOString() };
}

export async function encodeCapturedFrame(frame, defer = () => new Promise(resolve => setTimeout(resolve, 0))) {
  await defer();
  const blob = await new Promise((resolve, reject) => {
    frame.canvas.toBlob(value => value ? resolve(value) : reject(new Error('Impossibile creare JPEG')), 'image/jpeg', 0.97);
  });
  return { ...frame, blob };
}
