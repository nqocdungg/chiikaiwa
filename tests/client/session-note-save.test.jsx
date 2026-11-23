import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionTools } from '../../client/src/features/kaiwa/use-session-tools.js';
import {
  getSessionPersonal,
  putSessionNote,
} from '../../client/src/features/kaiwa/session-learning-api.js';

vi.mock('../../client/src/features/kaiwa/session-learning-api.js', () => ({
  getSessionPersonal: vi.fn(),
  getSessionHints: vi.fn(),
  putSessionNote: vi.fn(),
  findSavedKnowledge: vi.fn(),
  saveSessionKnowledge: vi.fn(),
  unsaveSessionKnowledge: vi.fn(),
}));

const personal = { sessionId: 'session-a', noteVersion: 0, version: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getSessionPersonal).mockResolvedValue(personal);
  vi.mocked(putSessionNote).mockResolvedValue({
    ...personal,
    note: 'Từ mới',
    noteVersion: 1,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('Session note', () => {
  it('keeps edits as a draft until Save or session end requests a save', async () => {
    const { result } = renderHook(() =>
      useSessionTools({ sessionId: 'session-a' }),
    );
    await act(async () => {});
    act(() => result.current.setNote('Từ mới'));
    await act(async () => vi.advanceTimersByTime(2000));
    expect(putSessionNote).not.toHaveBeenCalled();
    expect(result.current.noteStatus).toBe('draft');

    await act(async () => {
      expect(await result.current.savePendingNote()).toBe(true);
    });
    expect(putSessionNote).toHaveBeenCalledWith(
      'session-a',
      0,
      'Từ mới',
      expect.any(Object),
    );
    expect(result.current.getPendingNote()).toBeNull();
  });

  it('keeps the draft available for the summary when saving fails', async () => {
    vi.mocked(putSessionNote).mockRejectedValueOnce(new Error('Mất kết nối'));
    const { result } = renderHook(() =>
      useSessionTools({ sessionId: 'session-a' }),
    );
    await act(async () => {});
    act(() => result.current.setNote('Từ mới'));

    await act(async () => {
      expect(await result.current.savePendingNote()).toBe(false);
    });
    expect(result.current.getPendingNote()).toEqual({
      noteDraft: 'Từ mới',
      noteFailure: { status: 'error', message: 'Mất kết nối' },
    });
  });
});
