import { useCallback, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { ApiError } from '../../services/errors.js';
import { LibraryStatus } from './LibraryParts.jsx';
import { TopicBack } from './TopicPresentation.jsx';
import { libraryPath, readLibrary } from './library-api.js';
import { useLibraryPage, useLibraryWrite } from './library-hooks.js';
import { postTopicStudy } from './topic-study-api.js';
import './topic-study.css';

/** @typedef {import('./topic-study-api.js').Quiz} Quiz */
/** @typedef {import('./topic-study-api.js').QuizAnswer} QuizAnswer */
/** @typedef {import('./topic-study-api.js').QuizResult} QuizResult */
/** @typedef {{expectedVersion: number, answers: QuizAnswer[]}} Submission */

export function TopicQuizPage() {
  const { topicVersionId = '' } = useParams();
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const attemptId = params.get('attempt');
  const detailPath = '/topics/' + encodeURIComponent(topicVersionId);

  return (
    <section className="ck-topic-study" data-screen-id="SC-15">
      <TopicBack to={detailPath} state={state}>
        Quay lại bộ chủ đề
      </TopicBack>
      <h1>Luyện tập Quiz</h1>
      {attemptId ? (
        <LoadQuiz
          key={attemptId}
          attemptId={attemptId}
          deckVersionId={topicVersionId}
          detailPath={detailPath}
          onRestart={() => setParams({}, { replace: true, state })}
        />
      ) : (
        <QuizStart
          key={topicVersionId}
          deckVersionId={topicVersionId}
          onStart={(id) => setParams({ attempt: id }, { replace: true, state })}
        />
      )}
    </section>
  );
}

/** @param {{deckVersionId: string, onStart: (id: string) => void}} props */
function QuizStart({ deckVersionId, onStart }) {
  const start = useLibraryWrite();
  return (
    <div className="ck-topic-study__card">
      <p>
        Mỗi lượt có tối đa 5 câu. Bạn có thể xem lại đáp án và giải thích sau
        khi nộp.
      </p>
      <Button
        variant="primary"
        appearance="sticker"
        loading={start.pending}
        onClick={() => {
          void start.write(
            deckVersionId,
            async (options) => {
              const quiz = /** @type {Quiz} */ (
                await postTopicStudy('/quizzes', { deckVersionId }, options)
              );
              onStart(quiz.id);
            },
            () => {},
          );
        }}
      >
        Bắt đầu Quiz
      </Button>
      {start.error && <p role="alert">{start.error}</p>}
    </div>
  );
}

/** @param {{attemptId: string, deckVersionId: string, detailPath: string, onRestart: () => void}} props */
function LoadQuiz({ attemptId, deckVersionId, detailPath, onRestart }) {
  const path = '/quizzes/' + encodeURIComponent(attemptId);
  const load = useCallback(
    /** @param {string|null} _cursor @param {AbortSignal} signal */
    async (_cursor, signal) => ({
      items: [/** @type {Quiz} */ (await readLibrary(path, signal))].filter(
        (entry) => entry.deckVersionId === deckVersionId,
      ),
    }),
    [deckVersionId, path],
  );
  const page = useLibraryPage(load);
  const quiz = page.data?.[0];
  return (
    <LibraryStatus
      {...page}
      empty={!quiz}
      retry={page.reload}
      emptyText="Không tìm thấy lượt Quiz của bộ chủ đề này."
    >
      {quiz?.status === 'submitted' ? (
        <QuizResults
          quiz={quiz}
          detailPath={detailPath}
          onRestart={onRestart}
        />
      ) : quiz ? (
        <QuizQuestions
          quiz={quiz}
          path={path}
          onRefresh={page.reload}
          onSubmit={(result) => page.setData([result])}
        />
      ) : null}
    </LibraryStatus>
  );
}

/** @param {{quiz: Quiz, path: string, onRefresh: () => void, onSubmit: (result: QuizResult) => void}} props */
function QuizQuestions({ quiz, path, onRefresh, onSubmit }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(
    /** @type {Record<string,string>} */ ({}),
  );
  const [confirming, setConfirming] = useState(false);
  const [retry, setRetry] = useState(/** @type {Submission|null} */ (null));
  const submit = useLibraryWrite();
  const question = quiz.questions[index];
  const values = quiz.questions.flatMap(({ questionVersionId, type }) => {
    const value = answers[questionVersionId]?.trim();
    if (!value) return [];
    return [
      type === 'multipleChoice'
        ? { questionVersionId, optionId: value }
        : { questionVersionId, text: value },
    ];
  });
  const missing = quiz.questions.length - values.length;

  /** @param {Submission} body */
  function submitAnswers(body) {
    setConfirming(false);
    void submit.write(
      JSON.stringify(body),
      async (options) => {
        try {
          const result = /** @type {QuizResult} */ (
            await postTopicStudy(path + '/submission', body, options)
          );
          onSubmit(result);
        } catch (error) {
          if (error instanceof ApiError && error.isRetryable()) setRetry(body);
          else {
            setRetry(null);
            if (
              error instanceof ApiError &&
              error.code === 'QUIZ_ALREADY_SUBMITTED'
            )
              onRefresh();
          }
          throw error;
        }
      },
      onRefresh,
    );
  }

  if (!question) return <p>Không có câu hỏi trong lượt Quiz này.</p>;

  return (
    <div className="ck-topic-study__card">
      <p className="ck-topic-study__counter">
        Câu {index + 1} / {quiz.total}
      </p>
      <fieldset
        disabled={submit.pending || Boolean(retry)}
        className="ck-quiz-question"
      >
        <legend>{question.prompt}</legend>
        {question.type === 'multipleChoice' ? (
          question.options?.map((option) => (
            <label key={option.id} className="ck-quiz-option">
              <input
                type="radio"
                name={question.questionVersionId}
                checked={answers[question.questionVersionId] === option.id}
                onChange={() =>
                  setAnswers({
                    ...answers,
                    [question.questionVersionId]: option.id,
                  })
                }
              />
              {option.text}
            </label>
          ))
        ) : (
          <label className="ck-quiz-field">
            Câu trả lời của bạn
            <input
              value={answers[question.questionVersionId] ?? ''}
              onChange={(event) =>
                setAnswers({
                  ...answers,
                  [question.questionVersionId]: event.target.value,
                })
              }
              maxLength={500}
            />
          </label>
        )}
      </fieldset>
      <nav className="ck-quiz-steps" aria-label="Chọn câu hỏi">
        {quiz.questions.map(({ questionVersionId }, number) => (
          <button
            type="button"
            key={questionVersionId}
            aria-current={number === index ? 'step' : undefined}
            aria-label={
              'Câu ' +
              (number + 1) +
              (answers[questionVersionId]?.trim()
                ? ', đã trả lời'
                : ', chưa trả lời')
            }
            data-answered={Boolean(answers[questionVersionId]?.trim())}
            onClick={() => setIndex(number)}
          >
            {number + 1}
          </button>
        ))}
      </nav>
      <div className="ck-topic-study__controls">
        <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Câu trước
        </Button>
        <Button
          disabled={index === quiz.questions.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          Câu tiếp
        </Button>
        <Button
          variant="primary"
          loading={submit.pending}
          onClick={() => {
            if (retry) submitAnswers(retry);
            else if (missing) setConfirming(true);
            else
              submitAnswers({ expectedVersion: quiz.version, answers: values });
          }}
        >
          {retry ? 'Thử nộp lại' : 'Nộp bài'}
        </Button>
      </div>
      {submit.error && <p role="alert">{submit.error}</p>}
      <Dialog
        open={confirming}
        title="Nộp bài Quiz"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Tiếp tục làm</Button>
            <Button
              variant="primary"
              onClick={() =>
                submitAnswers({
                  expectedVersion: quiz.version,
                  answers: values,
                })
              }
            >
              Vẫn nộp bài
            </Button>
          </>
        }
      >
        <p>
          Bạn còn {missing} câu chưa trả lời. Câu bỏ trống được tính 0 điểm.
        </p>
      </Dialog>
    </div>
  );
}

/** @param {{quiz: QuizResult, detailPath: string, onRestart: () => void}} props */
function QuizResults({ quiz, detailPath, onRestart }) {
  const { state } = useLocation();
  return (
    <div className="ck-topic-study__card">
      <h2>Kết quả Quiz</h2>
      <p className="ck-topic-study__score">
        {quiz.score} / {quiz.total}
      </p>
      <ol className="ck-topic-study__results">
        {quiz.questions.map((question, index) => {
          const answer = quiz.answers.find(
            (item) => item.questionVersionId === question.questionVersionId,
          );
          const result = quiz.results.find(
            (item) => item.questionVersionId === question.questionVersionId,
          );
          const response =
            answer?.text ??
            question.options?.find(({ id }) => id === answer?.optionId)?.text;
          const correct =
            result?.acceptedAnswers?.join(' / ') ??
            question.options?.find(({ id }) => id === result?.correctOptionId)
              ?.text;

          return (
            <li key={question.questionVersionId}>
              <h3>
                Câu {index + 1}. {question.prompt}
              </h3>
              <p>
                <strong>{result?.isCorrect ? 'Đúng' : 'Chưa đúng'}</strong> ·{' '}
                {response ?? 'Bỏ trống'}
              </p>
              {correct && <p>Đáp án: {correct}</p>}
              {result?.explanation && <p>{result.explanation}</p>}
              {result?.knowledgeVersionIds.map((revision, number) => (
                <Link
                  key={revision}
                  className="ck-library-text-link"
                  state={state}
                  to={
                    libraryPath(detailPath, { revision }) + '#topic-knowledge'
                  }
                >
                  Kiến thức liên quan
                  {result.knowledgeVersionIds.length > 1
                    ? ' ' + (number + 1)
                    : ''}
                </Link>
              ))}
            </li>
          );
        })}
      </ol>
      <Button variant="primary" appearance="sticker" onClick={onRestart}>
        Làm lại Quiz
      </Button>
    </div>
  );
}
