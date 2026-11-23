import mongoose from 'mongoose';
import { AppError } from '../../middleware/http-error.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import { toSelfDto } from '../identity/dto.js';
import { endSession } from '../sessions/session-lifecycle-service.js';
import { finishSessionEffects } from '../sessions/media-cleanup-service.js';

const { ObjectId } = mongoose.Types;
const ACTOR_KEY_RE = /^(user|guest):([0-9a-f]{24})$/iu;
const ALLOWED_ENTRY_MODES = new Set([
  'idle',
  'inviting',
  'requestingInvite',
  'proposed',
]);

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
 * @param {{
 *   blockerKey: string,
 *   blockedKey: string,
 *   sessionId?: string,
 *   now?: Date,
 *   effects?: typeof finishSessionEffects
 * }} input
 */
export async function createPairBlock({
  blockerKey,
  blockedKey,
  sessionId,
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
  /** @type {any} */
  let endedSession = null;
  /** @type {any} */
  let blockDoc = null;

  await withTransaction(async (session) => {
    endedSession = null;
    const db = await connectDatabase();

    if (validatedSessionObjectId) {
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
      if (targetSession.status !== 'ended') {
        endedSession = await endSession(targetSession, now, 'blocked', session);
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
      states.set(key, await actorStates(db).findOne({ _id: key }, { session }));
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
        endedSession = await endSession(sharedSession, now, 'blocked', session);
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
        { $set: { status: 'rejected', updatedAt: now }, $inc: { version: 1 } },
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
  });

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
 * Locks a user account within an existing MongoDB transaction session (TX-05).
 * Revokes active auth_sessions and tears down any active coordination / practice session state.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {import('mongoose').ClientSession} session
 * @param {{
 *   userId: string,
 *   adminId?: string | import('mongoose').Types.ObjectId,
 *   expectedVersion?: number,
 *   now?: Date,
 * }} input
 * @returns {Promise<{ lockedUser: any, endedSession: any }>}
 */
export async function lockUserAccountWithinSession(
  db,
  session,
  { userId, adminId, expectedVersion, now = new Date() },
) {
  const userObjectId = new ObjectId(userId);
  const actorKey = `user:${userObjectId.toHexString()}`;
  const adminObjectId =
    adminId && ObjectId.isValid(adminId) ? new ObjectId(adminId) : undefined;

  /** @type {Record<string, any>} */
  const query = { _id: userObjectId };
  if (expectedVersion !== undefined) {
    query.version = expectedVersion;
    query.status = 'active';
  }

  const lockedUser = await db.collection('users').findOneAndUpdate(
    query,
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
    if (expectedVersion !== undefined) {
      const existing = await db
        .collection('users')
        .findOne({ _id: userObjectId }, { session });
      if (!existing) {
        throw new AppError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          message: 'Không tìm thấy tài khoản.',
        });
      }
      throw new AppError({
        status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Phiên bản tài khoản không khớp. Vui lòng tải lại.',
        details: { currentVersion: existing.version },
      });
    }
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

  let endedSession = null;
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
  } else if (state?.mode === 'inviting' && ObjectId.isValid(state.resourceId)) {
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
  } else if (state?.mode === 'proposed' && ObjectId.isValid(state.resourceId)) {
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

  return { lockedUser, endedSession };
}

/**
 * Unlocks a user account within an existing MongoDB transaction session.
 * Does NOT increment authVersion (Q9), updates status to 'active' and increments version.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {import('mongoose').ClientSession} session
 * @param {{
 *   userId: string,
 *   adminId?: string | import('mongoose').Types.ObjectId,
 *   expectedVersion: number,
 *   now?: Date,
 * }} input
 * @returns {Promise<{ unlockedUser: any }>}
 */
export async function unlockUserAccountWithinSession(
  db,
  session,
  { userId, adminId, expectedVersion, now = new Date() },
) {
  const userObjectId = new ObjectId(userId);
  const adminObjectId =
    adminId && ObjectId.isValid(adminId) ? new ObjectId(adminId) : undefined;

  const unlockedUser = await db.collection('users').findOneAndUpdate(
    { _id: userObjectId, version: expectedVersion, status: 'locked' },
    {
      $set: {
        status: 'active',
        statusChangedAt: now,
        ...(adminObjectId ? { statusChangedBy: adminObjectId } : {}),
        updatedAt: now,
      },
      $inc: { version: 1 },
    },
    { session, returnDocument: 'after' },
  );

  if (!unlockedUser) {
    const existing = await db
      .collection('users')
      .findOne({ _id: userObjectId }, { session });
    if (!existing) {
      throw new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Không tìm thấy tài khoản.',
      });
    }
    throw new AppError({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'Phiên bản tài khoản không khớp. Vui lòng tải lại.',
      details: { currentVersion: existing.version },
    });
  }

  return { unlockedUser };
}

/**
 * Locks a user account, revokes all sessions, ends any active practice session,
 * and releases pending invites or matchmaking queue presence (TX-05).
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

  /** @type {any} */
  let endedSession = null;
  /** @type {any} */
  let lockedUser = null;

  await withTransaction(async (session) => {
    endedSession = null;
    const db = await connectDatabase();
    const result = await lockUserAccountWithinSession(db, session, {
      userId,
      adminId,
      now,
    });
    lockedUser = result.lockedUser;
    endedSession = result.endedSession;
  });

  if (endedSession) {
    await effects(endedSession);
  }

  return {
    user: toSelfDto(lockedUser),
    endedSessionId: endedSession ? String(endedSession._id) : null,
  };
}
