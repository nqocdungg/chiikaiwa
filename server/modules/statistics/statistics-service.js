import { AppError } from '../../middleware/http-error.js';
import { connectDatabase } from '../../persistence/database.js';

const COUNTERS = [
  'registeredAccounts',
  'startedSessions',
  'reviewCount',
  'submittedQuizCount',
];

function statisticsUnavailable() {
  return new AppError({
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message: 'Thống kê hiện chưa sẵn sàng.',
  });
}

/** Returns only the four aggregate counters allowed by 07 §10. */
export async function getLifetimeStatistics() {
  try {
    const db = await connectDatabase();
    const document = await db
      .collection('statistics')
      .findOne(/** @type {any} */ ({ _id: 'lifetime' }), {
        projection: Object.fromEntries(COUNTERS.map((name) => [name, 1])),
      });

    if (
      !document ||
      COUNTERS.some(
        (name) => !Number.isSafeInteger(document[name]) || document[name] < 0,
      )
    ) {
      throw statisticsUnavailable();
    }

    return Object.fromEntries(COUNTERS.map((name) => [name, document[name]]));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw statisticsUnavailable();
  }
}
