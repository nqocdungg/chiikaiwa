import { api } from '../../services/api-client.js';
import { ApiError } from '../../services/errors.js';

export const MAX_REPORT_REASON_LENGTH = 500;
export const MAX_REPORT_DESCRIPTION_LENGTH = 2000;
export const DEFAULT_BLOCKS_LIMIT = 20;

export const REPORT_REASON_SUGGESTIONS = [
  'Ngôn từ không phù hợp hoặc thiếu tôn trọng',
  'Quấy rối hoặc làm phiền trong phiên luyện',
  'Nội dung không phù hợp với môi trường học tập',
  'Hành vi gây cản trở buổi luyện tập',
];

/**
 * @typedef {Object} PartnerProfile
 * @property {string} [level]
 * @property {string} [goal]
 * @property {string} [nativeLanguageCode]
 * @property {string} [countryCode]
 * @property {string[]} [interests]
 */

/**
 * @typedef {Object} SafetyPartner
 * @property {string} actorKey
 * @property {string} [displayName]
 * @property {string} [avatarKey]
 * @property {PartnerProfile} [profile]
 */

/**
 * @typedef {Object} BlockItem
 * @property {string} id
 * @property {SafetyPartner} partner
 * @property {string} createdAt
 */

/**
 * @typedef {Object} BlockListData
 * @property {BlockItem[]} items
 * @property {string | null} nextCursor
 */

/**
 * @typedef {Object} ReportCreatedData
 * @property {string} id
 * @property {'new' | 'inProgress' | 'resolved' | 'rejected'} status
 * @property {string} createdAt
 */

/**
 * Counts Unicode code points (matching BE-019 server validation in 07 §2.3).
 * @param {string} value
 * @returns {number}
 */
export function countCodePoints(value) {
  return [...value].length;
}

/**
 * Resolves a safe, non-empty partner display name from Partner DTO.
 * @param {SafetyPartner | null | undefined} partner
 * @returns {string}
 */
export function resolvePartnerDisplayName(partner) {
  const trimmed = partner?.displayName?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (partner?.actorKey?.toLowerCase().startsWith('guest:')) {
    return 'Khách';
  }
  return 'Bạn luyện';
}

/**
 * Resolves the partner member from a Session's members array given current identity.
 * @param {SafetyPartner[] | undefined} members
 * @param {{
 *   identityKey?: string | null,
 *   kind?: 'user' | 'guest' | 'unauthenticated',
 *   userId?: string | null,
 *   guestActorKey?: string | null,
 *   guestId?: string | null,
 * }} actor
 * @returns {SafetyPartner | null}
 */
export function resolveSessionPartner(members, actor) {
  if (!Array.isArray(members) || members.length === 0) {
    return null;
  }

  let selfKey = actor.identityKey?.toLowerCase() ?? '';
  if (!selfKey && actor.kind === 'user' && actor.userId) {
    selfKey = `user:${actor.userId.toLowerCase()}`;
  } else if (!selfKey && actor.kind === 'guest') {
    if (actor.guestActorKey) {
      selfKey = actor.guestActorKey.toLowerCase();
    } else if (actor.guestId) {
      selfKey = `guest:${actor.guestId.toLowerCase()}`;
    }
  }

  if (selfKey) {
    const partner = members.find(
      (member) => member.actorKey.toLowerCase() !== selfKey,
    );
    return partner ?? null;
  }

  if (actor.kind === 'guest') {
    return (
      members.find((member) =>
        member.actorKey.toLowerCase().startsWith('user:'),
      ) ?? null
    );
  }

  return null;
}

/**
 * Validates report form inputs according to 07 §2.3 & BE-019.
 * @param {{ reason: string, description: string }} input
 * @returns {{
 *   valid: boolean,
 *   reason: string,
 *   description: string | undefined,
 *   fieldErrors: Record<string, string>,
 * }}
 */
export function validateReportForm({ reason, description }) {
  /** @type {Record<string, string>} */
  const fieldErrors = {};
  const trimmedReason = reason.trim();

  if (trimmedReason.length === 0) {
    fieldErrors.reason = 'Vui lòng nhập lý do báo cáo.';
  } else if (countCodePoints(trimmedReason) > MAX_REPORT_REASON_LENGTH) {
    fieldErrors.reason = `Lý do báo cáo không được vượt quá ${MAX_REPORT_REASON_LENGTH} ký tự.`;
  }

  if (countCodePoints(description) > MAX_REPORT_DESCRIPTION_LENGTH) {
    fieldErrors.description = `Mô tả chi tiết không được vượt quá ${MAX_REPORT_DESCRIPTION_LENGTH} ký tự.`;
  }

  const normalizedDescription =
    description.length > 0 ? description : undefined;

  return {
    valid: Object.keys(fieldErrors).length === 0,
    reason: trimmedReason,
    description: normalizedDescription,
    fieldErrors,
  };
}

/**
 * Formats an API error into user-facing Vietnamese text and metadata flags.
 * @param {unknown} err
 * @param {string} fallbackMessage
 * @returns {{
 *   message: string,
 *   retryable: boolean,
 *   fieldErrors: Record<string, string>,
 *   requestId: string | null,
 *   code: string | null,
 * }}
 */
export function formatSafetyError(err, fallbackMessage) {
  if (!(err instanceof ApiError)) {
    return {
      message:
        err instanceof Error && err.message ? err.message : fallbackMessage,
      retryable: false,
      fieldErrors: {},
      requestId: null,
      code: null,
    };
  }

  const requestId = err.meta?.requestId ?? null;
  const fieldErrors = err.isValidationError() ? err.getFieldErrors() : {};

  if (err.isRateLimited()) {
    const waitHint =
      typeof err.retryAfter === 'number' && err.retryAfter > 0
        ? ` Vui lòng thử lại sau ${err.retryAfter} giây.`
        : ' Vui lòng thử lại sau ít phút.';
    return {
      message: `${err.message || 'Bạn thao tác quá nhanh.'}${waitHint}`,
      retryable: false,
      fieldErrors,
      requestId,
      code: err.code,
    };
  }

  if (err.status === 500 || err.code === 'INTERNAL_ERROR') {
    const refHint = requestId ? ` (Mã yêu cầu: ${requestId})` : '';
    return {
      message: `${err.message || fallbackMessage}${refHint}`,
      retryable: false,
      fieldErrors,
      requestId,
      code: err.code,
    };
  }

  if (err.isRetryable()) {
    return {
      message:
        err.message ||
        'Kết nối tạm thời gián đoạn. Bạn có thể thử gửi lại với cùng yêu cầu này.',
      retryable: true,
      fieldErrors,
      requestId,
      code: err.code,
    };
  }

  return {
    message: err.message || fallbackMessage,
    retryable: false,
    fieldErrors,
    requestId,
    code: err.code,
  };
}

/**
 * Formats an ISO timestamp for Vietnamese display.
 * @param {string} isoString
 * @returns {string}
 */
export function formatSafetyDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * GET /api/v1/me/blocks (BE-019, 07 §10)
 * @param {{ limit?: number, cursor?: string, signal?: AbortSignal }} [params]
 */
export async function listMyBlocks({
  limit = DEFAULT_BLOCKS_LIMIT,
  cursor,
  signal,
} = {}) {
  const searchParams = new URLSearchParams();
  if (limit !== undefined) {
    searchParams.set('limit', String(limit));
  }
  if (cursor) {
    searchParams.set('cursor', cursor);
  }
  const query = searchParams.toString();
  const path = query ? `/me/blocks?${query}` : '/me/blocks';
  const response = await api.get(path, { signal });
  return {
    ...response,
    data: /** @type {BlockListData} */ (response.data),
  };
}

/**
 * POST /api/v1/me/blocks (BE-019, 07 §10)
 * @param {{ sessionId: string, targetActorKey: string, idempotencyKey: string }} params
 */
export async function createBlock({
  sessionId,
  targetActorKey,
  idempotencyKey,
}) {
  const response = await api.post(
    '/me/blocks',
    { sessionId, targetActorKey },
    { idempotencyKey },
  );
  return {
    ...response,
    data: /** @type {{ id: string }} */ (response.data),
  };
}

/**
 * DELETE /api/v1/me/blocks/:id (BE-019, 07 §10)
 * @param {string} blockId
 * @param {{ idempotencyKey: string }} params
 */
export async function deleteMyBlock(blockId, { idempotencyKey }) {
  return api.delete(`/me/blocks/${encodeURIComponent(blockId)}`, {
    idempotencyKey,
  });
}

/**
 * POST /api/v1/reports (BE-019, 07 §10)
 * @param {{
 *   sessionId: string,
 *   targetActorKey: string,
 *   reason: string,
 *   description?: string,
 *   idempotencyKey: string,
 * }} params
 */
export async function createReport({
  sessionId,
  targetActorKey,
  reason,
  description,
  idempotencyKey,
}) {
  /** @type {{ sessionId: string, targetActorKey: string, reason: string, description?: string }} */
  const payload = {
    sessionId,
    targetActorKey,
    reason,
    ...(description !== undefined && description.length > 0
      ? { description }
      : {}),
  };
  const response = await api.post('/reports', payload, { idempotencyKey });
  return {
    ...response,
    data: /** @type {ReportCreatedData} */ (response.data),
  };
}
