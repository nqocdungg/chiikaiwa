/** @typedef {'registeredAccounts' | 'startedSessions' | 'reviewCount' | 'submittedQuizCount'} LifetimeCounter */

const LIFETIME_ID = 'lifetime';

const LIFETIME_COUNTERS = Object.freeze([
  'registeredAccounts',
  'startedSessions',
  'reviewCount',
  'submittedQuizCount',
]);

export class LifetimeStatisticsIntegrityError extends Error {
  /** @param {string} counter */
  constructor(counter) {
    super(
      `Lifetime statistics counter "${counter}" is missing or invalid; refusing to initialize or repair it during a business transaction`,
    );
    this.name = 'LifetimeStatisticsIntegrityError';
    this.counter = counter;
  }
}

/** @param {import('mongoose').mongo.Db} db */
function statisticsCollection(db) {
  return db.collection('statistics');
}

/** @param {LifetimeCounter} counter */
function validCounterFilter(counter) {
  const field = `$${counter}`;
  return {
    _id: LIFETIME_ID,
    [counter]: { $type: 'number', $gte: 0, $lt: Number.MAX_SAFE_INTEGER },
    $expr: {
      $cond: [{ $isNumber: field }, { $eq: [{ $trunc: field }, field] }, false],
    },
  };
}

/**
 * Creates the baseline document only when it does not exist yet.
 * An existing document is never modified, even if it is incomplete.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {{ session?: import('mongoose').ClientSession, now?: Date }} [options]
 */
export async function ensureLifetimeBaseline(
  db,
  { session, now = new Date() } = {},
) {
  await statisticsCollection(db).updateOne(
    /** @type {any} */ ({ _id: LIFETIME_ID }),
    {
      $setOnInsert: {
        registeredAccounts: 0,
        startedSessions: 0,
        reviewCount: 0,
        submittedQuizCount: 0,
        updatedAt: now,
      },
    },
    { session, upsert: true },
  );
}

/**
 * @param {import('mongoose').mongo.Db} db
 * @param {import('mongoose').ClientSession | undefined} session
 */
async function describeIncrementFailure(db, session) {
  try {
    const existing = await statisticsCollection(db).findOne(
      /** @type {any} */ ({ _id: LIFETIME_ID }),
      { projection: { _id: 1 }, session },
    );
    return existing ? 'counter-invalid' : 'document-missing';
  } catch {
    return 'unknown';
  }
}

/**
 * Atomically increments one lifetime counter inside the caller's business
 * transaction. It never creates the document, never touches other counters and
 * fails with LifetimeStatisticsIntegrityError when the counter is missing,
 * negative, fractional, or when the document does not exist, causing the business
 * transaction to roll back to preserve data consistency.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {LifetimeCounter} counter
 * @param {{ session?: import('mongoose').ClientSession, now?: Date }} [options]
 */
export async function incrementLifetimeCounter(
  db,
  counter,
  { session, now = new Date() } = {},
) {
  if (!LIFETIME_COUNTERS.includes(counter)) {
    throw new TypeError('Unknown lifetime statistics counter');
  }

  const result = await statisticsCollection(db).updateOne(
    /** @type {any} */ (validCounterFilter(counter)),
    { $inc: { [counter]: 1 }, $max: { updatedAt: now } },
    { session },
  );
  if (result.matchedCount === 1) return;

  const reason = await describeIncrementFailure(db, session);
  console.error(
    `[statistics] Lifetime increment failed, rolling back the business transaction: counter=${counter} reason=${reason}`,
  );
  throw new LifetimeStatisticsIntegrityError(counter);
}

/**
 * Increments the committed review event counter within TX-09.
 *
 * @param {import('mongoose').mongo.Db} db
 * @param {{ session?: import('mongoose').ClientSession, now?: Date }} [options]
 */
export async function incrementReviewCount(db, options = {}) {
  return incrementLifetimeCounter(db, 'reviewCount', options);
}
