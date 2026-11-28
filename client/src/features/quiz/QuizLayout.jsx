import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { readLibrary } from '../library/library-api.js';
import { useQuizLeaveGuard } from './use-quiz-leave-guard.js';

/**
 * @param {{
 *   deckVersionId?: string,
 *   sourceSessionId?: string,
 *   currentIndex?: number,
 *   total?: number,
 *   answeredCount?: number,
 *   hasDraft?: boolean,
 *   children: React.ReactNode,
 * }} props
 */
export function QuizLayout({
  deckVersionId,
  sourceSessionId,
  currentIndex,
  total,
  answeredCount = 0,
  hasDraft = false,
  children,
}) {
  const navigate = useNavigate();
  const [topicState, setTopicState] = useState(
    /** @type {{ id: string, title: string } | null} */ (null),
  );
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  useEffect(() => {
    if (!deckVersionId) return undefined;
    let active = true;
    const controller = new AbortController();

    readLibrary(
      `/topic-versions/${encodeURIComponent(deckVersionId)}`,
      controller.signal,
    )
      .then((data) => {
        if (active && data?.title) {
          setTopicState({ id: deckVersionId, title: data.title });
        }
      })
      .catch(() => {
        // Lỗi tải tiêu đề không được chặn làm quiz
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [deckVersionId]);

  const topicTitle =
    topicState && topicState.id === deckVersionId ? topicState.title : '';

  const exitTarget = sourceSessionId
    ? `/sessions/${encodeURIComponent(sourceSessionId)}/summary`
    : deckVersionId
      ? `/topics/${encodeURIComponent(deckVersionId)}`
      : '/topics';

  const handleBlockedLeave = useCallback(() => {
    setShowLeaveDialog(true);
  }, []);

  const releaseGuard = useQuizLeaveGuard({
    active: hasDraft,
    onBlocked: handleBlockedLeave,
  });

  const handleExitClick = () => {
    if (hasDraft) {
      setShowLeaveDialog(true);
    } else {
      releaseGuard();
      navigate(exitTarget, { replace: true });
    }
  };

  const handleConfirmExit = () => {
    setShowLeaveDialog(false);
    releaseGuard();
    navigate(exitTarget, { replace: true });
  };

  const progressPercent =
    total && total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <div className="ck-quiz-layout">
      <header className="ck-quiz-header">
        <div className="ck-quiz-header-left">
          <Button
            variant="ghost"
            size="compact"
            className="ck-quiz-exit-btn"
            onClick={handleExitClick}
            aria-label="Thoát lượt ôn"
          >
            ← Thoát lượt ôn
          </Button>
          {topicTitle && (
            <span className="ck-quiz-topic-title" title={topicTitle}>
              {topicTitle}
            </span>
          )}
          <span className="ck-quiz-badge">QUIZ</span>
        </div>

        {typeof currentIndex === 'number' && typeof total === 'number' && (
          <div className="ck-quiz-header-right">
            <span
              className="ck-quiz-counter-pill"
              aria-label={`Câu ${currentIndex + 1} trên ${total}`}
            >
              Câu {currentIndex + 1}/{total}
            </span>
          </div>
        )}
      </header>

      {typeof total === 'number' && total > 0 && (
        <div
          className="ck-quiz-progress-bar-container"
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Tiến độ trả lời quiz"
        >
          <div
            className="ck-quiz-progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <main className="ck-quiz-main">{children}</main>

      {showLeaveDialog && (
        <Dialog
          open={showLeaveDialog}
          title="Rời bài quiz?"
          onClose={() => setShowLeaveDialog(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowLeaveDialog(false)}
              >
                Ở lại làm tiếp
              </Button>
              <Button variant="danger" onClick={handleConfirmExit}>
                Rời khỏi
              </Button>
            </>
          }
        >
          <p>
            Câu trả lời chưa nộp sẽ mất. Bạn có chắc chắn muốn rời bài quiz?
          </p>
        </Dialog>
      )}
    </div>
  );
}
