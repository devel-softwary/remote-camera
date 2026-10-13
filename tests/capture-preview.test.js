import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freezeVideoPreview, previewSize } from '../public/capture-preview.js';

assert.deepEqual(previewSize(1920, 1080), { width: 480, height: 270 });
assert.deepEqual(previewSize(320, 240), { width: 320, height: 240 });
assert.equal(previewSize(0, 1080), null);

const calls = [];
const video = { videoWidth: 1080, videoHeight: 1920 };
const canvas = { getContext: () => ({ drawImage: (...args) => calls.push(args) }) };
assert.equal(freezeVideoPreview(video, canvas), true);
assert.deepEqual({ width: canvas.width, height: canvas.height }, { width: 270, height: 480 });
assert.deepEqual(calls[0], [video, 0, 0, 270, 480]);

for (const file of ['controller.html', 'mobile-controller.html']) {
  const html = readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
  assert.match(html, /id="capturePreviewCanvas"/);
  assert.match(html, /id="closeCapturePreview"/);
}
console.log('Frozen capture preview regression passed');
