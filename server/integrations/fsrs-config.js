import { createHash } from 'node:crypto';

const parameters = {
  model: 'FSRS-6',
  libraryName: 'ts-fsrs',
  libraryVersion: '6.0.0',
  weights: Object.freeze([
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
    0.0912, 0.0658, 0.1542,
  ]),
  retention: 0.9,
  learningStepsMinutes: Object.freeze([1, 10]),
  relearningStepsMinutes: Object.freeze([10]),
  enableFuzz: false,
  enableShortTerm: true,
  maximumIntervalDays: 36500,
  fractionalDays: false,
  roundingPolicy: 'ts-fsrs@6.0.0/native',
  stepPolicy:
    'ts-fsrs@6.0.0/native;graduatingInterval=1;allowModelOverride=false',
};

// Fixed field order is part of the configuration identity; createdAt is excluded.
export const schedulerConfig = Object.freeze({
  _id: createHash('sha256').update(JSON.stringify(parameters)).digest('hex'),
  ...parameters,
});

/** @param {typeof schedulerConfig} config */
export function assertSchedulerConfig(config) {
  for (const key of /** @type {(keyof typeof schedulerConfig)[]} */ (
    Object.keys(schedulerConfig)
  )) {
    if (
      JSON.stringify(config?.[key]) !== JSON.stringify(schedulerConfig[key])
    ) {
      throw new Error('Unsupported FSRS configuration');
    }
  }
}
