import { api } from '../../services/api-client.js';
import { getIdentityEpoch } from '../../services/cache.js';

/** @typedef {{confidence: number, comment?: string}} SelfAssessment */
/** @typedef {{sessionId: string, note?: string, noteVersion: number, selfAssessment?: SelfAssessment, version: number}} PersonalSession */
/** @typedef {{id: string, versionId: string, type: 'vocabulary'|'grammar', expression: string, reading?: string, meaning: string, examples: {japanese: string, vietnamese: string}[], isSaved: boolean}} HintKnowledge */
/** @typedef {{id: string, knowledge: Omit<HintKnowledge, 'isSaved'>, savedAt: string, version: number}} SavedItem */
/** @typedef {{session: {members: {actorKey: string, displayName: string}[], activeDurationMs: number, endReason?: string, deckVersionId?: string}, drawnCards: {id: string, title: string, status: 'completed'|'skipped'|'unfinished'|'current'}[], personal: PersonalSession, savedSources: {knowledgeVersionId: string, deckVersionId: string}[]}} SessionSummaryData */

/** @param {number} epoch */
function ensureCurrentIdentity(epoch) {
  if (epoch !== getIdentityEpoch()) {
    throw new DOMException('Danh tính đã thay đổi.', 'AbortError');
  }
}

/** @param {string} sessionId @param {AbortSignal} [signal] */
export async function getSessionPersonal(sessionId, signal) {
  const response = await api.get(
    `/sessions/${encodeURIComponent(sessionId)}/personal`,
    { signal },
  );
  ensureCurrentIdentity(response.epoch);
  return /** @type {PersonalSession} */ (response.data);
}

/** @param {string} sessionId @param {number} expectedVersion @param {string} note @param {{idempotencyKey?: string, signal?: AbortSignal}} [options] */
export async function putSessionNote(
  sessionId,
  expectedVersion,
  note,
  options,
) {
  const response = await api.put(
    `/sessions/${encodeURIComponent(sessionId)}/note`,
    { expectedVersion, note },
    options,
  );
  ensureCurrentIdentity(response.epoch);
  return /** @type {PersonalSession} */ (response.data);
}

/** @param {string} sessionId @param {number} expectedVersion @param {{idempotencyKey?: string, signal?: AbortSignal}} [options] */
export async function deleteSessionNote(sessionId, expectedVersion, options) {
  const query = new URLSearchParams({
    expectedVersion: String(expectedVersion),
  });
  const response = await api.delete(
    `/sessions/${encodeURIComponent(sessionId)}/note?${query}`,
    options,
  );
  ensureCurrentIdentity(response.epoch);
}

/** @param {string} sessionId @param {number} expectedVersion @param {SelfAssessment} assessment @param {{idempotencyKey?: string, signal?: AbortSignal}} [options] */
export async function putSessionSelfAssessment(
  sessionId,
  expectedVersion,
  assessment,
  options,
) {
  const response = await api.put(
    `/sessions/${encodeURIComponent(sessionId)}/self-assessment`,
    { expectedVersion, ...assessment },
    options,
  );
  ensureCurrentIdentity(response.epoch);
  return /** @type {PersonalSession} */ (response.data);
}

/** @param {string} sessionId @param {string} cardId @param {AbortSignal} [signal] */
export async function getSessionHints(sessionId, cardId, signal) {
  const response = await api.get(
    `/sessions/${encodeURIComponent(sessionId)}/cards/${encodeURIComponent(cardId)}/hints`,
    { signal },
  );
  ensureCurrentIdentity(response.epoch);
  return /** @type {{hints: string[], knowledge: HintKnowledge[]}} */ (
    response.data
  );
}

/** @param {string|null} cursor @param {AbortSignal} signal */
async function getSavedItemsPage(cursor, signal) {
  const query = new URLSearchParams();
  if (cursor) query.set('cursor', cursor);
  const response = await api.get(
    `/me/saved-items${query.size ? `?${query}` : ''}`,
    { signal },
  );
  ensureCurrentIdentity(response.epoch);
  return /** @type {{items: SavedItem[], nextCursor?: string|null}} */ (
    response.data
  );
}

/** @param {string} knowledgeId @param {AbortSignal} signal */
export async function findSavedKnowledge(knowledgeId, signal) {
  let cursor = null;
  do {
    signal.throwIfAborted();
    const page = await getSavedItemsPage(cursor, signal);
    const found = page.items.find((item) => item.knowledge.id === knowledgeId);
    if (found) return found;
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return null;
}

/** @param {HintKnowledge} item @param {{sessionId: string, scenarioVersionId: string, deckVersionId: string}} source @param {{idempotencyKey?: string, signal?: AbortSignal}} [options] */
export async function saveSessionKnowledge(item, source, options) {
  const response = await api.post(
    '/me/saved-items',
    {
      knowledgeVersionId: item.versionId,
      deckVersionId: source.deckVersionId,
      sessionId: source.sessionId,
      scenarioVersionId: source.scenarioVersionId,
    },
    options,
  );
  ensureCurrentIdentity(response.epoch);
  return /** @type {SavedItem} */ (response.data);
}

/** @param {SavedItem} item @param {{idempotencyKey?: string, signal?: AbortSignal}} [options] */
export async function unsaveSessionKnowledge(item, options) {
  const query = new URLSearchParams({ expectedVersion: String(item.version) });
  const response = await api.delete(
    `/me/saved-items/${encodeURIComponent(item.id)}?${query}`,
    options,
  );
  ensureCurrentIdentity(response.epoch);
}

/** @param {string} sessionId @param {AbortSignal} [signal] */
export async function getSessionSummary(sessionId, signal) {
  const response = await api.get(
    `/sessions/${encodeURIComponent(sessionId)}/summary`,
    { signal },
  );
  ensureCurrentIdentity(response.epoch);
  return /** @type {SessionSummaryData} */ (response.data);
}
