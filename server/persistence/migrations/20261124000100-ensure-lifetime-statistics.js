const EVIDENCE_COLLECTIONS = [
  'users',
  'practice_sessions',
  'review_logs',
  'quiz_attempts',
];

/** @param {import('mongoose').mongo.Db} db */
export async function up(db) {
  const statistics = db.collection('statistics');
  const existing = await statistics.findOne(
    /** @type {any} */ ({ _id: 'lifetime' }),
    { projection: { _id: 1 } },
  );
  if (existing) return;

  for (const name of EVIDENCE_COLLECTIONS) {
    const found = await db
      .collection(name)
      .findOne({}, { projection: { _id: 1 } });
    if (found) {
      const message = `Lifetime statistics baseline is missing but '${name}' already has data. Insert the verified baseline document (see migrations/README.md) and run the migration again.`;
      console.error(`[migration] ${message}`);
      throw new Error(message);
    }
  }

  await statistics.updateOne(
    /** @type {any} */ ({ _id: 'lifetime' }),
    {
      $setOnInsert: {
        registeredAccounts: 0,
        startedSessions: 0,
        reviewCount: 0,
        submittedQuizCount: 0,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}
