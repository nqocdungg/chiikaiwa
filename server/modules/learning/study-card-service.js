import {
  assertSchedulerConfig,
  schedulerConfig,
} from '../../integrations/fsrs-config.js';
import { previewCard } from '../../integrations/fsrs.js';
import {
  AppError,
  createValidationError,
} from '../../middleware/http-error.js';

/** @typedef {import('mongoose').mongo.Db} Db */
/** @typedef {import('../../integrations/fsrs.js').CardState & {cardKey: string, ownerKey: string, version: number}} StoredProgress */
/** @typedef {{type: 'topic', topicVersionId: string} | {type: 'saved'} | {type: 'personalDeck', deckId: string}} StudyScope */
/** @typedef {{time: number, id: string}} StudyPosition */
/** @typedef {{cardKey: string, front: string, back: string, position: StudyPosition} & ({contentVersionId: string, manualVersion?: never} | {manualVersion: number, contentVersionId?: never})} StudyCard */
/** @typedef {{ownerKey: string, scope: StudyScope, cards: readonly StudyCard[], now: Date}} AuthorizedStudySet */

export const studyCardKeyPattern = /^(knowledge|manual):[a-f0-9]{24}$/u;
const ticketLifetimeMs = 30 * 60 * 1000;
const ratingLabels = ['Again', 'Hard', 'Good'];

/** @param {Db} db @returns {import('mongoose').mongo.Collection<StoredProgress>} */
function progressCollection(db) {
  return db.collection('card_progress');
}

/** @param {StudyScope} scope */
function scopeKey(scope) {
  if (scope.type === 'topic') return `topic:${scope.topicVersionId}`;
  if (scope.type === 'personalDeck') return `personalDeck:${scope.deckId}`;
  return 'saved';
}

/** @param {StudyPosition} left @param {StudyPosition} right */
function comparePosition(left, right) {
  return (
    right.time - left.time ||
    (right.id > left.id ? 1 : right.id < left.id ? -1 : 0)
  );
}

/** @param {string} cursor @param {string} context @returns {StudyPosition} */
function readCursor(cursor, context) {
  try {
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') === cursor) {
      const data = JSON.parse(decoded.toString('utf8'));
      if (
        data?.context === context &&
        Number.isSafeInteger(data.after?.time) &&
        Math.abs(data.after.time) <= 8.64e15 &&
        typeof data.after.id === 'string' &&
        /^[a-f0-9]{24}$/u.test(data.after.id)
      ) {
        return data.after;
      }
    }
  } catch {
    // Invalid cursors share the same public error.
  }
  throw new AppError({
    status: 400,
    code: 'INVALID_CURSOR',
    message: 'Con trỏ không hợp lệ hoặc không khớp truy vấn thẻ.',
  });
}

/** @param {string} cardKey @param {StoredProgress | null} stored */
function toProgress(cardKey, stored) {
  if (!stored) {
    return { cardKey, state: 'new', reps: 0, lapses: 0, version: 0 };
  }
  return {
    cardKey,
    state: stored.state,
    dueAt: stored.dueAt.toISOString(),
    ...(stored.lastReviewAt && {
      lastReviewAt: stored.lastReviewAt.toISOString(),
    }),
    reps: stored.reps,
    lapses: stored.lapses,
    version: stored.version,
  };
}

/** @param {StudyCard} card */
function cardRevision(card) {
  return card.manualVersion === undefined
    ? { contentVersionId: card.contentVersionId }
    : { manualVersion: card.manualVersion };
}

/**
 * Cards must come from the scope resolver after checking access for this owner.
 * @param {Db} db
 * @param {AuthorizedStudySet & {mode: 'all' | 'due', limit?: number, cursor?: string}} input
 */
export async function queryStudyCards(
  db,
  { ownerKey, scope, cards, now, mode, limit = 20, cursor },
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw createValidationError([
      {
        path: 'limit',
        code: 'INVALID_LIMIT',
        message: 'Nhập số nguyên từ 1 đến 50.',
      },
    ]);
  }
  const context = JSON.stringify([
    ownerKey,
    scopeKey(scope),
    mode,
    'time:desc,id:desc',
  ]);
  const after = cursor === undefined ? undefined : readCursor(cursor, context);
  const candidates = cards
    .filter(({ position }) => !after || comparePosition(position, after) > 0)
    .sort((left, right) => comparePosition(left.position, right.position));
  const lookup = mode === 'all' ? candidates.slice(0, limit + 1) : candidates;
  const stored = lookup.length
    ? await progressCollection(db)
        .find({
          ownerKey,
          cardKey: { $in: lookup.map(({ cardKey }) => cardKey) },
        })
        .toArray()
    : [];
  const progressByKey = new Map(stored.map((row) => [row.cardKey, row]));
  const eligible = lookup.filter(({ cardKey }) => {
    const progress = progressByKey.get(cardKey);
    return mode === 'all' || !progress || progress.dueAt <= now;
  });
  const page = eligible.slice(0, limit);
  const items = page.map((card) => ({
    cardKey: card.cardKey,
    front: card.front,
    ...cardRevision(card),
    progress: toProgress(card.cardKey, progressByKey.get(card.cardKey) ?? null),
  }));
  const nextCursor =
    eligible.length > limit
      ? Buffer.from(
          JSON.stringify({ context, after: page.at(-1)?.position }),
        ).toString('base64url')
      : null;
  return { items, nextCursor };
}

/**
 * Builds the reveal data and claims for the review-ticket signer.
 * @param {Db} db
 * @param {AuthorizedStudySet & {cardKey: string, guestExpiresAt?: Date}} input
 */
export async function prepareStudyCardReveal(
  db,
  { ownerKey, scope, cards, cardKey, now, guestExpiresAt },
) {
  const expiresAt = Math.min(
    now.getTime() + ticketLifetimeMs,
    guestExpiresAt?.getTime() ?? Infinity,
  );
  if (expiresAt <= now.getTime()) {
    throw new AppError({
      status: 410,
      code: 'GUEST_EXPIRED',
      message: 'Quyền truy cập tạm của khách đã hết hạn.',
    });
  }
  const card = cards.find((candidate) => candidate.cardKey === cardKey);
  if (!card) {
    throw new AppError({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Không tìm thấy thẻ trong phạm vi học.',
    });
  }
  const stored = await progressCollection(db).findOne({ ownerKey, cardKey });
  const progress = toProgress(cardKey, stored);
  const configId = stored?.schedulerConfigId ?? schedulerConfig._id;
  const configuration =
    /** @type {import('mongoose').mongo.Collection<typeof schedulerConfig>} */ (
      db.collection('scheduler_configs')
    );
  const config = await configuration.findOne({ _id: configId });
  try {
    if (!config) throw new Error('Scheduler configuration is missing');
    assertSchedulerConfig(config);
  } catch {
    throw new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Cấu hình lịch ôn chưa sẵn sàng.',
    });
  }
  const preview = previewCard(stored, now, config).map(
    ({ rating, progress }) => ({
      rating,
      label: ratingLabels[rating - 1],
      dueAt: progress.dueAt.toISOString(),
    }),
  );
  const ticketExpiresAt = new Date(expiresAt).toISOString();
  return {
    data: {
      cardKey,
      front: card.front,
      back: card.back,
      progress,
      preview,
      ticketExpiresAt,
    },
    ticketClaims: {
      ownerKey,
      scope,
      cardKey,
      ...cardRevision(card),
      progressVersion: progress.version,
      schedulerConfigId: configId,
      expiresAt: ticketExpiresAt,
    },
  };
}
