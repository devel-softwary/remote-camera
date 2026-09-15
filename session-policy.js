export function sessionTokenMode(value) {
  return value === true ? 'reusable' : 'one-time';
}

export function consumeCameraToken(session) {
  if (session.tokenMode === 'reusable') return true;
  if (session.cameraTokenConsumed) return false;
  session.cameraTokenConsumed = true;
  return true;
}
