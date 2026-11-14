import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import { readMediaParticipant } from '../../integrations/livekit/room-service.js';

const retentionMs = 7 * 24 * 60 * 60 * 1000;
const participantEvents = new Set([
  'participant_joined',
  'participant_left',
  'participant_connection_aborted',
]);

/**
 * BE-012 supplies a transactional consumer. It must use the supplied Mongo session,
 * and must not call external services: MongoDB may rerun the transaction callback.
 * @typedef {(input: {event: import('livekit-server-sdk').WebhookEvent, before: import('mongoose').mongo.WithId<import('mongoose').mongo.Document>, after: import('mongoose').mongo.WithId<import('mongoose').mongo.Document>, presenceChanged: boolean, reason: string, session: import('mongoose').ClientSession, observedAt: Date, checkedAt?: Date, roomEmpty?: boolean}) => Promise<void>} PresenceConsumer
 */

/**
 * @param {import('livekit-server-sdk').WebhookEvent} event
 * @param {{now?: () => Date, readParticipant?: typeof readMediaParticipant, onVerifiedPresence?: PresenceConsumer}} [options]
 */
export async function processLivekitWebhook(
  event,
  {
    now = () => new Date(),
    readParticipant = readMediaParticipant,
    onVerifiedPresence,
  } = {},
) {
  const observedAt = now();
  const occurredAt = new Date(Number(event.createdAt) * 1000);
  if (
    typeof event.id !== 'string' ||
    !event.id ||
    typeof event.event !== 'string' ||
    !event.event ||
    !Number.isFinite(occurredAt.getTime()) ||
    occurredAt.getTime() <= 0 ||
    occurredAt > observedAt
  ) {
    throw new Error('Invalid webhook envelope');
  }
  const roomName = event.room?.name ?? '';
  const actorKey = event.participant?.identity ?? '';
  const sid = event.participant?.sid;
  const participantEvent = participantEvents.has(event.event);
  if (participantEvent && (!roomName || !actorKey || !sid)) {
    throw new Error('Incomplete participant event');
  }
  const lifecycleEvent = participantEvent || event.event === 'room_finished';
  if (lifecycleEvent && !roomName) throw new Error('Missing room');
  const db = await connectDatabase();
  const receipts = db.collection('webhook_receipts');
  if (await receipts.findOne({ eventId: event.id })) return;

  // Network reads stay outside transactions. Retry if another webhook changed the
  // snapshot while reconciliation was in flight; never apply that stale result.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const before = lifecycleEvent
      ? await db.collection('practice_sessions').findOne({ roomName })
      : null;
    const previous = before?.presence?.find(
      (/** @type {Record<string, any>} */ item) => item.actorKey === actorKey,
    );
    let roomEmpty = false;
    if (
      event.event === 'room_finished' &&
      before &&
      before.status !== 'ended'
    ) {
      roomEmpty = true;
      for (const member of before.members) {
        if (await readParticipant(roomName, member.actorKey)) roomEmpty = false;
      }
    }
    const joining = event.event === 'participant_joined';
    const eligible =
      participantEvent &&
      before &&
      ['preparing', 'active', 'reconnecting'].includes(before.status) &&
      before.members?.length === 2 &&
      before.presence?.length === 2 &&
      before.members.some(
        (/** @type {Record<string, any>} */ member) =>
          member.actorKey === actorKey,
      ) &&
      previous;
    let apply = Boolean(eligible);
    let reason = before?.status === 'ended' ? 'session.ended' : 'event.ignored';
    let connectionSid = sid;
    let connected = joining;
    if (apply) reason = 'presence.updated';
    if (
      apply &&
      previous.lastEventAt instanceof Date &&
      occurredAt < previous.lastEventAt
    ) {
      apply = false;
      reason = 'event.stale';
    }
    if (apply && joining && previous.connectionSid === sid) {
      // A closed SID cannot be reopened, including after the receipt TTL expires.
      apply = false;
      reason = 'connection.unchanged';
    }
    if (
      apply &&
      !joining &&
      previous.connectionSid &&
      previous.connectionSid !== sid
    ) {
      const currentSid = await readParticipant(roomName, actorKey);
      connectionSid = currentSid ?? sid;
      connected = currentSid !== null;
      apply =
        !connected ||
        currentSid !== previous.connectionSid ||
        !previous.connected;
      reason = apply ? 'presence.reconciled' : 'connection.unchanged';
    }
    if (apply && connected && before) {
      const expired = before.presence.some(
        (/** @type {Record<string, any>} */ item) =>
          !item.connected &&
          item.reconnectUntil instanceof Date &&
          item.reconnectUntil <= observedAt,
      );
      const admissionExpired =
        before.status === 'preparing' &&
        (!(before.createdAt instanceof Date) ||
          before.createdAt.getTime() + 300_000 <= observedAt.getTime());
      if (expired || admissionExpired) {
        apply = false;
        reason = 'deadline.expired';
      } else if (joining && (previous.connectionSid || previous.lastEventAt)) {
        // Timestamps have only second precision. A new SID (including a tie)
        // needs current media evidence, rather than lexical SID ordering.
        apply = (await readParticipant(roomName, actorKey)) === sid;
        if (!apply) reason = 'connection.superseded';
      }
    }
    try {
      const retry = await withTransaction(async (session) => {
        if (await receipts.findOne({ eventId: event.id }, { session }))
          return false;
        if (before) {
          const current = await db
            .collection('practice_sessions')
            .findOne({ _id: before._id }, { session });
          if (
            !current ||
            current.version !== before.version ||
            current.status !== before.status
          )
            return true;
        }
        await receipts.insertOne(
          {
            eventId: event.id,
            eventType: event.event,
            roomName,
            ...(sid ? { connectionSid: sid } : {}),
            occurredAt,
            processedAt: observedAt,
            purgeAt: new Date(observedAt.getTime() + retentionMs),
          },
          { session },
        );
        if (!before) return false;
        const memberEvent =
          participantEvent &&
          before.members?.some(
            (/** @type {Record<string, any>} */ member) =>
              member.actorKey === actorKey,
          );
        if (!memberEvent && event.event !== 'room_finished') return false;
        // Do not consume a lifecycle event with a no-op when BE-012 is absent.
        // The receipt and presence roll back, leaving delivery retryable.
        if (!onVerifiedPresence)
          throw new Error('Lifecycle consumer is not configured');
        let after = before;
        if (apply) {
          const presence = before.presence.map(
            (/** @type {Record<string, any>} */ item) => {
              if (item.actorKey !== actorKey) return item;
              /** @type {Record<string, any>} */
              const next = {
                ...item,
                connected,
                connectionSid,
                lastEventAt: occurredAt,
              };
              if (connected) {
                delete next.disconnectedAt;
                delete next.reconnectUntil;
              } else if (
                item.connected ||
                !(item.disconnectedAt instanceof Date)
              ) {
                next.disconnectedAt = observedAt;
                next.reconnectUntil = new Date(observedAt.getTime() + 300_000);
              }
              return next;
            },
          );
          const updated = await db
            .collection('practice_sessions')
            .findOneAndUpdate(
              {
                _id: before._id,
                version: before.version,
                status: before.status,
              },
              {
                $set: { presence, updatedAt: observedAt },
                $inc: { version: 1 },
              },
              { session, returnDocument: 'after' },
            );
          if (!updated) throw new Error('Presence update conflict');
          after = updated;
        }
        await onVerifiedPresence({
          event,
          before,
          after,
          presenceChanged: apply,
          reason: event.event === 'room_finished' ? 'room.finished' : reason,
          session,
          observedAt,
          checkedAt: now(),
          roomEmpty,
        });
        return false;
      });
      if (!retry) return;
    } catch (error) {
      // Only acknowledge a concurrent unique-key collision after its transaction
      // committed a receipt; never swallow another DB/lifecycle failure.
      const failure =
        /** @type {{code?: number, keyPattern?: Record<string, number>}} */ (
          error
        );
      if (
        failure?.code === 11000 &&
        failure?.keyPattern?.eventId === 1 &&
        (await receipts.findOne({ eventId: event.id }))
      )
        return;
      throw error;
    }
  }
  throw new Error('Presence snapshot changed repeatedly');
}
