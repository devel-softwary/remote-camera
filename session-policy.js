import { MARADONA_WORK_PROFILE, normalizeMaradonaLocation, normalizeWorkProfile } from './public/work-profile.js';
import { safeFolderName } from './storage-policy.js';

export function createSessionBinding(project, area) {
  if (typeof project !== 'string' || typeof area !== 'string' || !project || !area) return null;
  return Object.freeze({ project, area });
}

export function createSessionStorageBinding(workProfile, location) {
  const profile = normalizeWorkProfile(workProfile);
  if (profile.type !== MARADONA_WORK_PROFILE) return Object.freeze({ workProfile: profile, location: null });
  const normalizedLocation = normalizeMaradonaLocation(location);
  return normalizedLocation ? Object.freeze({ workProfile: profile, location: normalizedLocation }) : null;
}

export function createAllowedSessionAreas(project, requestedAreas, workProfile) {
  if (!safeFolderName(project) || !Array.isArray(requestedAreas)) return [];
  const seen = new Set();
  return requestedAreas.slice(0, 500).flatMap(item => {
    const name = safeFolderName(item?.name);
    const key = name.toLocaleLowerCase();
    const storage = createSessionStorageBinding(workProfile, item?.location);
    if (!name || seen.has(key) || !storage) return [];
    seen.add(key);
    return [{ name, location: storage.location }];
  });
}

export function matchesSessionBinding(session, project, area) {
  return Boolean(session && session.project === project && session.area === area);
}

export function authorizePhotoUpload(session, request, tokensEqual, now = Date.now()) {
  if (!session || now >= session.expiresAt || request.project !== session.project) return null;
  if (tokensEqual(session.controllerToken, request.controllerToken) && session.area === request.area) {
    return { role: 'controller', area: { name: session.area, location: session.location } };
  }
  if (!session.localMode || !tokensEqual(session.cameraToken, request.cameraToken)) return null;
  const area = session.allowedAreas.find(item => item.name === request.area);
  return area ? { role: 'camera', area } : null;
}
