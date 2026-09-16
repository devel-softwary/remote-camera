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

console.log('Static asset cache policy regression passed');
