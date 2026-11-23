import { TrackSource } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../../persistence/database.js';
import { AppError } from '../../middleware/http-error.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import {
  hasScreenMedia,
  listMediaParticipants,
  setScreenPermission,
} from '../../integrations/livekit/room-service.js';
import { finishSessionEffects } from './media-cleanup-service.js';
import {
  authorizedSession,
  reconcileSession,
  sessionObjectId,
} from './session-service.js';
import { projectSession } from './session-projection.js';
import { sessionDeadline } from './session-clock.js';
import {
  sessionEnded,
  sessionExpired,
  sessionVersionConflict,
} from './sessions-errors.js';

/** @param {any} doc */
export async function reconcileScreenShare(doc) {
  const share = doc.screenShare;
  if (
    !share ||
    !['granting', 'revoking'].includes(share.state) ||
    doc.status === 'ended' ||
    share.grantInFlight
  )
    return;
  const db = await connectDatabase();
  const sessions = db.collection('practice_sessions');
  const filter = {
    _id: doc._id,
    version: doc.version,
    'screenShare.version': share.version,
  };
  const grant = share.state === 'granting';
  if (
    grant &&
    (doc.status !== 'active' ||
      (sessionDeadline(doc)?.at.getTime() ?? Infinity) <= Date.now())
  )
    return;
  const lock = { ...filter, 'screenShare.grantInFlight': { $ne: true } };
  const locked = await sessions.updateOne(lock, {
    $set: { 'screenShare.grantInFlight': true },
  });
  if (!locked.modifiedCount) return;
  let confirmed = false;
  let permissionCallPending = false;
  try {
    const before = await listMediaParticipants(doc.roomName);
    const owner = before.find((p) => p.identity === share.ownerKey);
    if (
      grant &&
      owner &&
      !before.some((p) => p.identity !== share.ownerKey && hasScreenMedia(p)) &&
      doc.presence.every(
        (/** @type {any} */ p) =>
          p.connected &&
          before.some(
            (item) =>
              item.identity === p.actorKey && item.sid === p.connectionSid,
          ),
      )
    ) {
      permissionCallPending = true;
      const updated = await setScreenPermission(
        doc.roomName,
        share.ownerKey,
        true,
      );
      permissionCallPending = false;
      confirmed =
        updated.sid === owner.sid &&
        Boolean(
          updated.permission?.canPublishSources.includes(
            TrackSource.SCREEN_SHARE,
          ),
        );
    } else if (!grant) {
      if (owner && hasScreenMedia(owner)) {
        permissionCallPending = true;
        await setScreenPermission(doc.roomName, share.ownerKey, false);
        permissionCallPending = false;
      }
      confirmed = !(await listMediaParticipants(doc.roomName)).some(
        hasScreenMedia,
      );
    }
  } catch {
    // An unacknowledged permission change can still execute on LiveKit.
    if (permissionCallPending) return;
  }
  const updated =
    confirmed &&
    (!grant ||
      !((sessionDeadline(doc)?.at.getTime() ?? Infinity) <= Date.now())) &&
    (await sessions.findOneAndUpdate(
      filter,
      {
        $set: {
          screenShare: grant
            ? { ...share, state: 'active', version: share.version + 1 }
            : { state: 'idle', version: share.version + 1 },
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    ));
  if (updated) await finishSessionEffects(updated);
  else if (grant) {
    const pending = await sessions.findOneAndUpdate(
      {
        _id: doc._id,
        status: { $ne: 'ended' },
        'screenShare.ownerKey': share.ownerKey,
        'screenShare.grantInFlight': true,
      },
      {
        $set: { 'screenShare.state': 'revoking' },
        $unset: { 'screenShare.grantInFlight': '' },
        $inc: { version: 1, 'screenShare.version': 1 },
      },
      { returnDocument: 'after' },
    );
    if (pending) {
      await finishSessionEffects(pending);
      await reconcileScreenShare(pending);
    }
  } else {
    await sessions.updateOne(
      {
        _id: doc._id,
        status: { $ne: 'ended' },
        'screenShare.ownerKey': share.ownerKey,
        'screenShare.state': 'revoking',
      },
      { $unset: { 'screenShare.grantInFlight': '' } },
    );
  }
}

/** @param {{sessionId:string, getIdentity: () => Promise<import('./session-service.js').Identity>, operationId:string, expectedVersion?:number}} input */
export async function changeScreenShare({
  sessionId,
  getIdentity,
  operationId,
  expectedVersion,
}) {
  const id = sessionObjectId(sessionId);
  const identity = await getIdentity();
  const claim = expectedVersion !== undefined;
  await reconcileSession(id, identity);
  const db = await connectDatabase();
  /** @type {any} */ let doc;
  const intent = randomUUID();
  const reference = await runIdempotentOperation({
    actorKey: identity.actorKey,
    method: 'POST',
    path: `/api/v1/sessions/${id}/screen-share/${claim ? 'claim' : 'release'}`,
    operationId,
    payload: claim ? { expectedVersion } : {},
    authorize: async ({ session }) => {
      const current = await getIdentity();
      if (current.actorKey !== identity.actorKey) throw sessionExpired();
      doc = await authorizedSession(id, current, new Date(), session);
    },
    execute: async ({ session }) => {
      if (
        doc.status === 'ended' ||
        (sessionDeadline(doc)?.at.getTime() ?? Infinity) <= Date.now()
      )
        throw sessionEnded();
      const share = doc.screenShare;
      if (claim) {
        if (share.state !== 'idle')
          throw new AppError({
            status: 409,
            code: 'SCREEN_SHARE_BUSY',
            message: 'Quyền chia sẻ màn hình đang được giữ.',
          });
        if (
          doc.version !== expectedVersion ||
          doc.status !== 'active' ||
          !doc.presence.every((/** @type {any} */ p) => p.connected)
        )
          throw sessionVersionConflict(undefined, doc.version);
      } else if (share.ownerKey !== identity.actorKey) {
        throw new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Chỉ người giữ quyền chia sẻ có thể dừng.',
        });
      }
      doc = await db.collection('practice_sessions').findOneAndUpdate(
        {
          _id: id,
          version: doc.version,
          'screenShare.version': share.version,
        },
        {
          $set: {
            screenShare: {
              ...share,
              state: claim ? 'granting' : 'revoking',
              ownerKey: identity.actorKey,
              operationId: intent,
              version: share.version + 1,
            },
          },
          $inc: { version: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!doc) throw sessionVersionConflict();
      return { resultRef: intent, value: intent };
    },
    replay: async ({ receipt }) => receipt.resultRef,
  });
  if (reference === intent) await finishSessionEffects(doc);
  await reconcileScreenShare(doc);
  const current = await getIdentity();
  if (current.actorKey !== identity.actorKey) throw sessionExpired();
  const at = new Date();
  doc = await authorizedSession(id, current, at);
  const share = doc.screenShare;
  const pending =
    share.operationId === reference &&
    ['granting', 'revoking'].includes(share.state);
  return {
    data: { session: await projectSession(doc, current.actorKey, at) },
    status: pending ? 202 : 200,
    at,
  };
}
