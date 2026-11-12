import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import { reconcileActorSession } from './session-lifecycle-service.js';
import {
  removeMediaParticipant,
  closeMediaRoom,
  notifyMediaSession,
} from '../../integrations/livekit/room-service.js';

/** @param {any} id @param {{remove?: typeof removeMediaParticipant, close?: typeof closeMediaRoom, now?: () => Date}} [options] */
export async function cleanupSessionMedia(
  id,
  {
    remove = removeMediaParticipant,
    close = closeMediaRoom,
    now = () => new Date(),
  } = {},
) {
  const db = await connectDatabase();
  const doc = await db.collection('practice_sessions').findOneAndUpdate(
    { _id: id, status: 'ended', 'mediaCleanup.state': 'pending' },
    {
      $inc: { 'mediaCleanup.attempts': 1 },
      $set: { 'mediaCleanup.lastAttemptAt': now() },
    },
    { returnDocument: 'after' },
  );
  if (!doc) return;
  let failed = false;
  for (const member of doc.members) {
    try {
      await remove(doc.roomName, member.actorKey);
    } catch {
      failed = true;
    }
  }
  try {
    await close(doc.roomName);
  } catch {
    failed = true;
  }
  await db.collection('practice_sessions').updateOne(
    {
      _id: id,
      status: 'ended',
      'mediaCleanup.state': 'pending',
      'mediaCleanup.attempts': doc.mediaCleanup.attempts,
    },
    failed
      ? { $set: { 'mediaCleanup.lastErrorCode': 'MEDIA_CLEANUP_FAILED' } }
      : {
          $set: { 'mediaCleanup.state': 'complete' },
          $unset: { 'mediaCleanup.lastErrorCode': '' },
        },
  );
  if (failed)
    console.warn(
      JSON.stringify({ code: 'MEDIA_CLEANUP_FAILED', sessionId: String(id) }),
    );
}

/** @param {any} doc */
export async function notifySessionUpdated(doc) {
  try {
    await notifyMediaSession(doc.roomName, String(doc._id), doc.version);
  } catch {
    console.warn(
      JSON.stringify({
        code: 'SESSION_NOTIFICATION_FAILED',
        sessionId: String(doc._id),
      }),
    );
  }
}

/** Best effort only after the durable lifecycle transaction has committed. @param {any} doc */
export async function finishSessionEffects(doc) {
  await notifySessionUpdated(doc);
  if (doc.status === 'ended') await cleanupSessionMedia(doc._id);
}

/** @param {string} actorKey @param {Date} at */
export async function reconcileActorSessionMedia(actorKey, at) {
  const doc = await withTransaction((session) =>
    reconcileActorSession(actorKey, at, session),
  );
  if (doc?.status === 'ended') await finishSessionEffects(doc);
}
