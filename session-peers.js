export const CENTRAL_ROLE = 'controller-central';
export const MOBILE_ROLE = 'controller-mobile';
export const CAMERA_ROLE = 'camera';

export function normalizedRole(role) {
  if (role === 'controller' || role === CENTRAL_ROLE) return CENTRAL_ROLE;
  if (role === MOBILE_ROLE || role === CAMERA_ROLE) return role;
  return null;
}

export function controllerRoles() { return [CENTRAL_ROLE, MOBILE_ROLE]; }

export function activePeerCount(session) {
  return Number(Boolean(session.camera)) + controllerRoles().filter(role => Boolean(session[role])).length;
}

export function signalTargetRole(senderRole, targetRole) {
  if (senderRole !== CAMERA_ROLE) return null;
  if (!targetRole) return CENTRAL_ROLE; // camera client before mobile-controller support
  return controllerRoles().includes(targetRole) ? targetRole : null;
}
