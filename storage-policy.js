import path from 'node:path';
import { MARADONA_WORK_PROFILE, normalizeMaradonaLocation, normalizeWorkProfile } from './public/work-profile.js';

export function safeFolderName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 80) return '';
  if (/[\\/:*?"<>|\x00-\x1f]/.test(name) || name === '.' || name === '..') return '';
  return name;
}

export function photoExtension(contentType) {
  return contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
}

export function photoStorageDirectory(value, defaultDirectory) {
  const configured = String(value || '').trim();
  return configured ? path.resolve(configured) : defaultDirectory;
}

export function photoProjectStorageName(session) {
  const profile = normalizeWorkProfile(session?.workProfile);
  return profile.type === MARADONA_WORK_PROFILE ? profile.workName : safeFolderName(session?.project);
}

export function photoStoragePlan(root, session, contentType) {
  const profile = normalizeWorkProfile(session?.workProfile);
  const extension = photoExtension(contentType);
  if (profile.type === MARADONA_WORK_PROFILE) {
    const location = normalizeMaradonaLocation(session?.location);
    if (!location) return null;
    const segments = [profile.workName, location.tower, location.face, location.node];
    return {
      folder: path.join(root, ...segments), segments, extension,
      filenamePrefix: `${profile.workName}_${location.tower}_${location.face}_${location.node}`
    };
  }
  const project = safeFolderName(session?.project);
  const area = safeFolderName(session?.area);
  if (!project || !area) return null;
  return { folder: path.join(root, project, area), segments: [project, area], extension, filenamePrefix: '' };
}

export function maradonaPhotoFilename(prefix, sequence, extension) {
  if (!prefix || !Number.isInteger(sequence) || sequence < 1 || !['jpg', 'png', 'webp'].includes(extension)) return '';
  return `${prefix}_fotogramma${String(sequence).padStart(2, '0')}.${extension}`;
}

export function photoPublicUrl(segments, filename) {
  return `/uploads/${[...segments, filename].map(encodeURIComponent).join('/')}`;
}

export function safeCaptureId(value) {
  const id = String(value || '');
  return /^[A-Za-z0-9._-]{1,100}$/.test(id) ? id : '';
}
