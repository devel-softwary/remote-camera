import assert from 'node:assert/strict';
import { cameraDiagnostics, normalizeCameraControls, normalizedVideoPoint } from '../public/camera-capabilities.js';

const controls = normalizeCameraControls({
  zoom: { min: 1, max: 5, step: 0.5 }, torch: [false, true],
  focusMode: ['manual', 'single-shot'], focusDistance: { min: 0, max: 10, step: 0.25 }
}, { zoom: 2, focusDistance: 3 }, { pointsOfInterest: true }, { fillLightMode: ['off', 'flash'] });

assert.deepEqual(controls.zoom, { min: 1, max: 5, step: 0.5, value: 2 });
assert.equal(controls.torch, true);
assert.equal(controls.pointsOfInterest, true);
assert.deepEqual(controls.focusDistance, { min: 0, max: 10, step: 0.25, value: 3 });
assert.deepEqual(controls.flashModes, ['off', 'flash']);

const point = normalizedVideoPoint(500, 250, { left: 0, top: 0, width: 1000, height: 500 }, 1920, 1080);
assert.ok(Math.abs(point.x - 0.5) < 0.001);
assert.ok(Math.abs(point.y - 0.5) < 0.001);
assert.equal(normalizedVideoPoint(10, 250, { left: 0, top: 0, width: 1000, height: 500 }, 1000, 1000), null);

const diagnostics = cameraDiagnostics({ label: 'Back', settings: { width: 1920, height: 1080 }, controls });
assert.match(diagnostics, /Torcia continua: sì/);
assert.match(diagnostics, /Flash foto: off, flash/);
console.log('Camera capability regression passed');
