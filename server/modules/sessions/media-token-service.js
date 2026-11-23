import mongoose from 'mongoose';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import { connectDatabase } from '../../persistence/database.js';
import { AppError } from '../../middleware/http-error.js';
import { signMediaToken } from '../../integrations/livekit/media-token.js';
import { reconcileSession } from './session-service.js';
import {
  sessionEnded,
  sessionVersionConflict,
  sessionExpired,
  mediaUnavailable,
} from './sessions-errors.js';

/** @typedef {Awaited<ReturnType<typeof import('../identity/identity-service.js').resolveIdentityFromCookies>>} Identity */
const { ObjectId } = mongoose.Types;

// Chỉ đọc quyền từ DB; việc đổi trạng thái phòng thuộc luồng vòng đời.
/**
 * @param {import('mongoose').mongo.Db} db
 * @param {import('mongoose').Types.ObjectId} id
 * @param {Identity} identity
 * @param {Date} now
 */
async function readPermission(db, id, identity, now) {
  const session = await db.collection('practice_sessions').findOne({
    _id: id,
    'members.actorKey': identity.actorKey,
  });
  if (!session)
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Không tìm thấy phiên.',
    });
  if (session.status === 'ended') throw sessionEnded();
  if (!['preparing', 'active', 'reconnecting'].includes(session.status)) {
    throw new AppError({
      status: 409,
      code: 'INVALID_SESSION_STATE',
      message: 'Phiên chưa sẵn sàng.',
    });
  }
  const members = session.members;
  if (
    !Array.isArray(members) ||
    members.length !== 2 ||
    members[0].actorKey === members[1].actorKey ||
    typeof session.roomName !== 'string' ||
    !session.roomName ||
    !Number.isInteger(session.version) ||
    session.version < 0
  ) {
    throw mediaUnavailable('Dữ liệu phiên chưa sẵn sàng.');
  }
  // Vé tối đa 10 phút; các hạn quyền bên dưới có thể rút ngắn thời gian này.
  let deadline = now.getTime() + 600_000;
  if (session.status === 'preparing') {
    // Anchor initial admission to persisted server time, even before presence exists.
    if (!(session.createdAt instanceof Date)) {
      throw sessionEnded();
    }
    deadline = Math.min(deadline, session.createdAt.getTime() + 300_000);
  }
  if (identity.kind === 'user') {
    const login = await db
      .collection('auth_sessions')
      .findOne({ _id: identity.sessionId });
    if (!(login?.expiresAt instanceof Date) || login.expiresAt <= now) {
      throw sessionExpired();
    }
    deadline = Math.min(deadline, login.expiresAt.getTime());
  }
  for (const member of members) {
    if (
      member.kind === 'user' &&
      /^user:[0-9a-f]{24}$/u.test(member.actorKey)
    ) {
      if (String(member.userId) !== member.actorKey.slice(5)) {
        throw mediaUnavailable('Dữ liệu thành viên chưa sẵn sàng.');
      }
      const user = await db
        .collection('users')
        .findOne({ _id: new ObjectId(member.actorKey.slice(5)) });
      if (!user || user.status !== 'active') {
        throw sessionEnded('Thành viên không còn quyền tham gia.');
      }
    } else if (
      member.kind === 'guest' &&
      /^guest:[0-9a-f]{24}$/u.test(member.actorKey)
    ) {
      const guest = await db
        .collection('guest_sessions')
        .findOne({ _id: new ObjectId(member.actorKey.slice(6)) });
      if (
        !guest ||
        guest.status !== 'active' ||
        guest.revokedAt ||
        String(guest.practiceSessionId) !== id.toHexString() ||
        (guest.expiresAt instanceof Date && guest.expiresAt <= now)
      ) {
        if (member.actorKey === identity.actorKey) {
          throw new AppError({
            status: 410,
            code: 'GUEST_EXPIRED',
            message: 'Quyền tham gia của khách đã hết hạn.',
          });
        }
        throw sessionEnded('Đối tác không còn quyền tham gia.');
      }
      if (guest.expiresAt instanceof Date)
        deadline = Math.min(deadline, guest.expiresAt.getTime());
    } else {
      throw mediaUnavailable('Dữ liệu thành viên chưa sẵn sàng.');
    }
  }
  const blocked = await db.collection('blocks').findOne({
    $or: [
      { blockerKey: members[0].actorKey, blockedKey: members[1].actorKey },
      { blockerKey: members[1].actorKey, blockedKey: members[0].actorKey },
    ],
  });
  if (blocked)
    throw new AppError({
      status: 409,
      code: 'PAIR_BLOCKED',
      message: 'Hai thành viên không thể tiếp tục phiên.',
    });
  for (const presence of session.presence ?? []) {
    if (!presence.connected && presence.reconnectUntil instanceof Date) {
      deadline = Math.min(deadline, presence.reconnectUntil.getTime());
    }
  }
  if (!session.deckVersionId && session.selectionRunningSince instanceof Date) {
    deadline = Math.min(
      deadline,
      session.selectionRunningSince.getTime() + session.selectionRemainingMs,
    );
  }
  if (!Number.isFinite(deadline) || deadline <= now.getTime()) {
    throw sessionEnded('Quyền tham gia phiên đã hết hạn.');
  }
  // Phòng có thể đã đổi trong lúc đọc tài khoản, khách và danh sách chặn.
  const unchanged = await db.collection('practice_sessions').findOne(
    {
      _id: id,
      version: session.version,
      status: session.status,
      roomName: session.roomName,
      members: session.members,
    },
    { projection: { _id: 1 } },
  );
  if (!unchanged)
    throw sessionVersionConflict('Phiên đã thay đổi. Vui lòng thử lại.');
  return { session, deadline };
}

/**
 * @param {{sessionId: string, getIdentity: () => Promise<Identity>, operationId?: string}} input
 * @param {{sign?: typeof signMediaToken, now?: () => Date}} [options]
 */
export async function issueMediaToken(
  { sessionId, getIdentity, operationId },
  { sign = signMediaToken, now = () => new Date() } = {},
) {
  if (!/^[0-9a-fA-F]{24}$/u.test(sessionId)) {
    throw new AppError({
      status: 400,
      code: 'MALFORMED_REQUEST',
      message: 'ID phiên không hợp lệ.',
    });
  }
  try {
    const db = await connectDatabase();
    const id = new ObjectId(sessionId);
    const identity = await getIdentity();
    if (
      identity.kind === 'guest' &&
      String(identity.guestSession.practiceSessionId) !== String(id)
    ) {
      // Preserve the token contract: a known member whose trial was detached
      // has expired media rights; outsiders still receive RESOURCE_NOT_FOUND.
      await readPermission(db, id, identity, now());
    }
    await reconcileSession(id, identity, now);
    const before = await readPermission(db, id, identity, now());
    const expiresAt = new Date(Math.floor(before.deadline / 1000) * 1000);
    if (expiresAt <= now())
      throw sessionEnded('Quyền tham gia phiên đã hết hạn.');
    // Chỉ ký sau khi xác nhận quyền; room và identity không lấy từ body client.
    const credential = await sign({
      roomName: before.session.roomName,
      actorKey: identity.actorKey,
      expiresAt,
    });
    // Nếu quyền đổi trong lúc ký thì bỏ vé, không trả cho browser.
    const currentIdentity = await getIdentity();
    if (identity.actorKey !== currentIdentity.actorKey) {
      throw sessionExpired('Danh tính đã thay đổi.');
    }
    await reconcileSession(id, currentIdentity, now);
    const after = await readPermission(db, id, currentIdentity, now());
    if (
      after.session.version !== before.session.version ||
      after.session.roomName !== before.session.roomName ||
      credential.expiresAt.getTime() > after.deadline
    ) {
      throw sessionVersionConflict();
    }
    if (credential.expiresAt <= now())
      throw sessionEnded('Quyền tham gia phiên đã hết hạn.');
    // Receipt chỉ ghi dấu yêu cầu, không lưu hoặc phát lại token.
    if (operationId) {
      await runIdempotentOperation({
        actorKey: identity.actorKey,
        method: 'POST',
        path: `/api/v1/sessions/${id}/media-token`,
        operationId,
        payload: {},
        authorize: async () => {
          const current = await getIdentity();
          if (current.actorKey !== identity.actorKey) throw sessionExpired();
          await readPermission(db, id, current, now());
        },
        execute: async () => ({ value: null }),
        replay: async () => null,
        now: now(),
      });
      // Ghi DB cũng mất thời gian, nên kiểm tra quyền lần cuối trước khi trả vé.
      const finalIdentity = await getIdentity();
      const finalPermission = await readPermission(
        db,
        id,
        finalIdentity,
        now(),
      );
      if (
        finalIdentity.actorKey !== identity.actorKey ||
        finalPermission.session.version !== before.session.version ||
        credential.expiresAt.getTime() > finalPermission.deadline ||
        credential.expiresAt <= now()
      ) {
        throw sessionVersionConflict();
      }
    }
    return { ...credential, expiresAt: credential.expiresAt.toISOString() };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mediaUnavailable();
  }
}
