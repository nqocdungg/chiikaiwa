import { api, createIdempotencyKey } from '../../services/api-client.js';
import { getCurrentActorKey } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import { ensureLibraryIdentity } from '../library/library-api.js';

/** @typedef {{ id: string, text: string }} QuizOption */
/** @typedef {{ questionVersionId: string, type: 'multipleChoice'|'shortAnswer', prompt: string, options?: QuizOption[] }} QuizQuestion */
/** @typedef {{ questionVersionId: string, optionId?: string, text?: string }} QuizAnswer */
/** @typedef {{ id: string, deckVersionId: string, sourceSessionId?: string, status: 'inProgress', total: number, version: number, questions: QuizQuestion[] }} QuizPublic */
/** @typedef {{ questionVersionId: string, isCorrect: boolean, points: 0|1, correctOptionId?: string, acceptedAnswers?: string[], explanation: string, knowledgeVersionIds: string[] }} QuizResultItem */
/** @typedef {{ id: string, deckVersionId: string, sourceSessionId?: string, status: 'submitted', total: number, version: number, questions: QuizQuestion[], answers: QuizAnswer[], score: number, submittedAt: string, results: QuizResultItem[] }} QuizResult */
/** @typedef {{ expectedVersion: number, answers: QuizAnswer[] }} SubmitBody */
/** @typedef {{ key: string, body: SubmitBody }} SubmitIntent */

const CREATE_KEY_PREFIX = 'ck-quiz-create:';

/**
 * @param {string} deckVersionId
 * @param {string} [sourceSessionId]
 */
function createKeyStorageName(deckVersionId, sourceSessionId) {
  return `${CREATE_KEY_PREFIX}${getCurrentActorKey() ?? 'anonymous'}:${deckVersionId}:${sourceSessionId ?? ''}`;
}

/**
 * @param {string} deckVersionId
 * @param {string} [sourceSessionId]
 */
export function takeCreateKey(deckVersionId, sourceSessionId) {
  const name = createKeyStorageName(deckVersionId, sourceSessionId);
  try {
    const stored = window.sessionStorage.getItem(name);
    if (stored) return stored;
    const key = createIdempotencyKey();
    window.sessionStorage.setItem(name, key);
    return key;
  } catch {
    return createIdempotencyKey();
  }
}

/**
 * @param {string} deckVersionId
 * @param {string} [sourceSessionId]
 */
export function releaseCreateKey(deckVersionId, sourceSessionId) {
  try {
    window.sessionStorage.removeItem(
      createKeyStorageName(deckVersionId, sourceSessionId),
    );
  } catch {
    return;
  }
}

/**
 * @param {{ deckVersionId: string, sourceSessionId?: string }} input
 * @param {{ idempotencyKey: string, signal?: AbortSignal }} options
 */
export async function createQuiz({ deckVersionId, sourceSessionId }, options) {
  const response = await api.post(
    '/quizzes',
    sourceSessionId ? { deckVersionId, sourceSessionId } : { deckVersionId },
    options,
  );
  ensureLibraryIdentity(response.epoch);
  return /** @type {QuizPublic} */ (response.data);
}

/**
 * @param {string} quizId
 * @param {AbortSignal} [signal]
 */
export async function readQuiz(quizId, signal) {
  const response = await api.get(`/quizzes/${encodeURIComponent(quizId)}`, {
    signal,
  });
  ensureLibraryIdentity(response.epoch);
  return /** @type {QuizPublic | QuizResult} */ (response.data);
}

/**
 * @param {string} quizId
 * @param {SubmitIntent} intent
 * @param {AbortSignal} [signal]
 */
export async function submitQuiz(quizId, intent, signal) {
  const response = await api.post(
    `/quizzes/${encodeURIComponent(quizId)}/submission`,
    intent.body,
    { idempotencyKey: intent.key, signal },
  );
  ensureLibraryIdentity(response.epoch);
  return /** @type {QuizResult} */ (response.data);
}

/**
 * Checks whether an API error represents an uncertain/transient network or timeout failure
 * where the same Idempotency-Key should be preserved for retry.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isQuizRetryableError(err) {
  if (err instanceof ApiError) {
    return err.isRetryable() || err.status === 504;
  }
  const e = /** @type {{ code?: string, status?: number } | null} */ (err);
  return (
    e?.code === 'TIMEOUT' ||
    e?.code === 'NETWORK_ERROR' ||
    e?.code === 'SERVICE_UNAVAILABLE' ||
    e?.status === 503 ||
    e?.status === 504
  );
}

/**
 * Handles session expiry, guest expiry, and account lock errors uniformly (04 §6, 07 §12).
 *
 * @param {unknown} err
 * @param {{
 *   auth: { invalidateSession?: (notice?: string | null) => void, updateUser?: (partial: { status: 'locked' }) => void },
 *   navigate: (to: string, options?: { replace?: boolean }) => void,
 *   onBeforeNavigate?: () => void,
 * }} ctx
 * @returns {boolean}
 */
export function handleQuizLifecycleError(
  err,
  { auth, navigate, onBeforeNavigate },
) {
  const e = /** @type {{ status?: number, code?: string } | null} */ (err);
  if (!e) return false;

  const isGuestExpired =
    err instanceof ApiError
      ? err.isGuestExpired()
      : e.status === 410 || e.code === 'GUEST_EXPIRED';
  if (isGuestExpired) {
    onBeforeNavigate?.();
    navigate('/expired', { replace: true });
    return true;
  }

  const isAuthRequired =
    err instanceof ApiError
      ? err.isAuthRequired() || err.status === 401
      : e.status === 401 ||
        e.code === 'AUTH_REQUIRED' ||
        e.code === 'SESSION_EXPIRED';
  if (isAuthRequired) {
    onBeforeNavigate?.();
    auth.invalidateSession?.(
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    );
    navigate('/login', { replace: true });
    return true;
  }

  if (e.code === 'ACCOUNT_LOCKED') {
    onBeforeNavigate?.();
    auth.updateUser?.({ status: 'locked' });
    return true;
  }

  return false;
}

/**
 * Formats API error messages according to 07 §12 (requestId on 500, Retry-After on 429).
 *
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
export function formatQuizError(err, fallback) {
  const e =
    /** @type {{ status?: number, code?: string, message?: string, retryAfter?: number | null, meta?: { requestId?: string } } | null} */ (
      err
    );
  if (!e) return fallback;

  if (e.status === 429 || e.code === 'RATE_LIMITED') {
    if (typeof e.retryAfter === 'number' && e.retryAfter > 0) {
      return `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${e.retryAfter} giây.`;
    }
    return (
      e.message || 'Bạn thao tác quá nhanh. Vui lòng chờ giây lát rồi thử lại.'
    );
  }

  if (e.status === 500 || e.code === 'INTERNAL_ERROR') {
    const base = e.message || 'Hệ thống gặp sự cố tạm thời.';
    const reqId = e.meta?.requestId;
    return reqId ? `${base} (Mã tra cứu: ${reqId})` : base;
  }

  if (e instanceof Error && e.message) {
    return e.message;
  }
  return typeof e.message === 'string' && e.message ? e.message : fallback;
}
