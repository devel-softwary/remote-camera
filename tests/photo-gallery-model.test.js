import assert from 'node:assert/strict';
import { photoDisplayName, queuedGalleryPhotos } from '../public/photo-gallery-model.js';

const captures = new Map([
  ['capture-1', { area: { id: 'area-1' }, context: { project: 'DAM' }, previewUrl: 'data:image/jpeg;base64,AA==', createdAt: '2026-11-16T10:00:00Z', width: 1920, height: 1080, size: 42 }],
  ['capture-2', { area: { id: 'area-2' }, context: { project: 'DAM' } }],
  ['capture-3', { area: { id: 'area-1' }, context: { project: 'Altro' } }]
]);

assert.deepEqual(queuedGalleryPhotos(captures, 'DAM', 'area-1'), [{
  id: 'queued:capture-1', captureId: 'capture-1', pending: true,
  previewUrl: 'data:image/jpeg;base64,AA==', createdAt: '2026-11-16T10:00:00Z',
  width: 1920, height: 1080, size: 42
}]);
assert.deepEqual(queuedGalleryPhotos(captures, 'DAM', 'missing'), []);
assert.equal(photoDisplayName({ filename: 'TR01_A_N001_01.jpg' }), 'TR01_A_N001_01.jpg');
assert.equal(photoDisplayName({ url: '/uploads/DAM/TR01/A/N001/TR01_A_N001_02.jpg' }), 'TR01_A_N001_02.jpg');
assert.equal(photoDisplayName({ url: 'https://camera.example.com/uploads/Area%201/01.jpg' }), '01.jpg');
assert.equal(photoDisplayName({ filename: '../secret.jpg', url: '' }), '');

console.log('Queued gallery placeholder regression passed');
