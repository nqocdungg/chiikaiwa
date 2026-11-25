import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { ApiError } from '../../services/errors.js';
import { LibraryMore, LibraryStatus } from './LibraryParts.jsx';
import { TopicBack } from './TopicPresentation.jsx';
import { libraryPath, readLibrary } from './library-api.js';
import {
  libraryError,
  useLibraryPage,
  useLibraryWrite,
} from './library-hooks.js';
import { postTopicStudy, studyDate } from './topic-study-api.js';
import './topic-study.css';

/** @typedef {import('./topic-study-api.js').StudyCard} StudyCard */
/** @typedef {import('./topic-study-api.js').StudyReveal} StudyReveal */
/** @typedef {import('./topic-study-api.js').ReviewReceipt} ReviewReceipt */
/** @typedef {import('./topic-study-api.js').ReviewRecord} ReviewRecord */

const ratings = { 1: 'Cần học lại', 2: 'Nhớ nhưng còn khó', 3: 'Nhớ được' };
const labels = { 1: 'Again', 2: 'Hard', 3: 'Good' };

export function TopicFlashcardPage() {
  const { topicVersionId = '' } = useParams();
  const { state } = useLocation();
  return (
    <section className="ck-topic-study" data-screen-id="SC-14">
      <TopicBack
        to={'/topics/' + encodeURIComponent(topicVersionId)}
        state={state}
      >
        Quay lại bộ chủ đề
      </TopicBack>
      <h1>Ôn tập Flashcard</h1>
      <TopicFlashcards key={topicVersionId} versionId={topicVersionId} />
    </section>
  );
}

/** @param {{versionId: string}} props */
function TopicFlashcards({ versionId }) {
  const load = useCallback(
    /** @param {string|null} cursor @param {AbortSignal} signal */
    (cursor, signal) =>
      /** @type {Promise<import('./library-api.js').Page<StudyCard>>} */ (
        postTopicStudy(
          '/study/cards/query',
          {
            scope: { type: 'topic', topicVersionId: versionId },
            mode: 'all',
            ...(cursor ? { cursor } : {}),
          },
          { signal },
        )
      ),
    [versionId],
  );
  const cards = useLibraryPage(load);
  const [index, setIndex] = useState(0);
  const card = cards.data?.[index];

  return (
    <LibraryStatus
      {...cards}
      empty={!cards.data?.length}
      retry={cards.reload}
      emptyText="Bộ chủ đề chưa có thẻ để ôn."
    >
      {card ? (
        <Flashcard
          key={card.cardKey}
          card={card}
          versionId={versionId}
          position={index + 1}
          onNext={() => {
            setIndex(index + 1);
            if (index + 1 === cards.data?.length && cards.hasMore)
              void cards.more();
          }}
        />
      ) : cards.hasMore ? (
        <LibraryMore {...cards} />
      ) : (
        <div className="ck-topic-study__card">
          <h2>Đã xem hết thẻ</h2>
          <Button
            onClick={() => {
              setIndex(0);
              void cards.reload();
            }}
          >
            Ôn lại
          </Button>
        </div>
      )}
    </LibraryStatus>
  );
}

/** @param {{card: StudyCard, versionId: string, position: number, onNext: () => void}} props */
function Flashcard({ card, versionId, position, onNext }) {
  const [reveal, setReveal] = useState(/** @type {StudyReveal|null} */ (null));
  const [receipt, setReceipt] = useState(
    /** @type {ReviewReceipt|null} */ (null),
  );
  const [requesting, setRequesting] = useState(false);
  const [revealError, setRevealError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [retryRating, setRetryRating] = useState(
    /** @type {1|2|3|null} */ (null),
  );
  const request = useRef(/** @type {AbortController|null} */ (null));
  const review = useLibraryWrite();

  useEffect(() => () => request.current?.abort(), []);

  async function revealAnswer() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRequesting(true);
    setRevealError('');
    try {
      setReveal(
        await postTopicStudy(
          '/study/cards/reveal',
          {
            scope: { type: 'topic', topicVersionId: versionId },
            cardKey: card.cardKey,
          },
          { signal: controller.signal },
        ),
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setRevealError(libraryError(error, 'Không mở được đáp án.'));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setRequesting(false);
    }
  }

  /** @param {1|2|3} rating */
  function saveRating(rating) {
    if (!reveal) return;
    void review.write(
      reveal.reviewTicket + ':' + rating,
      async (options) => {
        try {
          setReceipt(
            await postTopicStudy(
              '/study/reviews',
              { reviewTicket: reveal.reviewTicket, rating },
              options,
            ),
          );
          setRetryRating(null);
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.code === 'REVIEW_TICKET_EXPIRED'
          ) {
            setReveal(null);
          }
          setRetryRating(
            error instanceof ApiError && error.isRetryable() ? rating : null,
          );
          throw error;
        }
      },
      () => setReveal(null),
    );
  }

  return (
    <div className="ck-topic-study__card">
      <p className="ck-topic-study__counter">Thẻ {position}</p>
      <h2 lang="ja" className="ck-flashcard-front">
        {card.front}
      </h2>
      {!reveal ? (
        <Button
          appearance="sticker"
          variant="primary"
          loading={requesting}
          onClick={revealAnswer}
        >
          Mở đáp án
        </Button>
      ) : (
        <>
          <p className="ck-flashcard-back">{reveal.back}</p>
          {receipt ? (
            <p role="status">
              Đã lưu. Ôn lại lúc {studyDate(receipt.progress.dueAt)}.
            </p>
          ) : (
            <div
              className="ck-flashcard-ratings"
              role="group"
              aria-label="Đánh giá mức độ ghi nhớ"
            >
              {reveal.preview.map(({ rating, dueAt }) => (
                <Button
                  key={rating}
                  disabled={
                    review.pending ||
                    (retryRating !== null && retryRating !== rating)
                  }
                  onClick={() => saveRating(rating)}
                >
                  <span>
                    <strong>{labels[rating]}</strong>
                    <span>{ratings[rating]}</span>
                    <small>{studyDate(dueAt)}</small>
                  </span>
                </Button>
              ))}
            </div>
          )}
        </>
      )}
      {revealError && <p role="alert">{revealError}</p>}
      {!receipt && review.error && <p role="alert">{review.error}</p>}
      <div className="ck-topic-study__controls">
        <Button
          variant="ghost"
          aria-controls="topic-card-history"
          aria-pressed={showHistory}
          onClick={() => setShowHistory(!showHistory)}
        >
          Lịch sử ôn thẻ
        </Button>
        <Button
          variant={receipt ? 'primary' : 'secondary'}
          disabled={requesting || review.pending || retryRating !== null}
          onClick={onNext}
        >
          {receipt ? 'Thẻ tiếp theo' : 'Bỏ qua thẻ'}
        </Button>
      </div>
      <div id="topic-card-history" hidden={!showHistory}>
        {showHistory && (
          <ReviewHistory
            key={receipt?.progress.dueAt ?? ''}
            cardKey={card.cardKey}
          />
        )}
      </div>
    </div>
  );
}

/** @param {{cardKey: string}} props */
function ReviewHistory({ cardKey }) {
  const load = useCallback(
    /** @param {string|null} cursor @param {AbortSignal} signal */
    (cursor, signal) =>
      /** @type {Promise<import('./library-api.js').Page<ReviewRecord>>} */ (
        readLibrary(libraryPath('/me/reviews', { cardKey, cursor }), signal)
      ),
    [cardKey],
  );
  const history = useLibraryPage(load);
  return (
    <LibraryStatus
      {...history}
      empty={!history.data?.length}
      retry={history.reload}
      emptyText="Thẻ chưa có lượt ôn."
    >
      <ul className="ck-topic-study__results">
        {history.data?.map((item) => (
          <li key={item.id}>
            <strong>{labels[item.rating]}</strong>
            <p>
              {studyDate(item.reviewedAt)} · Lịch ôn {studyDate(item.nextDueAt)}
            </p>
          </li>
        ))}
      </ul>
      <LibraryMore {...history} />
    </LibraryStatus>
  );
}
