import assert from 'node:assert/strict';
import { publicStaticOptions } from '../static-options.js';

assert.equal(publicStaticOptions.maxAge, 0);
assert.deepEqual(publicStaticOptions.extensions, ['html']);

console.log('Static asset cache policy regression passed');
