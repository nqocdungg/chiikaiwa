import { Button, Icon } from '../../../components/ui/controls.jsx';
import { KnowledgeItem } from './KnowledgeItem.jsx';

/** @param {{panel: import('../../../demo/kaiwa-fixtures.js').Panel, contentPhase: import('../../../demo/kaiwa-fixtures.js').Phase, hints?: string[], knowledge: (typeof import('../../../demo/kaiwa-fixtures.js').knowledge | import('../session-learning-api.js').HintKnowledge[]), saved: string[], note: string, noteStatus: string, noteError?: string, noteDemo?: boolean, hintsPending?: boolean, hintsError?: string, personalPending?: boolean, personalError?: string, knowledgePending?: Set<string>, knowledgeErrors?: Record<string, string>, onClose: () => void, onToggleSaved: (id: string) => void, onNoteChange: (value: string) => void, onNoteSave: () => void, onRetryHints?: () => void, onRetryPersonal?: () => void, onResolveNoteConflict?: () => void, liveContent?: import('react').ReactNode}} props */
export function PrivateTools({
  panel,
  contentPhase,
  hints = [],
  knowledge,
  saved,
  note,
  noteStatus,
  noteError = '',
  noteDemo = false,
  hintsPending = false,
  hintsError = '',
  personalPending = false,
  personalError = '',
  knowledgePending = new Set(),
  knowledgeErrors = {},
  onClose,
  onToggleSaved,
  onNoteChange,
  onNoteSave,
  onRetryHints,
  onRetryPersonal,
  onResolveNoteConflict,
  liveContent,
}) {
  return (
    <aside
      id="ck-private-panel"
      className={`ck-panel ${panel === 'chat' ? 'ck-panel--chat' : ''}`}
      aria-label="Công cụ riêng"
    >
      <header>
        <h2>
          {panel === 'hints'
            ? 'Gợi ý & kiến thức'
            : panel === 'note'
              ? 'Ghi chú riêng'
              : 'Chat'}
        </h2>
        <Button variant="ghost" size="compact" onClick={onClose}>
          Thu gọn <Icon name="close" size={16} />
        </Button>
      </header>
      <div
        className="ck-panel-scroll"
        tabIndex={0}
        aria-label="Nội dung công cụ riêng"
      >
        {panel === 'chat' && liveContent ? (
          liveContent
        ) : panel === 'hints' ? (
          <HintsPanel
            contentPhase={contentPhase}
            hints={hints}
            knowledge={knowledge}
            saved={saved}
            pending={hintsPending}
            error={hintsError}
            knowledgePending={knowledgePending}
            knowledgeErrors={knowledgeErrors}
            onToggleSaved={onToggleSaved}
            onRetry={onRetryHints}
          />
        ) : panel === 'note' ? (
          <NotePanel
            note={note}
            status={noteStatus}
            error={noteError}
            demo={noteDemo}
            pending={personalPending}
            loadError={personalError}
            onChange={onNoteChange}
            onSave={onNoteSave}
            onRetry={onRetryPersonal}
            onResolveConflict={onResolveNoteConflict}
          />
        ) : (
          <div className="ck-empty ck-chat-empty">
            <Icon name="chat" size={30} />
            <p>Chưa có tin nhắn.</p>
            <small>
              Chat chưa kết nối trong bản demo. Tin nhắn không lưu vào lịch sử.
            </small>
            <label htmlFor="ck-chat">Tin nhắn</label>
            <input id="ck-chat" disabled placeholder="Chưa kết nối" />
          </div>
        )}
      </div>
    </aside>
  );
}

/** @param {{contentPhase: import('../../../demo/kaiwa-fixtures.js').Phase, hints: string[], knowledge: (typeof import('../../../demo/kaiwa-fixtures.js').knowledge | import('../session-learning-api.js').HintKnowledge[]), saved: string[], pending: boolean, error: string, knowledgePending: Set<string>, knowledgeErrors: Record<string, string>, onToggleSaved: (id: string) => void, onRetry?: () => void}} props */
function HintsPanel({
  contentPhase,
  hints,
  knowledge,
  saved,
  pending,
  error,
  knowledgePending,
  knowledgeErrors,
  onToggleSaved,
  onRetry,
}) {
  if (pending)
    return (
      <p className="ck-muted" role="status">
        Đang tải gợi ý…
      </p>
    );
  if (error)
    return (
      <div className="ck-panel-status">
        <p className="ck-error" role="alert">
          {error}
        </p>
        {onRetry && (
          <Button size="compact" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </div>
    );
  if (contentPhase === 'selecting' || contentPhase === 'drawing')
    return (
      <div className="ck-empty">
        <Icon name="book" size={30} />
        <p>Gợi ý sẽ xuất hiện sau khi bốc thẻ.</p>
      </div>
    );
  if (!hints.length && !knowledge.length)
    return (
      <div className="ck-empty">
        <Icon name="book" size={30} />
        <p>Tình huống này chưa có gợi ý hoặc kiến thức.</p>
      </div>
    );
  return (
    <>
      {hints.length > 0 && (
        <section className="ck-hints" aria-labelledby="ck-hints-title">
          <h3 id="ck-hints-title">Gợi ý diễn đạt</h3>
          <ul>
            {hints.map((hint, index) => (
              <li key={`${index}:${hint}`}>{hint}</li>
            ))}
          </ul>
        </section>
      )}
      {knowledge.length > 0 && (
        <h3 className="ck-panel-section-title">Kiến thức trong tình huống</h3>
      )}
      {knowledge.map((item) => (
        <KnowledgeItem
          key={item.id}
          item={item}
          saved={'isSaved' in item ? item.isSaved : saved.includes(item.id)}
          pending={knowledgePending.has(item.id)}
          error={knowledgeErrors[item.id]}
          onToggle={() => onToggleSaved(item.id)}
        />
      ))}
    </>
  );
}

/** @param {{note: string, status: string, error: string, demo: boolean, pending: boolean, loadError: string, onChange: (value: string) => void, onSave: () => void, onRetry?: () => void, onResolveConflict?: () => void}} props */
function NotePanel({
  note,
  status,
  error,
  demo,
  pending,
  loadError,
  onChange,
  onSave,
  onRetry,
  onResolveConflict,
}) {
  if (pending)
    return (
      <p className="ck-muted" role="status">
        Đang tải ghi chú…
      </p>
    );
  if (loadError && status === 'error' && !note)
    return (
      <div className="ck-panel-status">
        <p className="ck-error" role="alert">
          {loadError}
        </p>
        {onRetry && (
          <Button size="compact" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </div>
    );
  return (
    <div className="ck-note">
      <label htmlFor="ck-note">Chỉ mình bạn thấy</label>
      <textarea
        id="ck-note"
        value={note}
        maxLength={10000}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Từ mới, câu muốn thử lại…"
      />
      <span
        role="status"
        className={
          status === 'error' || status === 'conflict' ? 'ck-error' : 'ck-muted'
        }
      >
        {status === 'error' || status === 'conflict'
          ? error || 'Chưa lưu được ghi chú. Bản nhập vẫn được giữ.'
          : status === 'saving'
            ? 'Đang lưu…'
            : status === 'saved'
              ? demo
                ? 'Đã lưu trong bản demo · Chưa lưu lên server.'
                : note
                  ? 'Đã lưu riêng tư.'
                  : 'Chưa có ghi chú.'
              : 'Bản nhập chưa lưu. Nhấn Lưu ghi chú.'}
      </span>
      <Button
        onClick={onSave}
        disabled={status !== 'error' && status !== 'draft'}
      >
        {status === 'error' ? 'Thử lưu lại' : 'Lưu ghi chú'}
      </Button>
      {status === 'conflict' && onResolveConflict && (
        <Button onClick={onResolveConflict}>Tải phiên bản mới</Button>
      )}
    </div>
  );
}
