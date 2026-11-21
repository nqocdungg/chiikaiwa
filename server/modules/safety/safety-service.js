import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../middleware/http-error.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import { toPartnerDto, toSelfDto } from '../identity/dto.js';
import { endSession } from '../sessions/session-lifecycle-service.js';
import { finishSessionEffects } from '../sessions/media-cleanup-service.js';

const { ObjectId } = mongoose.Types;
const ACTOR_KEY_RE = /^(user|guest):([0-9a-f]{24})$/iu;
const RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;
const ALLOWED_ENTRY_MODES = new Set([
  'idle',
  'inviting',
  'requestingInvite',
  'proposed',
]);

/** @param {unknown} value @returns {string} */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(/** @type {Record<string, unknown>} */ (value)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** @param {unknown} payload */
function hashPayload(payload) {
  return createHash('sha256')
    .update(canonicalJson(payload ?? {}))
    .digest('hex');
}

function idempotencyConflictError() {
  return new AppError({
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Khóa thao tác đã được dùng với nội dung khác.',
  });
}

/**
 * Verifies a guest identity is still within its trial session scope and not expired.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {any} identity
 * @param {import('mongoose').Types.ObjectId} sessionObjectId
 * @param {Date} now
 * @param {import('mongoose').ClientSession} [session]
 */
async function assertGuestSessionScope(
  db,
  identity,
  sessionObjectId,
  now,
  session,
) {
  if (!identity || identity.kind !== 'guest') return;
  const guest = await db.collection('guest_sessions').findOne(
    {
      _id: identity.guestId,
      practiceSessionId: sessionObjectId,
      revokedAt: { $exists: false },
    },
    { session, projection: { status: 1, expiresAt: 1 } },
  );
  if (!guest) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Không tìm thấy phiên hợp lệ trong phạm vi lượt thử.',
    });
  }
  if (
    !['active', 'summary'].includes(guest.status) ||
    (guest.expiresAt instanceof Date && guest.expiresAt <= now)
  ) {
    throw new AppError({
      status: 410,
      code: 'GUEST_EXPIRED',
      message: 'Quyền truy cập tạm đã hết hạn.',
    });
  }
}

/** @param {unknown} error */
function isDuplicateKeyError(error) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000,
  );
}

/** @param {string} actorKey */
function parseActorKey(actorKey) {
  if (typeof actorKey !== 'string') {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'Định danh người dùng không hợp lệ.',
    });
  }
  const match = ACTOR_KEY_RE.exec(actorKey);
  if (!match) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'Định danh người dùng không hợp lệ.',
    });
  }
  return { kind: match[1].toLowerCase(), id: new ObjectId(match[2]) };
}

/** @param {import('mongoose').mongo.Db} db */
function actorStates(db) {
  return /** @type {import('mongoose').mongo.Collection<any>} */ (
    db.collection('actor_states')
  );
}

/**
 * Touches an actor_states document within a transaction so concurrent
 * block/lock and room-grant transactions contend on the same write boundary.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {string} actorKey
 * @param {Date} now
 * @param {import('mongoose').ClientSession} session
 * @param {any} [existingState]
 */
async function touchActorState(db, actorKey, now, session, existingState) {
  const collection = actorStates(db);
  if (existingState) {
    const result = await collection.updateOne(
      {
        _id: actorKey,
        mode: existingState.mode,
        version: existingState.version,
      },
      { $inc: { version: 1 }, $set: { updatedAt: now } },
      { session },
    );
    if (result.modifiedCount !== 1) {
      throw new AppError({
        status: 409,
        code: 'ACTOR_BUSY',
        message: 'Trạng thái điều phối của người dùng đã thay đổi.',
      });
    }
    return;
  }

  try {
    const result = await collection.updateOne(
      { _id: actorKey, mode: 'idle' },
      {
        $set: { mode: 'idle', updatedAt: now },
        $inc: { version: 1 },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, session },
    );
    if (result.matchedCount === 0 && result.upsertedCount === 0) {
      throw new AppError({
        status: 409,
        code: 'ACTOR_BUSY',
        message: 'Danh tính đang tham gia một luồng khác.',
      });
    }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError({
        status: 409,
        code: 'ACTOR_BUSY',
        message: 'Danh tính đang tham gia một luồng khác.',
      });
    }
    throw error;
  }
}

/**
 * Releases an actor_states document to idle if it still matches the expected
 * mode and resourceId, returning true if modified.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {{actorKey: string, mode: string, resourceId?: string, now: Date, session: import('mongoose').ClientSession}} input
 */
async function releaseActorToIdle(
  db,
  { actorKey, mode, resourceId, now, session },
) {
  /** @type {Record<string, any>} */
  const filter = { _id: actorKey, mode };
  if (resourceId !== undefined) filter.resourceId = resourceId;
  const result = await actorStates(db).updateOne(
    filter,
    {
      $set: { mode: 'idle', updatedAt: now },
      $unset: { resourceId: '', search: '' },
      $inc: { version: 1 },
    },
    { session },
  );
  return result.modifiedCount === 1;
}

/** @param {{db: import('mongoose').mongo.Db, session: import('mongoose').ClientSession, firstActorKey: string, secondActorKey: string, now: Date}} input */
export async function assertPairNotBlocked({
  db,
  session,
  firstActorKey,
  secondActorKey,
  now,
}) {
  for (const actorKey of [firstActorKey, secondActorKey].sort()) {
    const state = await actorStates(db).findOne({ _id: actorKey }, { session });
    await touchActorState(db, actorKey, now, session, state);
  }
  await checkPairBlock(db, session, firstActorKey, secondActorKey);
}

/** @param {import('mongoose').mongo.Db} db @param {import('mongoose').ClientSession} session @param {string} firstActorKey @param {string} secondActorKey */
async function checkPairBlock(db, session, firstActorKey, secondActorKey) {
  // Check two-way block (BR-28 / FR-SAF-01).
  const blocked = await db.collection('blocks').findOne(
    {
      $or: [
        { blockerKey: firstActorKey, blockedKey: secondActorKey },
        { blockerKey: secondActorKey, blockedKey: firstActorKey },
      ],
    },
    { session, projection: { _id: 1 } },
  );
  if (blocked) {
    throw new AppError({
      status: 409,
      code: 'PAIR_BLOCKED',
      message: 'Hai người dùng không thể vào phiên do đang chặn nhau.',
    });
  }
}

/**
 * Shared safety guard for session entry (invitations and matching).
 * Checks actor busyness, two-way pair blocks, and account lock / guest expiry
 * inside the caller's transaction, while writing to `actor_states` in sorted
 * actorKey order so concurrent block/lock transactions trigger write conflicts.
 *
 * @param {{
 *   db: import('mongoose').mongo.Db,
 *   session: import('mongoose').ClientSession,
 *   firstActorKey: string,
 *   secondActorKey: string,
 *   now?: Date,
 *   expectedStates?: Record<string, { mode: string, resourceId?: string }>
 * }} input
 */
export async function assertPairCanEnterSession({
  db,
  session,
  firstActorKey,
  secondActorKey,
  now = new Date(),
  expectedStates,
}) {
  parseActorKey(firstActorKey);
  parseActorKey(secondActorKey);
  if (firstActorKey === secondActorKey) {
    throw new AppError({
      status: 409,
      code: 'IDENTITY_CONFLICT',
      message: 'Không thể tạo phiên với chính mình.',
    });
  }

  const orderedKeys = [firstActorKey, secondActorKey].sort();

  // 1. Verify and touch actor_states in deterministic order to enforce
  //    actor-busy invariants and participate in MongoDB write conflicts.
  for (const actorKey of orderedKeys) {
    const state = await actorStates(db).findOne({ _id: actorKey }, { session });
    const expected = expectedStates?.[actorKey];
    if (expected) {
      if (
        !state ||
        state.mode !== expected.mode ||
        (expected.resourceId !== undefined &&
          state.resourceId !== expected.resourceId)
      ) {
        throw new AppError({
          status: 409,
          code: 'ACTOR_BUSY',
          message: 'Danh tính đang tham gia một luồng khác.',
        });
      }
    } else if (state && !ALLOWED_ENTRY_MODES.has(state.mode)) {
      throw new AppError({
        status: 409,
        code: 'ACTOR_BUSY',
        message: 'Danh tính đang tham gia một luồng khác.',
      });
    }
    await touchActorState(db, actorKey, now, session, state);
  }

  await checkPairBlock(db, session, firstActorKey, secondActorKey);

  // 3. Check account lock / guest validity (FR-ADM-01 / 06 §4.3).
  for (const actorKey of orderedKeys) {
    const parsed = parseActorKey(actorKey);
    if (parsed.kind === 'user') {
      const user = await db
        .collection('users')
        .findOne({ _id: parsed.id }, { session, projection: { status: 1 } });
      if (!user || user.status !== 'active') {
        throw new AppError({
          status: 403,
          code: 'ACCOUNT_LOCKED',
          message: 'Tài khoản đã bị khóa hoặc không còn hoạt động.',
        });
      }
    } else {
      const guest = await db
        .collection('guest_sessions')
        .findOne(
          { _id: parsed.id },
          { session, projection: { status: 1, revokedAt: 1, expiresAt: 1 } },
        );
      if (
        !guest ||
        guest.revokedAt ||
        !['waiting', 'active'].includes(guest.status) ||
        (guest.expiresAt instanceof Date && guest.expiresAt <= now)
      ) {
        throw new AppError({
          status: 410,
          code: 'GUEST_EXPIRED',
          message: 'Phiên khách đã hết hạn hoặc bị thu hồi.',
        });
      }
    }
  }
}

/**
 * TX-05 (Block): Creates a directed block record, contends on both actors'
 * `actor_states` in sorted order, revokes any shared pending proposal/invite
 * request or ends any shared active/preparing session, and triggers LiveKit
 * media cleanup after commit.
 *
 * When `idempotency` is provided (from `POST /api/v1/me/blocks`), the receipt
 * check and insertion execute atomically inside the same TX-05 transaction.
 *
 * @param {{
 *   blockerKey: string,
 *   blockedKey: string,
 *   sessionId?: string,
 *   identity?: any,
 *   idempotency?: { method: string, path: string, operationId: string, payload: unknown },
 *   now?: Date,
 *   effects?: typeof finishSessionEffects
 * }} input
 */
export async function createPairBlock({
  blockerKey,
  blockedKey,
  sessionId,
  identity,
  idempotency,
  now = new Date(),
  effects = finishSessionEffects,
}) {
  parseActorKey(blockerKey);
  parseActorKey(blockedKey);
  if (blockerKey === blockedKey) {
    throw new AppError({
      status: 409,
      code: 'IDENTITY_CONFLICT',
      message: 'Không thể tự chặn chính mình.',
    });
  }

  /** @type {import('mongoose').Types.ObjectId | undefined} */
  let validatedSessionObjectId;
  if (sessionId !== undefined) {
    if (typeof sessionId !== 'string' || !ObjectId.isValid(sessionId)) {
      throw new AppError({
        status: 400,
        code: 'MALFORMED_REQUEST',
        message: 'ID phiên không hợp lệ.',
      });
    }
    validatedSessionObjectId = new ObjectId(sessionId);
  }

  const orderedKeys = [blockerKey, blockedKey].sort();
  const receiptKey = idempotency
    ? {
        actorKey: blockerKey,
        action: idempotency.method.toUpperCase(),
        resourceKey: idempotency.path,
        operationId: idempotency.operationId,
      }
    : null;
  const payloadHash = idempotency ? hashPayload(idempotency.payload) : null;

  /** @type {any} */
  let endedSession = null;
  /** @type {any} */
  let blockDoc = null;

  /** @param {import('mongoose').ClientSession} session @param {Record<string, any>} receipt */
  const replayFromReceipt = async (session, receipt) => {
    if (receipt.payloadHash !== payloadHash) {
      throw idempotencyConflictError();
    }
    const db = await connectDatabase();
    const existingBlock = await db
      .collection('blocks')
      .findOne({ blockerKey, blockedKey }, { session });
    if (!existingBlock) {
      throw new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Bản chặn không còn tồn tại.',
      });
    }
    blockDoc = existingBlock;
  };

  try {
    await withTransaction(async (session) => {
      endedSession = null;
      blockDoc = null;
      const db = await connectDatabase();

      if (validatedSessionObjectId) {
        await assertGuestSessionScope(
          db,
          identity,
          validatedSessionObjectId,
          now,
          session,
        );
        const targetSession = await db.collection('practice_sessions').findOne(
          {
            _id: validatedSessionObjectId,
            'members.actorKey': { $all: [blockerKey, blockedKey] },
          },
          { session },
        );
        if (!targetSession) {
          throw new AppError({
            status: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Không tìm thấy phiên hợp lệ để chặn đối tác.',
          });
        }

        if (receiptKey) {
          const existingReceipt = await db
            .collection('operation_receipts')
            .findOne(receiptKey, { session });
          if (existingReceipt) {
            await replayFromReceipt(session, existingReceipt);
            return;
          }
        }

        if (targetSession.status !== 'ended') {
          endedSession = await endSession(
            targetSession,
            now,
            'blocked',
            session,
          );
        }
      } else if (receiptKey) {
        const existingReceipt = await db
          .collection('operation_receipts')
          .findOne(receiptKey, { session });
        if (existingReceipt) {
          await replayFromReceipt(session, existingReceipt);
          return;
        }
      }

      await db
        .collection('blocks')
        .updateOne(
          { blockerKey, blockedKey },
          { $setOnInsert: { blockerKey, blockedKey, createdAt: now } },
          { upsert: true, session },
        );
      blockDoc = await db
        .collection('blocks')
        .findOne({ blockerKey, blockedKey }, { session });

      const states = new Map();
      for (const key of orderedKeys) {
        states.set(
          key,
          await actorStates(db).findOne({ _id: key }, { session }),
        );
      }

      const updatedActors = new Set();
      if (endedSession) {
        updatedActors.add(blockerKey);
        updatedActors.add(blockedKey);
      }

      const stateA = states.get(orderedKeys[0]);
      const stateB = states.get(orderedKeys[1]);

      // Check if both actors are in the same active/preparing session (even if sessionId wasn't passed).
      if (
        !endedSession &&
        stateA?.mode === 'inSession' &&
        stateB?.mode === 'inSession' &&
        stateA.resourceId &&
        stateA.resourceId === stateB.resourceId &&
        ObjectId.isValid(stateA.resourceId)
      ) {
        const sharedSession = await db.collection('practice_sessions').findOne(
          {
            _id: new ObjectId(stateA.resourceId),
            'members.actorKey': { $all: [blockerKey, blockedKey] },
          },
          { session },
        );
        if (sharedSession && sharedSession.status !== 'ended') {
          endedSession = await endSession(
            sharedSession,
            now,
            'blocked',
            session,
          );
          updatedActors.add(orderedKeys[0]);
          updatedActors.add(orderedKeys[1]);
        }
      }

      // Check if both actors share a pending match_proposal.
      if (
        stateA?.mode === 'proposed' &&
        stateB?.mode === 'proposed' &&
        stateA.resourceId &&
        stateA.resourceId === stateB.resourceId &&
        ObjectId.isValid(stateA.resourceId)
      ) {
        await db.collection('match_proposals').updateOne(
          { _id: new ObjectId(stateA.resourceId), status: 'pending' },
          {
            $set: { status: 'cancelled', updatedAt: now },
            $inc: { version: 1 },
          },
          { session },
        );
        for (const key of orderedKeys) {
          if (
            await releaseActorToIdle(db, {
              actorKey: key,
              mode: 'proposed',
              resourceId: stateA.resourceId,
              now,
              session,
            })
          ) {
            updatedActors.add(key);
          }
        }
      }

      // Check if one actor is inviting and the other is requestingInvite on that invitation.
      const invitingPair =
        stateA?.mode === 'inviting' && stateB?.mode === 'requestingInvite'
          ? {
              hostState: stateA,
              requesterKey: orderedKeys[1],
              requesterState: stateB,
            }
          : stateB?.mode === 'inviting' && stateA?.mode === 'requestingInvite'
            ? {
                hostState: stateB,
                requesterKey: orderedKeys[0],
                requesterState: stateA,
              }
            : null;

      if (
        invitingPair &&
        ObjectId.isValid(invitingPair.hostState.resourceId) &&
        ObjectId.isValid(invitingPair.requesterState.resourceId)
      ) {
        const reqUpdate = await db.collection('invite_requests').updateOne(
          {
            _id: new ObjectId(invitingPair.requesterState.resourceId),
            invitationId: new ObjectId(invitingPair.hostState.resourceId),
            status: 'pending',
          },
          {
            $set: { status: 'rejected', updatedAt: now },
            $inc: { version: 1 },
          },
          { session },
        );
        if (reqUpdate.modifiedCount === 1) {
          if (
            await releaseActorToIdle(db, {
              actorKey: invitingPair.requesterKey,
              mode: 'requestingInvite',
              resourceId: invitingPair.requesterState.resourceId,
              now,
              session,
            })
          ) {
            updatedActors.add(invitingPair.requesterKey);
          }
        }
      }

      // Ensure both actors' actor_states are written in deterministic order
      // so any concurrent room-grant transaction hits a write conflict.
      for (const key of orderedKeys) {
        if (!updatedActors.has(key)) {
          await touchActorState(db, key, now, session, states.get(key));
        }
      }

      if (receiptKey && payloadHash) {
        await db.collection('operation_receipts').insertOne(
          {
            ...receiptKey,
            payloadHash,
            ...(blockDoc ? { resultRef: String(blockDoc._id) } : {}),
            committedAt: now,
            purgeAt: new Date(now.getTime() + RECEIPT_RETENTION_MS),
          },
          { session },
        );
      }
    });
  } catch (error) {
    if (!receiptKey || !isDuplicateKeyError(error)) throw error;
    await withTransaction(async (session) => {
      const db = await connectDatabase();
      const receipt = await db
        .collection('operation_receipts')
        .findOne(receiptKey, { session });
      if (!receipt) throw error;
      if (validatedSessionObjectId) {
        await assertGuestSessionScope(
          db,
          identity,
          validatedSessionObjectId,
          now,
          session,
        );
        const targetSession = await db.collection('practice_sessions').findOne(
          {
            _id: validatedSessionObjectId,
            'members.actorKey': { $all: [blockerKey, blockedKey] },
          },
          { session },
        );
        if (!targetSession) {
          throw new AppError({
            status: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Không tìm thấy phiên hợp lệ để chặn đối tác.',
          });
        }
      }
      await replayFromReceipt(session, receipt);
    });
  }

  if (endedSession) {
    await effects(endedSession);
  }

  return {
    block: blockDoc
      ? {
          id: String(blockDoc._id),
          blockerKey: blockDoc.blockerKey,
          blockedKey: blockDoc.blockedKey,
          createdAt: blockDoc.createdAt,
        }
      : null,
    endedSessionId: endedSession ? String(endedSession._id) : null,
  };
}

/**
 * TX-05 (Account Lock): Locks a user account, increments authVersion, revokes
 * active auth_sessions, contends on `actor_states`, revokes active coordination
 * or ends any active/preparing session, and triggers LiveKit media cleanup
 * after commit.
 *
 * @param {{
 *   userId: string,
 *   adminId?: string,
 *   now?: Date,
 *   effects?: typeof finishSessionEffects
 * }} input
 */
export async function lockUserAccount({
  userId,
  adminId,
  now = new Date(),
  effects = finishSessionEffects,
}) {
  if (typeof userId !== 'string' || !ObjectId.isValid(userId)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID tài khoản không hợp lệ.',
    });
  }
  const userObjectId = new ObjectId(userId);
  const actorKey = `user:${userObjectId.toHexString()}`;
  const adminObjectId =
    typeof adminId === 'string' && ObjectId.isValid(adminId)
      ? new ObjectId(adminId)
      : undefined;

  /** @type {any} */
  let endedSession = null;
  /** @type {any} */
  let lockedUser = null;

  await withTransaction(async (session) => {
    endedSession = null;
    const db = await connectDatabase();

    lockedUser = await db.collection('users').findOneAndUpdate(
      { _id: userObjectId },
      {
        $set: {
          status: 'locked',
          statusChangedAt: now,
          ...(adminObjectId ? { statusChangedBy: adminObjectId } : {}),
          updatedAt: now,
        },
        $inc: { authVersion: 1, version: 1 },
      },
      { session, returnDocument: 'after' },
    );
    if (!lockedUser) {
      throw new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Không tìm thấy tài khoản.',
      });
    }

    await db
      .collection('auth_sessions')
      .updateMany(
        { userId: userObjectId, revokedAt: { $exists: false } },
        { $set: { revokedAt: now } },
        { session },
      );

    const state = await actorStates(db).findOne({ _id: actorKey }, { session });

    if (state?.mode === 'inSession' && ObjectId.isValid(state.resourceId)) {
      const activeSession = await db.collection('practice_sessions').findOne(
        {
          _id: new ObjectId(state.resourceId),
          'members.actorKey': actorKey,
        },
        { session },
      );
      if (activeSession && activeSession.status !== 'ended') {
        endedSession = await endSession(
          activeSession,
          now,
          'account_locked',
          session,
        );
      } else {
        await touchActorState(db, actorKey, now, session, state);
      }
    } else if (
      state?.mode === 'inviting' &&
      ObjectId.isValid(state.resourceId)
    ) {
      const invitationId = new ObjectId(state.resourceId);
      await db.collection('invitations').updateOne(
        { _id: invitationId, status: 'open' },
        {
          $set: { status: 'cancelled', updatedAt: now },
          $inc: { version: 1 },
        },
        { session },
      );
      const pendingRequests = await db
        .collection('invite_requests')
        .find({ invitationId, status: 'pending' }, { session })
        .toArray();
      await db.collection('invite_requests').updateMany(
        { invitationId, status: 'pending' },
        {
          $set: { status: 'cancelled', updatedAt: now },
          $inc: { version: 1 },
        },
        { session },
      );
      const releaseTargets = [
        { actorKey, mode: 'inviting', resourceId: state.resourceId },
        ...pendingRequests.map((req) => ({
          actorKey: req.requesterKey,
          mode: 'requestingInvite',
          resourceId: String(req._id),
        })),
      ].sort((a, b) => a.actorKey.localeCompare(b.actorKey));
      for (const target of releaseTargets) {
        await releaseActorToIdle(db, { ...target, now, session });
      }
    } else if (
      state?.mode === 'requestingInvite' &&
      ObjectId.isValid(state.resourceId)
    ) {
      await db.collection('invite_requests').updateOne(
        { _id: new ObjectId(state.resourceId), status: 'pending' },
        {
          $set: { status: 'cancelled', updatedAt: now },
          $inc: { version: 1 },
        },
        { session },
      );
      await releaseActorToIdle(db, {
        actorKey,
        mode: 'requestingInvite',
        resourceId: state.resourceId,
        now,
        session,
      });
    } else if (state?.mode === 'searching') {
      await releaseActorToIdle(db, {
        actorKey,
        mode: 'searching',
        now,
        session,
      });
    } else if (
      state?.mode === 'proposed' &&
      ObjectId.isValid(state.resourceId)
    ) {
      const proposalId = new ObjectId(state.resourceId);
      const proposal = await db.collection('match_proposals').findOneAndUpdate(
        { _id: proposalId, status: 'pending' },
        {
          $set: { status: 'cancelled', updatedAt: now },
          $inc: { version: 1 },
        },
        { session, returnDocument: 'after' },
      );
      const participantKeys = (proposal?.participants ?? [])
        .map((/** @type {any} */ p) => p.actorKey)
        .filter((/** @type {unknown} */ k) => typeof k === 'string');
      if (!participantKeys.includes(actorKey)) participantKeys.push(actorKey);
      for (const key of participantKeys.sort()) {
        await releaseActorToIdle(db, {
          actorKey: key,
          mode: 'proposed',
          resourceId: state.resourceId,
          now,
          session,
        });
      }
    } else {
      await touchActorState(db, actorKey, now, session, state);
    }
  });

  if (endedSession) {
    await effects(endedSession);
  }

  return {
    user: toSelfDto(lockedUser),
    endedSessionId: endedSession ? String(endedSession._id) : null,
  };
}

/**
 * @param {{ actorKey: string, createdAt: Date, id: import('mongoose').Types.ObjectId }} input
 */
function encodeBlocksCursor({ actorKey, createdAt, id }) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      scope: 'me-blocks',
      actorKey,
      createdAt: createdAt.toISOString(),
      id: id.toHexString(),
    }),
    'utf8',
  ).toString('base64url');
}

/**
 * @param {string} rawCursor
 * @param {string} expectedActorKey
 * @returns {{ createdAt: Date, id: import('mongoose').Types.ObjectId }}
 */
function decodeBlocksCursor(rawCursor, expectedActorKey) {
  try {
    const parsed = JSON.parse(
      Buffer.from(rawCursor, 'base64url').toString('utf8'),
    );
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.v !== 1 ||
      parsed.scope !== 'me-blocks' ||
      parsed.actorKey !== expectedActorKey ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{24}$/iu.test(parsed.id)
    ) {
      throw new Error('Invalid cursor structure');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('Invalid cursor date');
    }
    return { createdAt, id: new ObjectId(parsed.id) };
  } catch {
    throw new AppError({
      status: 400,
      code: 'INVALID_CURSOR',
      message: 'Con trỏ phân trang không hợp lệ.',
    });
  }
}

/**
 * Lists blocks created by the caller (`GET /api/v1/me/blocks`, 07 §10).
 * Sorted by `createdAt DESC, _id DESC` with cursor pagination.
 *
 * @param {{ actorKey: string, limit?: number, cursor?: string }} input
 */
export async function listMyBlocks({ actorKey, limit = 20, cursor }) {
  parseActorKey(actorKey);
  const decoded =
    cursor !== undefined ? decodeBlocksCursor(cursor, actorKey) : null;

  const db = await connectDatabase();
  /** @type {Record<string, any>} */
  const filter = { blockerKey: actorKey };
  if (decoded) {
    filter.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
    ];
  }

  const rows = await db
    .collection('blocks')
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const userIds = [];
  for (const row of page) {
    const match = ACTOR_KEY_RE.exec(String(row.blockedKey));
    if (match && match[1].toLowerCase() === 'user') {
      userIds.push(new ObjectId(match[2]));
    }
  }

  const usersById = new Map();
  if (userIds.length > 0) {
    const users = await db
      .collection('users')
      .find(
        { _id: { $in: userIds } },
        { projection: { displayName: 1, avatarKey: 1, profile: 1 } },
      )
      .toArray();
    for (const user of users) {
      usersById.set(String(user._id), user);
    }
  }

  const items = page.map((row) => {
    const blockedKey = String(row.blockedKey);
    const match = ACTOR_KEY_RE.exec(blockedKey);
    let partner;
    if (match && match[1].toLowerCase() === 'guest') {
      partner = { actorKey: blockedKey, displayName: 'Khách' };
    } else if (match) {
      const userDoc = usersById.get(match[2].toLowerCase());
      partner = userDoc
        ? toPartnerDto(userDoc)
        : {
            actorKey: blockedKey,
            displayName: 'Người học',
            profile: { interests: [] },
          };
    } else {
      partner = { actorKey: blockedKey, displayName: 'Người học' };
    }

    return {
      id: String(row._id),
      partner,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(row.createdAt).toISOString(),
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeBlocksCursor({
          actorKey,
          createdAt:
            last.createdAt instanceof Date
              ? last.createdAt
              : new Date(last.createdAt),
          id: last._id,
        })
      : null;

  return { items, nextCursor };
}

/**
 * Deletes a block record owned by the caller (`DELETE /api/v1/me/blocks/:id`, 07 §10).
 * Only removes the caller's own directed block; any reverse block remains intact.
 *
 * @param {{ actorKey: string, blockId: string, operationId: string, now?: Date }} input
 */
export async function deleteMyBlock({
  actorKey,
  blockId,
  operationId,
  now = new Date(),
}) {
  parseActorKey(actorKey);
  if (typeof blockId !== 'string' || !ObjectId.isValid(blockId)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID bản chặn không hợp lệ.',
    });
  }
  const blockObjectId = new ObjectId(blockId);

  await runIdempotentOperation({
    actorKey,
    method: 'DELETE',
    path: `/api/v1/me/blocks/${blockObjectId.toHexString()}`,
    operationId,
    payload: { id: blockObjectId.toHexString() },
    now,
    authorize: async () => {},
    execute: async ({ session }) => {
      const db = await connectDatabase();
      const result = await db
        .collection('blocks')
        .deleteOne({ _id: blockObjectId, blockerKey: actorKey }, { session });
      if (result.deletedCount !== 1) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy bản chặn trong danh sách của bạn.',
        });
      }
      return { resultRef: blockObjectId.toHexString(), value: null };
    },
    replay: async () => null,
  });
}

/**
 * Creates a safety report for a partner in a participated session (`POST /api/v1/reports`, 07 §10).
 * Does not create a block, does not end the session, and never sets `purgeAt` (06 §10.2).
 *
 * @param {{
 *   identity: any,
 *   sessionId: string,
 *   targetActorKey: string,
 *   reason: string,
 *   description?: string,
 *   operationId: string,
 *   now?: Date
 * }} input
 */
export async function createReport({
  identity,
  sessionId,
  targetActorKey,
  reason,
  description,
  operationId,
  now = new Date(),
}) {
  const reporterKey = identity.actorKey;
  parseActorKey(reporterKey);
  parseActorKey(targetActorKey);

  if (reporterKey === targetActorKey) {
    throw new AppError({
      status: 409,
      code: 'IDENTITY_CONFLICT',
      message: 'Không thể tự báo cáo chính mình.',
    });
  }

  if (typeof sessionId !== 'string' || !ObjectId.isValid(sessionId)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID phiên không hợp lệ.',
    });
  }
  const sessionObjectId = new ObjectId(sessionId);

  const payload = {
    sessionId: sessionObjectId.toHexString(),
    targetActorKey,
    reason,
    ...(description !== undefined ? { description } : {}),
  };

  return /** @type {Promise<{ id: string, status: string, createdAt: string }>} */ (
    runIdempotentOperation({
      actorKey: reporterKey,
      method: 'POST',
      path: '/api/v1/reports',
      operationId,
      payload,
      now,
      authorize: async ({ session }) => {
        const db = await connectDatabase();
        await assertGuestSessionScope(
          db,
          identity,
          sessionObjectId,
          now,
          session,
        );
        const targetSession = await db.collection('practice_sessions').findOne(
          {
            _id: sessionObjectId,
            'members.actorKey': { $all: [reporterKey, targetActorKey] },
          },
          { session, projection: { _id: 1 } },
        );
        if (!targetSession) {
          throw new AppError({
            status: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Không tìm thấy phiên hợp lệ để gửi báo cáo.',
          });
        }
      },
      execute: async ({ session }) => {
        const db = await connectDatabase();
        const reportId = new ObjectId();
        const reportDoc = {
          _id: reportId,
          reporterKey,
          reportedKey: targetActorKey,
          sessionId: sessionObjectId,
          reason,
          ...(description !== undefined ? { description } : {}),
          status: 'new',
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('reports').insertOne(reportDoc, { session });
        return {
          resultRef: reportId.toHexString(),
          value: {
            id: reportId.toHexString(),
            status: reportDoc.status,
            createdAt: now.toISOString(),
          },
        };
      },
      replay: async ({ session, receipt }) => {
        const db = await connectDatabase();
        const reportId =
          typeof receipt.resultRef === 'string' &&
          ObjectId.isValid(receipt.resultRef)
            ? new ObjectId(receipt.resultRef)
            : null;
        if (!reportId) {
          throw new AppError({
            status: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Không tìm thấy báo cáo đã ghi nhận.',
          });
        }
        const existing = await db
          .collection('reports')
          .findOne(
            { _id: reportId, reporterKey },
            { session, projection: { status: 1, createdAt: 1 } },
          );
        if (!existing) {
          throw new AppError({
            status: 404,
            code: 'RESOURCE_NOT_FOUND',
            message: 'Không tìm thấy báo cáo đã ghi nhận.',
          });
        }
        return {
          id: String(existing._id),
          status: String(existing.status),
          createdAt:
            existing.createdAt instanceof Date
              ? existing.createdAt.toISOString()
              : new Date(existing.createdAt).toISOString(),
        };
      },
    })
  );
}
