import {
  assertSchedulerConfig,
  schedulerConfig,
} from '../../integrations/fsrs-config.js';

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
  if (!stored || !(stored.createdAt instanceof Date)) {
    throw new Error('Invalid persisted FSRS-6 configuration');
  }
  assertSchedulerConfig(stored);
}
