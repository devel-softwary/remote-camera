import assert from 'node:assert/strict';
import { capturePhoto, captureVideoFrame, encodeCapturedFrame } from '../public/photo-capture.js';

const calls = [];
const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
const canvas = {
  getContext: () => ({ drawImage: (...args) => calls.push(['draw', ...args]) }),
  toBlob(callback, type, quality) { calls.push(['encode', type, quality]); callback(blob); }
};
const video = { videoWidth: 3840, videoHeight: 2160 };
const track = { getSettings: () => ({ width: 1280, height: 720 }) };

const frame = captureVideoFrame(video, track, () => canvas);
assert.equal(canvas.width, 3840);
assert.equal(canvas.height, 2160);
assert.deepEqual(calls[0], ['draw', video, 0, 0, 3840, 2160]);

let releaseEncoding;
const encoded = encodeCapturedFrame(frame, () => new Promise(resolve => { releaseEncoding = resolve; }));
assert.equal(calls.length, 1, 'la codifica deve attendere dopo lo scatto');
releaseEncoding();
const photo = await encoded;
assert.equal(photo.blob, blob);
assert.deepEqual(calls[1], ['encode', 'image/jpeg', 0.97]);

assert.throws(() => captureVideoFrame(video, null, () => canvas), /Camera non attiva/);

const nativeBlob = new Blob(['native'], { type: 'image/jpeg' });
class NativeCapture {
  constructor(value) { assert.equal(value, track); }
  async takePhoto(settings) { assert.deepEqual(settings, { fillLightMode: 'flash' }); return nativeBlob; }
}
const nativePhoto = await capturePhoto(frame, track, { fillLightMode: 'flash' }, NativeCapture);
assert.equal(nativePhoto.blob, nativeBlob);
assert.equal(nativePhoto.nativeCapture, true);

class FailedCapture { async takePhoto() { throw new Error('unsupported'); } }
await assert.rejects(capturePhoto(frame, track, { fillLightMode: 'flash' }, FailedCapture), /Flash fotografico non disponibile/);
console.log('Immediate photo capture regression passed');
