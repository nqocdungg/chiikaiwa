import { ParticipantInfo_State } from 'livekit-server-sdk';
import { listMediaParticipants } from '../../integrations/livekit/room-service.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import { CONNECTION_TIMEOUT_MS } from './session-clock.js';
import { createSessionPresenceConsumer } from './session-lifecycle-service.js';

const consume = createSessionPresenceConsumer();

/** @param {any} doc @param {() => Date} now */
export async function reconcileMediaPresence(
  doc,
  now,
  read = listMediaParticipants,
) {
  if (doc.status === 'ended') return doc;
  const observedAt = now();
  const db = await connectDatabase();
  const sessions = db.collection('practice_sessions');
  const claimed = await sessions.updateOne(
    {
      _id: doc._id,
      version: doc.version,
      $or: [
        { presenceCheckedAt: { $exists: false } },
        { presenceCheckedAt: { $lte: new Date(observedAt.getTime() - 4_000) } },
      ],
    },
    { $set: { presenceCheckedAt: observedAt } },
  );
  if (!claimed.modifiedCount) return doc;
  let participants;
  try {
    participants = await read(doc.roomName);
  } catch {
    return doc;
  }
  return withTransaction(async (session) => {
    const current = await sessions.findOne({ _id: doc._id }, { session });
    if (
      !current ||
      current.version !== doc.version ||
      current.presenceCheckedAt?.getTime() !== observedAt.getTime()
    )
      return current ?? doc;
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
    return (await sessions.findOne({ _id: doc._id }, { session })) ?? doc;
  });
}
