import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { previewCard, reviewCard } from '../../server/integrations/fsrs.js';
import {
  assertSchedulerConfig,
  schedulerConfig,
} from '../../server/integrations/fsrs-config.js';

/** @typedef {import('../../server/integrations/fsrs.js').CardState} CardState */
/** @typedef {Omit<CardState, 'dueAt'|'lastReviewAt'> & {dueAt: string, lastReviewAt?: string}} StoredState */
/** @type {{config: typeof schedulerConfig, reference: {relativeMemoryTolerance: number}, cases: {name: string, progress: StoredState|null, now: string, expected: {rating: number, progress: StoredState}[]}[]}} */
const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/fsrs-reference.json', import.meta.url),
    'utf8',
  ),
);

/** @param {StoredState|null} progress @returns {CardState|null} */
function hydrate(progress) {
  if (!progress) return null;
  const { dueAt, lastReviewAt, ...fields } = progress;
  return {
    ...fields,
    dueAt: new Date(dueAt),
    ...(lastReviewAt ? { lastReviewAt: new Date(lastReviewAt) } : {}),
  };
}

/** @param {CardState} actual @param {StoredState} expected */
function expectReference(actual, expected) {
  const { stability, difficulty, ...fields } = actual;
  const {
    stability: referenceS,
    difficulty: referenceD,
    ...reference
  } = expected;
  expect(JSON.parse(JSON.stringify(fields))).toEqual(reference);
  for (const [value, target] of [
    [stability, referenceS],
    [difficulty, referenceD],
  ]) {
    expect(Math.abs(value - target)).toBeLessThanOrEqual(
      fixture.reference.relativeMemoryTolerance * Math.max(1, Math.abs(target)),
    );
  }
}

describe('pinned FSRS-6 scheduler', () => {
  it('locks the complete configuration and its identity against the reference', () => {
    expect(schedulerConfig).toEqual(fixture.config);
    expect(Object.isFrozen(schedulerConfig)).toBe(true);
    expect(Object.isFrozen(schedulerConfig.weights)).toBe(true);
    expect(Object.isFrozen(schedulerConfig.learningStepsMinutes)).toBe(true);
    expect(Object.isFrozen(schedulerConfig.relearningStepsMinutes)).toBe(true);
    const manifest = JSON.parse(
      readFileSync(
        new URL('../../server/package.json', import.meta.url),
        'utf8',
      ),
    );
    expect(manifest.dependencies['ts-fsrs']).toBe(
      schedulerConfig.libraryVersion,
    );
  });

  for (const testCase of fixture.cases) {
    it(`matches independent reference: ${testCase.name}`, () => {
      const input = hydrate(testCase.progress);
      const before = structuredClone(input);
      const now = new Date(testCase.now);
      const previews = previewCard(input, now);
      expect(previews.map(({ rating }) => rating)).toEqual([1, 2, 3]);
      for (const expected of testCase.expected) {
        const result = reviewCard(input, now, expected.rating);
        expectReference(result.progress, expected.progress);
        expect(previews[expected.rating - 1]).toEqual({
          rating: expected.rating,
          ...result,
        });
        expect(reviewCard(input, now, expected.rating)).toEqual(result);
        expect(result.log.afterState).toEqual(result.progress);
        expect(result.log.beforeState).toEqual(
          input ?? {
            state: 'new',
            dueAt: now,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            learningSteps: 0,
            schedulerConfigId: schedulerConfig._id,
          },
        );
        expect(result.log.reviewedAt).toEqual(now);
        expect(result.log.rating).toBe(expected.rating);
        expect(result.log.schedulerConfigId).toBe(schedulerConfig._id);
      }
      expect(input).toEqual(before);
      expect(now.toISOString()).toBe(testCase.now);
    });
  }

  it('uses the actual review time rather than a previous preview time', () => {
    const input = hydrate(fixture.cases[3].progress);
    const preview = previewCard(input, new Date('2026-01-11T12:00:00Z'));
    const later = reviewCard(input, new Date('2026-01-11T12:05:00Z'), 3);
    expect(later.progress.dueAt.getTime()).toBe(
      preview[2].progress.dueAt.getTime() + 5 * 60000,
    );
    expect(later.log.reviewedAt).toEqual(new Date('2026-01-11T12:05:00Z'));
  });

  it('returns independent snapshots without changing future results', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const result = reviewCard(null, now, 3);
    const original = structuredClone(result);
    result.progress.dueAt.setUTCFullYear(2030);
    result.progress.stability = 999;
    result.log.beforeState.dueAt.setUTCFullYear(2031);
    expect(result.log.afterState).toEqual(original.progress);
    expect(reviewCard(null, now, 3)).toEqual(original);
  });

  it.each([0, 4, -1, 1.5, NaN, Infinity, '3', null])(
    'rejects unsupported rating %s',
    (rating) => {
      expect(() =>
        reviewCard(
          null,
          new Date('2026-01-01'),
          /** @type {number} */ (rating),
        ),
      ).toThrow(/Rating/);
    },
  );

  it.each([new Date(NaN), new Date(0), '2026-01-01', null])(
    'rejects invalid server time %s',
    (now) => {
      expect(() => previewCard(null, /** @type {Date} */ (now))).toThrow();
    },
  );

  it.each([
    { stability: NaN },
    { difficulty: Infinity },
    { stability: 0 },
    { difficulty: 11 },
    { scheduledDays: -1 },
    { elapsedDays: -1 },
    { reps: 1.5 },
    { lapses: -1 },
    { learningSteps: 1 },
    { lastReviewAt: undefined },
    { lastReviewAt: new Date(NaN) },
    { lastReviewAt: new Date('2026-02-01') },
    { dueAt: new Date(NaN) },
    { schedulerConfigId: 'unknown' },
  ])('rejects malformed progress %j', (changes) => {
    const input = /** @type {CardState} */ ({
      ...hydrate(fixture.cases[3].progress),
      ...changes,
    });
    expect(() =>
      reviewCard(input, new Date(fixture.cases[3].now), 3),
    ).toThrow();
  });

  it.each([
    'state',
    'dueAt',
    'stability',
    'difficulty',
    'elapsedDays',
    'scheduledDays',
    'reps',
    'lapses',
    'learningSteps',
    'lastReviewAt',
    'schedulerConfigId',
  ])('rejects existing review progress without %s', (field) => {
    const input = /** @type {CardState} */ (hydrate(fixture.cases[3].progress));
    const now = new Date(fixture.cases[3].now);
    Reflect.deleteProperty(input, field);
    expect(Object.hasOwn(input, field)).toBe(false);
    expect(() => reviewCard(input, now, 3)).toThrow();
    expect(() => previewCard(input, now)).toThrow();
  });

  it('accepts an explicit empty new state and rejects inconsistent memory', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const empty = reviewCard(null, now, 1).log.beforeState;
    expect(reviewCard(empty, now, 3)).toEqual(reviewCard(null, now, 3));
    expect(() => reviewCard({ ...empty, reps: 1 }, now, 3)).toThrow();
    expect(() => reviewCard({ ...empty, lastReviewAt: now }, now, 3)).toThrow();
  });

  it('rejects unknown state names rather than treating them as new', () => {
    const input = /** @type {CardState} */ (hydrate(fixture.cases[3].progress));
    Object.assign(input, { state: 'unknown' });
    expect(() => previewCard(input, new Date(fixture.cases[3].now))).toThrow();
  });

  it.each([
    { retention: 0.8 },
    { weights: [] },
    { libraryVersion: '6.0.1' },
    { fractionalDays: true },
    { enableFuzz: true },
    { maximumIntervalDays: 30 },
    { learningStepsMinutes: [10] },
    { stepPolicy: 'other' },
    { _id: 'other' },
  ])(
    'rejects config drift even when the config ID is copied: %j',
    (changes) => {
      const changed = Object.assign({}, schedulerConfig, changes);
      expect(() => assertSchedulerConfig(changed)).toThrow(/configuration/);
      expect(() =>
        previewCard(null, new Date('2026-01-01'), changed),
      ).toThrow();
    },
  );
});
