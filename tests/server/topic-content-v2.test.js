import { expect, it } from 'vitest';
import { assertTopicContentV2Reviewed } from '../../server/persistence/seed/topic-content-v2.js';
import manifest from '../../server/persistence/seed/topic-content-v2.json' with { type: 'json' };

it('chỉ cho phép nạp học liệu đã duyệt đúng revision', () => {
  const review = {
    scenarioVersionId: 'reviewed-version',
    reviewStatus: 'approved',
    humanReviewer: 'Reviewer',
  };
  const source = {
    reviewStatus: 'approved',
    entries: [
      {
        kind: 'scenario',
        seedKey: 'test-topic',
        versionId: 'reviewed-version',
      },
    ],
    metadata: { scenarioReviewBySeedKey: { 'test-topic': review } },
  };

  expect(() => assertTopicContentV2Reviewed(source)).not.toThrow();
  source.reviewStatus = 'draft';
  expect(() => assertTopicContentV2Reviewed(source)).toThrow(
    'chưa có duyệt độc lập',
  );
  source.reviewStatus = 'approved';
  source.entries[0].versionId = 'new-version';
  expect(() => assertTopicContentV2Reviewed(source)).toThrow(
    'chưa có duyệt độc lập',
  );
});

it('giữ bốn phương án cùng dạng trong câu hỏi cách dùng ngữ pháp', () => {
  const questions = manifest.entries.filter(({ payload }) =>
    payload.prompt?.includes('cách dùng của 「'),
  );
  expect(questions).toHaveLength(50);
  const withFormulas = questions.filter(({ payload }) =>
    payload.options?.some(({ text }) => /[ぁ-ヿ一-龯]/u.test(text)),
  );
  expect(withFormulas.map(({ seedKey }) => seedKey)).toEqual([]);
});

it('không tập trung đáp án đúng vào một nhóm độ dài trong quiz ứng xử N2/N1', () => {
  const questions = manifest.entries.filter(({ seedKey }) =>
    seedKey.endsWith('/quiz-pragmatics'),
  );
  expect(questions).toHaveLength(24);
  const lengthGroups = { shortest: 0, middle: 0, longest: 0 };
  for (const { payload } of questions) {
    const options = payload.options ?? [];
    const correct = options.find(({ id }) => id === payload.correctOptionId);
    if (!correct) throw new Error('Câu hỏi ứng xử thiếu đáp án đúng');
    const lengths = options.map(({ text }) => text.length);
    const correctLength = correct.text.length;
    if (correctLength === Math.min(...lengths)) lengthGroups.shortest++;
    else if (correctLength === Math.max(...lengths)) lengthGroups.longest++;
    else lengthGroups.middle++;
  }
  for (const count of Object.values(lengthGroups)) {
    expect(count).toBeLessThanOrEqual(questions.length / 2);
  }
});
