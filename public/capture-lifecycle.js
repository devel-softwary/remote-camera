export const CAPTURE_TIMEOUT_MS = 75_000;

export function canStartCapture(canCapture, requestId) {
  return Boolean(canCapture) && !requestId;
}

export function isCurrentCapture(requestId, messageRequestId) {
  return Boolean(requestId) && requestId === messageRequestId;
}
