import { useRef, useState } from 'react';
import { ConnectionState, Track } from 'livekit-client';
import { Button, Icon, IconButton } from '../../components/ui/controls.jsx';
import { PillMotion } from '../../components/ui/PillMotion.jsx';
import { CardTable } from './components/CardTable.jsx';
import { ConsentBanner } from './components/ConsentBanner.jsx';
import { DeckPicker } from './components/DeckPicker.jsx';
import { LeaveDialog } from './components/LeaveDialog.jsx';
import { ParticipantVideo } from './components/ParticipantVideo.jsx';
import { PrivateTools } from './components/PrivateTools.jsx';
import { RoleCard } from './components/RoleCard.jsx';
import { SessionChat } from './components/SessionChat.jsx';
import { ConnectionRoom } from './components/ConnectionRoom.jsx';
import { SafetyActionDialog } from '../safety/SafetyActionDialog.jsx';
import { SessionSummary } from '../session-summary/SessionSummary.jsx';
import roomLogo from '../../assets/brand/chii-logo.svg';

/** @typedef {import('../../demo/kaiwa-fixtures.js').Stage} Stage */
/** @typedef {import('../../demo/kaiwa-fixtures.js').Phase} Phase */
/** @typedef {import('../../demo/kaiwa-fixtures.js').Panel} Panel */
/** @typedef {{action: 'swap'|'skip'|'complete', incoming: boolean}|null} Consent */

/** @param {{initialStage: Stage, initialPanel: Panel|null, longContent: boolean, initialNoteError: boolean, showDemoTools: boolean, onHome: () => void, live?: ReturnType<typeof import('./use-session-room.js').useSessionRoom>, tools?: ReturnType<typeof import('./use-session-tools.js').useSessionTools>, demoData?: typeof import('../../demo/kaiwa-fixtures.js')}} props */
export function KaiwaRoom({
  initialStage,
  initialPanel,
  longContent,
  initialNoteError,
  showDemoTools,
  onHome,
  live,
  tools,
  demoData,
}) {
  const {
    decks = [],
    knowledge = [],
    scenarios = [],
    stages = {},
  } = demoData ?? {};
  const [demoStage, setStage] = useState(initialStage);
  const stage = live
    ? live.session?.status === 'reconnecting'
      ? 'reconnecting'
      : 'selecting'
    : demoStage;
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
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [lastRead, setLastRead] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const sendingRef = useRef(false);
  const lastMessageId = live?.messages.at(-1)?.id ?? '';
  const media = live?.media;
  const identity = media?.room.localParticipant.identity ?? '';
  const selfMember = live?.session?.members.find(
    (member) => member.actorKey === identity,
  );
  const partner = live?.session?.members.find(
    (member) => member.actorKey !== identity,
  );
  const remote =
    partner && media?.room.remoteParticipants.get(partner.actorKey);
  const connected = media?.room.state === ConnectionState.Connected;
  const actualMic = live
    ? !!media?.room.localParticipant.isMicrophoneEnabled
    : mic;
  const actualCamera = live
    ? !!media?.room.localParticipant.isCameraEnabled
    : camera;
  const triggerRefs = useRef(
    /** @type {Record<string, HTMLButtonElement|null>} */ ({}),
  );
  const scenario = scenarios[cardIndex];
  const paused = stage === 'reconnecting' || (!!live && !connected);
  const contentPhase =
    live && !demoData
      ? live.session?.currentCard
        ? 'practice'
        : live.session?.deckVersionId
          ? 'drawing'
          : 'selecting'
      : stage === 'exhausted'
        ? 'exhausted'
        : phase;
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
    if (next === 'chat' || panel === 'chat') setLastRead(lastMessageId);
    setPanel(panel === next ? null : next);
  }
  function closePanel() {
    if (panel === 'chat') setLastRead(lastMessageId);
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
    <div className="ck-tools ck-motion-group" aria-label="Công cụ riêng">
      <PillMotion />
      {
        /** @type {[Panel,string,string][]} */ ([
          ['hints', 'Kiến thức', 'book'],
          ['note', 'Ghi chú', 'note'],
          ['chat', 'Chat', 'chat'],
        ]).map(([key, label, icon]) => (
          <Button
            variant="ghost"
            size="compact"
            className={`ck-room-tool ${panel === key ? 'ck-room-tool--active' : ''}`}
            buttonRef={(element) => {
              triggerRefs.current[key] = element;
            }}
            key={key}
            aria-label={
              key === 'chat' &&
              live &&
              panel !== 'chat' &&
              lastMessageId !== lastRead
                ? `${label} · tin mới`
                : label
            }
            aria-pressed={panel === key}
            aria-controls={panel === key ? 'ck-private-panel' : undefined}
            onClick={() => togglePanel(key)}
          >
            <Icon name={icon} />
            {label}
            {key === 'chat' &&
              live &&
              panel !== 'chat' &&
              lastMessageId !== lastRead && (
                <span className="ck-chat-unread" aria-hidden="true">
                  Mới
                </span>
              )}
          </Button>
        ))
      }
    </div>
  );
  const deviceControls = (
    <div className="ck-device-controls" aria-label="Thiết bị của bạn">
      <Button
        variant="ghost"
        size="compact"
        leadingIcon={<Icon name={actualMic ? 'mic' : 'micOff'} />}
        loading={media?.pendingDevices.has('microphone')}
        aria-label="Micro"
        aria-pressed={actualMic}
        disabled={
          !!live && (!connected || media?.pendingDevices.has('microphone'))
        }
        onClick={() => {
          if (live) {
            void media?.setDevice('microphone', !actualMic);
            return;
          }
          setMic(!mic);
        }}
      />
      <Button
        variant="ghost"
        size="compact"
        leadingIcon={<Icon name={actualCamera ? 'camera' : 'cameraOff'} />}
        loading={media?.pendingDevices.has('camera')}
        aria-label="Camera"
        aria-pressed={actualCamera}
        disabled={!!live && (!connected || media?.pendingDevices.has('camera'))}
        onClick={() => {
          if (live) {
            void media?.setDevice('camera', !actualCamera);
            return;
          }
          setCamera(!camera);
        }}
      />
    </div>
  );
  if (
    live &&
    (!live.session || live.session.status === 'preparing' || !identity)
  ) {
    return <ConnectionRoom live={live} onHome={onHome} />;
  }
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
          className="ck-room-logo"
          aria-label="Về trang chính"
          onClick={() => (stage === 'ended' ? onHome() : setLeave(true))}
        >
          <img src={roomLogo} alt="" width="42" height="46" />
        </button>
        <div className="ck-room-heading">
          <h1>{stage === 'ended' ? 'Tổng kết phiên' : 'Phòng Kaiwa'}</h1>
          <span className={`ck-status ${paused ? 'ck-status--warning' : ''}`}>
            {stage === 'ended'
              ? 'Đã kết thúc'
              : paused
                ? 'Đang phục hồi'
                : live
                  ? `Đã kết nối ${Number(connected) + Number(!!remote)}/2`
                  : 'Đã kết nối 2/2'}
          </span>
        </div>
        <div className="ck-room-meta">
          <span>Thời lượng</span>
          <span className="ck-time">
            <Icon name="clock" size={16} />
            {live
              ? `${Math.floor((live.session?.activeDurationMs ?? 0) / 60000)}:${String(Math.floor((live.session?.activeDurationMs ?? 0) / 1000) % 60).padStart(2, '0')}`
              : phase === 'selecting'
                ? '01:00'
                : '08:24'}
          </span>
        </div>
        {stage !== 'ended' && (
          <div className="ck-room-actions">
            <Button
              variant="ghost"
              size="compact"
              leadingIcon={<Icon name="screen" />}
              disabled={!!live || paused || stage === 'sharing'}
              onClick={() =>
                setFeedback('Chia sẻ màn hình chưa kết nối trong bản xem thử.')
              }
            >
              Chia sẻ
            </Button>
            {toolButtons}
            {live?.session && partner ? (
              <Button
                variant="ghost"
                size="compact"
                leadingIcon={<Icon name="shield" size={18} />}
                onClick={() => setSafetyOpen(true)}
              >
                Báo cáo / Chặn
              </Button>
            ) : null}
            <Button
              variant="danger"
              size="compact"
              onClick={() => setLeave(true)}
            >
              Rời phòng
            </Button>
          </div>
        )}
      </header>
      {stage === 'ended' ? (
        <SessionSummary
          phase={phase}
          scenarioTitle={scenario.vietnameseTitle}
          outcomes={outcomes}
          note={note}
          noteStatus={noteStatus}
          saved={saved}
          knowledge={knowledge}
          onHome={onHome}
        />
      ) : (
        <>
          {paused && (
            <div className="ck-recovery" role="status">
              <Icon name="clock" size={17} />
              <span>
                {live
                  ? `Đang chờ phục hồi kết nối${live.session?.reconnectUntil ? ` · Hạn ${new Date(live.session.reconnectUntil).toLocaleTimeString('vi-VN')}` : ''}. Thao tác chung tạm dừng.`
                  : 'Chờ Haru kết nối lại · Còn 04:32 (mẫu). Thao tác chung tạm dừng.'}
              </span>
            </div>
          )}
          <main
            className={`ck-workspace ${panel ? '' : 'ck-workspace--wide'}`}
            aria-label="Phòng luyện hội thoại"
          >
            <aside className="ck-participants" aria-label="Hai người luyện">
              <ParticipantVideo
                name={live ? (selfMember?.displayName ?? 'Bạn') : 'Minh Anh'}
                self
                camera={actualCamera}
                paused={!!live && !connected}
                videoTrack={
                  media?.room.localParticipant.getTrackPublication(
                    Track.Source.Camera,
                  )?.videoTrack
                }
                microphone={live ? actualMic : undefined}
              />
              {deviceControls}
              <ParticipantVideo
                name={live ? (partner?.displayName ?? 'Bạn luyện') : 'Haru'}
                self={false}
                camera={live ? !!remote?.isCameraEnabled : false}
                paused={live ? !connected || !remote : paused}
                videoTrack={
                  remote?.getTrackPublication(Track.Source.Camera)?.videoTrack
                }
                audioTrack={
                  remote?.getTrackPublication(Track.Source.Microphone)
                    ?.audioTrack
                }
                microphone={live ? !!remote?.isMicrophoneEnabled : undefined}
              />
              <span className="ck-private-caption">
                <Icon name="lock" size={12} />
                Không ghi âm / ghi hình
              </span>
            </aside>
            <section className="ck-scenario" aria-label="Thẻ tình huống">
              <div className="ck-scenario-header">
                {contentPhase === 'selecting' && (
                  <div className="ck-section-heading">
                    <span className="ck-step-label">BƯỚC 1</span>
                    <h2>Chọn bộ hội thoại</h2>
                    <p>Chọn một bộ phù hợp với trình độ của hai bạn.</p>
                  </div>
                )}
                <div className="ck-scenario-toolbar">
                  <span>
                    <Icon name="cards" size={16} />
                    {(
                      live
                        ? live.session?.controllerKey === identity
                        : controller
                    )
                      ? 'Bạn đang điều khiển'
                      : 'Bạn luyện đang điều khiển'}
                  </span>
                  {!live && !controller && (
                    <button
                      className="ck-text-button"
                      disabled={paused}
                      onClick={() => setController(true)}
                    >
                      Lấy quyền điều khiển
                    </button>
                  )}
                  {contentPhase === 'selecting' && (
                    <span className="ck-level">
                      {live
                        ? `Còn ${Math.ceil((live.session?.selectionRemainingMs ?? 0) / 1000)} giây chọn bộ`
                        : phase === 'selecting'
                          ? 'Chọn trong 60 giây'
                          : 'N4 · Đời sống'}
                    </span>
                  )}
                </div>
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
                {live && !demoData ? (
                  <div className="ck-live-card">
                    {live.session?.currentCard ? (
                      <>
                        <h2>{live.session.currentCard.title}</h2>
                        <p>{live.session.currentCard.context}</p>
                        <h3>{live.session.currentCard.myRole}</h3>
                        <p>{live.session.currentCard.objective}</p>
                      </>
                    ) : (
                      <div className="ck-empty">
                        <Icon name="cards" size={38} />
                        <h3>
                          {live.session?.deckVersionId
                            ? 'Chưa có thẻ đang luyện'
                            : 'Chưa chọn bộ hội thoại'}
                        </h3>
                        <p>Hai bạn có thể trò chuyện trong khi chờ chọn thẻ.</p>
                      </div>
                    )}
                  </div>
                ) : contentPhase === 'selecting' ? (
                  <DeckPicker
                    decks={decks}
                    disabled={paused || !controller}
                    onSelect={() => advancePhase('drawing')}
                    previewOnly={!!live && !!demoData}
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
              {!live && contentPhase === 'practice' && (
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
                hints={tools?.hints}
                knowledge={tools?.knowledge ?? knowledge}
                saved={saved}
                note={tools?.note ?? note}
                noteStatus={tools?.noteStatus ?? noteStatus}
                noteError={tools?.noteError}
                noteDemo={!tools}
                hintsPending={tools?.hintsPending}
                hintsError={tools?.hintsError}
                personalPending={tools?.personalPending}
                personalError={tools?.personalError}
                knowledgePending={tools?.knowledgePending}
                knowledgeErrors={tools?.knowledgeErrors}
                onClose={closePanel}
                onToggleSaved={(id) => {
                  if (tools) {
                    void tools.toggleKnowledge(id);
                    return;
                  }
                  toggleSaved(id);
                }}
                onNoteChange={(value) => {
                  if (tools) {
                    tools.setNote(value);
                    return;
                  }
                  setNote(value);
                  setNoteStatus('draft');
                }}
                onNoteSave={() => {
                  if (tools) {
                    void tools.saveNote();
                    return;
                  }
                  setNoteStatus('saved');
                }}
                onRetryHints={tools?.reloadHints}
                onRetryPersonal={() => {
                  void tools?.reloadPersonal();
                }}
                onResolveNoteConflict={() => {
                  void tools?.resolveNoteConflict();
                }}
                liveContent={
                  live && panel === 'chat' ? (
                    <SessionChat
                      messages={live.messages}
                      members={live.session?.members ?? []}
                      identity={identity}
                      connected={connected}
                      draft={chatDraft}
                      onDraft={setChatDraft}
                      sending={sendingChat}
                      onSend={async (text) => {
                        if (sendingRef.current) return;
                        if (!media) throw new Error('Chưa kết nối chat.');
                        sendingRef.current = true;
                        setSendingChat(true);
                        try {
                          await media.send(text);
                          setChatDraft((current) =>
                            current === text ? '' : current,
                          );
                        } finally {
                          sendingRef.current = false;
                          setSendingChat(false);
                        }
                      }}
                    />
                  ) : undefined
                }
              />
            )}
          </main>
          {live && (
            <div className="ck-room-notices" aria-live="polite">
              {[
                live.error,
                live.mediaError,
                ...(media?.deviceErrors.values() ?? []),
              ]
                .filter(Boolean)
                .map((message, index) => (
                  <p className="ck-error" key={index}>
                    {message}
                  </p>
                ))}
              {!connected && (
                <Button
                  disabled={live.connecting || live.leaving}
                  onClick={() => {
                    void live.connect();
                  }}
                >
                  Thử lại kết nối
                </Button>
              )}
              {media && !media.room.canPlaybackAudio && (
                <Button
                  onClick={() => {
                    void media.room
                      .startAudio()
                      .catch(() =>
                        setFeedback('Chưa phát được âm thanh. Hãy thử lại.'),
                      );
                  }}
                >
                  Bật âm thanh cuộc gọi
                </Button>
              )}
            </div>
          )}
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
      {safetyOpen && live?.session && partner ? (
        <SafetyActionDialog
          open={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          sessionId={live.session.id}
          partner={partner}
          inActiveSession
          leaving={live.leaving}
          isGuest={identity.toLowerCase().startsWith('guest:')}
          onLeaveRoom={() => {
            setSafetyOpen(false);
            setLeave(true);
          }}
          onReported={() => {
            setFeedback(
              'Báo cáo đã được tiếp nhận. Thao tác này không tự chặn đối tác.',
            );
          }}
          onBlocked={() => {
            setSafetyOpen(false);
            setFeedback('Đã chặn đối tác. Đang đồng bộ trạng thái phiên…');
            live.refresh();
          }}
        />
      ) : null}
      {leave && (
        <LeaveDialog
          onCancel={() => setLeave(false)}
          onConfirm={
            live
              ? () => {
                  void live.leave();
                }
              : endSession
          }
          pending={live?.leaving}
          hasPendingNote={Boolean(tools?.getPendingNote())}
          partnerName={live ? (partner?.displayName ?? 'bạn luyện') : undefined}
        />
      )}
    </>
  );
}
