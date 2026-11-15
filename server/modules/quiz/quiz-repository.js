import mongoose from 'mongoose';
import { QuizAttempt } from './quiz-model.js';

const { ObjectId } = mongoose.Types;

/**
 * @param {string | import('mongoose').Types.ObjectId} id
 * @returns {import('mongoose').Types.ObjectId}
 */
export function toObjectId(id) {
  return id instanceof ObjectId ? id : new ObjectId(id);
}

/**
 * @param {Record<string, any>} doc
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 */
export async function createQuizAttempt(doc, { session } = {}) {
  const [created] = await QuizAttempt.create([doc], { session });
  return created.toObject();
}

/**
 * @param {string | import('mongoose').Types.ObjectId} id
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 */
export async function findQuizAttemptById(id, { session } = {}) {
  const objectId = toObjectId(id);
  return QuizAttempt.findById(objectId)
    .session(session ?? null)
    .lean();
}

/**
 * @param {string | import('mongoose').Types.ObjectId} id
 * @param {string} ownerKey
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 */
export async function findQuizAttemptByIdAndOwner(
  id,
  ownerKey,
  { session } = {},
) {
  const objectId = toObjectId(id);
  return QuizAttempt.findOne({ _id: objectId, ownerKey })
    .session(session ?? null)
    .lean();
}

/**
 * Cập nhật nộp bài có CAS: chỉ chuyển khi status === 'inProgress' và version === expectedVersion.
 *
 * @param {Object} params
 * @param {string | import('mongoose').Types.ObjectId} params.id
 * @param {string} params.ownerKey
 * @param {number} params.expectedVersion
 * @param {Record<string, any>} params.updateData
 * @param {import('mongoose').ClientSession} params.session
 */
export async function submitQuizAttemptCas({
  id,
  ownerKey,
  expectedVersion,
  updateData,
  session,
}) {
  const objectId = toObjectId(id);
  return QuizAttempt.findOneAndUpdate(
    {
      _id: objectId,
      ownerKey,
      status: 'inProgress',
      version: expectedVersion,
    },
    {
      $set: updateData,
      $inc: { version: 1 },
    },
    {
      session,
      returnDocument: 'after',
      runValidators: true,
    },
  ).lean();
}

/**
 * Tăng submittedQuizCount trong thống kê trọn đời (06 §11.1).
 *
 * @param {any} db
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 */
export async function incrementSubmittedQuizCount(db, { session } = {}) {
  const collection = /** @type {import('mongoose').mongo.Collection<any>} */ (
    db.collection('statistics')
  );
  await collection.updateOne(
    { _id: 'lifetime' },
    {
      $inc: { submittedQuizCount: 1 },
      $currentDate: { updatedAt: true },
    },
    { session, upsert: true },
  );
}

/**
 * Mã hóa con trỏ phân trang cho quiz attempt.
 *
 * @param {{ createdAt: Date, _id: import('mongoose').Types.ObjectId | string }} doc
 * @returns {string}
 */
export function encodeQuizCursor(doc) {
  const createdAtIso =
    doc.createdAt instanceof Date
      ? doc.createdAt.toISOString()
      : new Date(doc.createdAt).toISOString();
  const idStr =
    doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
  const payload = JSON.stringify({ c: createdAtIso, i: idStr });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Giải mã con trỏ phân trang cho quiz attempt.
 *
 * @param {string | undefined | null} cursor
 * @returns {{ createdAt: Date, id: import('mongoose').Types.ObjectId } | null}
 */
export function decodeQuizCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    if (!parsed.c || !parsed.i) return null;
    const createdAt = new Date(parsed.c);
    if (
      Number.isNaN(createdAt.getTime()) ||
      !/^[a-f0-9]{24}$/iu.test(parsed.i)
    ) {
      return null;
    }
    return { createdAt, id: new ObjectId(parsed.i) };
  } catch {
    return null;
  }
}

/**
 * Truy vấn danh sách quiz attempts của owner có phân trang cursor.
 *
 * @param {Object} params
 * @param {string} params.ownerKey
 * @param {string} [params.sourceSessionId]
 * @param {number} [params.limit]
 * @param {string} [params.cursor]
 */
export async function listQuizAttempts({
  ownerKey,
  sourceSessionId,
  limit = 20,
  cursor,
}) {
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const query = /** @type {Record<string, any>} */ ({ ownerKey });

  if (sourceSessionId) {
    query.sourceSessionId = toObjectId(sourceSessionId);
  }

  if (cursor) {
    const decoded = decodeQuizCursor(cursor);
    if (!decoded) {
      throw new Error('INVALID_CURSOR');
    }
    query.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
    ];
  }

  const items = await QuizAttempt.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageSize + 1)
    .lean();

  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor =
    hasMore && pageItems.length > 0
      ? encodeQuizCursor(pageItems[pageItems.length - 1])
      : null;

  return {
    items: pageItems,
    nextCursor,
  };
}
