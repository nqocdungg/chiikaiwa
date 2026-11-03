import { Button, Icon, IconButton } from '../../../components/ui/controls.jsx';
import { KnowledgeItem } from './KnowledgeItem.jsx';

/** @param {{panel: import('../../../demo/kaiwa-fixtures.js').Panel, contentPhase: import('../../../demo/kaiwa-fixtures.js').Phase, knowledge: typeof import('../../../demo/kaiwa-fixtures.js').knowledge, saved: string[], note: string, noteStatus: string, onClose: () => void, onToggleSaved: (id: string) => void, onNoteChange: (value: string) => void, onNoteSave: () => void}} props */
export function PrivateTools({
  panel,
  contentPhase,
  knowledge,
  saved,
  note,
  noteStatus,
  onClose,
  onToggleSaved,
  onNoteChange,
  onNoteSave,
}) {
  return (
    <aside
      id="ck-private-panel"
      className="ck-panel"
      aria-label="Công cụ riêng"
    >
      <header>
        <h2>
          {panel === 'hints'
            ? 'Gợi ý'
            : panel === 'note'
              ? 'Ghi chú riêng'
              : 'Chat trong phiên'}
        </h2>
        <IconButton name="close" label="Ẩn công cụ riêng" onClick={onClose} />
      </header>
      <div
        className="ck-panel-scroll"
        tabIndex={0}
        aria-label="Nội dung công cụ riêng"
      >
        {panel === 'hints' ? (
          contentPhase === 'selecting' || contentPhase === 'drawing' ? (
            <div className="ck-empty">
              <Icon name="book" size={30} />
              <p>Gợi ý sẽ xuất hiện sau khi bốc thẻ.</p>
            </div>
          ) : (
            <>
              {knowledge.map((item) => (
                <KnowledgeItem
                  key={item.id}
                  item={item}
                  saved={saved.includes(item.id)}
                  onToggle={() => onToggleSaved(item.id)}
                />
              ))}
              <span className="ck-save-status" role="status">
                {saved.length > 0
                  ? `Đã lưu ${saved.length} mục · mẫu`
                  : 'Bấm sao để lưu kiến thức.'}
              </span>
            </>
          )
        ) : panel === 'note' ? (
          <div className="ck-note">
            <label htmlFor="ck-note">Chỉ mình bạn thấy</label>
            <textarea
              id="ck-note"
              value={note}
              onChange={(event) => {
                onNoteChange(event.target.value);
              }}
              placeholder="Từ mới, câu muốn thử lại…"
            />
            <span
              role="status"
              className={noteStatus === 'error' ? 'ck-error' : 'ck-muted'}
            >
              {noteStatus === 'error'
                ? 'Chưa lưu được ghi chú. Bản nhập vẫn được giữ.'
                : noteStatus === 'saved'
                  ? 'Đã lưu trong bản demo · Chưa lưu lên server'
                  : 'Bản nhập trong demo · Chưa lưu'}
            </span>
            <Button onClick={onNoteSave}>
              {noteStatus === 'error'
                ? 'Thử lưu lại · mẫu'
                : 'Lưu ghi chú · mẫu'}
            </Button>
          </div>
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
