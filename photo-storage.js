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
