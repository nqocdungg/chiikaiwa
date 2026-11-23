import mongoose from 'mongoose';
import { AppError } from '../../middleware/http-error.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import { runIdempotentOperation } from '../coordination/coordination-service.js';
import { SavedSource } from '../learning/saved-item-models.js';
import {
  deleteSessionNote,
  findSessionPersonal,
  saveSelfAssessment,
  saveSessionNote,
} from '../learning/session-personal-repository.js';
import { QuizAttempt } from '../quiz/quiz-model.js';
import { projectSession, projectSessionMembers } from './session-projection.js';
import {
  authorizedSession,
  reconcileSession,
  sessionObjectId,
} from './session-service.js';

/** @typedef {Awaited<ReturnType<typeof import('../identity/identity-service.js').resolveIdentityFromCookies>>} Identity */
/** @typedef {{identity: Identity, getIdentity: () => Promise<Identity>, operationId: string}} WriteInput */

const { ObjectId } = mongoose.Types;
const GUEST_SUMMARY_TTL_MS = 15 * 60 * 1000;

function notReadyForSummary() {
  return new AppError({
    status: 409,
    code: 'INVALID_SESSION_STATE',
    message: 'Chỉ có thể xem tổng kết của phiên đã bắt đầu và kết thúc.',
  });
}

/** @param {number} currentVersion */
function versionConflict(currentVersion) {
  return new AppError({
    status: 409,
    code: 'VERSION_CONFLICT',
    message: 'Dữ liệu cá nhân đã thay đổi. Vui lòng tải lại trước khi lưu.',
    details: { currentVersion },
  });
}

function guestExpired() {
  return new AppError({
    status: 410,
    code: 'GUEST_EXPIRED',
    message: 'Quyền truy cập tạm của khách đã hết hạn.',
  });
}

/** @param {any} value */
function dateIso(value) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/** @param {any} personal @param {string} sessionId */
function personalDto(personal, sessionId) {
  return {
    sessionId,
    ...(personal?.note !== undefined ? { note: personal.note } : {}),
    noteVersion: personal?.noteVersion ?? 0,
    ...(personal?.selfAssessment
      ? {
          selfAssessment: {
            confidence: personal.selfAssessment.confidence,
            ...(personal.selfAssessment.comment !== undefined
              ? { comment: personal.selfAssessment.comment }
              : {}),
          },
        }
      : {}),
    version: personal?.version ?? 0,
  };
}

/**
 * Rechecks membership and returns the purge deadline for guest-owned data.
 * Guest writes also advance the guest guard in the same transaction.
 * @param {any} db
 * @param {mongoose.Types.ObjectId} id
 * @param {Identity} identity
 * @param {Date} at
 * @param {import('mongoose').ClientSession} session
 * @param {boolean} write
 */
async function authorizePersonalAccess(db, id, identity, at, session, write) {
  const practice = await authorizedSession(id, identity, at, session);
  if (identity.kind !== 'guest') return { practice };

  const guest = await db.collection('guest_sessions').findOne(
    {
      _id: identity.guestId,
      practiceSessionId: id,
      revokedAt: { $exists: false },
      status: { $in: ['active', 'summary'] },
    },
    { session },
  );
  if (!guest) throw guestExpired();
  const deadline = Math.min(
    practice.endedAt instanceof Date
      ? practice.endedAt.getTime() + GUEST_SUMMARY_TTL_MS
      : Infinity,
    guest.expiresAt instanceof Date ? guest.expiresAt.getTime() : Infinity,
  );
  if (deadline <= at.getTime()) throw guestExpired();
  if (write) {
    const result = await db
      .collection('guest_sessions')
      .updateOne(
        { _id: guest._id, version: guest.version },
        { $inc: { version: 1 } },
        { session },
      );
    if (!result.matchedCount) throw guestExpired();
  }
  return {
    practice,
    purgeAt: Number.isFinite(deadline) ? new Date(deadline) : undefined,
  };
}

/** @param {WriteInput} write */
async function recheckIdentity(write) {
  const current = await write.getIdentity();
  if (current.actorKey !== write.identity.actorKey) {
    throw new AppError({
      status: 401,
      code: 'SESSION_EXPIRED',
      message: 'Danh tính đã thay đổi.',
    });
  }
  return current;
}

/** @param {{sessionId: string, identity: Identity, now?: () => Date}} input */
export async function readSessionPersonal({
  sessionId,
  identity,
  now = () => new Date(),
}) {
  const id = sessionObjectId(sessionId);
  await reconcileSession(id, identity, now);
  return withTransaction(async (session) => {
    const at = now();
    await authorizePersonalAccess(
      await connectDatabase(),
      id,
      identity,
      at,
      session,
      false,
    );
    const personal = await findSessionPersonal(identity.actorKey, id)
      .session(session)
      .lean();
    return personalDto(personal, sessionId);
  });
}

/**
 * @param {WriteInput & {sessionId: string}} write
 * @param {{expectedVersion: number, note: string}} input
 */
export async function putSessionNote(write, input) {
  return writePersonal(write, 'PUT', 'note', input, async (context) => {
    const updated = await saveSessionNote(
      context.ownerKey,
      context.id,
      input.expectedVersion,
      input.note,
      context.session,
      { purgeAt: context.purgeAt, now: context.at },
    );
    if (!updated)
      await throwPersonalConflict(
        context.ownerKey,
        context.id,
        'noteVersion',
        context.session,
      );
    return updated;
  });
}

/**
 * @param {WriteInput & {sessionId: string}} write
 * @param {{expectedVersion: number}} input
 */
export async function removeSessionNote(write, input) {
  await writePersonal(write, 'DELETE', 'note', input, async (context) => {
    const updated = await deleteSessionNote(
      context.ownerKey,
      context.id,
      input.expectedVersion,
      context.session,
      { now: context.at },
    );
    if (!updated)
      await throwPersonalConflict(
        context.ownerKey,
        context.id,
        'noteVersion',
        context.session,
      );
    return updated;
  });
}

/**
 * @param {WriteInput & {sessionId: string}} write
 * @param {{expectedVersion: number, confidence: number, comment?: string}} input
 */
export async function putSessionSelfAssessment(write, input) {
  return writePersonal(
    write,
    'PUT',
    'self-assessment',
    input,
    async (context) => {
      const updated = await saveSelfAssessment(
        context.ownerKey,
        context.id,
        input.expectedVersion,
        {
          confidence: input.confidence,
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
        },
        context.session,
        { purgeAt: context.purgeAt, now: context.at },
      );
      if (!updated)
        await throwPersonalConflict(
          context.ownerKey,
          context.id,
          'version',
          context.session,
        );
      return updated;
    },
  );
}

/**
 * @param {WriteInput & {sessionId: string}} write
 * @param {'PUT'|'DELETE'} method
 * @param {string} resource
 * @param {Record<string, unknown>} payload
 * @param {(context: {ownerKey: string, id: mongoose.Types.ObjectId, session: import('mongoose').ClientSession, purgeAt?: Date, at: Date}) => Promise<any>} mutate
 */
async function writePersonal(write, method, resource, payload, mutate) {
  const db = await connectDatabase();
  const id = sessionObjectId(write.sessionId);
  const ownerKey = write.identity.actorKey;
  await reconcileSession(id, write.identity);
  /** @type {Identity} */ let current;
  /** @type {Date | undefined} */ let purgeAt;
  try {
    return await runIdempotentOperation({
      actorKey: ownerKey,
      method,
      path: `/api/v1/sessions/${write.sessionId}/${resource}`,
      operationId: write.operationId,
      payload,
      authorize: async ({ session, replay }) => {
        current = await recheckIdentity(write);
        const access = await authorizePersonalAccess(
          db,
          id,
          current,
          new Date(),
          session,
          !replay,
        );
        purgeAt = access.purgeAt;
      },
      execute: async ({ session }) => {
        const at = new Date();
        const updated = await mutate({
          ownerKey,
          id,
          session,
          purgeAt,
          at,
        });
        return {
          resultRef: String(id),
          value: personalDto(updated, write.sessionId),
        };
      },
      replay: async ({ session }) => {
        const personal = await findSessionPersonal(ownerKey, id)
          .session(session)
          .lean();
        return personalDto(personal, write.sessionId);
      },
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const currentPersonal = await findSessionPersonal(ownerKey, id).lean();
    const field = resource === 'note' ? 'noteVersion' : 'version';
    throw versionConflict(currentPersonal?.[field] ?? 0);
  }
}

/** @param {unknown} error */
function isDuplicateKey(error) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000,
  );
}

/** @param {string} ownerKey @param {mongoose.Types.ObjectId} id @param {'noteVersion'|'version'} field @param {import('mongoose').ClientSession} session */
async function throwPersonalConflict(ownerKey, id, field, session) {
  const current = await findSessionPersonal(ownerKey, id)
    .session(session)
    .lean();
  throw versionConflict(current?.[field] ?? 0);
}

/** @param {{sessionId: string, identity: Identity, now?: () => Date}} input */
export async function readSessionSummary({
  sessionId,
  identity,
  now = () => new Date(),
}) {
  const id = sessionObjectId(sessionId);
  await reconcileSession(id, identity, now);
  return withTransaction(async (session) => {
    const db = await connectDatabase();
    const at = now();
    const { practice } = await authorizePersonalAccess(
      db,
      id,
      identity,
      at,
      session,
      false,
    );
    if (practice.status !== 'ended' || !(practice.startedAt instanceof Date))
      throw notReadyForSummary();

    const [cards, personal, savedSources, quizAttempts] = await Promise.all([
      db
        .collection('session_cards')
        .find({ sessionId: id, drawnAt: { $type: 'date' } }, { session })
        .sort({ drawnAt: 1, _id: 1 })
        .toArray(),
      findSessionPersonal(identity.actorKey, id).session(session).lean(),
      SavedSource.find({ ownerKey: identity.actorKey, sessionId: id })
        .sort({ createdAt: 1, _id: 1 })
        .session(session)
        .lean(),
      QuizAttempt.find({ ownerKey: identity.actorKey, sourceSessionId: id })
        .sort({ createdAt: 1, _id: 1 })
        .session(session)
        .lean(),
    ]);
    const revisionIds = cards.map((card) => card.scenarioVersionId);
    const revisions = await db
      .collection('content_versions')
      .find(
        { _id: { $in: revisionIds }, kind: 'scenario' },
        { session, projection: { payload: 1 } },
      )
      .toArray();
    const titles = new Map(
      revisions.map((revision) => [
        String(revision._id),
        revision.payload?.title,
      ]),
    );
    if (
      cards.some(
        (card) =>
          typeof titles.get(String(card.scenarioVersionId)) !== 'string',
      )
    ) {
      throw new Error('Missing scenario revision for session summary');
    }
    return {
      session: await projectSession(practice, identity.actorKey, at, session),
      drawnCards: cards.map((card) => ({
        id: String(card._id),
        scenarioVersionId: String(card.scenarioVersionId),
        title: titles.get(String(card.scenarioVersionId)),
        status: card.status,
        drawnAt: dateIso(card.drawnAt),
        ...(card.finishedAt ? { finishedAt: dateIso(card.finishedAt) } : {}),
      })),
      personal: personalDto(personal, sessionId),
      savedSources: savedSources.map((source) => ({
        knowledgeVersionId: String(source.knowledgeVersionId),
        deckVersionId: String(source.deckVersionId),
        sessionId,
        scenarioVersionId: String(source.scenarioVersionId),
        createdAt: dateIso(source.createdAt),
      })),
      quizAttempts: quizAttempts.map(toQuizSummary),
    };
  });
}

/** @param {any} attempt */
function toQuizSummary(attempt) {
  return {
    id: String(attempt._id),
    deckVersionId: String(attempt.deckVersionId),
    sourceSessionId: String(attempt.sourceSessionId),
    status: attempt.status,
    total: attempt.total,
    ...(attempt.status === 'submitted' ? { score: attempt.score } : {}),
    createdAt: dateIso(attempt.createdAt),
    ...(attempt.submittedAt
      ? { submittedAt: dateIso(attempt.submittedAt) }
      : {}),
  };
}

/** @param {string | undefined} cursor @param {string} ownerKey */
function decodeHistoryCursor(cursor, ownerKey) {
  if (cursor === undefined) return null;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor)
      throw new Error('non-canonical');
    const value = JSON.parse(bytes.toString('utf8'));
    if (
      value?.context !== ownerKey ||
      typeof value.startedAt !== 'string' ||
      Number.isNaN(Date.parse(value.startedAt)) ||
      typeof value.id !== 'string' ||
      !/^[0-9a-f]{24}$/u.test(value.id)
    )
      throw new Error('invalid');
    return { startedAt: new Date(value.startedAt), id: new ObjectId(value.id) };
  } catch {
    throw new AppError({
      status: 400,
      code: 'INVALID_CURSOR',
      message: 'Con trỏ lịch sử không hợp lệ.',
    });
  }
}

/** @param {string} ownerKey @param {any} row */
function encodeHistoryCursor(ownerKey, row) {
  return Buffer.from(
    JSON.stringify({
      context: ownerKey,
      startedAt: row.startedAt.toISOString(),
      id: String(row._id),
    }),
  ).toString('base64url');
}

/** @param {{identity: Identity, limit: number, cursor?: string}} input */
export async function listSessionHistory({ identity, limit, cursor }) {
  const db = await connectDatabase();
  const boundary = decodeHistoryCursor(cursor, identity.actorKey);
  const query = {
    'members.actorKey': identity.actorKey,
    startedAt: { $type: 'date' },
    ...(boundary
      ? {
          $or: [
            { startedAt: { $lt: boundary.startedAt } },
            { startedAt: boundary.startedAt, _id: { $lt: boundary.id } },
          ],
        }
      : {}),
  };
  const rows = await db
    .collection('practice_sessions')
    .find(query)
    .sort({ startedAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const selected = rows.slice(0, limit);
  const items = [];
  for (const row of selected) {
    items.push({
      id: String(row._id),
      status: row.status,
      members: await projectSessionMembers(row),
      startedAt: dateIso(row.startedAt),
      ...(row.endedAt ? { endedAt: dateIso(row.endedAt) } : {}),
      ...(row.endReason !== undefined ? { endReason: row.endReason } : {}),
      ...(row.suggestedMinutes !== undefined
        ? { suggestedMinutes: row.suggestedMinutes }
        : {}),
      activeDurationMs: row.activeDurationMs ?? 0,
      ...(row.deckVersionId
        ? { deckVersionId: String(row.deckVersionId) }
        : {}),
    });
  }
  return {
    items,
    nextCursor:
      rows.length > limit && selected.length
        ? encodeHistoryCursor(identity.actorKey, selected.at(-1))
        : null,
  };
}
