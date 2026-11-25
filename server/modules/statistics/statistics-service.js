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

/** @param {unknown} value */
function isValidCounter(value) {
  return Number.isSafeInteger(value) && /** @type {number} */ (value) >= 0;
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

    if (!document) {
      console.warn(
        '[statistics] Lifetime statistics unavailable: document-missing',
      );
      throw statisticsUnavailable();
    }
    const invalid = COUNTERS.filter((name) => !isValidCounter(document[name]));
    if (invalid.length > 0) {
      console.warn(
        `[statistics] Lifetime statistics unavailable: invalid counters=${invalid.join(',')}`,
      );
      throw statisticsUnavailable();
    }

    return Object.fromEntries(COUNTERS.map((name) => [name, document[name]]));
  } catch (error) {
    if (error instanceof AppError) throw error;
    const failure = /** @type {{ name?: string, code?: unknown }} */ (error);
    console.error(
      `[statistics] Lifetime statistics read failed: name=${failure?.name} code=${String(failure?.code)}`,
    );
    throw statisticsUnavailable();
  }
}
