import assert from 'node:assert/strict';
import { clampPhotoZoom, photoZoomRange } from '../public/photo-viewer.js';

assert.deepEqual(photoZoomRange(4000, 3000, 1000, 900), { min: .25, max: 1 });
assert.deepEqual(photoZoomRange(800, 600, 1000, 900), { min: 1, max: 1 });
assert.equal(clampPhotoZoom(.1, { min: .25, max: 1 }), .25);
assert.equal(clampPhotoZoom(1.2, { min: .25, max: 1 }), 1);
assert.equal(clampPhotoZoom(.75, { min: .25, max: 1 }), .75);

console.log('Photo viewer zoom regression passed');
