import { isDeepStrictEqual } from 'node:util';

// Keep this snapshot fixed so fresh installs and existing databases register the same configuration.
const schedulerConfig = {
  _id: '7b85ae5ab4827b7b355ec04e657eb4e31fbc3b87894c9838772f19a6f40d266d',
  model: 'FSRS-6',
  libraryName: 'ts-fsrs',
  libraryVersion: '6.0.0',
  weights: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
    0.0912, 0.0658, 0.1542,
  ],
  retention: 0.9,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  enableFuzz: false,
  enableShortTerm: true,
  maximumIntervalDays: 36500,
  fractionalDays: false,
  roundingPolicy: 'ts-fsrs@6.0.0/native',
  stepPolicy:
    'ts-fsrs@6.0.0/native;graduatingInterval=1;allowModelOverride=false',
};

/** @param {import('mongoose').mongo.Db} db */
export async function up(db) {
  /** @type {import('mongoose').mongo.Collection<typeof schedulerConfig & {createdAt: Date}>} */
  const configs = db.collection('scheduler_configs');
  await configs.updateOne(
    { _id: schedulerConfig._id },
    { $setOnInsert: { ...schedulerConfig, createdAt: new Date() } },
    { upsert: true },
  );
  const stored = await configs.findOne({ _id: schedulerConfig._id });
  const { createdAt, ...parameters } = stored ?? {};
  if (!(createdAt instanceof Date)) {
    throw new Error('Invalid persisted FSRS-6 configuration');
  }
  if (!isDeepStrictEqual(parameters, schedulerConfig)) {
    throw new Error('Unsupported FSRS configuration');
  }
}
