import { describe, expect, it } from 'vitest';
import {
  sessionClocks,
  sessionDeadline,
} from '../../server/modules/sessions/session-clock.js';

const start = new Date('2026-11-12T12:00:00Z');
describe('session clocks', () => {
  it('projects a running segment without mutating persisted clocks', () => {
    const doc = {
      activeDurationMs: 2000,
      activeSince: start,
      selectionRemainingMs: 60_000,
      selectionRunningSince: start,
    };
    expect(sessionClocks(doc, new Date(start.getTime() + 10_000))).toEqual({
      activeDurationMs: 12_000,
      selectionRemainingMs: 50_000,
    });
    expect(doc.activeDurationMs).toBe(2000);
    expect(sessionClocks(doc, new Date(start.getTime() - 1000))).toEqual({
      activeDurationMs: 2000,
      selectionRemainingMs: 60_000,
    });
  });
  it('selects the earliest applicable deadline and ignores selection after a deck is fixed', () => {
    const doc = {
      startedAt: start,
      presence: [
        {
          connected: false,
          reconnectUntil: new Date(start.getTime() + 300_000),
        },
      ],
      selectionRemainingMs: 60_000,
      selectionRunningSince: start,
    };
    expect(sessionDeadline(doc)).toEqual({
      at: new Date(start.getTime() + 60_000),
      reason: 'selection_timeout',
    });
    expect(sessionDeadline({ ...doc, deckVersionId: 'deck' })?.reason).toBe(
      'connection_timeout',
    );
  });
});
