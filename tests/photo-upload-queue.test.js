import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createQueuedPhoto, queuedPhotoSummary, remotePhotoQueueMessage } from '../public/photo-upload-queue.js';

const blob = new Blob(['photo'], { type: 'image/jpeg' });
const record = createQueuedPhoto({ id: 'capture-1', room: 'ROOM01', project: 'DAM', area: 'TR01_A_N001', blob, width: 10, height: 20 });
assert.equal(record.size, 5);
assert.equal('token' in record, false);
assert.deepEqual(queuedPhotoSummary([record, { size: 7 }]), { count: 2, bytes: 12 });
assert.deepEqual(remotePhotoQueueMessage(record), {
  type: 'photo-queued', requestId: 'capture-1', project: 'DAM', area: 'TR01_A_N001',
  createdAt: record.createdAt, width: 10, height: 20, size: 5
});
assert.throws(() => createQueuedPhoto({ id: 'bad' }), /non validi/);
assert.throws(() => remotePhotoQueueMessage({ id: 'bad' }), /non valida/);

const cameraSource = await readFile(new URL('../public/camera.js', import.meta.url), 'utf8');
const captureFlow = cameraSource.slice(cameraSource.indexOf('async function captureLocalPhoto'), cameraSource.indexOf('function renderLocalSession'));
assert.match(captureFlow, /await queuePhoto\(record\)[\s\S]*photoBusy = false[\s\S]*enqueueLocalUpload\(record\)/);
assert.doesNotMatch(captureFlow, /await uploadLocalPhoto\(record\)/);

const cameraHtml = await readFile(new URL('../public/camera.html', import.meta.url), 'utf8');
assert.match(cameraHtml, /id="uploadImmediately"[^>]*checked/);

assert.match(cameraSource, /await queuePhoto\(record\);[\s\S]*sendData\(remotePhotoQueueMessage\(record\)\)/);
assert.match(cameraSource, /await acknowledgement;\s*await deleteQueuedPhoto\(record\.id\)/);

console.log('Local photo queue regression passed');
