import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Avatar, Badge, Card } from '../../components/ui/surfaces.jsx';
import { Friends } from '../../components/Friends.jsx';
import { libraryPath } from '../library/library-api.js';

const confidenceLabels = [
  'Chưa tự tin',
  'Còn khá khó',
  'Tạm ổn',
  'Khá tự tin',
  'Rất tự tin',
];

const cardStatus = {
  completed: 'Đã hoàn thành',
  skipped: 'Đã bỏ qua',
  unfinished: 'Chưa hoàn thành',
  current: 'Chưa hoàn thành',
};

const endReasons = {
  left: 'Một thành viên đã rời phòng',
  connection_timeout: 'Hết thời gian kết nối lại',
  selection_timeout: 'Chưa chọn bộ trong thời gian cho phép',
  blocked: 'Phiên kết thúc do chặn thành viên',
  account_locked: 'Tài khoản không còn quyền tiếp tục',
  system_error: 'Phiên kết thúc do lỗi hệ thống',
};

/** @param {number} milliseconds */
function duration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes} phút ${String(seconds % 60).padStart(2, '0')} giây`;
}

/** @param {{sessionId?: string, summary?: import('../kaiwa/session-learning-api.js').SessionSummaryData, savedKnowledge?: import('../library/library-api.js').Knowledge[], assessment?: {confidence: number|null, comment: string}, assessmentStatus?: string, assessmentError?: string, noteError?: string, onNoteChange?: (value: string) => void, onNoteSave?: () => void, onNoteDelete?: () => void, onRefreshPersonal?: () => void, onAssessmentChange?: (value: {confidence: number|null, comment: string}) => void, onAssessmentSave?: () => void, safetyNotice?: string, onOpenSafety?: () => void, phase?: import('../../demo/kaiwa-fixtures.js').Phase, scenarioTitle?: string, outcomes?: {title: string, result: string}[], note: string, noteStatus: string, saved?: string[], knowledge?: typeof import('../../demo/kaiwa-fixtures.js').knowledge, onHome: () => void}} props */
export function SessionSummary({
  sessionId: propSessionId,
  summary,
  savedKnowledge = [],
  assessment = { confidence: null, comment: '' },
  assessmentStatus = 'idle',
  assessmentError = '',
  noteError = '',
  onNoteChange,
  onNoteSave,
  onNoteDelete,
  onRefreshPersonal,
  onAssessmentChange,
  onAssessmentSave,
  safetyNotice = '',
  onOpenSafety,
  phase,
  scenarioTitle = '',
  outcomes = [],
  note,
  noteStatus,
  saved = [],
  knowledge = [],
  onHome,
}) {
  const [hoveredConfidence, setHoveredConfidence] = useState(
    /** @type {number|null} */ (null),
  );
  if (!summary)
    return (
      <DemoSummary
        phase={phase ?? 'selecting'}
        scenarioTitle={scenarioTitle}
        outcomes={outcomes}
        note={note}
        noteStatus={noteStatus}
        saved={saved}
        knowledge={knowledge}
        onHome={onHome}
      />
    );

  const { session, drawnCards, personal } = summary;
  const members = session.members ?? [];
  const deckVersionId = session.deckVersionId;
  const sessionId = propSessionId ?? '';
  return (
    <main className="ck-summary" data-screen-id="SC-10">
      <header className="ck-summary-hero">
        <div className="ck-summary-art" aria-hidden="true">
          <Friends />
        </div>
        <div>
          <p className="ck-summary-kicker" lang="ja">
            おつかれさま！
          </p>
          <h1>Một cuộc trò chuyện thật vui!</h1>
          <p>Bạn vừa hoàn thành thêm một buổi luyện nói.</p>
        </div>
      </header>

      {safetyNotice ? (
        <div className="ck-safety-notice" role="status" aria-live="polite">
          <p>{safetyNotice}</p>
        </div>
      ) : null}

      <Card className="ck-summary-overview">
        <div className="ck-summary-members">
          <div className="ck-summary-avatars" aria-hidden="true">
            {members.slice(0, 2).map((member) => (
              <Avatar
                key={member.actorKey}
                name={member.displayName}
                size={48}
              />
            ))}
          </div>
          <div>
            <span>Thành viên phiên</span>
            <strong>
              {members.map((member) => member.displayName).join(' · ')}
            </strong>
          </div>
        </div>
        <dl>
          <div>
            <dt>Thời lượng thực tế</dt>
            <dd>{duration(session.activeDurationMs)}</dd>
          </div>
          <div>
            <dt>Kết thúc phiên</dt>
            <dd>
              {endReasons[
                /** @type {keyof typeof endReasons} */ (session.endReason)
              ] ?? 'Đã kết thúc'}
            </dd>
          </div>
          <div>
            <dt>Bộ hội thoại</dt>
            <dd>
              {deckVersionId
                ? 'Đã chọn bộ hội thoại'
                : 'Chưa chọn bộ hội thoại'}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="ck-summary-grid">
        <Card className="ck-summary-section">
          <header>
            <Badge tone="accent">01</Badge>
            <div>
              <h2>Tình huống đã luyện</h2>
              <p>Những phần hai bạn đã cùng thực hành.</p>
            </div>
          </header>
          {drawnCards.length ? (
            <ul className="ck-summary-list">
              {drawnCards.map((card) => (
                <li key={card.id}>
                  <Icon
                    name={card.status === 'completed' ? 'check' : 'cards'}
                    size={18}
                  />
                  <div>
                    <strong>{card.title}</strong>
                    <span>{cardStatus[card.status] ?? card.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ck-summary-empty">
              Phiên kết thúc trước khi bốc tình huống.
            </p>
          )}
        </Card>

        <Card className="ck-summary-section">
          <header>
            <Badge tone="accent">02</Badge>
            <div>
              <h2>Đã lưu trong buổi này</h2>
              <p>Kiến thức và ghi chú riêng để xem lại.</p>
            </div>
          </header>
          {savedKnowledge.length ? (
            <ul className="ck-summary-knowledge">
              {savedKnowledge.map((item) => (
                <li key={item.versionId}>
                  <strong lang="ja">{item.expression}</strong>
                  <span>{item.meaning}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ck-summary-empty">
              Bạn chưa lưu kiến thức trong phiên này.
            </p>
          )}
          <div className="ck-summary-note-editor">
            <label htmlFor="ck-summary-note">Ghi chú riêng</label>
            <textarea
              id="ck-summary-note"
              value={note}
              maxLength={10000}
              onChange={(event) => onNoteChange?.(event.target.value)}
              placeholder="Ghi lại điều bạn muốn xem lại…"
            />
            <p
              className={
                noteStatus === 'error' || noteStatus === 'conflict'
                  ? 'ck-error'
                  : 'ck-muted'
              }
              role="status"
            >
              {noteStatus === 'saving'
                ? 'Đang lưu…'
                : noteStatus === 'saved'
                  ? 'Đã lưu riêng tư.'
                  : noteError || 'Thay đổi chưa được lưu.'}
            </p>
            <div className="ck-actions">
              <Button
                size="compact"
                loading={noteStatus === 'saving'}
                disabled={noteStatus === 'saved' || noteStatus === 'conflict'}
                onClick={onNoteSave}
              >
                Lưu ghi chú
              </Button>
              {personal.note !== undefined && (
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={noteStatus !== 'saved'}
                  onClick={onNoteDelete}
                >
                  Xóa ghi chú
                </Button>
              )}
              {noteStatus === 'conflict' && (
                <Button
                  size="compact"
                  variant="secondary"
                  onClick={onRefreshPersonal}
                >
                  Tải version mới
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="ck-summary-assessment">
        <header>
          <Badge tone="accent">03</Badge>
          <div>
            <h2>Tự đánh giá sau buổi luyện</h2>
            <p>Bạn cảm thấy mức độ tự tin của mình thế nào?</p>
          </div>
        </header>
        <fieldset
          onMouseLeave={() => setHoveredConfidence(null)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setHoveredConfidence(null);
          }}
        >
          <legend className="ck-sr-only">Mức độ tự tin từ 1 đến 5</legend>
          <div className="ck-confidence-options">
            {confidenceLabels.map((label, index) => {
              const value = index + 1;
              return (
                <label
                  key={value}
                  onMouseEnter={() => setHoveredConfidence(value)}
                  className={
                    value <= (hoveredConfidence ?? assessment.confidence ?? 0)
                      ? 'ck-confidence-option--filled'
                      : ''
                  }
                >
                  <input
                    type="radio"
                    name="confidence"
                    value={value}
                    checked={assessment.confidence === value}
                    onChange={() =>
                      onAssessmentChange?.({ ...assessment, confidence: value })
                    }
                    onFocus={() => setHoveredConfidence(value)}
                  />
                  <span className="ck-confidence-star">
                    <Icon name="star" size={36} />
                  </span>
                  <strong className="ck-sr-only">{value} sao</strong>
                  <span className="ck-confidence-caption">{label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <label htmlFor="ck-assessment-comment">
          Điều bạn muốn cải thiện ở lần sau <span>(không bắt buộc)</span>
        </label>
        <textarea
          id="ck-assessment-comment"
          value={assessment.comment}
          maxLength={1000}
          onChange={(event) =>
            onAssessmentChange?.({ ...assessment, comment: event.target.value })
          }
          placeholder="Ví dụ: luyện phản xạ nhanh hơn khi gọi món…"
        />
        <div className="ck-summary-assessment-footer">
          <p
            className={
              assessmentStatus === 'error' || assessmentStatus === 'conflict'
                ? 'ck-error'
                : 'ck-muted'
            }
            role="status"
          >
            {assessmentStatus === 'saving'
              ? 'Đang lưu tự đánh giá…'
              : assessmentStatus === 'saved'
                ? 'Đã lưu tự đánh giá.'
                : assessmentError || 'Chọn một mức độ để lưu tự đánh giá.'}
          </p>
          <Button
            variant="primary"
            loading={assessmentStatus === 'saving'}
            disabled={
              assessment.confidence === null || assessmentStatus === 'saved'
            }
            onClick={onAssessmentSave}
          >
            Lưu tự đánh giá
          </Button>
          {assessmentStatus === 'conflict' && (
            <Button variant="secondary" onClick={onRefreshPersonal}>
              Tải version mới
            </Button>
          )}
        </div>
      </Card>

      <nav className="ck-summary-actions" aria-label="Học tiếp sau phiên">
        {deckVersionId && (
          <>
            <Link
              className="ck-button ck-button--secondary"
              to={`/topics/${encodeURIComponent(deckVersionId)}`}
            >
              Xem chủ đề
            </Link>
            <Link
              className="ck-button ck-button--primary"
              to={`/study?scope=topic&topicVersionId=${encodeURIComponent(deckVersionId)}&mode=all`}
            >
              Ôn flashcard
            </Link>
            <Link
              className="ck-button ck-button--secondary"
              to={libraryPath('/quiz', {
                deckVersionId,
                sourceSessionId: sessionId,
              })}
            >
              Luyện quiz
            </Link>
          </>
        )}
        <Link className="ck-button ck-button--secondary" to="/saved">
          Kiến thức đã lưu
        </Link>
        {onOpenSafety ? (
          <Button
            variant="secondary"
            leadingIcon={<Icon name="shield" size={18} />}
            onClick={onOpenSafety}
          >
            Báo cáo / Chặn đối tác
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onHome}>
          Về trang chính
        </Button>
      </nav>
    </main>
  );
}

/** @param {{phase: import('../../demo/kaiwa-fixtures.js').Phase, scenarioTitle: string, outcomes: {title: string, result: string}[], note: string, noteStatus: string, saved: string[], knowledge: typeof import('../../demo/kaiwa-fixtures.js').knowledge, onHome: () => void}} props */
function DemoSummary({
  phase,
  scenarioTitle,
  outcomes,
  note,
  noteStatus,
  saved,
  knowledge,
  onHome,
}) {
  return (
    <main className="ck-summary ck-summary--demo">
      <section>
        <h2>Hẹn một câu chuyện khác.</h2>
        <p>Phiên mẫu đã kết thúc cho cả hai.</p>
        <dl>
          <div>
            <dt>Thời gian cùng kết nối</dt>
            <dd>08:24 · mẫu</dd>
          </div>
          <div>
            <dt>Tình huống</dt>
            <dd>
              {phase === 'selecting'
                ? 'Chưa chọn bộ chủ đề.'
                : phase === 'drawing'
                  ? 'Chưa bốc thẻ tiếp theo.'
                  : phase === 'exhausted'
                    ? 'Đã đi hết bộ tình huống.'
                    : `${scenarioTitle} · Chưa hoàn thành`}
            </dd>
          </div>
          {outcomes.map((item, index) => (
            <div key={index}>
              <dt>{item.title}</dt>
              <dd>{item.result}</dd>
            </div>
          ))}
          <div>
            <dt>Kiến thức đã lưu</dt>
            <dd>
              {saved.length
                ? knowledge
                    .filter((item) => saved.includes(item.id))
                    .map((item) => item.word)
                    .join(' · ')
                : 'Chưa lưu mục nào.'}
            </dd>
          </div>
        </dl>
        <section className="ck-summary-note">
          <h3>Ghi chú riêng</h3>
          <p>{note || 'Chưa có ghi chú.'}</p>
          <small>
            {noteStatus === 'error' ? 'Chưa lưu được ghi chú.' : 'Dữ liệu mẫu.'}
          </small>
        </section>
        <Button onClick={onHome}>Về trang chính</Button>
      </section>
      <aside>
        <div className="ck-summary-art">
          <Friends />
        </div>
        <p lang="ja">また話そうね。</p>
      </aside>
    </main>
  );
}
