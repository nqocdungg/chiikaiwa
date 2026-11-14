import mongoose from 'mongoose';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import { AppError } from '../../middleware/http-error.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import {
  reconcileSessionDeadline,
  endSession,
} from './session-lifecycle-service.js';
import { projectSession } from './session-projection.js';
import {
  cleanupSessionMedia,
  finishSessionEffects,
} from './media-cleanup-service.js';

/** @typedef {Awaited<ReturnType<typeof import('../identity/identity-service.js').resolveIdentityFromCookies>>} Identity */

/** @param {unknown} id */
export function sessionObjectId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{24}$/iu.test(id))
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID phiên không hợp lệ.',
    });
  return new mongoose.Types.ObjectId(id);
}

/** @param {any} id @param {Identity} identity @param {Date} at @param {import('mongoose').ClientSession} [session] */
async function authorizedSession(id, identity, at, session) {
  const db = await connectDatabase();
  const doc = await db
    .collection('practice_sessions')
    .findOne({ _id: id, 'members.actorKey': identity.actorKey }, { session });
  if (!doc)
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Không tìm thấy phiên.',
    });
  if (identity.kind === 'guest') {
    const guest = await db.collection('guest_sessions').findOne(
      {
        _id: identity.guestId,
        practiceSessionId: id,
        revokedAt: { $exists: false },
      },
      { session },
    );
    if (!guest)
      throw new AppError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Không tìm thấy phiên.',
      });
    if (
      !['active', 'summary'].includes(guest.status) ||
      (guest.expiresAt && guest.expiresAt <= at)
    )
      throw new AppError({
        status: 410,
        code: 'GUEST_EXPIRED',
        message: 'Quyền truy cập tạm đã hết hạn.',
      });
  }
  return doc;
}

/** Commit expiry before a caller rejects its now-ended resource. @param {any} id @param {Identity} identity @param {() => Date} now */
export async function reconcileSession(id, identity, now = () => new Date()) {
  let changed = false;
  const doc = await withTransaction(async (session) => {
    const before = await authorizedSession(id, identity, now(), session);
    const after = await reconcileSessionDeadline(before, now(), session);
    changed = after.version !== before.version;
    return after;
  });
  if (changed) await finishSessionEffects(doc);
  else if (doc.status === 'ended') await cleanupSessionMedia(id);
  return doc;
}

/** @param {{sessionId: string, getIdentity: () => Promise<Identity>, now?: () => Date}} input */
export async function readSession({
  sessionId,
  getIdentity,
  now = () => new Date(),
}) {
  const id = sessionObjectId(sessionId);
  await reconcileSession(id, await getIdentity(), now);
  return sessionSnapshot(id, await getIdentity(), now);
}

/** Read the session, its cards and revisions from the same authoritative snapshot.
 * @param {any} id @param {Identity} identity @param {() => Date} now
 */
async function sessionSnapshot(id, identity, now) {
  const snapshot = await withTransaction(async (session) => {
    const at = now();
    const before = await authorizedSession(id, identity, at, session);
    const doc = await reconcileSessionDeadline(before, at, session);
    return {
      data: await projectSession(doc, identity.actorKey, at, session),
      at,
      doc,
      changed: doc.version !== before.version,
    };
  });
  if (snapshot.changed) await finishSessionEffects(snapshot.doc);
  // Expiry must stay committed even when this ends an already-expired trial.
  if (identity.kind === 'guest') await authorizedSession(id, identity, now());
  return { data: snapshot.data, at: snapshot.at };
}

/** @param {{sessionId: string, getIdentity: () => Promise<Identity>, operationId: string, now?: () => Date, effects?: typeof finishSessionEffects}} input */
export async function leaveSession({
  sessionId,
  getIdentity,
  operationId,
  now = () => new Date(),
  effects = finishSessionEffects,
}) {
  const id = sessionObjectId(sessionId);
  const identity = await getIdentity();
  // Expiry commits independently; returning an auth error must not undo it.
  await reconcileSession(id, identity, now);
  /** @type {any} */ let doc;
  await runIdempotentOperation({
    actorKey: identity.actorKey,
    method: 'POST',
    path: `/api/v1/sessions/${id}/leave`,
    operationId,
    payload: {},
    now: now(),
    authorize: async ({ session }) => {
      const current = await getIdentity();
      if (current.actorKey !== identity.actorKey)
        throw new AppError({
          status: 401,
          code: 'SESSION_EXPIRED',
          message: 'Danh tính đã thay đổi.',
        });
      doc = await authorizedSession(id, current, now(), session);
    },
    execute: async ({ session }) => {
      doc = await reconcileSessionDeadline(doc, now(), session);
      doc = await endSession(doc, now(), 'left', session);
      return { resultRef: String(id), value: null };
    },
    replay: async () => null,
  });
  await effects(doc);
  const currentIdentity = await getIdentity();
  return sessionSnapshot(id, currentIdentity, now);
}
