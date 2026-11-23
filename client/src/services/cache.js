/**
 * In-memory private cache manager with identity epoch isolation.
 * Guarantees that private cache is completely cleared when identity changes,
 * and stale in-flight requests from a previous identity cannot restore private state.
 */

let currentEpoch = 0;
/** @type {string | null} */
let currentActorKey = null;
/** @type {Map<string, unknown>} */
const privateCache = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * Returns the current identity epoch.
 * Used by async requests to verify identity hasn't changed before updating state/cache.
 * @returns {number}
 */
export function getIdentityEpoch() {
  return currentEpoch;
}

/**
 * Returns the current actor key associated with the private cache.
 * @returns {string | null}
 */
export function getCurrentActorKey() {
  return currentActorKey;
}

/**
 * Updates the current actor key and invalidates private cache if identity changed.
 * @param {string | null} nextActorKey
 */
export function setIdentityKey(nextActorKey) {
  if (currentActorKey !== nextActorKey) {
    currentActorKey = nextActorKey;
    clearPrivateCache();
  }
}

/**
 * Retrieves a value from the private in-memory cache.
 * @template T
 * @param {string} key
 * @returns {T | undefined}
 */
export function getPrivateCache(key) {
  return /** @type {T | undefined} */ (privateCache.get(key));
}

/**
 * Stores a value in the private in-memory cache, verifying that the request epoch matches current epoch.
 * @param {string} key
 * @param {unknown} value
 * @param {number} [epoch] Optional request epoch. If passed and doesn't match current, write is discarded.
 * @returns {boolean} True if stored, false if discarded due to epoch mismatch.
 */
export function setPrivateCache(key, value, epoch) {
  if (epoch !== undefined && epoch !== currentEpoch) {
    return false;
  }
  privateCache.set(key, value);
  return true;
}

/**
 * Clears all private in-memory cache and increments identity epoch.
 */
export function clearPrivateCache() {
  currentEpoch += 1;
  privateCache.clear();
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore listener error to guarantee complete cache wipe
    }
  }
}

/**
 * Subscribes to private cache wipe events.
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe function
 */
export function onClearPrivateCache(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
