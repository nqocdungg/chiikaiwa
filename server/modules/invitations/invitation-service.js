import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../middleware/http-error.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import {
  claimActorState,
  runIdempotentOperation,
} from '../coordination/coordination-service.js';

export const INVITATION_TTL_MS = 10 * 60 * 1000;
export const INVITATION_CODE_LOOKUP_WINDOW_MS = 5 * 60 * 1000;
export const INVITATION_CODE_LOOKUP_MAX = 20;
const CODE_LENGTH = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const { ObjectId } = mongoose.Types;

/** @param {(max: number) => number} [pickIndex] */
export function generateInvitationCode(pickIndex = (max) => randomInt(max)) {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const selected = pickIndex(CODE_ALPHABET.length);
    if (
      !Number.isInteger(selected) ||
      selected < 0 ||
      selected >= CODE_ALPHABET.length
    ) {
      throw new RangeError('Invitation code index is out of range');
    }
    code += CODE_ALPHABET[selected];
  }
  return code;
}

/** @param {number} status @param {string} code @param {string} message */
function error(status, code, message) {
  return new AppError({ status, code, message });
}
const notFound = () =>
  error(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy tài nguyên.');
const unavailable = () =>
  error(409, 'INVITATION_UNAVAILABLE', 'Mã mời không còn khả dụng.');
const versionConflict = () =>
  error(409, 'VERSION_CONFLICT', 'Tài nguyên đã thay đổi. Vui lòng tải lại.');
const serviceUnavailable = () =>
  error(
    503,
    'SERVICE_UNAVAILABLE',
    'Kiểm tra an toàn cặp người học chưa sẵn sàng.',
  );

/** @param {unknown} value */
function isDuplicateKeyError(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'code' in value &&
    value.code === 11000,
  );
}

/** @param {any} id */
function idString(id) {
  return typeof id?.toHexString === 'function' ? id.toHexString() : String(id);
}

/** @param {import('mongoose').mongo.Db} db */
function actorStates(db) {
  return /** @type {import('mongoose').mongo.Collection<any>} */ (
    db.collection('actor_states')
  );
}

/** @param {any} doc @param {boolean} includeCode */
function invitationDto(doc, includeCode) {
  return {
    id: idString(doc._id),
    status: doc.status,
    version: doc.version,
    expiresAt: doc.expiresAt.toISOString(),
    ...(doc.practiceSessionId
      ? { sessionId: idString(doc.practiceSessionId) }
      : {}),
    ...(includeCode && doc.status === 'open' ? { code: doc.code } : {}),
  };
}

/** @param {import('mongoose').mongo.Db} db @param {string[]} actorKeys @param {import('mongoose').ClientSession} session */
async function userMap(db, actorKeys, session) {
  const ids = actorKeys
    .filter((key) => key.startsWith('user:'))
    .map((key) => new ObjectId(key.slice(5)));
  if (ids.length === 0) return new Map();
  const docs = await db
    .collection('users')
    .find(
      { _id: { $in: ids } },
      { session, projection: { displayName: 1, avatarKey: 1, profile: 1 } },
    )
    .toArray();
  return new Map(docs.map((doc) => [`user:${idString(doc._id)}`, doc]));
}

/** @param {string} actorKey @param {Map<string, any>} users */
function partnerDto(actorKey, users) {
  if (actorKey.startsWith('guest:')) return { actorKey, displayName: 'Khách' };
  const user = users.get(actorKey);
  if (!user) return { actorKey, displayName: 'Người học' };
  const profile = user.profile ?? {};
  const allowedProfile = Object.fromEntries(
    [
      'level',
      'nativeLanguageCode',
      'goal',
      'interests',
      'countryCode',
      'ageGroup',
      'gender',
    ]
      .filter((key) => profile[key] !== undefined)
      .map((key) => [key, profile[key]]),
  );
  return {
    actorKey,
    displayName: user.displayName ?? 'Người học',
    ...(user.avatarKey ? { avatarKey: user.avatarKey } : {}),
    ...(Object.keys(allowedProfile).length > 0
      ? { profile: allowedProfile }
      : {}),
  };
}

/** @param {import('mongoose').mongo.Db} db @param {any[]} docs @param {import('mongoose').ClientSession} session */
async function requestDtos(db, docs, session) {
  const users = await userMap(
    db,
    docs.map((doc) => doc.requesterKey),
    session,
  );
  return docs.map((doc) => ({
    id: idString(doc._id),
    invitationId: idString(doc.invitationId),
    requester: partnerDto(doc.requesterKey, users),
    status: doc.status,
    version: doc.version,
    expiresAt: doc.expiresAt.toISOString(),
    ...(doc.practiceSessionId
      ? { sessionId: idString(doc.practiceSessionId) }
      : {}),
  }));
}

/** @param {import('mongoose').mongo.Db} db @param {{actorKey: string, mode: string, resourceId: string, now: Date, session: import('mongoose').ClientSession}} input */
async function releaseOwnedState(
  db,
  { actorKey, mode, resourceId, now, session },
) {
  await actorStates(db).updateOne(
    { _id: actorKey, mode, resourceId },
    {
      $set: { mode: 'idle', updatedAt: now },
      $unset: { resourceId: '', search: '' },
      $inc: { version: 1 },
    },
    { session },
  );
}

/** @param {import('mongoose').mongo.Db} db @param {any} invitation @param {Date} now @param {import('mongoose').ClientSession} session */
async function expireInvitation(db, invitation, now, session) {
  if (invitation.status !== 'open' || invitation.expiresAt > now)
    return invitation;
  await db
    .collection('invitations')
    .updateOne(
      { _id: invitation._id, status: 'open', version: invitation.version },
      { $set: { status: 'expired', updatedAt: now }, $inc: { version: 1 } },
      { session },
    );
  const requests = await db
    .collection('invite_requests')
    .find({ invitationId: invitation._id, status: 'pending' }, { session })
    .toArray();
  await db
    .collection('invite_requests')
    .updateMany(
      { invitationId: invitation._id, status: 'pending' },
      { $set: { status: 'expired', updatedAt: now }, $inc: { version: 1 } },
      { session },
    );
  await releaseOwnedState(db, {
    actorKey: invitation.hostKey,
    mode: 'inviting',
    resourceId: idString(invitation._id),
    now,
    session,
  });
  for (const request of requests) {
    await releaseOwnedState(db, {
      actorKey: request.requesterKey,
      mode: 'requestingInvite',
      resourceId: idString(request._id),
      now,
      session,
    });
  }
  const current = await db
    .collection('invitations')
    .findOne({ _id: invitation._id }, { session });
  if (!current) throw notFound();
  return /** @type {any} */ (current);
}

/** @param {import('mongoose').mongo.Db} db @param {string} invitationId @param {Date} now @param {import('mongoose').ClientSession} session */
async function loadInvitation(db, invitationId, now, session) {
  const invitation = await db
    .collection('invitations')
    .findOne({ _id: new ObjectId(invitationId) }, { session });
  if (!invitation) throw notFound();
  return expireInvitation(db, invitation, now, session);
}

/** @param {string} invitationId @param {Date} now */
async function reconcileInvitationById(invitationId, now) {
  await withTransaction(async (session) => {
    const db = await connectDatabase();
    const invitation = await db
      .collection('invitations')
      .findOne({ _id: new ObjectId(invitationId) }, { session });
    if (invitation) await expireInvitation(db, invitation, now, session);
  });
}

/** @param {string} code @param {Date} now */
async function reconcileInvitationByCode(code, now) {
  await withTransaction(async (session) => {
    const db = await connectDatabase();
    const invitation = await db
      .collection('invitations')
      .findOne({ code }, { session });
    if (invitation) await expireInvitation(db, invitation, now, session);
  });
}

/** @param {string} requestId @param {Date} now */
async function reconcileInvitationForRequest(requestId, now) {
  await withTransaction(async (session) => {
    const db = await connectDatabase();
    const request = await db
      .collection('invite_requests')
      .findOne({ _id: new ObjectId(requestId) }, { session });
    if (!request) return;
    const invitation = await db
      .collection('invitations')
      .findOne({ _id: request.invitationId }, { session });
    if (invitation) await expireInvitation(db, invitation, now, session);
  });
}

/** @param {import('mongoose').mongo.Db} db @param {string} actorKey @param {Date} now @param {import('mongoose').ClientSession} session */
async function reconcileActorInvitationReservation(db, actorKey, now, session) {
  const state = await actorStates(db).findOne({ _id: actorKey }, { session });
  if (
    !state ||
    !['inviting', 'requestingInvite'].includes(state.mode) ||
    typeof state.resourceId !== 'string' ||
    !ObjectId.isValid(state.resourceId)
  ) {
    return;
  }
  let invitation;
  if (state.mode === 'inviting') {
    invitation = await db
      .collection('invitations')
      .findOne({ _id: new ObjectId(state.resourceId) }, { session });
  } else {
    const request = await db
      .collection('invite_requests')
      .findOne({ _id: new ObjectId(state.resourceId) }, { session });
    if (request) {
      invitation = await db
        .collection('invitations')
        .findOne({ _id: request.invitationId }, { session });
    }
  }
  if (invitation) await expireInvitation(db, invitation, now, session);
}

/** @param {import('mongoose').mongo.Db} db @param {any} invitation @param {string} actorKey @param {import('mongoose').ClientSession} session */
async function mayReadInvitation(db, invitation, actorKey, session) {
  if (invitation.hostKey === actorKey) return true;
  return Boolean(
    await db
      .collection('invite_requests')
      .findOne(
        { invitationId: invitation._id, requesterKey: actorKey },
        { session, projection: { _id: 1 } },
      ),
  );
}

/** @param {{identity: any, operationId: string, now?: Date, generateCode?: () => string}} input @returns {Promise<any>} */
export async function createInvitation({
  identity,
  operationId,
  now = new Date(),
  generateCode = generateInvitationCode,
}) {
  const invitationId = new ObjectId();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      return await runIdempotentOperation({
        actorKey: identity.actorKey,
        method: 'POST',
        path: '/api/v1/invitations',
        operationId,
        payload: {},
        now,
        authorize: async () => {},
        execute: async ({ session }) => {
          const db = await connectDatabase();
          await reconcileActorInvitationReservation(
            db,
            identity.actorKey,
            now,
            session,
          );
          await claimActorState({
            actorKey: identity.actorKey,
            mode: 'inviting',
            resourceId: idString(invitationId),
            session,
            now,
          });
          const doc = {
            _id: invitationId,
            hostKey: identity.actorKey,
            code,
            status: 'open',
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
            version: 0,
            createdAt: now,
            updatedAt: now,
          };
          await db.collection('invitations').insertOne(doc, { session });
          return {
            resultRef: idString(invitationId),
            value: invitationDto(doc, true),
          };
        },
        replay: async ({ session, receipt }) => {
          const db = await connectDatabase();
          const doc = await loadInvitation(db, receipt.resultRef, now, session);
          if (doc.hostKey !== identity.actorKey) throw notFound();
          return invitationDto(doc, true);
        },
      });
    } catch (caught) {
      if (!isDuplicateKeyError(caught) || attempt === 4) throw caught;
    }
  }
  throw new Error('Invitation code generation exhausted');
}

/** @param {{invitationId: string, actorKey: string, now?: Date}} input @returns {Promise<any>} */
export async function getInvitation({
  invitationId,
  actorKey,
  now = new Date(),
}) {
  return withTransaction(async (session) => {
    const db = await connectDatabase();
    const doc = await loadInvitation(db, invitationId, now, session);
    if (!(await mayReadInvitation(db, doc, actorKey, session)))
      throw notFound();
    return invitationDto(doc, doc.hostKey === actorKey);
  });
}

/** @param {{invitationId: string, actorKey: string, expectedVersion: number, operationId: string, now?: Date}} input @returns {Promise<any>} */
export async function cancelInvitation({
  invitationId,
  actorKey,
  expectedVersion,
  operationId,
  now = new Date(),
}) {
  await reconcileInvitationById(invitationId, now);
  return runIdempotentOperation({
    actorKey,
    method: 'DELETE',
    path: `/api/v1/invitations/${invitationId}`,
    operationId,
    payload: { expectedVersion },
    now,
    authorize: async ({ session }) => {
      const db = await connectDatabase();
      const doc = await db
        .collection('invitations')
        .findOne({ _id: new ObjectId(invitationId) }, { session });
      if (!doc || doc.hostKey !== actorKey) throw notFound();
    },
    execute: async ({ session }) => {
      const db = await connectDatabase();
      const invitation = await loadInvitation(db, invitationId, now, session);
      if (invitation.status !== 'open') throw unavailable();
      const result = await db.collection('invitations').updateOne(
        { _id: invitation._id, status: 'open', version: expectedVersion },
        {
          $set: { status: 'cancelled', updatedAt: now },
          $inc: { version: 1 },
        },
        { session },
      );
      if (result.modifiedCount !== 1) throw versionConflict();
      const requests = await db
        .collection('invite_requests')
        .find({ invitationId: invitation._id, status: 'pending' }, { session })
        .toArray();
      await db.collection('invite_requests').updateMany(
        { invitationId: invitation._id, status: 'pending' },
        {
          $set: { status: 'cancelled', updatedAt: now },
          $inc: { version: 1 },
        },
        { session },
      );
      await releaseOwnedState(db, {
        actorKey,
        mode: 'inviting',
        resourceId: invitationId,
        now,
        session,
      });
      for (const request of requests) {
        await releaseOwnedState(db, {
          actorKey: request.requesterKey,
          mode: 'requestingInvite',
          resourceId: idString(request._id),
          now,
          session,
        });
      }
      return { resultRef: invitationId, value: undefined };
    },
    replay: async () => undefined,
  });
}

/** @param {{identity: any, code: string, operationId: string, now?: Date}} input @returns {Promise<any>} */
export async function createInviteRequest({
  identity,
  code,
  operationId,
  now = new Date(),
}) {
  await reconcileInvitationByCode(code, now);
  const requestId = new ObjectId();
  return runIdempotentOperation({
    actorKey: identity.actorKey,
    method: 'POST',
    path: '/api/v1/invitation-requests',
    operationId,
    payload: { code },
    now,
    authorize: async () => {},
    execute: async ({ session }) => {
      const db = await connectDatabase();
      let invitation = await db
        .collection('invitations')
        .findOne({ code }, { session });
      if (!invitation) throw unavailable();
      invitation = /** @type {any} */ (
        await expireInvitation(db, invitation, now, session)
      );
      if (!invitation) throw notFound();
      if (
        invitation.status !== 'open' ||
        invitation.hostKey === identity.actorKey
      )
        throw unavailable();
      const existing = await db
        .collection('invite_requests')
        .findOne(
          { invitationId: invitation._id, requesterKey: identity.actorKey },
          { session },
        );
      const effectiveId = existing?._id ?? requestId;
      await reconcileActorInvitationReservation(
        db,
        identity.actorKey,
        now,
        session,
      );
      await claimActorState({
        actorKey: identity.actorKey,
        mode: 'requestingInvite',
        resourceId: idString(effectiveId),
        session,
        now,
      });
      let doc;
      if (existing) {
        if (existing.status === 'pending' || existing.status === 'accepted')
          throw unavailable();
        await db.collection('invite_requests').updateOne(
          {
            _id: existing._id,
            version: existing.version,
            status: existing.status,
          },
          {
            $set: {
              status: 'pending',
              expiresAt: invitation.expiresAt,
              updatedAt: now,
            },
            $unset: { practiceSessionId: '' },
            $inc: { version: 1 },
          },
          { session },
        );
        doc = await db
          .collection('invite_requests')
          .findOne({ _id: existing._id }, { session });
        if (!doc) throw notFound();
      } else {
        doc = {
          _id: requestId,
          invitationId: invitation._id,
          requesterKey: identity.actorKey,
          status: 'pending',
          expiresAt: invitation.expiresAt,
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('invite_requests').insertOne(doc, { session });
      }
      return {
        resultRef: idString(doc._id),
        value: (await requestDtos(db, [doc], session))[0],
      };
    },
    replay: async ({ session, receipt }) => {
      const db = await connectDatabase();
      const doc = await db
        .collection('invite_requests')
        .findOne({ _id: new ObjectId(receipt.resultRef) }, { session });
      if (!doc || doc.requesterKey !== identity.actorKey) throw notFound();
      return (await requestDtos(db, [doc], session))[0];
    },
  });
}

/** @param {import('mongoose').mongo.Db} db @param {string} requestId @param {string} actorKey @param {import('mongoose').ClientSession} session */
async function loadRequestForActor(db, requestId, actorKey, session) {
  const doc = await db
    .collection('invite_requests')
    .findOne({ _id: new ObjectId(requestId) }, { session });
  if (!doc) throw notFound();
  const invitation = await db
    .collection('invitations')
    .findOne({ _id: doc.invitationId }, { session });
  if (
    !invitation ||
    (doc.requesterKey !== actorKey && invitation.hostKey !== actorKey)
  )
    throw notFound();
  return { doc, invitation };
}

/** @param {{requestId: string, actorKey: string, now?: Date}} input @returns {Promise<any>} */
export async function getInviteRequest({
  requestId,
  actorKey,
  now = new Date(),
}) {
  return withTransaction(async (session) => {
    const db = await connectDatabase();
    const loaded = await loadRequestForActor(db, requestId, actorKey, session);
    await expireInvitation(db, loaded.invitation, now, session);
    const current = await db
      .collection('invite_requests')
      .findOne({ _id: loaded.doc._id }, { session });
    return (await requestDtos(db, [current], session))[0];
  });
}

/** @param {string | undefined} cursor @param {string | undefined} status */
function decodeCursor(cursor, status) {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      value.status !== (status ?? null) ||
      typeof value.id !== 'string' ||
      typeof value.createdAt !== 'string'
    )
      throw new Error();
    const createdAt = new Date(value.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !ObjectId.isValid(value.id))
      throw new Error();
    return { createdAt, id: new ObjectId(value.id) };
  } catch {
    throw error(400, 'INVALID_CURSOR', 'Cursor không hợp lệ.');
  }
}

/** @param {{invitationId: string, actorKey: string, status?: string, limit: number, cursor?: string, now?: Date}} input @returns {Promise<any>} */
export async function listInviteRequests({
  invitationId,
  actorKey,
  status,
  limit,
  cursor,
  now = new Date(),
}) {
  return withTransaction(async (session) => {
    const db = await connectDatabase();
    const invitation = await loadInvitation(db, invitationId, now, session);
    if (invitation.hostKey !== actorKey) throw notFound();
    const boundary = decodeCursor(cursor, status);
    const filter = {
      invitationId: invitation._id,
      ...(status ? { status } : {}),
      ...(boundary
        ? {
            $or: [
              { createdAt: { $lt: boundary.createdAt } },
              { createdAt: boundary.createdAt, _id: { $lt: boundary.id } },
            ],
          }
        : {}),
    };
    const docs = await db
      .collection('invite_requests')
      .find(filter, { session })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    const page = docs.slice(0, limit);
    const last = page.at(-1);
    return {
      items: await requestDtos(db, page, session),
      ...(docs.length > limit && last
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({
                createdAt: last.createdAt.toISOString(),
                id: idString(last._id),
                status: status ?? null,
              }),
            ).toString('base64url'),
          }
        : {}),
    };
  });
}

/** @param {{requestId: string, actorKey: string, expectedVersion: number, operationId: string, now?: Date}} input @returns {Promise<any>} */
export async function cancelInviteRequest({
  requestId,
  actorKey,
  expectedVersion,
  operationId,
  now = new Date(),
}) {
  await reconcileInvitationForRequest(requestId, now);
  return runIdempotentOperation({
    actorKey,
    method: 'DELETE',
    path: `/api/v1/invitation-requests/${requestId}`,
    operationId,
    payload: { expectedVersion },
    now,
    authorize: async ({ session }) => {
      const db = await connectDatabase();
      const doc = await db
        .collection('invite_requests')
        .findOne({ _id: new ObjectId(requestId) }, { session });
      if (!doc || doc.requesterKey !== actorKey) throw notFound();
    },
    execute: async ({ session }) => {
      const db = await connectDatabase();
      const result = await db.collection('invite_requests').updateOne(
        {
          _id: new ObjectId(requestId),
          requesterKey: actorKey,
          status: 'pending',
          version: expectedVersion,
        },
        {
          $set: { status: 'cancelled', updatedAt: now },
          $inc: { version: 1 },
        },
        { session },
      );
      if (result.modifiedCount !== 1) throw versionConflict();
      await releaseOwnedState(db, {
        actorKey,
        mode: 'requestingInvite',
        resourceId: requestId,
        now,
        session,
      });
      return { resultRef: requestId, value: undefined };
    },
    replay: async () => undefined,
  });
}

/** @param {string} actorKey */
function memberFromActorKey(actorKey) {
  if (actorKey.startsWith('user:')) {
    return { actorKey, kind: 'user', userId: new ObjectId(actorKey.slice(5)) };
  }
  return { actorKey, kind: 'guest' };
}

/** @param {{db: import('mongoose').mongo.Db, session: import('mongoose').ClientSession, requestId: string, hostKey: string, expectedVersion: number, decision: string, now: Date, assertPairCanEnterSession?: (input: any) => Promise<void>}} input */
async function respondInTransaction({
  db,
  session,
  requestId,
  hostKey,
  expectedVersion,
  decision,
  now,
  assertPairCanEnterSession,
}) {
  const request = await db
    .collection('invite_requests')
    .findOne({ _id: new ObjectId(requestId) }, { session });
  if (!request) throw notFound();
  let invitation = await db
    .collection('invitations')
    .findOne({ _id: request.invitationId }, { session });
  if (!invitation || invitation.hostKey !== hostKey) throw notFound();
  invitation = /** @type {any} */ (
    await expireInvitation(db, invitation, now, session)
  );
  if (!invitation) throw notFound();
  if (invitation.status !== 'open' || request.expiresAt <= now)
    throw unavailable();
  if (request.status !== 'pending' || request.version !== expectedVersion)
    throw versionConflict();

  if (decision === 'reject') {
    await db
      .collection('invite_requests')
      .updateOne(
        { _id: request._id, status: 'pending', version: expectedVersion },
        { $set: { status: 'rejected', updatedAt: now }, $inc: { version: 1 } },
        { session },
      );
    await releaseOwnedState(db, {
      actorKey: request.requesterKey,
      mode: 'requestingInvite',
      resourceId: requestId,
      now,
      session,
    });
    const current = await db
      .collection('invite_requests')
      .findOne({ _id: request._id }, { session });
    return (await requestDtos(db, [current], session))[0];
  }

  if (!assertPairCanEnterSession) throw serviceUnavailable();
  await assertPairCanEnterSession({
    db,
    session,
    firstActorKey: hostKey,
    secondActorKey: request.requesterKey,
    now,
  });
  const practiceSessionId = new ObjectId();
  const resourceId = idString(practiceSessionId);
  const hostState = await actorStates(db).updateOne(
    { _id: hostKey, mode: 'inviting', resourceId: idString(invitation._id) },
    {
      $set: { mode: 'inSession', resourceId, updatedAt: now },
      $inc: { version: 1 },
    },
    { session },
  );
  const requesterState = await actorStates(db).updateOne(
    {
      _id: request.requesterKey,
      mode: 'requestingInvite',
      resourceId: requestId,
    },
    {
      $set: { mode: 'inSession', resourceId, updatedAt: now },
      $inc: { version: 1 },
    },
    { session },
  );
  if (hostState.modifiedCount !== 1 || requesterState.modifiedCount !== 1)
    throw versionConflict();

  await db.collection('practice_sessions').insertOne(
    {
      _id: practiceSessionId,
      originKind: 'invite',
      originId: invitation._id,
      members: [
        memberFromActorKey(hostKey),
        memberFromActorKey(request.requesterKey),
      ],
      status: 'preparing',
      version: 0,
      roomName: `session-${resourceId}`,
      presence: [
        { actorKey: hostKey, connected: false },
        { actorKey: request.requesterKey, connected: false },
      ],
      activeDurationMs: 0,
      selectionRemainingMs: 60_000,
      screenShare: { state: 'idle', version: 0 },
      mediaCleanup: { state: 'none', attempts: 0 },
      createdAt: now,
      updatedAt: now,
    },
    { session },
  );
  await db.collection('invitations').updateOne(
    { _id: invitation._id, status: 'open', version: invitation.version },
    {
      $set: { status: 'used', practiceSessionId, updatedAt: now },
      $inc: { version: 1 },
    },
    { session },
  );
  await db.collection('invite_requests').updateOne(
    { _id: request._id, status: 'pending', version: expectedVersion },
    {
      $set: { status: 'accepted', practiceSessionId, updatedAt: now },
      $inc: { version: 1 },
    },
    { session },
  );
  const losers = await db
    .collection('invite_requests')
    .find(
      {
        invitationId: invitation._id,
        _id: { $ne: request._id },
        status: 'pending',
      },
      { session },
    )
    .toArray();
  await db.collection('invite_requests').updateMany(
    {
      invitationId: invitation._id,
      _id: { $ne: request._id },
      status: 'pending',
    },
    { $set: { status: 'expired', updatedAt: now }, $inc: { version: 1 } },
    { session },
  );
  for (const loser of losers) {
    await releaseOwnedState(db, {
      actorKey: loser.requesterKey,
      mode: 'requestingInvite',
      resourceId: idString(loser._id),
      now,
      session,
    });
  }
  if (request.requesterKey.startsWith('guest:')) {
    await db.collection('guest_sessions').updateOne(
      { _id: new ObjectId(request.requesterKey.slice(6)), status: 'waiting' },
      {
        $set: { status: 'active', practiceSessionId, updatedAt: now },
        $inc: { version: 1 },
      },
      { session },
    );
  }
  const current = await db
    .collection('invite_requests')
    .findOne({ _id: request._id }, { session });
  return (await requestDtos(db, [current], session))[0];
}

/** @param {{requestId: string, hostKey: string, expectedVersion: number, decision: string, operationId: string, assertPairCanEnterSession?: (input: any) => Promise<void>, now?: Date}} input @returns {Promise<any>} */
export async function respondToInviteRequest({
  requestId,
  hostKey,
  expectedVersion,
  decision,
  operationId,
  assertPairCanEnterSession,
  now = new Date(),
}) {
  await reconcileInvitationForRequest(requestId, now);
  return runIdempotentOperation({
    actorKey: hostKey,
    method: 'POST',
    path: `/api/v1/invitation-requests/${requestId}/responses`,
    operationId,
    payload: { expectedVersion, decision },
    now,
    authorize: async ({ session }) => {
      const db = await connectDatabase();
      await loadRequestForActor(db, requestId, hostKey, session);
    },
    execute: async ({ session }) => {
      const db = await connectDatabase();
      const value = await respondInTransaction({
        db,
        session,
        requestId,
        hostKey,
        expectedVersion,
        decision,
        now,
        assertPairCanEnterSession,
      });
      return { resultRef: requestId, value };
    },
    replay: async ({ session }) => {
      const db = await connectDatabase();
      const { doc } = await loadRequestForActor(
        db,
        requestId,
        hostKey,
        session,
      );
      return (await requestDtos(db, [doc], session))[0];
    },
  });
}
