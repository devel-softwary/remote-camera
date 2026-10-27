import assert from 'node:assert/strict';
import { maradonaPointName, normalizeMaradonaLocation, normalizeWorkProfile } from '../public/work-profile.js';

assert.deepEqual(normalizeWorkProfile(), { type: 'generic' });
assert.deepEqual(normalizeWorkProfile({ type: 'unknown' }), { type: 'generic' });
assert.deepEqual(normalizeWorkProfile({ type: 'maradona', workName: '../altro' }), { type: 'maradona', workName: 'DAM' });
assert.deepEqual(normalizeMaradonaLocation({ tower: 1, face: 'a', node: 1 }), { tower: 'TR01', face: 'A', node: 'N001' });
assert.deepEqual(normalizeMaradonaLocation({ tower: 'TR28', face: 'D', node: 'N100' }), { tower: 'TR28', face: 'D', node: 'N100' });
assert.equal(normalizeMaradonaLocation({ tower: 29, face: 'A', node: 1 }), null);
assert.equal(normalizeMaradonaLocation({ tower: 1, face: 'E', node: 1 }), null);
assert.equal(normalizeMaradonaLocation({ tower: 1, face: 'A', node: 101 }), null);
assert.equal(maradonaPointName({ tower: 1, face: 'a', node: 1 }), 'TR01_A_N001');

console.log('Work profile validation regression passed');
