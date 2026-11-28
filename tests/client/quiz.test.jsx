import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../../client/src/App.jsx';
import { api } from '../../client/src/services/api-client.js';
import { getIdentityEpoch } from '../../client/src/services/cache.js';
import { ApiError } from '../../client/src/services/errors.js';

configure({ asyncUtilTimeout: 5000 });

const learnerUser = {
  kind: 'user',
  user: {
    id: 'user-quiz-learner',
    displayName: 'Thảo Nhi',
    role: 'learner',
    status: 'active',
  },
};

const mockTopicDetail = {
  id: 'topic-deck-v1',
  contentId: 'topic-content-1',
  title: 'Gọi món ở quán cà phê',
  level: 'N5',
  description: 'Luyện tập gọi món cơ bản',
  knowledgeCount: 2,
  questionCount: 3,
};

/** @type {import('../../client/src/features/quiz/quiz-api.js').QuizPublic} */
const mockInProgressQuiz = {
  id: 'quiz-active-001',
  deckVersionId: 'topic-deck-v1',
  status: 'inProgress',
  total: 3,
  version: 1,
  questions: [
    {
      questionVersionId: 'qv-1',
      type: 'multipleChoice',
      prompt: 'Khi muốn gọi món cà phê nóng, bạn nói gì?',
      options: [
        { id: 'opt-1', text: 'ホットコーヒーをお願いします。' },
        { id: 'opt-2', text: 'いくらですか。' },
      ],
    },
    {
      questionVersionId: 'qv-2',
      type: 'multipleChoice',
      prompt: 'Để hỏi kích cỡ cốc lớn, bạn chọn câu nào?',
      options: [
        { id: 'opt-3', text: 'Lサイズでお願いします。' },
        { id: 'opt-4', text: 'ごちそうさまでした。' },
      ],
    },
    {
      questionVersionId: 'qv-3',
      type: 'shortAnswer',
      prompt: 'Viết từ tiếng Nhật cho "vâng / được":',
    },
  ],
};

/** @type {import('../../client/src/features/quiz/quiz-api.js').QuizResult} */
const mockSubmittedQuiz = {
  id: 'quiz-active-001',
  deckVersionId: 'topic-deck-v1',
  status: 'submitted',
  total: 3,
  version: 2,
  score: 2,
  submittedAt: '2026-11-28T10:00:00.000Z',
  questions: mockInProgressQuiz.questions,
  answers: [
    { questionVersionId: 'qv-1', optionId: 'opt-1' },
    { questionVersionId: 'qv-3', text: 'はい' },
  ],
  results: [
    {
      questionVersionId: 'qv-1',
      isCorrect: true,
      points: 1,
      correctOptionId: 'opt-1',
      explanation: 'Câu này mang nghĩa "Cho tôi một cà phê nóng."',
      knowledgeVersionIds: ['kv-1'],
    },
    {
      questionVersionId: 'qv-2',
      isCorrect: false,
      points: 0,
      correctOptionId: 'opt-3',
      explanation: 'Lサイズ mang nghĩa kích thước lớn.',
      knowledgeVersionIds: ['kv-2'],
    },
    {
      questionVersionId: 'qv-3',
      isCorrect: true,
      points: 1,
      acceptedAnswers: ['はい', 'hai'],
      explanation: 'はい mang nghĩa đồng ý hoặc vâng.',
      knowledgeVersionIds: [],
    },
  ],
};

const mockKnowledgeList = [
  {
    id: 'k-item-1',
    versionId: 'kv-1',
    type: 'vocabulary',
    expression: 'ホットコーヒー',
    reading: 'ほっとこーひー',
    meaning: 'Cà phê nóng',
    examples: [],
  },
  {
    id: 'k-item-2',
    versionId: 'kv-2',
    type: 'vocabulary',
    expression: 'サイズ',
    reading: 'さいず',
    meaning: 'Kích cỡ',
    examples: [],
  },
];

/** @param {unknown} data */
function apiResponse(data) {
  return {
    data,
    meta: { requestId: 'test-req-id' },
    epoch: getIdentityEpoch(),
  };
}

function renderApp(/** @type {string} */ initialPath) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('Quiz features integration tests (FE-018)', () => {
  it('navigates from entry /quiz to /quiz/:id on successful creation', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      throw new Error(`Unexpected GET ${path}`);
    });

    const postSpy = vi
      .spyOn(api, 'post')
      .mockImplementation(async (path, body) => {
        if (path === '/quizzes') {
          expect(body).toEqual({ deckVersionId: 'topic-deck-v1' });
          return apiResponse(mockInProgressQuiz);
        }
        throw new Error(`Unexpected POST ${path}`);
      });

    renderApp('/quiz?deckVersionId=topic-deck-v1');

    expect(
      await screen.findByText('Đang chuẩn bị câu hỏi quiz…'),
    ).toBeInTheDocument();

    // Verify redirected to runner page with question 1
    expect(
      await screen.findByRole('heading', {
        name: 'Khi muốn gọi món cà phê nóng, bạn nói gì?',
      }),
    ).toBeVisible();

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Câu 1/3')).toBeVisible();
  });

  it('handles 409 QUIZ_UNAVAILABLE when topic has no quiz questions', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      throw new Error(`Unexpected GET ${path}`);
    });

    vi.spyOn(api, 'post').mockImplementation(async (path) => {
      if (path === '/quizzes') {
        throw new ApiError({
          status: 409,
          code: 'QUIZ_UNAVAILABLE',
          message: 'Chưa có câu hỏi cho chủ đề này',
        });
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz?deckVersionId=empty-deck');

    expect(
      await screen.findByRole('heading', { name: 'Chưa có câu hỏi' }),
    ).toBeVisible();
    expect(
      screen.getByText('Chủ đề này hiện chưa có câu hỏi quiz.'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Quay lại chủ đề' }),
    ).toHaveAttribute('href', '/topics/empty-deck');
  });

  it('supports AC1: horizontal navigation, radio selection, keeping answers on back', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      throw new Error(`Unexpected GET ${path}`);
    });

    renderApp('/quiz/quiz-active-001');

    // Prompt 1 displayed
    expect(
      await screen.findByRole('heading', {
        name: 'Khi muốn gọi món cà phê nóng, bạn nói gì?',
      }),
    ).toBeVisible();

    // "Trước" button disabled at question 1
    const prevBtn = screen.getByRole('button', { name: 'Câu trước' });
    expect(prevBtn).toBeDisabled();

    // Select option A
    const optA = screen.getByLabelText(/ホットコーヒーをお願いします。/);
    fireEvent.click(optA);
    expect(optA).toBeChecked();

    // Verify selecting option did NOT auto-advance (prompt 1 remains)
    expect(
      screen.getByRole('heading', {
        name: 'Khi muốn gọi món cà phê nóng, bạn nói gì?',
      }),
    ).toBeVisible();

    // Go to next question via "Tiếp"
    const nextBtn = screen.getByRole('button', { name: 'Câu tiếp theo' });
    fireEvent.click(nextBtn);

    // Prompt 2 displayed
    expect(
      await screen.findByRole('heading', {
        name: 'Để hỏi kích cỡ cốc lớn, bạn chọn câu nào?',
      }),
    ).toBeVisible();
    expect(screen.getByText('Câu 2/3')).toBeVisible();

    // Go back via "Trước" -> answer 1 is still checked
    fireEvent.click(screen.getByRole('button', { name: 'Câu trước' }));
    expect(
      screen.getByRole('heading', {
        name: 'Khi muốn gọi món cà phê nóng, bạn nói gì?',
      }),
    ).toBeVisible();
    const optAReloaded =
      screen.getByLabelText(/ホットコーヒーをお願いします。/);
    expect(optAReloaded).toBeChecked();

    // Question chips navigation: click chip 3
    const chip3 = screen.getByRole('button', { name: /Câu 3/ });
    fireEvent.click(chip3);

    // Short answer question 3 displayed
    expect(
      await screen.findByRole('heading', {
        name: 'Viết từ tiếng Nhật cho "vâng / được":',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Câu tiếp theo' }),
    ).toBeDisabled();
  });

  it('supports AC2: blank question confirmation dialog and single attempt submit', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    let capturedSubmitBody = /** @type {any} */ (null);
    let capturedSubmitKey = /** @type {string|null|undefined} */ (null);

    vi.spyOn(api, 'post').mockImplementation(async (path, body, options) => {
      if (path === '/quizzes/quiz-active-001/submission') {
        capturedSubmitBody = body;
        capturedSubmitKey = options?.idempotencyKey;
        return apiResponse(mockSubmittedQuiz);
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz/quiz-active-001');

    expect(
      await screen.findByRole('heading', {
        name: 'Khi muốn gọi món cà phê nóng, bạn nói gì?',
      }),
    ).toBeVisible();

    // Answer only Question 1
    fireEvent.click(screen.getByLabelText(/ホットコーヒーをお願いします。/));

    // Click "Nộp bài" while Question 2 and 3 are blank
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));

    // Blank question confirmation dialog opens
    const blankDialog = await screen.findByRole('dialog');
    expect(blankDialog).toBeVisible();
    expect(
      within(blankDialog).getByRole('heading', {
        name: 'Còn câu chưa trả lời',
      }),
    ).toBeVisible();
    expect(within(blankDialog).getByText(/Nếu nộp bài bây giờ/)).toBeVisible();

    // Click "Quay lại làm tiếp"
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại làm tiếp' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(capturedSubmitBody).toBeNull();

    // Click "Nộp bài" again and confirm in dialog
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = await screen.findByRole('dialog');
    const confirmSubmitBtn = within(dialog).getByRole('button', {
      name: 'Nộp bài',
    });
    fireEvent.click(confirmSubmitBtn);

    // Verify submission body only contained answered questions (q1) and expectedVersion
    await waitFor(() => {
      expect(capturedSubmitBody).toEqual({
        expectedVersion: 1,
        answers: [{ questionVersionId: 'qv-1', optionId: 'opt-1' }],
      });
    });
    expect(capturedSubmitKey).toBeTruthy();

    // Verify results screen renders correctly
    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
    expect(
      screen.getByText('Kết quả quiz không phải chứng nhận trình độ.'),
    ).toBeVisible();

    // Verify explanation and question details
    expect(
      screen.getByText('Câu này mang nghĩa "Cho tôi một cà phê nóng."'),
    ).toBeVisible();
    expect(screen.getAllByText('Đúng (+1 điểm)')).toHaveLength(2);
    expect(screen.getByText('Sai (0 điểm)')).toBeVisible();

    // Related knowledge rendered with read-only badge and deep links
    expect(await screen.findByText('Học liệu liên quan')).toBeVisible();
    expect(screen.getByText('ホットコーヒー')).toBeVisible();
    expect(screen.getAllByText('Chưa lưu').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', { name: 'Mở học liệu' })[0],
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/topics/topic-deck-v1?knowledge=k-item-1'),
    );
  });

  it('supports AC3: retry submit with exact same idempotency key and body on network failure', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    /** @type {{ body: any, key?: string }[]} */
    const submitCalls = [];

    vi.spyOn(api, 'post').mockImplementation(async (path, body, options) => {
      if (path === '/quizzes/quiz-active-001/submission') {
        submitCalls.push({ body, key: options?.idempotencyKey });
        if (submitCalls.length === 1) {
          throw new ApiError({
            status: 500,
            code: 'TIMEOUT',
            message: 'Gateway Timeout',
          });
        }
        return apiResponse(mockSubmittedQuiz);
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz/quiz-active-001');

    await screen.findByRole('heading', {
      name: 'Khi muốn gọi món cà phê nóng, bạn nói gì?',
    });

    // Answer question 1
    fireEvent.click(screen.getByLabelText(/ホットコーヒーをお願いします。/));

    // Submit and confirm
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nộp bài' }));

    // Verify error banner and "Thử lại" button
    expect(
      await screen.findByText(/Mạng gián đoạn hoặc quá thời gian chờ/),
    ).toBeVisible();
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    expect(retryBtn).toBeVisible();

    // Click "Thử lại"
    fireEvent.click(retryBtn);

    // Verify second submit call used the exact same key and body
    await waitFor(() => {
      expect(submitCalls.length).toBe(2);
    });
    expect(submitCalls[0].key).toBe(submitCalls[1].key);
    expect(submitCalls[0].body).toEqual(submitCalls[1].body);

    // Results screen shown
    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
  });

  it('supports AC3: warns before leave when user has draft answers', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      throw new Error(`Unexpected GET ${path}`);
    });

    renderApp('/quiz/quiz-active-001');

    await screen.findByRole('heading', {
      name: 'Khi muốn gọi món cà phê nóng, bạn nói gì?',
    });

    // When draft is empty, clicking exit does not show leave dialog
    const exitBtn = screen.getByRole('button', { name: 'Thoát lượt ôn' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Now answer question 1 (creating a draft)
    fireEvent.click(screen.getByLabelText(/ホットコーヒーをお願いします。/));

    // Click exit
    fireEvent.click(exitBtn);

    // Leave dialog is opened
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Rời bài quiz?' }),
    ).toBeVisible();
    expect(screen.getByText(/Câu trả lời chưa nộp sẽ mất/)).toBeVisible();

    // Click "Ở lại làm tiếp"
    fireEvent.click(screen.getByRole('button', { name: 'Ở lại làm tiếp' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens result screen directly when reading an already submitted quiz', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockSubmittedQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    renderApp('/quiz/quiz-active-001');

    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
    expect(
      screen.getByText('Kết quả quiz không phải chứng nhận trình độ.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Nộp bài' })).toBeNull();
  });

  it('submits all answered questions including trimmed shortAnswer without blank dialog and shows acceptedAnswers', async () => {
    /** @type {import('../../client/src/features/quiz/quiz-api.js').QuizResult} */
    const wrongShortAnswerResult = {
      ...mockSubmittedQuiz,
      score: 2,
      answers: [
        { questionVersionId: 'qv-1', optionId: 'opt-1' },
        { questionVersionId: 'qv-2', optionId: 'opt-3' },
        { questionVersionId: 'qv-3', text: 'iie' },
      ],
      results: [
        mockSubmittedQuiz.results[0],
        { ...mockSubmittedQuiz.results[1], isCorrect: true, points: 1 },
        {
          questionVersionId: 'qv-3',
          isCorrect: false,
          points: 0,
          acceptedAnswers: ['はい', 'hai'],
          explanation: 'はい hoặc hai nghĩa là vâng.',
          knowledgeVersionIds: [],
        },
      ],
    };

    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    let submittedPayload = /** @type {any} */ (null);
    vi.spyOn(api, 'post').mockImplementation(async (path, body) => {
      if (path === '/quizzes/quiz-active-001/submission') {
        submittedPayload = body;
        return apiResponse(wrongShortAnswerResult);
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz/quiz-active-001');

    // Answer Q1
    fireEvent.click(
      await screen.findByLabelText(/ホットコーヒーをお願いします。/),
    );
    // Answer Q2
    fireEvent.click(screen.getByRole('button', { name: 'Câu tiếp theo' }));
    fireEvent.click(await screen.findByLabelText(/Lサイズでお願いします。/));
    // Answer Q3 shortAnswer with leading/trailing spaces
    fireEvent.click(screen.getByRole('button', { name: 'Câu tiếp theo' }));
    const input = await screen.findByLabelText('Câu trả lời của bạn');
    fireEvent.change(input, { target: { value: '  iie  ' } });

    // Submit directly (no blank dialog expected)
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await waitFor(() => {
      expect(submittedPayload).toEqual({
        expectedVersion: 1,
        answers: [
          { questionVersionId: 'qv-1', optionId: 'opt-1' },
          { questionVersionId: 'qv-2', optionId: 'opt-3' },
          { questionVersionId: 'qv-3', text: 'iie' },
        ],
      });
    });

    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
    expect(screen.getByText('はい, hai')).toBeVisible();
  });

  it('recovers cleanly on 409 QUIZ_ALREADY_SUBMITTED by reading saved result', async () => {
    let getQuizCount = 0;
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001') {
        getQuizCount += 1;
        return apiResponse(
          getQuizCount === 1 ? mockInProgressQuiz : mockSubmittedQuiz,
        );
      }
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    vi.spyOn(api, 'post').mockImplementation(async (path) => {
      if (path === '/quizzes/quiz-active-001/submission') {
        throw new ApiError({
          status: 409,
          code: 'QUIZ_ALREADY_SUBMITTED',
          message: 'Lượt quiz đã được nộp trước đó.',
        });
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz/quiz-active-001');
    fireEvent.click(
      await screen.findByLabelText(/ホットコーヒーをお願いします。/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nộp bài' }));

    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
    expect(getQuizCount).toBe(2);
  });

  it('displays requestId on 500 INTERNAL_ERROR and generates a fresh Idempotency-Key on subsequent submit', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    /** @type {string[]} */
    const keys = [];
    vi.spyOn(api, 'post').mockImplementation(async (path, _body, options) => {
      if (path === '/quizzes/quiz-active-001/submission') {
        keys.push(options?.idempotencyKey ?? '');
        if (keys.length === 1) {
          throw new ApiError({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Lỗi máy chủ.',
            meta: { requestId: 'req-500-abc' },
          });
        }
        return apiResponse(mockSubmittedQuiz);
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz/quiz-active-001');
    fireEvent.click(
      await screen.findByLabelText(/ホットコーヒーをお願いします。/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog1 = await screen.findByRole('dialog');
    fireEvent.click(within(dialog1).getByRole('button', { name: 'Nộp bài' }));

    expect(await screen.findByText(/Mã tra cứu: req-500-abc/)).toBeVisible();

    // User changes answer and submits again -> MUST use a fresh key
    fireEvent.click(screen.getByLabelText(/いくらですか。/));
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog2 = await screen.findByRole('dialog');
    fireEvent.click(within(dialog2).getByRole('button', { name: 'Nộp bài' }));

    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('redirects guest to /expired when submitQuiz fails with 410 GUEST_EXPIRED', async () => {
    const guestUser = {
      kind: 'guest',
      guest: {
        sessionId: 'guest-sess-1',
        status: 'active',
        expiresAt: '2026-11-28T15:00:00.000Z',
      },
    };

    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(guestUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      throw new Error(`Unexpected GET ${path}`);
    });

    vi.spyOn(api, 'post').mockImplementation(async (path) => {
      if (path === '/quizzes/quiz-active-001/submission') {
        throw new ApiError({
          status: 410,
          code: 'GUEST_EXPIRED',
          message: 'Phiên khách đã hết hạn.',
        });
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz/quiz-active-001');
    fireEvent.click(
      await screen.findByLabelText(/ホットコーヒーをお願いします。/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nộp bài' }));

    expect(
      await screen.findByRole('heading', {
        name: /Phiên làm việc đã kết thúc/i,
      }),
    ).toBeVisible();
  });

  it('redirects to /login when GET /quizzes/:id returns 401 AUTH_REQUIRED', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001') {
        throw new ApiError({
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'Yêu cầu đăng nhập.',
        });
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    renderApp('/quiz/quiz-active-001');

    expect(
      await screen.findByRole('heading', { name: /Đăng nhập/i }),
    ).toBeVisible();
  });

  it('surfaces readSavedPage error locally without hiding quiz score or faking Chưa lưu', async () => {
    let savedCalls = 0;
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockSubmittedQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') {
        savedCalls += 1;
        if (savedCalls === 1) {
          throw new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Tạm thời không kiểm tra được mục đã lưu.',
          });
        }
        return apiResponse({
          items: [
            {
              id: 'saved-1',
              version: 1,
              knowledge: mockKnowledgeList[0],
            },
          ],
        });
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    renderApp('/quiz/quiz-active-001');

    // Score and answers stay visible even when /saved fails
    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
    expect(
      await screen.findByText(/Tạm thời không kiểm tra được mục đã lưu/),
    ).toBeVisible();
    expect(screen.queryByText('Chưa lưu')).toBeNull();

    // Retry loads knowledge & real saved status ("Đã lưu")
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Đã lưu')).toBeVisible();
  });

  it('forwards sourceSessionId on create and keeps session back-link on submitted result', async () => {
    const sessionSubmittedQuiz = {
      ...mockSubmittedQuiz,
      sourceSessionId: '507f1f77bcf86cd799439011',
    };
    const sessionInProgressQuiz = {
      ...mockInProgressQuiz,
      sourceSessionId: '507f1f77bcf86cd799439011',
    };

    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(sessionSubmittedQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    const postSpy = vi
      .spyOn(api, 'post')
      .mockImplementation(async (path, body) => {
        if (path === '/quizzes') {
          expect(body).toEqual({
            deckVersionId: 'topic-deck-v1',
            sourceSessionId: '507f1f77bcf86cd799439011',
          });
          return apiResponse(sessionInProgressQuiz);
        }
        throw new Error(`Unexpected POST ${path}`);
      });

    renderApp(
      '/quiz?deckVersionId=topic-deck-v1&sourceSessionId=507f1f77bcf86cd799439011',
    );

    expect(
      await screen.findByRole('button', { name: 'Về tổng kết phiên' }),
    ).toBeVisible();
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('locks form and lets user retry loading result with Tải kết quả when 409 QUIZ_ALREADY_SUBMITTED fallback readQuiz fails transiently', async () => {
    let getQuizCount = 0;
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001') {
        getQuizCount += 1;
        if (getQuizCount === 1) return apiResponse(mockInProgressQuiz);
        if (getQuizCount === 2) {
          throw new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Tạm thời gián đoạn.',
          });
        }
        return apiResponse(mockSubmittedQuiz);
      }
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    vi.spyOn(api, 'post').mockImplementation(async (path) => {
      if (path === '/quizzes/quiz-active-001/submission') {
        throw new ApiError({
          status: 409,
          code: 'QUIZ_ALREADY_SUBMITTED',
          message: 'Lượt quiz đã được nộp trước đó.',
        });
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz/quiz-active-001');
    fireEvent.click(
      await screen.findByLabelText(/ホットコーヒーをお願いします。/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nộp bài' }));

    const reloadBtn = await screen.findByRole('button', {
      name: 'Tải kết quả',
    });
    expect(reloadBtn).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nộp bài' })).toBeDisabled();

    fireEvent.click(reloadBtn);
    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
  });

  it('allows browsing questions while submitQuiz is in-flight without aborting or duplicating submit', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return apiResponse(learnerUser);
      if (path === '/quizzes/quiz-active-001')
        return apiResponse(mockInProgressQuiz);
      if (path === '/topic-versions/topic-deck-v1')
        return apiResponse(mockTopicDetail);
      if (path === '/topic-versions/topic-deck-v1/knowledge') {
        return apiResponse({ items: mockKnowledgeList });
      }
      if (path === '/me/saved-items') return apiResponse({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });

    /** @type {(value: any) => void} */
    let resolveSubmit = () => {};
    let postCount = 0;
    vi.spyOn(api, 'post').mockImplementation((path) => {
      if (path === '/quizzes/quiz-active-001/submission') {
        postCount += 1;
        return new Promise((resolve) => {
          resolveSubmit = resolve;
        });
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    renderApp('/quiz/quiz-active-001');
    fireEvent.click(
      await screen.findByLabelText(/ホットコーヒーをお願いします。/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nộp bài' }));

    // While submitQuiz is pending, navigate to question 2
    fireEvent.click(screen.getByRole('button', { name: 'Câu tiếp theo' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Để hỏi kích cỡ cốc lớn, bạn chọn câu nào?',
      }),
    ).toBeVisible();
    expect(postCount).toBe(1);

    resolveSubmit(apiResponse(mockSubmittedQuiz));
    expect(await screen.findByText('Đúng 2/3 câu')).toBeVisible();
    expect(postCount).toBe(1);
  });
});
