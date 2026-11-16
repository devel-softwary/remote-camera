import assert from 'node:assert/strict';
import { normalizePublicBaseUrl, publicPhotoUrl } from '../public-photo-url.js';

assert.equal(normalizePublicBaseUrl('https://camera.example.com/'), 'https://camera.example.com');
assert.equal(normalizePublicBaseUrl('http://localhost:3000'), 'http://localhost:3000');
assert.equal(normalizePublicBaseUrl('javascript:alert(1)'), '');
assert.equal(normalizePublicBaseUrl('https://user:secret@camera.example.com'), '');
assert.equal(normalizePublicBaseUrl('https://camera.example.com/app'), '');
assert.equal(publicPhotoUrl('https://camera.example.com', '/uploads/DAM/TR01/A/N001/TR01_A_N001_01.jpg'), 'https://camera.example.com/uploads/DAM/TR01/A/N001/TR01_A_N001_01.jpg');
assert.equal(publicPhotoUrl('https://camera.example.com', '/api/private'), '');
assert.equal(publicPhotoUrl('https://camera.example.com', '/uploads/photo.jpg?token=x'), '');

console.log('Public photo URL regression passed');
