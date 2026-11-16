import assert from 'node:assert/strict';
import { queuedGalleryPhotos } from '../public/photo-gallery-model.js';

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

console.log('Queued gallery placeholder regression passed');
