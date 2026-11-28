import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Badge } from '../../components/ui/surfaces.jsx';
import { libraryPath } from '../library/library-api.js';
import { QuizLayout } from './QuizLayout.jsx';
import { useQuizKnowledge } from './use-quiz-knowledge.js';

/** @typedef {import('./quiz-api.js').QuizResult} QuizResult */

/**
 * @param {{
 *   result: QuizResult,
 * }} props
 */
export function QuizResultView({ result }) {
  const navigate = useNavigate();

  // Gộp danh sách các knowledgeVersionIds liên quan từ các câu hỏi
  const allKnowledgeVersionIds = Array.from(
    new Set(result.results.flatMap((item) => item.knowledgeVersionIds ?? [])),
  );

  const { knowledgeMap, savedIds, loading, error, reload } = useQuizKnowledge(
    result.deckVersionId,
    allKnowledgeVersionIds.length > 0,
  );

  const resolvedKnowledge = allKnowledgeVersionIds
    .map((kVerId) => knowledgeMap.get(kVerId))
    .filter(
      /** @returns {k is import('../library/library-api.js').Knowledge} */ (
        k,
      ) => Boolean(k),
    );

  const handleRetryQuiz = () => {
    navigate(
      libraryPath('/quiz', {
        deckVersionId: result.deckVersionId,
        sourceSessionId: result.sourceSessionId,
      }),
    );
  };

  return (
    <QuizLayout
      deckVersionId={result.deckVersionId}
      sourceSessionId={result.sourceSessionId}
      hasDraft={false}
    >
      <div className="ck-quiz-result">
        <section className="ck-quiz-result-hero">
          <h2 className="ck-quiz-result-score">
            Đúng {result.score}/{result.total} câu
          </h2>
          <p className="ck-quiz-result-disclaimer">
            Kết quả quiz không phải chứng nhận trình độ.
          </p>
        </section>

        <section
          className="ck-quiz-result-items"
          aria-label="Chi tiết kết quả từng câu"
        >
          <h3 className="ck-sr-only">Chi tiết từng câu hỏi</h3>
          {result.questions.map((question, idx) => {
            const itemResult = result.results.find(
              (r) => r.questionVersionId === question.questionVersionId,
            );
            const userAnswer = result.answers.find(
              (a) => a.questionVersionId === question.questionVersionId,
            );
            const isCorrect = Boolean(itemResult?.isCorrect);

            // User answer text
            let userText = 'Bạn chưa trả lời';
            if (question.type === 'multipleChoice') {
              if (userAnswer?.optionId) {
                const opt = question.options?.find(
                  (o) => o.id === userAnswer.optionId,
                );
                userText = opt?.text ?? userAnswer.optionId;
              }
            } else if (userAnswer?.text?.trim()) {
              userText = userAnswer.text.trim();
            }

            // Correct answer text
            let correctText = '';
            if (question.type === 'multipleChoice') {
              const opt = question.options?.find(
                (o) => o.id === itemResult?.correctOptionId,
              );
              correctText = opt?.text ?? itemResult?.correctOptionId ?? '';
            } else if (itemResult?.acceptedAnswers?.length) {
              correctText = itemResult.acceptedAnswers.join(', ');
            }

            return (
              <article
                key={question.questionVersionId}
                className={`ck-quiz-result-item ${isCorrect ? 'is-correct' : 'is-incorrect'}`}
              >
                <div className="ck-quiz-result-item-header">
                  <span className="ck-quiz-question-type">Câu {idx + 1}</span>
                  <span
                    className={`ck-quiz-result-badge ${isCorrect ? 'ck-quiz-result-badge--correct' : 'ck-quiz-result-badge--incorrect'}`}
                  >
                    {isCorrect ? 'Đúng (+1 điểm)' : 'Sai (0 điểm)'}
                  </span>
                </div>

                <h4 className="ck-quiz-prompt">{question.prompt}</h4>

                <div className="ck-quiz-result-answers">
                  <p>
                    <strong>Bạn chọn: </strong>
                    <span
                      className={
                        isCorrect
                          ? 'ck-quiz-answer--correct'
                          : 'ck-quiz-answer--incorrect'
                      }
                    >
                      {userText}
                    </span>
                  </p>
                  {!isCorrect && correctText && (
                    <p>
                      <strong>Đáp án đúng: </strong>
                      <span className="ck-quiz-answer--correct">
                        {correctText}
                      </span>
                    </p>
                  )}
                </div>

                {itemResult?.explanation && (
                  <div className="ck-quiz-result-explanation">
                    <strong>Giải thích: </strong>
                    {itemResult.explanation}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {allKnowledgeVersionIds.length > 0 && (
          <section
            className="ck-quiz-knowledge-section"
            aria-label="Học liệu liên quan"
          >
            <h3>Học liệu liên quan</h3>
            {loading ? (
              <p role="status">Đang tải học liệu liên quan…</p>
            ) : error ? (
              <div
                className="ck-quiz-banner ck-quiz-banner--error"
                role="alert"
              >
                <span>{error}</span>
                <Button variant="secondary" size="compact" onClick={reload}>
                  Thử lại
                </Button>
              </div>
            ) : resolvedKnowledge.length === 0 ? (
              <p className="ck-quiz-knowledge-empty">
                Không có thông tin học liệu tương ứng để hiển thị.
              </p>
            ) : (
              <div className="ck-quiz-knowledge-list">
                {resolvedKnowledge.map((k) => {
                  const isSaved = savedIds.has(k.id);

                  return (
                    <div key={k.versionId} className="ck-quiz-knowledge-item">
                      <div className="ck-quiz-knowledge-info">
                        <strong lang="ja">{k.expression}</strong>
                        {k.reading && <span lang="ja"> ({k.reading})</span>}
                        <p>{k.meaning}</p>
                      </div>

                      <div className="ck-quiz-knowledge-actions">
                        <Badge tone={isSaved ? 'success' : 'neutral'}>
                          {isSaved ? 'Đã lưu' : 'Chưa lưu'}
                        </Badge>
                        <Link
                          to={libraryPath(
                            `/topics/${encodeURIComponent(result.deckVersionId)}`,
                            { knowledge: k.id, revision: k.versionId },
                          )}
                          className="ck-button ck-button--secondary ck-button--compact"
                        >
                          Mở học liệu
                        </Link>
                        <Link
                          to={libraryPath('/study', {
                            scope: 'topic',
                            topicVersionId: result.deckVersionId,
                            mode: 'all',
                          })}
                          className="ck-button ck-button--ghost ck-button--compact"
                        >
                          Ôn flashcard
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <footer className="ck-quiz-result-actions">
          <Button variant="primary" onClick={handleRetryQuiz}>
            Làm lại bài quiz
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              navigate(`/topics/${encodeURIComponent(result.deckVersionId)}`)
            }
          >
            Về trang chủ đề
          </Button>
          {result.sourceSessionId ? (
            <Button
              variant="secondary"
              onClick={() =>
                navigate(
                  `/sessions/${encodeURIComponent(result.sourceSessionId ?? '')}/summary`,
                )
              }
            >
              Về tổng kết phiên
            </Button>
          ) : null}
        </footer>
      </div>
    </QuizLayout>
  );
}
