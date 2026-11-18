import { api } from '../../services/api-client.js';
import { ApiError } from '../../services/errors.js';

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/iu;
const INVITATION_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/u;
const INVITATION_STATUSES = new Set(['open', 'used', 'cancelled', 'expired']);
const REQUEST_STATUSES = new Set([
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
]);

/** @typedef {{actorKey: string, displayName: string, avatarKey?: string, profile?: Record<string, unknown>}} Partner */
/** @typedef {{id: string, status: string, version: number, expiresAt: string, code?: string, sessionId?: string}} Invitation */
/** @typedef {{id: string, invitationId: string, requester: Partner, status: string, version: number, expiresAt: string, sessionId?: string}} InviteRequest */

/** @param {string} code */
export function normalizeInvitationCode(code) {
  return code.trim().toUpperCase();
}

/** @param {string} code */
export function isValidInvitationCode(code) {
  return INVITATION_CODE_PATTERN.test(normalizeInvitationCode(code));
}

function invalidResponse() {
  return new ApiError({
    status: 502,
    code: 'INVALID_RESPONSE',
    message: 'Phản hồi phòng mời không hợp lệ. Vui lòng thử lại.',
  });
}

/** @param {unknown} value */
function validId(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

/** @param {unknown} value */
function validVersion(value) {
  return Number.isInteger(value) && Number(value) >= 0;
}

/** @param {unknown} value */
function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** @param {unknown} value @returns {Invitation} */
function invitationDto(value) {
  const item = /** @type {Record<string, unknown>} */ (value);
  if (
    !item ||
    typeof item !== 'object' ||
    !validId(item.id) ||
    !INVITATION_STATUSES.has(String(item.status)) ||
    !validVersion(item.version) ||
    !validDate(item.expiresAt) ||
    (item.code !== undefined &&
      (typeof item.code !== 'string' ||
        !INVITATION_CODE_PATTERN.test(item.code))) ||
    (item.sessionId !== undefined && !validId(item.sessionId))
  ) {
    throw invalidResponse();
  }
  return /** @type {Invitation} */ (item);
}

/** @param {unknown} value @returns {Invitation} */
function hostInvitationDto(value) {
  const invitation = invitationDto(value);
  if (
    invitation.status === 'open' &&
    (!invitation.code || !INVITATION_CODE_PATTERN.test(invitation.code))
  ) {
    throw invalidResponse();
  }
  return invitation;
}

/** @param {unknown} value @returns {InviteRequest} */
function requestDto(value) {
  const item = /** @type {Record<string, unknown>} */ (value);
  const requester = /** @type {Record<string, unknown>} */ (item?.requester);
  if (
    !item ||
    typeof item !== 'object' ||
    !validId(item.id) ||
    !validId(item.invitationId) ||
    !REQUEST_STATUSES.has(String(item.status)) ||
    !validVersion(item.version) ||
    !validDate(item.expiresAt) ||
    !requester ||
    typeof requester.actorKey !== 'string' ||
    typeof requester.displayName !== 'string' ||
    (item.sessionId !== undefined && !validId(item.sessionId)) ||
    (item.status === 'accepted' && !validId(item.sessionId))
  ) {
    throw invalidResponse();
  }
  return /** @type {InviteRequest} */ (item);
}

/** @param {{data: unknown, meta?: {serverTime?: string}}} response */
function withServerTime(response) {
  const serverTime = response.meta?.serverTime;
  if (!validDate(serverTime)) throw invalidResponse();
  return {
    data: response.data,
    serverTime: /** @type {string} */ (serverTime),
  };
}

/** @param {{idempotencyKey: string, signal?: AbortSignal}} options */
export async function createInvitation(options) {
  const response = await api.post('/invitations', {}, options);
  const result = withServerTime(response);
  return { ...result, data: hostInvitationDto(result.data) };
}

/** @param {string} invitationId @param {{signal?: AbortSignal}} [options] */
export async function readInvitation(invitationId, options) {
  const response = await api.get(
    `/invitations/${encodeURIComponent(invitationId)}`,
    options,
  );
  const result = withServerTime(response);
  return { ...result, data: hostInvitationDto(result.data) };
}

/** @param {string} invitationId @param {{signal?: AbortSignal}} [options] */
export async function readPendingRequests(invitationId, options) {
  const response = await api.get(
    `/invitations/${encodeURIComponent(invitationId)}/requests?status=pending&limit=50`,
    options,
  );
  const result = withServerTime(response);
  const page = /** @type {{items?: unknown[]}} */ (result.data);
  if (!page || !Array.isArray(page.items)) throw invalidResponse();
  return { ...result, data: page.items.map(requestDto) };
}

/** @param {string} code @param {{idempotencyKey: string, signal?: AbortSignal}} options */
export async function createInviteRequest(code, options) {
  const response = await api.post(
    '/invitation-requests',
    { code: normalizeInvitationCode(code) },
    options,
  );
  const result = withServerTime(response);
  return { ...result, data: requestDto(result.data) };
}

/** @param {string} code @param {{idempotencyKey: string, signal?: AbortSignal}} options */
export async function createGuestTrial(code, options) {
  const response = await api.post(
    '/guest-trials',
    { code: normalizeInvitationCode(code) },
    options,
  );
  const result = withServerTime(response);
  const data = /** @type {{request?: unknown, guest?: {status?: string}}} */ (
    result.data
  );
  if (!data?.guest || typeof data.guest.status !== 'string') {
    throw invalidResponse();
  }
  return {
    ...result,
    data: { request: requestDto(data.request), guest: data.guest },
  };
}

/** @param {string} requestId @param {{signal?: AbortSignal}} [options] */
export async function readInviteRequest(requestId, options) {
  const response = await api.get(
    `/invitation-requests/${encodeURIComponent(requestId)}`,
    options,
  );
  const result = withServerTime(response);
  return { ...result, data: requestDto(result.data) };
}

/** @param {InviteRequest} request @param {'accept'|'reject'} decision @param {{idempotencyKey: string, signal?: AbortSignal}} options */
export async function respondToInviteRequest(request, decision, options) {
  const response = await api.post(
    `/invitation-requests/${encodeURIComponent(request.id)}/responses`,
    { expectedVersion: request.version, decision },
    options,
  );
  const result = withServerTime(response);
  return { ...result, data: requestDto(result.data) };
}

/** @param {Invitation} invitation @param {{idempotencyKey: string, signal?: AbortSignal}} options */
export function cancelInvitation(invitation, options) {
  return api.delete(
    `/invitations/${encodeURIComponent(invitation.id)}?expectedVersion=${invitation.version}`,
    options,
  );
}

/** @param {InviteRequest} request @param {{idempotencyKey: string, signal?: AbortSignal}} options */
export function cancelInviteRequest(request, options) {
  return api.delete(
    `/invitation-requests/${encodeURIComponent(request.id)}?expectedVersion=${request.version}`,
    options,
  );
}
