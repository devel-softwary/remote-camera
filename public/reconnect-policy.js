export const MAX_RECONNECT_DELAY_MS = 30_000;

export function reconnectDelay(attempt) {
  const safeAttempt = Math.max(0, Math.min(10, Number(attempt) || 0));
  return Math.min(MAX_RECONNECT_DELAY_MS, 1000 * (2 ** safeAttempt));
}

export function canRetryConnection(closeCode) {
  return ![4001, 4003].includes(Number(closeCode));
}
