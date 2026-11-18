import { AppError } from '../../middleware/http-error.js';

const TRIAL_GRACE_MS = 15 * 60 * 1000;

export function guestExpired() {
  return new AppError({
    status: 410,
    code: 'GUEST_EXPIRED',
    message: 'Quyền truy cập tạm của khách đã hết hạn.',
  });
}

function notFound() {
  return new AppError({
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    message: 'Tài nguyên không tồn tại hoặc ngoài phạm vi truy cập.',
  });
}

/**
 * Kiểm tra quyền khách, hạn dùng và cập nhật CAS version khi ghi học tập (06 §11.2, 06 §12.2).
 *
 * @param {any} db
 * @param {any} identity
 * @param {any} [session]
 * @param {boolean} [write]
 * @returns {Promise<{ sessionId: any, deckVersionId: any, purgeAt?: Date } | null>}
 */
export async function guestAccess(db, identity, session, write = false) {
  if (identity.kind !== 'guest') return null;
  const guests = db.collection('guest_sessions');
  const guest = await guests.findOne({ _id: identity.guestId }, { session });
  if (
    !guest ||
    guest.revokedAt ||
    !['active', 'summary'].includes(guest.status) ||
    !guest.practiceSessionId
  ) {
    throw guestExpired();
  }
  const trial = await db.collection('practice_sessions').findOne(
    {
      _id: guest.practiceSessionId,
      'members.actorKey': identity.actorKey,
    },
    { session },
  );
  if (!trial?.deckVersionId) throw notFound();
  const endsAt =
    trial.endedAt instanceof Date
      ? trial.endedAt.getTime() + TRIAL_GRACE_MS
      : Infinity;
  const expires = Math.min(
    endsAt,
    guest.expiresAt instanceof Date ? guest.expiresAt.getTime() : Infinity,
  );
  if (expires <= Date.now()) throw guestExpired();
  if (write) {
    const result = await guests.updateOne(
      { _id: guest._id, version: guest.version },
      { $inc: { version: 1 } },
      { session },
    );
    if (!result.matchedCount) throw guestExpired();
  }
  return {
    sessionId: trial._id,
    deckVersionId: /** @type {any} */ (trial.deckVersionId),
    purgeAt: Number.isFinite(expires) ? new Date(expires) : undefined,
  };
}
