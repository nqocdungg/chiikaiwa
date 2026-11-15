import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDatabase } from '../../persistence/database.js';
import { AppError } from '../../middleware/http-error.js';
import { sessionVersionConflict } from './sessions-errors.js';
import {
  sessionClocks,
  sessionDeadline,
  CONNECTION_TIMEOUT_MS,
} from './session-clock.js';

const { ObjectId } = mongoose.Types;

/** @param {any} doc @param {Date} at @param {string} reason @param {import('mongoose').ClientSession} session */
export async function endSession(doc, at, reason, session) {
  if (doc.status === 'ended') return doc;
  const db = await connectDatabase();
  const updated = await db.collection('practice_sessions').findOneAndUpdate(
    { _id: doc._id, version: doc.version, status: doc.status },
    {
      $set: {
        status: 'ended',
        endedAt: at,
        endReason: reason,
        ...sessionClocks(doc, at),
        'mediaCleanup.state': 'pending',
        updatedAt: at,
        screenShare: {
          state: 'idle',
          version: (doc.screenShare?.version ?? 0) + 1,
        },
      },
      $unset: { activeSince: '', selectionRunningSince: '', pendingAction: '' },
      $inc: { version: 1 },
    },
    { session, returnDocument: 'after' },
  );
  if (!updated) throw sessionVersionConflict();
  if (doc.currentCardId) {
    await db
      .collection('session_cards')
      .updateOne(
        { _id: doc.currentCardId, sessionId: doc._id, status: 'current' },
        { $set: { status: 'unfinished', finishedAt: at, updatedAt: at } },
        { session },
      );
  }
  for (const member of [...doc.members].sort((a, b) =>
    a.actorKey.localeCompare(b.actorKey),
  )) {
    await db.collection('actor_states').updateOne(
      /** @type {any} */ ({
        _id: member.actorKey,
        mode: 'inSession',
        resourceId: String(doc._id),
      }),
      {
        $set: { mode: 'idle', updatedAt: at },
        $unset: { resourceId: '', search: '' },
        $inc: { version: 1 },
      },
      { session },
    );
    if (member.kind === 'guest') {
      await db.collection('guest_sessions').updateOne(
        {
          _id: new ObjectId(member.actorKey.slice(6)),
          practiceSessionId: doc._id,
          status: 'active',
        },
        {
          $set: {
            status: 'summary',
            expiresAt: new Date(at.getTime() + 900_000),
            cleanupState: 'pending',
            updatedAt: at,
          },
          $inc: { version: 1 },
        },
        { session },
      );
    }
  }
  return updated;
}

/** @param {any} doc @param {Date} at @param {import('mongoose').ClientSession} session */
export async function reconcileSessionDeadline(doc, at, session) {
  if (doc.status === 'ended') return doc;
  const deadline = sessionDeadline(doc);
  return deadline && deadline.at <= at
    ? endSession(doc, deadline.at, deadline.reason, session)
    : doc;
}

/** Resolve only a reservation still owned by this expired session. @param {string} actorKey @param {Date} at @param {import('mongoose').ClientSession} session */
export async function reconcileActorSession(actorKey, at, session) {
  const db = await connectDatabase();
  const state = await db
    .collection('actor_states')
    .findOne(/** @type {any} */ ({ _id: actorKey, mode: 'inSession' }), {
      session,
    });
  if (!state || !/^[0-9a-f]{24}$/iu.test(state.resourceId)) return;
  const doc = await db
    .collection('practice_sessions')
    .findOne(
      { _id: new ObjectId(state.resourceId), 'members.actorKey': actorKey },
      { session },
    );
  if (doc) return reconcileSessionDeadline(doc, at, session);
}

/** @param {{pickController?: (max: number) => number}} [options] */
export function createSessionPresenceConsumer({
  pickController = randomInt,
} = {}) {
  /** @type {import('./livekit-webhook-service.js').PresenceConsumer} */
  const consume = async ({
    event,
    before,
    after,
    presenceChanged,
    reason,
    session,
    observedAt,
    checkedAt = observedAt,
    roomEmpty,
  }) => {
    const db = await connectDatabase();
    // Check the old running clock before a disconnect can remove its deadline.
    const losingConnection =
      roomEmpty ||
      (presenceChanged &&
        after.presence.some((/** @type {any} */ p) => !p.connected));
    const transitionAt = losingConnection ? observedAt : checkedAt;
    const reconciled = await reconcileSessionDeadline(
      { ...after, presence: before.presence },
      transitionAt,
      session,
    );
    if (reconciled.status === 'ended') {
      if (event.event === 'participant_joined') {
        // Invalidate an in-flight cleanup even if it was already pending.
        await db.collection('practice_sessions').updateOne(
          { _id: before._id, status: 'ended' },
          {
            $set: { 'mediaCleanup.state': 'pending' },
            $inc: { 'mediaCleanup.attempts': 1 },
          },
          { session },
        );
      }
      return;
    }
    if (reason === 'room.finished' && roomEmpty) {
      after = {
        ...after,
        presence: after.presence.map((/** @type {any} */ p) => ({
          ...p,
          connected: false,
          disconnectedAt: p.disconnectedAt ?? observedAt,
          reconnectUntil:
            p.reconnectUntil ??
            new Date(observedAt.getTime() + CONNECTION_TIMEOUT_MS),
        })),
      };
      presenceChanged = true;
    }
    if (!presenceChanged) return;
    const bothConnected =
      after.presence.length === 2 &&
      after.presence.every((/** @type {any} */ p) => p.connected);
    if (before.startedAt && before.status === 'reconnecting' && bothConnected) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Khôi phục phiên chưa sẵn sàng. Vui lòng thử lại.',
      });
    }
    /** @type {Record<string, any>} */
    const set = { updatedAt: transitionAt, presence: after.presence };
    /** @type {Record<string, string>} */
    const unset = {};
    if (!before.startedAt && bothConnected) {
      for (const member of after.members) {
        if (member.kind === 'user') {
          const user = await db
            .collection('users')
            .findOne(
              { _id: new ObjectId(member.actorKey.slice(5)), status: 'active' },
              { session },
            );
          if (!user) {
            await endSession(after, observedAt, 'account_locked', session);
            return;
          }
        } else {
          const guest = await db.collection('guest_sessions').findOne(
            {
              _id: new ObjectId(member.actorKey.slice(6)),
              practiceSessionId: after._id,
              status: 'active',
              revokedAt: { $exists: false },
            },
            { session },
          );
          if (!guest || (guest.expiresAt && guest.expiresAt <= checkedAt)) {
            await endSession(after, checkedAt, 'connection_timeout', session);
            return;
          }
        }
      }
      const blocked = await db.collection('blocks').findOne(
        {
          $or: [
            {
              blockerKey: after.members[0].actorKey,
              blockedKey: after.members[1].actorKey,
            },
            {
              blockerKey: after.members[1].actorKey,
              blockedKey: after.members[0].actorKey,
            },
          ],
        },
        { session },
      );
      if (blocked) {
        await endSession(after, observedAt, 'blocked', session);
        return;
      }
      for (const member of [...after.members].sort((a, b) =>
        a.actorKey.localeCompare(b.actorKey),
      )) {
        const guard = await db.collection('actor_states').updateOne(
          /** @type {any} */ ({
            _id: member.actorKey,
            mode: 'inSession',
            resourceId: String(after._id),
          }),
          { $inc: { version: 1 }, $set: { updatedAt: observedAt } },
          { session },
        );
        if (guard.modifiedCount !== 1) throw sessionVersionConflict();
      }
      const index = pickController(2);
      if (index !== 0 && index !== 1)
        throw new RangeError('Invalid controller index');
      Object.assign(set, {
        status: 'active',
        startedAt: checkedAt,
        controllerKey: after.members[index].actorKey,
        activeSince: checkedAt,
        selectionRunningSince: checkedAt,
      });
      await db.collection('statistics').updateOne(
        /** @type {any} */ ({ _id: 'lifetime' }),
        {
          $inc: { startedSessions: 1 },
          $set: { updatedAt: observedAt },
          $setOnInsert: {
            registeredAccounts: 0,
            reviewCount: 0,
            submittedQuizCount: 0,
          },
        },
        { upsert: true, session },
      );
    } else if (!bothConnected) {
      Object.assign(set, sessionClocks(before, observedAt));
      if (before.startedAt) set.status = 'reconnecting';
      Object.assign(unset, {
        activeSince: '',
        selectionRunningSince: '',
        pendingAction: '',
      });
    } else return;
    const result = await db.collection('practice_sessions').findOneAndUpdate(
      { _id: after._id, version: after.version, status: after.status },
      {
        $set: set,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
        $inc: { version: 1 },
      },
      { session, returnDocument: 'after' },
    );
    if (!result) throw sessionVersionConflict();
    await reconcileSessionDeadline(result, checkedAt, session);
  };
  return consume;
}
