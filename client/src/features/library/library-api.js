import { api } from '../../services/api-client.js';
import { getIdentityEpoch } from '../../services/cache.js';

/** @typedef {{ id: string, versionId: string, title: string, level: string, description: string }} Topic */
/** @typedef {{ id: string, contentId: string, title: string, level: string, description: string, knowledgeCount: number, questionCount: number }} TopicDetail */
/** @typedef {{ id: string, versionId: string, type: 'vocabulary'|'grammar', expression: string, reading?: string, meaning: string, examples: { japanese: string, vietnamese: string }[] }} Knowledge */
/** @typedef {{ id: string, knowledge: Knowledge, version: number }} SavedItem */
/** @typedef {{ knowledgeVersionId: string, deckVersionId: string, sessionId?: string, scenarioVersionId?: string, createdAt: string }} SavedSource */
/** @template T @typedef {{ items: T[], nextCursor?: string|null }} Page */

/** @param {{ filter: string, values: (string|undefined)[] }} props */
export function matchesLibraryText({ filter, values }) {
  const normalize = (/** @type {string} */ text) =>
    text.normalize('NFC').toLocaleLowerCase('vi');
  const normalized = normalize(filter);
  return values.some((value) => value && normalize(value).includes(normalized));
}

/** @param {string} path @param {Record<string, string | null | undefined>} params */
export function libraryPath(path, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return query.size ? `${path}?${query}` : path;
}

/** @template T @param {string} path @param {AbortSignal} [signal] @returns {Promise<T>} */
export async function readLibrary(path, signal) {
  const response = await api.get(path, { signal });
  ensureLibraryIdentity(response.epoch);
  return /** @type {T} */ (response.data);
}

/** @param {number} epoch */
export function ensureLibraryIdentity(epoch) {
  if (epoch !== getIdentityEpoch()) {
    throw new DOMException('Danh tính đã thay đổi.', 'AbortError');
  }
}

/** @param {string|null} cursor @param {AbortSignal} signal */
export function readSavedPage(cursor, signal) {
  return /** @type {Promise<Page<SavedItem>>} */ (
    readLibrary(libraryPath('/me/saved-items', { cursor }), signal)
  );
}

/**
 * @template T
 * @param {(cursor: string|null, signal: AbortSignal) => Promise<Page<T>>} readPage
 * @param {AbortSignal} signal
 * @param {(item: T) => boolean} [match]
 */
export async function collectLibraryItems(readPage, signal, match) {
  /** @type {T[]} */
  const items = [];
  let cursor = null;
  do {
    signal.throwIfAborted();
    const page = await readPage(cursor, signal);
    if (match) {
      const item = page.items.find(match);
      if (item) return [item];
    } else {
      items.push(...page.items);
    }
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return items;
}

/** @param {Knowledge} item @param {string} deckVersionId @param {{idempotencyKey: string, signal: AbortSignal}} options */
export async function saveKnowledge(item, deckVersionId, options) {
  const response = await api.post(
    '/me/saved-items',
    { knowledgeVersionId: item.versionId, deckVersionId },
    options,
  );
  ensureLibraryIdentity(response.epoch);
  return /** @type {SavedItem} */ (response.data);
}

/** @param {SavedItem} item @param {{idempotencyKey: string, signal: AbortSignal}} options */
export async function unsaveKnowledge(item, options) {
  const response = await api.delete(
    libraryPath(`/me/saved-items/${encodeURIComponent(item.id)}`, {
      expectedVersion: String(item.version),
    }),
    options,
  );
  ensureLibraryIdentity(response.epoch);
}
