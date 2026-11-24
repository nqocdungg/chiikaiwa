import { SessionPersonal } from './session-personal-model.js';

/** @typedef {import('mongoose').Types.ObjectId} ObjectId */
/** @typedef {import('mongoose').ClientSession} ClientSession */
/** @typedef {{confidence: number, comment?: string}} SelfAssessment */

/** @param {string} ownerKey */
function checkOwner(ownerKey) {
  if (
    typeof ownerKey !== 'string' ||
    !/^(user|guest):[0-9a-f]{24}$/.test(ownerKey)
  ) {
    throw new TypeError('A valid ownerKey is required');
  }
}

/** @param {number} expectedVersion */
function checkVersion(expectedVersion) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new TypeError('A non-negative expectedVersion is required');
  }
}

/** @param {ClientSession} session */
function checkTransaction(session) {
  if (!session?.inTransaction()) {
    throw new Error('Session personal writes require an active transaction');
  }
}

/**
 * Reads personal session data only inside the caller's ownership scope.
 * @param {string} ownerKey
 * @param {ObjectId} sessionId
 */
export function findSessionPersonal(ownerKey, sessionId) {
  checkOwner(ownerKey);
  return SessionPersonal.findOne({ ownerKey, sessionId });
}

/**
 * Creates or replaces the note with compare-and-swap on noteVersion.
 * The caller validates session membership and updates the guest guard, when
 * applicable, in the same transaction.
 *
 * @param {string} ownerKey
 * @param {ObjectId} sessionId
 * @param {number} expectedVersion
 * @param {string} note
 * @param {ClientSession} session
 * @param {{purgeAt?: Date, now?: Date}} [options]
 */
export async function saveSessionNote(
  ownerKey,
  sessionId,
  expectedVersion,
  note,
  session,
  { purgeAt, now = new Date() } = {},
) {
  checkOwner(ownerKey);
  checkVersion(expectedVersion);
  checkTransaction(session);
  const update = {
    $set: {
      note,
      updatedAt: now,
      ...(purgeAt ? { purgeAt } : {}),
    },
    $inc: { noteVersion: 1 },
  };
  const existing = await SessionPersonal.findOneAndUpdate(
    { ownerKey, sessionId, noteVersion: expectedVersion },
    update,
    { session, returnDocument: 'after', runValidators: true },
  );
  if (existing || expectedVersion !== 0) return existing;
  const occupied = await SessionPersonal.exists({
    ownerKey,
    sessionId,
  }).session(session);
  if (occupied) return null;

  const created = new SessionPersonal({
    ownerKey,
    sessionId,
    note,
    noteVersion: 1,
    version: 0,
    purgeAt,
    createdAt: now,
    updatedAt: now,
  });
  return created.save({ session });
}

/**
 * Removes only the note and advances noteVersion. Self-assessment and its
 * independent version are preserved.
 *
 * @param {string} ownerKey
 * @param {ObjectId} sessionId
 * @param {number} expectedVersion
 * @param {ClientSession} session
 * @param {{purgeAt?: Date, now?: Date}} [options]
 */
export function deleteSessionNote(
  ownerKey,
  sessionId,
  expectedVersion,
  session,
  { purgeAt, now = new Date() } = {},
) {
  checkOwner(ownerKey);
  checkVersion(expectedVersion);
  checkTransaction(session);
  return SessionPersonal.findOneAndUpdate(
    {
      ownerKey,
      sessionId,
      noteVersion: expectedVersion,
      note: { $exists: true },
    },
    {
      $unset: { note: '' },
      $set: { updatedAt: now, ...(purgeAt ? { purgeAt } : {}) },
      $inc: { noteVersion: 1 },
    },
    { session, returnDocument: 'after', runValidators: true },
  );
}

/**
 * Creates or replaces self-assessment with compare-and-swap on the PersonalSession version.
 * Note contents and noteVersion are independent and remain unchanged.
 *
 * @param {string} ownerKey
 * @param {ObjectId} sessionId
 * @param {number} expectedVersion
 * @param {SelfAssessment} selfAssessment
 * @param {ClientSession} session
 * @param {{purgeAt?: Date, now?: Date}} [options]
 */
export async function saveSelfAssessment(
  ownerKey,
  sessionId,
  expectedVersion,
  selfAssessment,
  session,
  { purgeAt, now = new Date() } = {},
) {
  checkOwner(ownerKey);
  checkVersion(expectedVersion);
  checkTransaction(session);
  const update = {
    $set: {
      selfAssessment,
      updatedAt: now,
      ...(purgeAt ? { purgeAt } : {}),
    },
    $inc: { version: 1 },
  };
  const existing = await SessionPersonal.findOneAndUpdate(
    { ownerKey, sessionId, version: expectedVersion },
    update,
    { session, returnDocument: 'after', runValidators: true },
  );
  if (existing || expectedVersion !== 0) return existing;
  const occupied = await SessionPersonal.exists({
    ownerKey,
    sessionId,
  }).session(session);
  if (occupied) return null;

  const created = new SessionPersonal({
    ownerKey,
    sessionId,
    noteVersion: 0,
    selfAssessment,
    version: 1,
    purgeAt,
    createdAt: now,
    updatedAt: now,
  });
  return created.save({ session });
}
