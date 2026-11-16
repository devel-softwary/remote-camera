import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { maradonaPhotoFilename, photoPublicUrl, photoStoragePlan } from './storage-policy.js';

export function savePhotoFile(uploadsDir, session, contentType, data, now = Date.now()) {
  const plan = photoStoragePlan(uploadsDir, session, contentType);
  if (!plan) throw new Error('Destinazione foto non valida.');
  fs.mkdirSync(plan.folder, { recursive: true, mode: 0o750 });

  if (!plan.filenamePrefix) {
    const filename = `${now}-${crypto.randomBytes(6).toString('hex')}.${plan.extension}`;
    fs.writeFileSync(path.join(plan.folder, filename), data, { mode: 0o640, flag: 'wx' });
    return { filename, url: photoPublicUrl(plan.segments, filename) };
  }

  const usedSequences = new Set(fs.readdirSync(plan.folder).flatMap(filename => {
    const match = filename.match(new RegExp(`^${plan.filenamePrefix}_fotogramma(\\d+)\\.(?:jpg|png|webp)$`));
    return match ? [Number(match[1])] : [];
  }));
  for (let sequence = 1; sequence <= 999999; sequence += 1) {
    if (usedSequences.has(sequence)) continue;
    const filename = maradonaPhotoFilename(plan.filenamePrefix, sequence, plan.extension);
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
    ? filename.startsWith(`${plan.filenamePrefix}_fotogramma`) && /^\d{2,6}\.(?:jpg|png|webp)$/.test(filename.slice(`${plan.filenamePrefix}_fotogramma`.length))
    : /^\d{1,16}-[a-f0-9]{12}\.(?:jpg|png|webp)$/.test(filename);
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
