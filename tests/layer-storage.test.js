import assert from 'node:assert/strict';
import { createLayerRecord } from '../public/layer-storage.js';

const file = { name: 'planimetria.png', type: 'image/png', size: 128 };
const record = createLayerRecord('Progetto nord', file);

assert.equal(record.project, 'Progetto nord');
assert.equal(record.name, file.name);
assert.equal(record.type, file.type);
assert.equal(record.size, file.size);
assert.equal(record.blob, file);
assert.equal(Number.isFinite(record.updatedAt), true);

console.log('Layer storage record regression passed');
