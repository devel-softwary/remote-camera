import assert from 'node:assert/strict';
import { createQueuedPhoto, queuedPhotoSummary } from '../public/photo-upload-queue.js';

const blob = new Blob(['photo'], { type: 'image/jpeg' });
const record = createQueuedPhoto({ id: 'capture-1', room: 'ROOM01', project: 'DAM', area: 'TR01_A_N001', blob, width: 10, height: 20 });
assert.equal(record.size, 5);
assert.equal('token' in record, false);
assert.deepEqual(queuedPhotoSummary([record, { size: 7 }]), { count: 2, bytes: 12 });
assert.throws(() => createQueuedPhoto({ id: 'bad' }), /non validi/);

console.log('Local photo queue regression passed');
