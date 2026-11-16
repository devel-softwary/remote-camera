import assert from 'node:assert/strict';
import { CAPTURE_TIMEOUT_MS, canStartCapture, isCompletePhoto, isCurrentCapture } from '../public/capture-lifecycle.js';

assert.ok(CAPTURE_TIMEOUT_MS >= 30_000);
assert.equal(canStartCapture(true, null), true);
assert.equal(canStartCapture(false, null), false);
assert.equal(canStartCapture(true, 'capture-1'), false);
assert.equal(isCurrentCapture('capture-1', 'capture-1'), true);
assert.equal(isCurrentCapture('capture-1', 'capture-2'), false);
assert.equal(isCurrentCapture(null, 'capture-1'), false);
assert.equal(isCompletePhoto(1024, 1024), true);
assert.equal(isCompletePhoto(1023, 1024), false);
assert.equal(isCompletePhoto(0, 0), false);
