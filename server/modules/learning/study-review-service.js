import mongoose from 'mongoose';
import { schedulerConfig } from '../../integrations/fsrs-config.js';
import { reviewCard } from '../../integrations/fsrs.js';
import { AppError } from '../../middleware/http-error.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import {
  hashPayload,
  idempotencyConflictError,
  isDuplicateKeyError,
} from '../coordination/coordination-service.js';
import { incrementReviewCount } from '../statistics/statistics-repository.js';
import { guestAccess } from './guest-write-guard.js';
import { verifyReviewTicket } from './review-ticket.js';
import {
  loadStudyScheduler,
  readCursor,
  toProgress,
} from './study-card-service.js';
import { resolveStudySet } from './study-scope.js';

const { ObjectId } = mongoose.Types;

/** @typedef {import('mongoose').mongo.Db} Db */
/** @typedef {Awaited<ReturnType<typeof import('../identity/identity-service.js').resolveIdentityFromCookies>>} Identity */
/** @typedef {NonNullable<Parameters<typeof toProgress>[1]>} StoredProgress */
/** @typedef {ReturnType<typeof reviewCard>['log'] & {ownerKey: string, cardKey: string, operationId: string, payloadHash: string, contentVersionId?: import('mongoose').Types.ObjectId, manualVersion?: number, beforeState: {version: number}, afterState: {version: number}, purgeAt?: Date}} ReviewLog */

/** @param {Db} db @returns {import('mongoose').mongo.Collection<ReviewLog>} */
function reviewLogs(db) {
  return db.collection('review_logs');
}

function cardNotFound() {
  return new AppError({
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    message: 'Không tìm thấy thẻ trong phạm vi học.',
  });
}

function versionConflict() {
  return new AppError({
    status: 409,
    code: 'VERSION_CONFLICT',
    message: 'Thẻ hoặc tiến độ đã thay đổi. Hãy mở lại đáp án.',
  });
}

/** @param {ReviewLog} log */
function reviewResult(log) {
  const { cardKey, ownerKey, reviewedAt, afterState } = log;
  return {
    cardKey,
    progress: toProgress(cardKey, { ...afterState, cardKey, ownerKey }),
    reviewedAt: reviewedAt.toISOString(),
  };
}

/** @param {{getIdentity: () => Promise<Identity>, reviewTicket: string, rating: 1 | 2 | 3, operationId: string, reviewedAt: Date}} input */
export async function submitStudyReview({
  getIdentity,
  reviewTicket,
  rating,
  operationId,
  reviewedAt,
}) {
  const db = await connectDatabase();
  const payloadHash = hashPayload({ reviewTicket, rating });
  const logs = reviewLogs(db);

  /** @param {import('mongoose').ClientSession} session */
  const record = async (session) => {
    const identity = await getIdentity();
    const ownerKey = identity.actorKey;
    const existing = await logs.findOne({ ownerKey, operationId }, { session });
    await guestAccess(db, identity, session);
    if (existing && existing.payloadHash !== payloadHash)
      throw idempotencyConflictError();
    const claims = verifyReviewTicket(
      reviewTicket,
      ownerKey,
      new Date(),
      Boolean(existing),
    );
    const { cardKey, scope, progressVersion, contentVersionId, manualVersion } =
      claims;
    const { cards } = await resolveStudySet(
      db,
      identity,
      scope,
      new Date(),
      session,
    );
    if (!cards.some((entry) => entry.cardKey === cardKey)) throw cardNotFound();
    if (existing) return reviewResult(existing);

    const progressRows =
      /** @type {import('mongoose').mongo.Collection<StoredProgress & {purgeAt?: Date}>} */ (
        db.collection('card_progress')
      );
    const key = { ownerKey, cardKey };
    const stored = await progressRows.findOne(key, { session });
    if ((stored?.version ?? 0) !== progressVersion) throw versionConflict();
    const configId = stored?.schedulerConfigId ?? schedulerConfig._id;
    if (configId !== claims.schedulerConfigId) throw versionConflict();
    const config = await loadStudyScheduler(db, configId, session);

    const cardId = new ObjectId(cardKey.slice(cardKey.indexOf(':') + 1));
    const revisionId = contentVersionId
      ? new ObjectId(contentVersionId)
      : undefined;
    if (revisionId) {
      const revision = await db
        .collection('content_versions')
        .findOne(
          { _id: revisionId, contentId: cardId, kind: 'knowledge' },
          { session, projection: { _id: 1 } },
        );
      if (!revision) throw cardNotFound();
    } else {
      // Force a write conflict with manual-card edits/deletion without changing its content version.
      const guard = await db.collection('manual_cards').updateOne(
        { _id: cardId, ownerKey, status: 'active', version: manualVersion },
        [
          {
            $set: {
              updatedAt: {
                $max: [
                  '$$NOW',
                  { $add: [{ $ifNull: ['$updatedAt', new Date(0)] }, 1] },
                ],
              },
            },
          },
        ],
        { session },
      );
      if (!guard.matchedCount) throw versionConflict();
    }

    const guest = await guestAccess(db, identity, session, true);
    verifyReviewTicket(reviewTicket, ownerKey, new Date());
    const { progress, log } = reviewCard(stored, reviewedAt, rating, config);
    const version = progressVersion + 1;
    const lifecycle = guest?.purgeAt ? { purgeAt: guest.purgeAt } : {};
    const nextProgress = { ...progress, version, ...lifecycle };
    if (stored) {
      const result = await progressRows.updateOne(
        { ...key, version: progressVersion },
        { $set: nextProgress },
        { session },
      );
      if (!result.matchedCount) throw versionConflict();
    } else {
      await progressRows.insertOne({ ...key, ...nextProgress }, { session });
    }
    const review = {
      ...log,
      ...key,
      operationId,
      payloadHash,
      ...(revisionId ? { contentVersionId: revisionId } : { manualVersion }),
      beforeState: { ...log.beforeState, version: progressVersion },
      afterState: { ...log.afterState, version },
      ...lifecycle,
    };
    await logs.insertOne(review, { session });
    await incrementReviewCount(db, { session, now: reviewedAt });
    return reviewResult(review);
  };

  try {
    return await withTransaction(record);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return withTransaction(record);
  }
}

/** @param {Identity} identity @param {{cardKey: string, limit: number, cursor?: string}} input */
export async function readStudyReviews(identity, { cardKey, limit, cursor }) {
  const db = await connectDatabase();
  const ownerKey = identity.actorKey;
  await guestAccess(db, identity);
  if (
    cardKey.startsWith('manual:') &&
    !(await db.collection('manual_cards').findOne(
      {
        _id: new ObjectId(cardKey.slice('manual:'.length)),
        ownerKey,
        status: 'active',
      },
      { projection: { _id: 1 } },
    ))
  ) {
    throw cardNotFound();
  }
  const context = JSON.stringify([ownerKey, 'reviews', cardKey]);
  const after = cursor === undefined ? undefined : readCursor(cursor, context);
  const reviewedAt = after ? new Date(after.time) : undefined;
  const rows = await reviewLogs(db)
    .find({
      ownerKey,
      cardKey,
      ...(after && {
        $or: [
          { reviewedAt: { $lt: reviewedAt } },
          { reviewedAt, _id: { $lt: new ObjectId(after.id) } },
        ],
      }),
    })
    .sort({ reviewedAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      id: row._id.toHexString(),
      cardKey: row.cardKey,
      rating: row.rating,
      reviewedAt: row.reviewedAt.toISOString(),
      ...(row.beforeState.lastReviewAt && {
        previousDueAt: row.beforeState.dueAt.toISOString(),
      }),
      nextDueAt: row.afterState.dueAt.toISOString(),
    })),
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              context,
              after: {
                time: last.reviewedAt.getTime(),
                id: last._id.toHexString(),
              },
            }),
          ).toString('base64url')
        : null,
  };
}
