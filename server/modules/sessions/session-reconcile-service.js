import { ParticipantInfo_State } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { listMediaParticipants } from '../../integrations/livekit/room-service.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import { CONNECTION_TIMEOUT_MS, sessionClocks } from './session-clock.js';
import { createSessionPresenceConsumer } from './session-lifecycle-service.js';
import { mediaUnavailable } from './sessions-errors.js';

const consume = createSessionPresenceConsumer();

/** @param {any} doc @param {() => Date} now */
export async function reconcileMediaPresence(
  doc,
  now,
  read = listMediaParticipants,
) {
  if (doc.status === 'ended') return doc;
  const db = await connectDatabase();
  const sessions = db.collection('practice_sessions');
  const waitUntil = Date.now() + 6_000;
  while (doc.presenceCheck?.until > new Date()) {
    if (Date.now() >= waitUntil) throw mediaUnavailable();
    await setTimeout(50);
    doc = (await sessions.findOne({ _id: doc._id })) ?? doc;
    if (doc.status === 'ended') return doc;
  }
  const observedAt = now();
  const check = { id: randomUUID(), until: new Date(Date.now() + 6_000) };
  const claimed = await sessions.updateOne(
    {
      _id: doc._id,
      version: doc.version,
      $and: [
        {
          $or: [
            { presenceCheck: { $exists: false } },
            { 'presenceCheck.until': { $lte: new Date() } },
          ],
        },
        {
          $or: [
            { presenceCheck: { $exists: true } },
            { presenceCheckedAt: { $exists: false } },
            {
              presenceCheckedAt: {
                $lte: new Date(observedAt.getTime() - 6_000),
              },
            },
          ],
        },
      ],
    },
    { $set: { presenceCheckedAt: observedAt, presenceCheck: check } },
  );
  if (!claimed.modifiedCount) {
    const current = (await sessions.findOne({ _id: doc._id })) ?? doc;
    if (current.presenceCheck)
      return reconcileMediaPresence(current, now, read);
    return current;
  }
  let participants;
  try {
    participants = await read(doc.roomName);
  } catch {
    return withTransaction(async (session) => {
      const current = await sessions.findOne(
        { _id: doc._id, 'presenceCheck.id': check.id },
        { session },
      );
      if (!current) throw mediaUnavailable();
      const pause = current.status === 'active' && current.activeSince;
      return sessions.findOneAndUpdate(
        {
          _id: doc._id,
          version: current.version,
          'presenceCheck.id': check.id,
        },
        {
          ...(pause && {
            $set: {
              ...sessionClocks(
                current,
                current.lastBothPresentAt ?? current.activeSince,
              ),
              presenceUnverified: true,
            },
            $inc: { version: 1 },
          }),
          $unset: {
            presenceCheck: '',
            ...(pause && { activeSince: '', selectionRunningSince: '' }),
          },
        },
        { session, returnDocument: 'after' },
      );
    });
  }
  return withTransaction(async (session) => {
    const current = await sessions.findOne({ _id: doc._id }, { session });
    if (
      !current ||
      current.version !== doc.version ||
      current.presenceCheck?.id !== check.id
    )
      throw mediaUnavailable();
    await sessions.updateOne(
      { _id: doc._id, 'presenceCheck.id': check.id },
      { $unset: { presenceCheck: '' } },
      { session },
    );
    delete current.presenceCheck;
    let changed = false;
    const presence = current.presence.map((/** @type {any} */ previous) => {
      const participant = participants.find(
        (p) =>
          p.identity === previous.actorKey &&
          p.state === ParticipantInfo_State.ACTIVE,
      );
      if (
        previous.connected === Boolean(participant) &&
        (!participant || previous.connectionSid === participant.sid)
      )
        return previous;
      changed = true;
      if (!participant)
        return {
          ...previous,
          connected: false,
          lastEventAt: new Date(Math.floor(observedAt.getTime() / 1000) * 1000),
          disconnectedAt: observedAt,
          reconnectUntil: new Date(
            observedAt.getTime() + CONNECTION_TIMEOUT_MS,
          ),
        };
      const rest = { ...previous };
      delete rest.disconnectedAt;
      delete rest.reconnectUntil;
      return {
        ...rest,
        connected: true,
        connectionSid: participant.sid,
        lastEventAt: new Date(Math.floor(observedAt.getTime() / 1000) * 1000),
      };
    });
    if (changed) {
      await consume({
        event: { event: 'presence_snapshot' },
        before: current,
        after: { ...current, presence },
        presenceChanged: true,
        reason: 'presence.reconciled',
        session,
        observedAt,
        checkedAt: now(),
      });
    }
    if (presence.every((/** @type {any} */ p) => p.connected)) {
      await sessions.updateOne(
        { _id: doc._id, status: 'active' },
        { $set: { lastBothPresentAt: observedAt } },
        { session },
      );
    }
    if (current.presenceUnverified) {
      const resumed = await sessions.findOne({ _id: doc._id }, { session });
      if (resumed?.status !== 'ended') {
        const at = now();
        await sessions.updateOne(
          { _id: doc._id },
          {
            $unset: { presenceUnverified: '' },
            ...(resumed?.status === 'active' && !resumed.activeSince
              ? {
                  $set: {
                    activeSince: at,
                    ...(!resumed.deckVersionId && {
                      selectionRunningSince: at,
                    }),
                  },
                  $inc: { version: 1 },
                }
              : {}),
          },
          { session },
        );
      }
    }
    return (await sessions.findOne({ _id: doc._id }, { session })) ?? doc;
  });
}
