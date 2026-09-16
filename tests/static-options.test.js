import assert from 'node:assert/strict';
import path from 'node:path';
import { publicStaticOptions } from '../static-options.js';
import { photoStorageDirectory } from '../storage-policy.js';

assert.equal(publicStaticOptions.maxAge, 0);
assert.deepEqual(publicStaticOptions.extensions, ['html']);
assert.equal(photoStorageDirectory('', '/data/photos'), '/data/photos');
assert.equal(photoStorageDirectory('/mnt/camera', '/data/photos'), '/mnt/camera');
assert.equal(photoStorageDirectory('relative/photos', '/data/photos'), path.resolve('relative/photos'));

console.log('Static asset cache policy regression passed');
