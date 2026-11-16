import fs from 'node:fs';
import path from 'node:path';
import { maradonaPhotoFilename, photoPublicUrl, photoStoragePlan } from './storage-policy.js';

function photoSequence(filename, plan) {
  const prefix = plan.filenamePrefix ? `${plan.filenamePrefix}_` : '';
  const current = filename.match(new RegExp(`^${prefix}(\\d+)\\.(?:jpg|png|webp)$`));
  if (current) return Number(current[1]);
  if (!plan.legacyFilenamePrefix) return 0;
  const legacy = filename.match(new RegExp(`^${plan.legacyFilenamePrefix}(\\d+)\\.(?:jpg|png|webp)$`));
  return legacy ? Number(legacy[1]) : 0;
}

export function savePhotoFile(uploadsDir, session, contentType, data) {
  const plan = photoStoragePlan(uploadsDir, session, contentType);
  if (!plan) throw new Error('Destinazione foto non valida.');
  fs.mkdirSync(plan.folder, { recursive: true, mode: 0o750 });

  const highestSequence = fs.readdirSync(plan.folder).reduce((highest, filename) => Math.max(highest, photoSequence(filename, plan)), 0);
  for (let sequence = highestSequence + 1; sequence <= 999999; sequence += 1) {
    const filename = plan.filenamePrefix
      ? maradonaPhotoFilename(plan.filenamePrefix, sequence, plan.extension)
      : `${String(sequence).padStart(2, '0')}.${plan.extension}`;
    try {
      fs.writeFileSync(path.join(plan.folder, filename), data, { mode: 0o640, flag: 'wx' });
      return { filename, url: photoPublicUrl(plan.segments, filename), sequence };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Numero massimo di fotogrammi raggiunto.');
}

export function photoFilePath(uploadsDir, session, photoUrl) {
  const plan = photoStoragePlan(uploadsDir, session, 'image/jpeg');
  if (!plan) return '';
  const prefix = photoPublicUrl(plan.segments, '');
  const value = String(photoUrl || '');
  if (!value.startsWith(prefix) || value.length > 2048) return '';
  let filename;
  try { filename = decodeURIComponent(value.slice(prefix.length)); }
  catch { return ''; }
  const validFilename = plan.filenamePrefix
    ? (filename.startsWith(`${plan.filenamePrefix}_`) && /^\d{2,6}\.(?:jpg|png|webp)$/.test(filename.slice(plan.filenamePrefix.length + 1)))
      || (filename.startsWith(plan.legacyFilenamePrefix) && /^\d{2,6}\.(?:jpg|png|webp)$/.test(filename.slice(plan.legacyFilenamePrefix.length)))
    : /^\d{2,6}\.(?:jpg|png|webp)$/.test(filename) || /^\d{1,16}-[a-f0-9]{12}\.(?:jpg|png|webp)$/.test(filename);
  if (!validFilename) return '';
  return path.join(plan.folder, filename);
}

export function deletePhotoFile(uploadsDir, session, photoUrl) {
  const filename = photoFilePath(uploadsDir, session, photoUrl);
  if (!filename) throw new Error('Percorso foto non valido.');
  try { fs.unlinkSync(filename); return true; }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function listPhotoFiles(uploadsDir, session) {
  const plan = photoStoragePlan(uploadsDir, session, 'image/jpeg');
  if (!plan || !fs.existsSync(plan.folder)) return [];
  return fs.readdirSync(plan.folder, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isFile()) return [];
    const sequence = photoSequence(entry.name, plan);
    return sequence ? [{ filename: entry.name, url: photoPublicUrl(plan.segments, entry.name), sequence }] : [];
  }).sort((a, b) => a.sequence - b.sequence || a.filename.localeCompare(b.filename));
}
