import { AppError } from '../../middleware/http-error.js';

export const TRIAL_GRACE_MS = 15 * 60 * 1000;

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
 * Computes the effective guest trial expiration deadline:
 * `min(trial.endedAt + 15 minutes, guest.expiresAt)`.
 *
 * @param {Record<string, any> | null | undefined} guest
 * @param {Record<string, any> | null | undefined} trial
 * @returns {Date | undefined}
 */
export function resolveGuestTrialDeadline(guest, trial) {
  const endsAt =
    trial?.endedAt instanceof Date
      ? trial.endedAt.getTime() + TRIAL_GRACE_MS
      : Infinity;
  const guestExpires =
    guest?.expiresAt instanceof Date ? guest.expiresAt.getTime() : Infinity;
  const expires = Math.min(endsAt, guestExpires);
  return Number.isFinite(expires) ? new Date(expires) : undefined;
}

/**
 * Kiểm tra quyền khách, hạn dùng và cập nhật CAS version khi ghi học tập (06 §11.2, 06 §12.2).
 *
 * @param {any} db
 * @param {any} identity
 * @param {any} [session]
 * @param {boolean} [write]
 * @param {Date} [now]
 * @returns {Promise<{ sessionId: any, deckVersionId: any, purgeAt?: Date } | null>}
 */
export async function guestAccess(
  db,
  identity,
  session,
  write = false,
  now = new Date(),
) {
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
  if (!trial) throw guestExpired();
  const deadline = resolveGuestTrialDeadline(guest, trial);
  if (
    (guest.status === 'summary' && !deadline) ||
    (deadline && deadline.getTime() <= now.getTime())
  ) {
    throw guestExpired();
  }
  if (!trial.deckVersionId) throw notFound();
  if (write) {
    const result = await guests.updateOne(
      {
        _id: guest._id,
        version: guest.version,
        status: { $in: ['active', 'summary'] },
        revokedAt: { $exists: false },
      },
      { $inc: { version: 1 } },
      { session },
    );
    if (!result.matchedCount) throw guestExpired();
  }
  return {
    sessionId: trial._id,
    deckVersionId: /** @type {any} */ (trial.deckVersionId),
    purgeAt: deadline,
  };
}
