import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { publicStaticOptions } from '../static-options.js';
import { photoStorageDirectory } from '../storage-policy.js';

assert.equal(publicStaticOptions.maxAge, 0);
assert.deepEqual(publicStaticOptions.extensions, ['html']);
assert.equal(photoStorageDirectory('', '/data/photos'), '/data/photos');
assert.equal(photoStorageDirectory('/mnt/camera', '/data/photos'), '/mnt/camera');
assert.equal(photoStorageDirectory('relative/photos', '/data/photos'), path.resolve('relative/photos'));
assert.doesNotMatch(fs.readFileSync(new URL('../public/controller.html', import.meta.url), 'utf8'), /mobileControllerSection|copyMobileLink/);

const cameraHtml = fs.readFileSync(new URL('../public/camera.html', import.meta.url), 'utf8');
const cameraCss = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
assert.match(cameraHtml, /local-camera-stage[\s\S]*id="localVideo"[\s\S]*id="localCapture"/);
const positions = ['localAreaSelect', 'localZoom', 'localFocusDistance', 'localFocus', 'localTorch', 'localSecondaryControls'].map(id => cameraHtml.indexOf(`id="${id}"`));
assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]), 'punto e regolazioni devono seguire il flusso operativo');
assert.match(cameraCss, /body\.local-mode #localControls \{ position:sticky/);
assert.match(cameraCss, /\.local-action-row \{ display:grid/);
assert.match(cameraCss, /body\.local-mode \.local-capture-overlay \{ display:grid;[\s\S]*position:absolute;[\s\S]*left:50%;[\s\S]*bottom:16px/);

console.log('Static asset cache policy regression passed');
