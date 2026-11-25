import mongoose from 'mongoose';
import { randomInt } from 'node:crypto';
import { connectDatabase } from '../../persistence/database.js';
import { incrementLifetimeCounter } from '../statistics/statistics-repository.js';
import {
  CONNECTION_TIMEOUT_MS,
  sessionClocks,
  sessionDeadline,
} from './session-clock.js';
import { mediaUnavailable, sessionVersionConflict } from './sessions-errors.js';

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
  // An expired lease still needs a new presence snapshot before clocks are trusted.
  if (doc.presenceCheck) throw mediaUnavailable();
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
        after.presence.some(
          (/** @type {any} */ p) =>
            !p.connected &&
            before.presence.some(
              (/** @type {any} */ previous) =>
                previous.actorKey === p.actorKey && previous.connected,
            ),
        ));
    const replacedConnection =
      event.event === 'presence_snapshot' &&
      before.status === 'active' &&
      before.presence.some(
        (/** @type {any} */ p, /** @type {number} */ i) =>
          p.connected &&
          after.presence[i]?.connected &&
          p.connectionSid !== after.presence[i].connectionSid,
      );
    const lastConfirmed = before.lastBothPresentAt ?? before.activeSince;
    const transitionAt =
      losingConnection || replacedConnection
        ? event.event === 'presence_snapshot' && lastConfirmed instanceof Date
          ? new Date(
              Math.max(
                before.activeSince?.getTime() ?? 0,
                lastConfirmed.getTime(),
              ),
            )
          : observedAt
        : checkedAt;
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
    /** @type {Record<string, any>} */
    const set = { updatedAt: transitionAt, presence: after.presence };
    if (
      before.screenShare?.ownerKey &&
      (!bothConnected ||
        before.presence.some(
          (/** @type {any} */ p, /** @type {number} */ i) =>
            p.actorKey === before.screenShare.ownerKey &&
            p.connectionSid !== after.presence[i]?.connectionSid,
        ))
    ) {
      set.screenShare = {
        ...before.screenShare,
        state: 'revoking',
        version: before.screenShare.version + 1,
      };
    }
    /** @type {Record<string, string>} */
    const unset = {};

    let countStartedSession = false;
    if (replacedConnection && bothConnected) {
      Object.assign(set, sessionClocks(before, transitionAt), {
        activeSince: checkedAt,
      });
      if (!before.deckVersionId) set.selectionRunningSince = checkedAt;
      unset.pendingAction = '';
    } else if (
      bothConnected &&
      (!before.startedAt || before.status === 'reconnecting')
    ) {
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
      Object.assign(set, { status: 'active', activeSince: checkedAt });
      if (!after.deckVersionId) set.selectionRunningSince = checkedAt;
      else unset.selectionRunningSince = '';
      // Only first admission chooses a controller and counts a started session.
      // Recovery opens a new active interval using the persisted paused clocks.
      if (!before.startedAt) {
        const index = pickController(2);
        if (index !== 0 && index !== 1)
          throw new RangeError('Invalid controller index');
        Object.assign(set, {
          startedAt: checkedAt,
          controllerKey: after.members[index].actorKey,
        });
        countStartedSession = true;
      }
    } else if (!bothConnected) {
      Object.assign(set, sessionClocks(before, transitionAt));
      if (before.startedAt) set.status = 'reconnecting';
      Object.assign(unset, {
        activeSince: '',
        selectionRunningSince: '',
        pendingAction: '',
      });
    }
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
    if (countStartedSession) {
      await incrementLifetimeCounter(db, 'startedSessions', {
        session,
        now: observedAt,
      });
    }
    await reconcileSessionDeadline(result, checkedAt, session);
  };
  return consume;
}
