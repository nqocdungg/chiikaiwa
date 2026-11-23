/** @typedef {'registeredAccounts' | 'startedSessions' | 'reviewCount' | 'submittedQuizCount'} LifetimeCounter */

const LIFETIME_COUNTERS = Object.freeze([
  'registeredAccounts',
  'startedSessions',
  'reviewCount',
  'submittedQuizCount',
]);

/**
 * Atomically increments one lifetime counter and keeps the document complete.
 * The caller must pass its business transaction session so rollback/retry
 * behavior remains tied to the event being counted.
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

  const values = Object.fromEntries(
    LIFETIME_COUNTERS.map((name) => [
      name,
      {
        $add: [{ $ifNull: [`$${name}`, 0] }, name === counter ? 1 : 0],
      },
    ]),
  );
  const update = /** @type {any} */ ([{ $set: { ...values, updatedAt: now } }]);

  await db
    .collection('statistics')
    .updateOne(/** @type {any} */ ({ _id: 'lifetime' }), update, {
      session,
      upsert: true,
    });
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
