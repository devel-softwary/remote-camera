export const CAPTURE_TIMEOUT_MS = 75_000;

export function canStartCapture(canCapture, requestId) {
  return Boolean(canCapture) && !requestId;
}

export function isCurrentCapture(requestId, messageRequestId) {
  return Boolean(requestId) && requestId === messageRequestId;
}

export function isCompletePhoto(receivedSize, expectedSize) {
  const received = Number(receivedSize);
  const expected = Number(expectedSize);
  return Number.isSafeInteger(received) && Number.isSafeInteger(expected) && expected > 0 && received === expected;
}
