import { describe, expect, it } from 'vitest';
import {
  buildSubmitBody,
  countUnanswered,
  createQuizState,
  hasDraft,
  isAnswered,
  quizReducer,
} from '../../client/src/features/quiz/quiz-state.js';

/** @type {import('../../client/src/features/quiz/quiz-api.js').QuizPublic} */
const mockQuiz = {
  id: 'quiz-001',
  deckVersionId: 'deck-v1',
  status: 'inProgress',
  total: 3,
  version: 2,
  questions: [
    {
      questionVersionId: 'q-1',
      type: 'multipleChoice',
      prompt: 'Câu hỏi 1?',
      options: [
        { id: 'opt-a', text: 'Đáp án A' },
        { id: 'opt-b', text: 'Đáp án B' },
      ],
    },
    {
      questionVersionId: 'q-2',
      type: 'multipleChoice',
      prompt: 'Câu hỏi 2?',
      options: [
        { id: 'opt-c', text: 'Đáp án C' },
        { id: 'opt-d', text: 'Đáp án D' },
      ],
    },
    {
      questionVersionId: 'q-3',
      type: 'shortAnswer',
      prompt: 'Câu hỏi 3 tự luận?',
    },
  ],
};

describe('quiz-state reducer and helpers', () => {
  it('creates initial state in answering phase with index 0', () => {
    const state = createQuizState();
    expect(state.index).toBe(0);
    expect(state.phase).toBe('answering');
    expect(state.draft).toEqual({});
    expect(state.intent).toBeNull();
    expect(state.notice).toBe('');
  });

  it('evaluates isAnswered for multiple choice and short answer', () => {
    const mc = mockQuiz.questions[0];
    const sa = mockQuiz.questions[2];

    expect(isAnswered(mc, undefined)).toBe(false);
    expect(isAnswered(mc, { optionId: '' })).toBe(false);
    expect(isAnswered(mc, { optionId: 'opt-a' })).toBe(true);

    expect(isAnswered(sa, undefined)).toBe(false);
    expect(isAnswered(sa, { text: '' })).toBe(false);
    expect(isAnswered(sa, { text: '   ' })).toBe(false);
    expect(isAnswered(sa, { text: '  arigatou  ' })).toBe(true);
  });

  it('counts unanswered questions and detects draft presence correctly', () => {
    expect(countUnanswered(mockQuiz, {})).toBe(3);
    expect(hasDraft(mockQuiz, {})).toBe(false);

    const partialDraft = {
      'q-1': { optionId: 'opt-a' },
    };
    expect(countUnanswered(mockQuiz, partialDraft)).toBe(2);
    expect(hasDraft(mockQuiz, partialDraft)).toBe(true);

    const fullDraft = {
      'q-1': { optionId: 'opt-a' },
      'q-2': { optionId: 'opt-d' },
      'q-3': { text: 'hai' },
    };
    expect(countUnanswered(mockQuiz, fullDraft)).toBe(0);
    expect(hasDraft(mockQuiz, fullDraft)).toBe(true);
  });

  it('buildSubmitBody only includes answered questions and trims short answer', () => {
    const draft = {
      'q-1': { optionId: 'opt-b' },
      'q-3': { text: '  kudasai  ' },
    };

    const body = buildSubmitBody(mockQuiz, draft);
    expect(body.expectedVersion).toBe(2);
    expect(body.answers).toEqual([
      { questionVersionId: 'q-1', optionId: 'opt-b' },
      { questionVersionId: 'q-3', text: 'kudasai' },
    ]);
  });

  it('answers and moves index properly, clamping bounds', () => {
    let state = createQuizState();

    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-1',
      answer: { optionId: 'opt-a' },
    });
    expect(state.draft['q-1']).toEqual({ optionId: 'opt-a' });

    // go forward
    state = quizReducer(state, { type: 'go', index: 1, total: 3 });
    expect(state.index).toBe(1);

    // clamp out of bounds
    state = quizReducer(state, { type: 'go', index: 10, total: 3 });
    expect(state.index).toBe(2);

    state = quizReducer(state, { type: 'go', index: -5, total: 3 });
    expect(state.index).toBe(0);
  });

  it('transitions to confirmingBlank when unanswered questions exist on submit request', () => {
    let state = createQuizState();
    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-1',
      answer: { optionId: 'opt-a' },
    });

    state = quizReducer(state, {
      type: 'request-submit',
      quiz: mockQuiz,
      key: 'key-123',
    });
    expect(state.phase).toBe('confirmingBlank');
    expect(state.intent).toBeNull();

    // cancel confirm returns to answering
    state = quizReducer(state, { type: 'cancel-confirm' });
    expect(state.phase).toBe('answering');

    // re-request and confirm submit starts submitting with frozen intent
    state = quizReducer(state, {
      type: 'request-submit',
      quiz: mockQuiz,
      key: 'key-123',
    });
    expect(state.phase).toBe('confirmingBlank');

    state = quizReducer(state, {
      type: 'confirm-submit',
      quiz: mockQuiz,
      key: 'key-123',
    });
    expect(state.phase).toBe('submitting');
    expect(state.intent).toEqual({
      key: 'key-123',
      body: {
        expectedVersion: 2,
        answers: [{ questionVersionId: 'q-1', optionId: 'opt-a' }],
      },
    });
  });

  it('directly starts submit when all questions answered', () => {
    let state = createQuizState();
    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-1',
      answer: { optionId: 'opt-a' },
    });
    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-2',
      answer: { optionId: 'opt-c' },
    });
    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-3',
      answer: { text: 'hai' },
    });

    state = quizReducer(state, {
      type: 'request-submit',
      quiz: mockQuiz,
      key: 'submit-key-abc',
    });
    expect(state.phase).toBe('submitting');
    expect(state.intent?.key).toBe('submit-key-abc');
    expect(state.intent?.body.answers).toHaveLength(3);
  });

  it('locks inputs while submitting or in unknown status', () => {
    let state = createQuizState();
    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-1',
      answer: { optionId: 'opt-a' },
    });
    state = quizReducer(state, {
      type: 'request-submit',
      quiz: mockQuiz,
      key: 'k-1',
    });
    state = quizReducer(state, {
      type: 'confirm-submit',
      quiz: mockQuiz,
      key: 'k-1',
    });
    expect(state.phase).toBe('submitting');

    // In submitting phase, answer is ignored
    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-2',
      answer: { optionId: 'opt-c' },
    });
    expect(state.draft['q-2']).toBeUndefined();
  });

  it('handles uncertainty and preserves intent across retries', () => {
    let state = createQuizState();
    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-1',
      answer: { optionId: 'opt-a' },
    });
    state = quizReducer(state, {
      type: 'request-submit',
      quiz: mockQuiz,
      key: 'fixed-key',
    });
    state = quizReducer(state, {
      type: 'confirm-submit',
      quiz: mockQuiz,
      key: 'fixed-key',
    });

    // Network timeout / unknown response
    state = quizReducer(state, {
      type: 'submit-uncertain',
      notice: 'Mạng gián đoạn',
    });
    expect(state.phase).toBe('submitUnknown');
    expect(state.notice).toBe('Mạng gián đoạn');
    expect(state.intent?.key).toBe('fixed-key');

    // Retry submit keeps the same frozen intent
    state = quizReducer(state, { type: 'retry-submit' });
    expect(state.phase).toBe('submitting');
    expect(state.notice).toBe('');
    expect(state.intent?.key).toBe('fixed-key');
  });

  it('handles rejected submit, restoring answering phase and clearing intent', () => {
    let state = createQuizState();
    state = quizReducer(state, {
      type: 'answer',
      questionVersionId: 'q-1',
      answer: { optionId: 'opt-a' },
    });
    state = quizReducer(state, {
      type: 'request-submit',
      quiz: mockQuiz,
      key: 'fixed-key',
    });
    state = quizReducer(state, {
      type: 'confirm-submit',
      quiz: mockQuiz,
      key: 'fixed-key',
    });
    expect(state.phase).toBe('submitting');

    state = quizReducer(state, {
      type: 'submit-rejected',
      notice: 'Phiên bản không khớp',
    });
    expect(state.phase).toBe('answering');
    expect(state.intent).toBeNull();
    expect(state.notice).toBe('Phiên bản không khớp');
  });
});
