export const CONNECTION_TIMEOUT_MS = 300_000;
export const SELECTION_TIMEOUT_MS = 60_000;

/** @param {any} doc @param {Date} at */
export function sessionClocks(doc, at) {
  const elapsed = (/** @type {unknown} */ since) =>
    since instanceof Date ? Math.max(0, at.getTime() - since.getTime()) : 0;
  return {
    activeDurationMs: doc.activeDurationMs + elapsed(doc.activeSince),
    selectionRemainingMs: Math.max(
      0,
      doc.selectionRemainingMs -
        (doc.deckVersionId ? 0 : elapsed(doc.selectionRunningSince)),
    ),
  };
}

/** @param {any} doc @returns {{at: Date, reason: string} | undefined} */
export function sessionDeadline(doc) {
  /** @type {{at: Date, reason: string}[]} */
  const deadlines = [];
  if (!doc.startedAt && doc.createdAt instanceof Date) {
    deadlines.push({
      at: new Date(doc.createdAt.getTime() + CONNECTION_TIMEOUT_MS),
      reason: 'connection_timeout',
    });
  }
  for (const item of doc.presence ?? []) {
    if (!item.connected && item.reconnectUntil instanceof Date) {
      deadlines.push({ at: item.reconnectUntil, reason: 'connection_timeout' });
    }
  }
  if (!doc.deckVersionId && doc.selectionRunningSince instanceof Date) {
    deadlines.push({
      at: new Date(
        doc.selectionRunningSince.getTime() + doc.selectionRemainingMs,
      ),
      reason: 'selection_timeout',
    });
  }
  return deadlines.sort((a, b) => a.at.getTime() - b.at.getTime())[0];
}
