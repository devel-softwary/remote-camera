import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deletePhotoFile, photoFilePath, savePhotoFile } from '../photo-storage.js';
import { maradonaPhotoFilename, photoProjectStorageName, photoStoragePlan, safeCaptureId } from '../storage-policy.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-camera-photos-'));
const session = {
  project: 'Maradona 2026', area: 'Nodo 1',
  workProfile: { type: 'maradona' }, location: { tower: 1, face: 'a', node: 1 }
};

assert.equal(photoProjectStorageName(session), 'DAM');
assert.deepEqual(photoStoragePlan(root, session, 'image/jpeg'), {
  folder: path.join(root, 'DAM', 'TR01', 'A', 'N001'),
  segments: ['DAM', 'TR01', 'A', 'N001'], extension: 'jpg', filenamePrefix: 'DAM_TR01_A_N001'
});
assert.equal(maradonaPhotoFilename('DAM_TR01_A_N001', 1, 'jpg'), 'DAM_TR01_A_N001_fotogramma01.jpg');
assert.equal(maradonaPhotoFilename('DAM_TR01_A_N001', 100, 'jpg'), 'DAM_TR01_A_N001_fotogramma100.jpg');

const first = savePhotoFile(root, session, 'image/jpeg', Buffer.from('first'));
const second = savePhotoFile(root, session, 'image/png', Buffer.from('second'));
assert.equal(first.filename, 'DAM_TR01_A_N001_fotogramma01.jpg');
assert.equal(second.filename, 'DAM_TR01_A_N001_fotogramma02.png');
assert.equal(first.url, '/uploads/DAM/TR01/A/N001/DAM_TR01_A_N001_fotogramma01.jpg');
assert.equal(fs.readFileSync(path.join(root, 'DAM', 'TR01', 'A', 'N001', first.filename), 'utf8'), 'first');
assert.equal(photoFilePath(root, session, first.url), path.join(root, 'DAM', 'TR01', 'A', 'N001', first.filename));
assert.equal(photoFilePath(root, session, '/uploads/DAM/TR01/A/N001/../../secret.jpg'), '');
assert.equal(photoFilePath(root, session, '/uploads/DAM/TR01/A/N001/DAM_TR01_A_N001_fotogrammaevil.jpg'), '');
assert.equal(photoFilePath(root, session, '/uploads/Altro/photo.jpg'), '');
assert.equal(deletePhotoFile(root, session, first.url), true);
assert.equal(fs.existsSync(path.join(root, 'DAM', 'TR01', 'A', 'N001', first.filename)), false);
assert.equal(deletePhotoFile(root, session, first.url), false);

const generic = savePhotoFile(root, { project: 'Generico', area: 'Area 1' }, 'image/webp', Buffer.from('generic'), 1234);
assert.match(generic.filename, /^1234-[a-f0-9]{12}\.webp$/);
assert.match(generic.url, /^\/uploads\/Generico\/Area%201\/1234-/);
assert.equal(photoFilePath(root, { project: 'Generico', area: 'Area 1' }, generic.url), path.join(root, 'Generico', 'Area 1', generic.filename));
assert.equal(deletePhotoFile(root, { project: 'Generico', area: 'Area 1' }, generic.url), true);
assert.equal(safeCaptureId('capture-1_2.3'), 'capture-1_2.3');
assert.equal(safeCaptureId('../capture'), '');

fs.rmSync(root, { recursive: true, force: true });
console.log('Photo storage naming regression passed');
