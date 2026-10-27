export const GENERIC_WORK_PROFILE = 'generic';
export const MARADONA_WORK_PROFILE = 'maradona';
export const MARADONA_WORK_NAME = 'DAM';

export function normalizeWorkProfile(profile) {
  return profile?.type === MARADONA_WORK_PROFILE
    ? { type: MARADONA_WORK_PROFILE, workName: MARADONA_WORK_NAME }
    : { type: GENERIC_WORK_PROFILE };
}

function boundedNumber(value, prefix, min, max) {
  const normalized = String(value ?? '').trim().toUpperCase();
  const number = Number(normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

export function normalizeMaradonaLocation(location) {
  const tower = boundedNumber(location?.tower, 'TR', 1, 28);
  const face = String(location?.face || '').trim().toUpperCase();
  const node = boundedNumber(location?.node, 'N', 1, 100);
  if (tower === null || !['A', 'B', 'C', 'D'].includes(face) || node === null) return null;
  return {
    tower: `TR${String(tower).padStart(2, '0')}`,
    face,
    node: `N${String(node).padStart(3, '0')}`
  };
}

export function maradonaPointName(location) {
  const normalized = normalizeMaradonaLocation(location);
  return normalized ? `${normalized.tower}_${normalized.face}_${normalized.node}` : '';
}
