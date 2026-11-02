import { useRef, useState } from 'react';
import { Button, Icon, IconButton } from '../../components/ui/controls.jsx';
import { CardTable } from './components/CardTable.jsx';
import { ConsentBanner } from './components/ConsentBanner.jsx';
import { DeckPicker } from './components/DeckPicker.jsx';
import { LeaveDialog } from './components/LeaveDialog.jsx';
import { ParticipantVideo } from './components/ParticipantVideo.jsx';
import { PrivateTools } from './components/PrivateTools.jsx';
import { RoleCard } from './components/RoleCard.jsx';
import { SessionSummary } from '../session-summary/SessionSummary.jsx';
import {
  decks,
  knowledge,
  scenarios,
  stages,
} from '../../demo/kaiwa-fixtures.js';

/** @typedef {import('../../demo/kaiwa-fixtures.js').Stage} Stage */
/** @typedef {import('../../demo/kaiwa-fixtures.js').Phase} Phase */
/** @typedef {import('../../demo/kaiwa-fixtures.js').Panel} Panel */
/** @typedef {{action: 'swap'|'skip'|'complete', incoming: boolean}|null} Consent */

/** @param {{initialStage: Stage, initialPanel: Panel|null, longContent: boolean, initialNoteError: boolean, showDemoTools: boolean, onHome: () => void}} props */
export function KaiwaRoom({
  initialStage,
  initialPanel,
  longContent,
  initialNoteError,
  showDemoTools,
  onHome,
}) {
  const [stage, setStage] = useState(initialStage);
  const [phase, setPhase] = useState(
    /** @type {Phase} */ (
      ['selecting', 'drawing', 'exhausted'].includes(initialStage)
        ? initialStage
        : 'practice'
    ),
  );
  const [panel, setPanel] = useState(
    /** @type {Panel|null} */ (initialNoteError ? 'note' : initialPanel),
  );
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState(
    initialNoteError ? 'error' : 'draft',
  );
  const [saved, setSaved] = useState(/** @type {string[]} */ ([]));
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [controller, setController] = useState(true);
  const [roleIndex, setRoleIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [translated, setTranslated] = useState(false);
  const [consent, setConsent] = useState(/** @type {Consent} */ (null));
  const [used, setUsed] = useState(
    /** @type {number[]} */ (initialStage === 'exhausted' ? [0, 1, 2] : []),
  );
  const [outcomes, setOutcomes] = useState(
    /** @type {{title: string, result: string}[]} */ ([]),
  );
  const [leave, setLeave] = useState(false);
  const [feedback, setFeedback] = useState('');
  const triggerRefs = useRef(
    /** @type {Record<string, HTMLButtonElement|null>} */ ({}),
  );
  const scenario = scenarios[cardIndex];
  const paused = stage === 'reconnecting';
  const contentPhase = stage === 'exhausted' ? 'exhausted' : phase;
  const active = contentPhase === 'practice' && !paused && stage !== 'ended';
  /** @param {Stage} next */
  function changeStage(next) {
    if (
      next === 'selecting' ||
      next === 'drawing' ||
      next === 'practice' ||
      next === 'exhausted'
    )
      setPhase(next);
    if (next !== 'sharing') setConsent(null);
    setStage(next);
    setFeedback('');
  }
  /** Card progression does not stop an ongoing screen share.
   * @param {Phase} next */
  function advancePhase(next) {
    setPhase(next);
    if (stage !== 'sharing') setStage(next);
    setConsent(null);
    setFeedback('');
  }
  /** @param {Panel} next */
  function togglePanel(next) {
    setPanel(panel === next ? null : next);
  }
  function closePanel() {
    if (panel) triggerRefs.current[panel]?.focus();
    setPanel(null);
  }
  /** @param {string} id */
  function toggleSaved(id) {
    setSaved(
      saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id],
    );
  }
  /** @param {boolean} accepted */
  function respond(accepted) {
    if (!consent) return;
    if (accepted && consent.action === 'swap') {
      setRoleIndex(roleIndex === 0 ? 1 : 0);
      setFeedback('Đã đồng ý đổi vai · mẫu');
    } else if (accepted) {
      const nextUsed = used.includes(cardIndex) ? used : [...used, cardIndex];
      setUsed(nextUsed);
      setOutcomes([
        ...outcomes,
        {
          title: scenario.vietnameseTitle,
          result: consent.action === 'skip' ? 'Đã bỏ qua' : 'Đã hoàn thành',
        },
      ]);
      setTranslated(false);
      advancePhase(
        nextUsed.length === scenarios.length ? 'exhausted' : 'drawing',
      );
    } else setFeedback('Đã từ chối. Giữ nguyên tình huống và vai.');
    setConsent(null);
  }
  function endSession() {
    setLeave(false);
    changeStage('ended');
  }
  const toolButtons = (
    <div className="ck-tools" aria-label="Công cụ riêng">
      {
        /** @type {[Panel,string,string][]} */ ([
          ['hints', 'Gợi ý', 'book'],
          ['note', 'Ghi chú', 'note'],
          ['chat', 'Chat', 'chat'],
        ]).map(([key, label, icon]) => (
          <button
            type="button"
            className="ck-icon-button"
            ref={(element) => {
              triggerRefs.current[key] = element;
            }}
            key={key}
            title={label}
            aria-label={label}
            aria-pressed={panel === key}
            aria-controls={panel === key ? 'ck-private-panel' : undefined}
            onClick={() => togglePanel(key)}
          >
            <Icon name={icon} />
          </button>
        ))
      }
    </div>
  );
  return (
    <>
      {showDemoTools && (
        <div className="ck-demo-bar">
          <span>DEMO · Dữ liệu mẫu</span>
          <label>
            Trạng thái{' '}
            <select
              value={stage}
              onChange={(event) =>
                changeStage(/** @type {Stage} */ (event.target.value))
              }
            >
              {Object.entries(stages).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {stage !== 'ended' && (
            <>
              <button type="button" onClick={() => setController(!controller)}>
                Quyền: {controller ? 'Bạn' : 'Haru'}
              </button>
              <button
                type="button"
                disabled={!active || !!consent}
                onClick={() => setConsent({ action: 'swap', incoming: true })}
              >
                Nhận đề nghị
              </button>
              {consent && !consent.incoming && (
                <>
                  <button type="button" onClick={() => respond(true)}>
                    Haru đồng ý
                  </button>
                  <button type="button" onClick={() => respond(false)}>
                    Haru từ chối
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
      <header className="ck-room-header">
        <button
          type="button"
          className="ck-brand"
          aria-label="Về trang chính"
          onClick={() => (stage === 'ended' ? onHome() : setLeave(true))}
        >
          <span lang="ja">ち</span>chiikaiwa
        </button>
        <div className="ck-room-heading">
          <h1>{stage === 'ended' ? 'Tổng kết phiên' : 'Phòng Kaiwa'}</h1>
          <span>Minh Anh & Haru</span>
        </div>
        <div className="ck-room-meta">
          <span className={`ck-status ${paused ? 'ck-status--warning' : ''}`}>
            {stage === 'ended'
              ? 'Đã kết thúc'
              : paused
                ? 'Đang phục hồi'
                : 'Phiên mẫu · 2 người'}
          </span>
          <span className="ck-time">
            <Icon name="clock" size={16} />
            {phase === 'selecting' ? '01:00' : '08:24'}
          </span>
        </div>
        {stage !== 'ended' && toolButtons}
      </header>
      {stage === 'ended' ? (
        <SessionSummary
          phase={phase}
          scenarioTitle={scenario.vietnameseTitle}
          outcomes={outcomes}
          note={note}
          noteStatus={noteStatus}
          saved={saved}
          onHome={onHome}
        />
      ) : (
        <>
          {paused && (
            <div className="ck-recovery" role="status">
              <Icon name="clock" size={17} />
              <span>
                Chờ Haru kết nối lại · Còn 04:32 (mẫu). Thao tác chung tạm dừng.
              </span>
            </div>
          )}
          <main
            className={`ck-workspace ${panel ? '' : 'ck-workspace--wide'}`}
            aria-label="Phòng luyện hội thoại"
          >
            <aside className="ck-participants" aria-label="Hai người luyện">
              <ParticipantVideo
                name="Haru"
                self={false}
                camera={false}
                paused={paused}
              />
              <ParticipantVideo
                name="Minh Anh"
                self
                camera={camera}
                paused={false}
              />
              <span className="ck-private-caption">
                <Icon name="lock" size={12} />
                Không ghi âm / ghi hình
              </span>
            </aside>
            <section className="ck-scenario" aria-label="Thẻ tình huống">
              <div className="ck-scenario-toolbar">
                <span>
                  <Icon name="cards" size={16} />
                  {controller
                    ? 'Bạn đang điều khiển'
                    : 'Bạn luyện đang điều khiển'}
                </span>
                {!controller && (
                  <button
                    className="ck-text-button"
                    disabled={paused}
                    onClick={() => setController(true)}
                  >
                    Lấy quyền điều khiển
                  </button>
                )}
                <span className="ck-level">
                  {phase === 'selecting'
                    ? 'Chọn trong 60 giây'
                    : 'N4 · Đời sống'}
                </span>
              </div>
              <div
                className="ck-scenario-scroll"
                tabIndex={0}
                aria-label="Nội dung tình huống"
              >
                {stage === 'sharing' && (
                  <div className="ck-sharing">
                    <Icon name="screen" size={30} />
                    <strong>Haru đang chia sẻ · mẫu</strong>
                    <span>Nội dung chia sẻ màn hình</span>
                  </div>
                )}
                {contentPhase === 'selecting' ? (
                  <DeckPicker
                    decks={decks}
                    disabled={paused || !controller}
                    onSelect={() => advancePhase('drawing')}
                  />
                ) : contentPhase === 'drawing' ? (
                  <CardTable
                    count={scenarios.length}
                    used={used}
                    disabled={paused || !controller}
                    onDraw={(index) => {
                      setCardIndex(index);
                      setRoleIndex(0);
                      setTranslated(false);
                      advancePhase('practice');
                    }}
                  />
                ) : contentPhase === 'exhausted' ? (
                  <div className="ck-empty">
                    <Icon name="check" size={38} />
                    <h2>Đã đi hết bộ tình huống.</h2>
                    <p>
                      Hai bạn vẫn có thể trò chuyện hoặc rời phòng để xem tổng
                      kết.
                    </p>
                  </div>
                ) : (
                  <RoleCard
                    scenario={scenario}
                    roleIndex={roleIndex}
                    translated={translated}
                    onTranslate={() => setTranslated(!translated)}
                    longContent={longContent}
                  />
                )}
              </div>
              {contentPhase === 'practice' && (
                <div className="ck-scenario-actions">
                  <IconButton
                    name="swap"
                    label="Đề nghị đổi vai"
                    disabled={paused || !!consent}
                    onClick={() =>
                      setConsent({ action: 'swap', incoming: false })
                    }
                  />
                  <button
                    type="button"
                    className="ck-text-button"
                    aria-label="Bỏ qua tình huống"
                    title="Bỏ qua tình huống"
                    disabled={paused || !!consent}
                    onClick={() =>
                      setConsent({ action: 'skip', incoming: false })
                    }
                  >
                    Bỏ qua
                  </button>
                  <Button
                    variant="primary"
                    disabled={paused || !!consent}
                    onClick={() =>
                      setConsent({ action: 'complete', incoming: false })
                    }
                  >
                    Hoàn thành và tiếp tục <Icon name="arrow" size={17} />
                  </Button>
                </div>
              )}
              {consent && (
                <ConsentBanner
                  consent={consent}
                  scenarioTitle={scenario.vietnameseTitle}
                  onRespond={respond}
                  onCancel={() => setConsent(null)}
                />
              )}
            </section>
            {panel && (
              <PrivateTools
                panel={panel}
                contentPhase={contentPhase}
                knowledge={knowledge}
                saved={saved}
                note={note}
                noteStatus={noteStatus}
                onClose={closePanel}
                onToggleSaved={toggleSaved}
                onNoteChange={(value) => {
                  setNote(value);
                  setNoteStatus('draft');
                }}
                onNoteSave={() => setNoteStatus('saved')}
              />
            )}
          </main>
          <footer className="ck-callbar">
            <span>
              <Icon name="lock" size={14} />
              Phòng riêng
            </span>
            <div className="ck-device-controls">
              <IconButton
                name="mic"
                label={mic ? 'Tắt micro' : 'Bật micro'}
                pressed={mic}
                onClick={() => {
                  setMic(!mic);
                  setFeedback('Micro được mô phỏng, không truy cập thiết bị.');
                }}
              />
              <IconButton
                name="camera"
                label={camera ? 'Tắt camera' : 'Bật camera'}
                pressed={camera}
                onClick={() => {
                  setCamera(!camera);
                  setFeedback('Camera được mô phỏng, không truy cập thiết bị.');
                }}
              />
              <IconButton
                name="screen"
                label="Chia sẻ màn hình"
                disabled={paused || stage === 'sharing'}
                onClick={() =>
                  setFeedback(
                    'Chia sẻ chưa kết nối. Dùng trạng thái Chia sẻ màn hình để xem bản mẫu.',
                  )
                }
              />
            </div>
            <Button variant="danger" onClick={() => setLeave(true)}>
              <Icon name="exit" size={17} />
              Rời phòng
            </Button>
          </footer>
        </>
      )}
      {feedback && (
        <div className="ck-feedback" role="status">
          <span>{feedback}</span>
          <IconButton
            name="close"
            label="Đóng thông báo"
            onClick={() => setFeedback('')}
          />
        </div>
      )}
      {leave && (
        <LeaveDialog onCancel={() => setLeave(false)} onConfirm={endSession} />
      )}
    </>
  );
}
