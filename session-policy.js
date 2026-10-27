import { MARADONA_WORK_PROFILE, normalizeMaradonaLocation, normalizeWorkProfile } from './public/work-profile.js';

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

export function matchesSessionBinding(session, project, area) {
  return Boolean(session && session.project === project && session.area === area);
}
