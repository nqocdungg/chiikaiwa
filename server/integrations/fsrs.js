import { dateChrono, defineScheduler, State } from 'ts-fsrs';
import { FSRS6Model } from 'ts-fsrs/models/fsrs-6';
import {
  schedulerDesiredRetentionMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerStatsMiddleware,
} from 'ts-fsrs/middlewares';
import { assertSchedulerConfig, schedulerConfig } from './fsrs-config.js';

/**
 * @typedef {Object} CardState
 * @property {'new'|'learning'|'review'|'relearning'} state
 * @property {Date} dueAt
 * @property {number} stability
 * @property {number} difficulty
 * @property {number} elapsedDays
 * @property {number} scheduledDays
 * @property {number} reps
 * @property {number} lapses
 * @property {number} learningSteps
 * @property {Date} [lastReviewAt]
 * @property {string} schedulerConfigId
 */

const states = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const stateNames = /** @type {(keyof typeof states)[]} */ (Object.keys(states));
const config = schedulerConfig;
const scheduler = defineScheduler({ model: FSRS6Model, chrono: dateChrono })
  .use(
    schedulerDesiredRetentionMiddleware,
    schedulerStatsMiddleware,
    schedulerScheduledDaysMiddleware,
    schedulerLearningStepsMiddleware,
    schedulerMaximumIntervalMiddleware,
    schedulerMonotonicIntervalMiddleware,
  )
  .create({
    config: {
      weights: [...config.weights],
      desiredRetention: config.retention,
      fractionalDays: config.fractionalDays,
      enableShortTerm: config.enableShortTerm,
      numRelearningSteps: config.relearningStepsMinutes.length,
      learningSteps: config.learningStepsMinutes.map(
        (minutes) => /** @type {`${number}m`} */ (`${minutes}m`),
      ),
      relearningSteps: config.relearningStepsMinutes.map(
        (minutes) => /** @type {`${number}m`} */ (`${minutes}m`),
      ),
      maximumInterval: config.maximumIntervalDays,
      graduatingInterval: 1,
      allowModelOverride: false,
      clearStatsOnForget: false,
    },
  });

/** @typedef {ReturnType<typeof scheduler.newCard>} SchedulerCard */

/** @param {Date} date */
function assertDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('Expected a valid Date');
  }
}

/** @param {CardState|null} progress @param {Date} now @returns {SchedulerCard} */
function toCard(progress, now) {
  assertDate(now);
  if (progress === null) return scheduler.newCard({ now });
  if (progress.schedulerConfigId !== config._id) {
    throw new Error('Progress uses an unsupported FSRS configuration');
  }
  if (!Object.hasOwn(states, progress.state)) {
    throw new TypeError('Invalid card state');
  }
  assertDate(progress.dueAt);
  if (progress.state !== 'new') {
    assertDate(/** @type {Date} */ (progress.lastReviewAt));
    if (now < /** @type {Date} */ (progress.lastReviewAt)) {
      throw new RangeError('Review time precedes the previous review');
    }
  } else if (progress.lastReviewAt !== undefined) {
    throw new TypeError('A new card cannot have a previous review');
  }
  if (!Number.isFinite(progress.elapsedDays) || progress.elapsedDays < 0) {
    throw new TypeError('Invalid elapsed days');
  }
  for (const value of [
    progress.reps,
    progress.lapses,
    progress.learningSteps,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError('Invalid card counters');
    }
  }
  if (progress.state === 'new') {
    if (
      [
        progress.stability,
        progress.difficulty,
        progress.reps,
        progress.lapses,
        progress.learningSteps,
        progress.elapsedDays,
        progress.scheduledDays,
      ].some((value) => value !== 0)
    ) {
      throw new TypeError('A new card must have empty memory and counters');
    }
  } else if (
    progress.stability < 0.001 ||
    progress.stability > 36500 ||
    progress.difficulty < 1 ||
    progress.difficulty > 10 ||
    progress.learningSteps >=
      (progress.state === 'learning'
        ? config.learningStepsMinutes.length
        : config.relearningStepsMinutes.length)
  ) {
    throw new TypeError(
      'Card memory or learning step is outside the pinned policy',
    );
  }
  return {
    dueAt: new Date(progress.dueAt),
    stability: progress.stability,
    difficulty: progress.difficulty,
    scheduledDays: progress.scheduledDays,
    reps: progress.reps,
    lapses: progress.lapses,
    state: states[progress.state],
    scheduleStatus:
      progress.state === 'new'
        ? 'new'
        : progress.state === 'review'
          ? 'review'
          : 'learning',
    learningStep: progress.learningSteps,
    lastReviewAt: progress.lastReviewAt
      ? new Date(progress.lastReviewAt)
      : null,
  };
}

/** @param {SchedulerCard} card @param {number} elapsedDays @returns {CardState} */
function fromCard(card, elapsedDays) {
  return {
    state: stateNames[card.state],
    dueAt: new Date(card.dueAt),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learningStep,
    ...(card.lastReviewAt ? { lastReviewAt: new Date(card.lastReviewAt) } : {}),
    schedulerConfigId: config._id,
  };
}

/**
 * @param {CardState|null} progress
 * @param {Date} now Server review time.
 * @param {number} rating
 * @param {typeof schedulerConfig} [configuration]
 */
export function reviewCard(progress, now, rating, configuration = config) {
  assertSchedulerConfig(configuration);
  if (rating !== 1 && rating !== 2 && rating !== 3) {
    throw new RangeError('Rating must be Again (1), Hard (2), or Good (3)');
  }
  const card = toCard(progress, now);
  const result = scheduler.review({ card, now, grade: rating });
  const elapsedDays =
    card.state === State.New
      ? 0
      : scheduler.chrono.difference(card.lastReviewAt ?? card.dueAt, now);
  const afterState = fromCard(result.card, elapsedDays);
  return {
    progress: afterState,
    log: {
      rating,
      reviewedAt: new Date(now),
      beforeState: fromCard(card, progress?.elapsedDays ?? 0),
      afterState: structuredClone(afterState),
      schedulerConfigId: config._id,
    },
  };
}

/**
 * @param {CardState|null} progress
 * @param {Date} now
 * @param {typeof schedulerConfig} [configuration]
 */
export function previewCard(progress, now, configuration = config) {
  return [1, 2, 3].map((rating) => ({
    rating,
    ...reviewCard(progress, now, rating, configuration),
  }));
}
