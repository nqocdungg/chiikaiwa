import { api } from '../../services/api-client.js';

/** @typedef {{actorKey: string, displayName: string}} SessionMember */
/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {'preparing'|'active'|'reconnecting'|'ended'} status
 * @property {number} version
 * @property {SessionMember[]} members
 * @property {number} activeDurationMs
 * @property {number} selectionRemainingMs
 * @property {string} [reconnectUntil]
 * @property {string} [controllerKey]
 * @property {string} [deckVersionId]
 * @property {{title: string, context: string, objective: string, myRole: string}} [currentCard]
 */

/** @param {string} id @param {AbortSignal} [signal] */
export async function getSession(id, signal) {
  const response = await api.get(`/sessions/${encodeURIComponent(id)}`, {
    signal,
  });
  return { ...response, data: /** @type {Session} */ (response.data) };
}

/** @param {string} id @param {AbortSignal} [signal] */
export async function getMediaToken(id, signal) {
  const response = await api.post(
    `/sessions/${encodeURIComponent(id)}/media-token`,
    {},
    { signal },
  );
  return {
    ...response,
    data: /** @type {{url: string, token: string, expiresAt: string}} */ (
      response.data
    ),
  };
}

/** @param {string} id @param {string} idempotencyKey */
export async function leaveSession(id, idempotencyKey) {
  const response = await api.post(
    `/sessions/${encodeURIComponent(id)}/leave`,
    {},
    { idempotencyKey },
  );
  return { ...response, data: /** @type {Session} */ (response.data) };
}
