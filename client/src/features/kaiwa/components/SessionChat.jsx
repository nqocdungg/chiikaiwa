import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/controls.jsx';

/** @param {{messages: {id: string, sender: string, text: string}[], members: import('../session-api.js').SessionMember[], identity: string, connected: boolean, draft: string, sending: boolean, onDraft: (text: string) => void, onSend: (text: string) => Promise<void>}} props */
export function SessionChat({
  messages,
  members,
  identity,
  connected,
  draft,
  sending,
  onDraft,
  onSend,
}) {
  const [error, setError] = useState('');
  const log = useRef(/** @type {HTMLDivElement|null} */ (null));
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);
  async function send() {
    if (sending) return;
    setError('');
    try {
      await onSend(draft);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Chưa gửi được tin nhắn.',
      );
    }
  }
  return (
    <div className="ck-session-chat">
      <div
        className="ck-chat-log"
        ref={log}
        role="log"
        aria-label="Tin nhắn trong phiên"
        aria-live="polite"
      >
        {!messages.length && <p className="ck-muted">Chưa có tin nhắn.</p>}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`ck-chat-message ${message.sender === identity ? 'ck-chat-message--self' : ''}`}
          >
            <small>
              {message.sender === identity
                ? 'Bạn'
                : members.find((member) => member.actorKey === message.sender)
                    ?.displayName}
            </small>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      <p className="ck-chat-notice">
        Tin nhắn chỉ có trong phiên này, không khôi phục lịch sử khi vào lại.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="ck-sr-only" htmlFor="ck-chat-text">
          Tin nhắn
        </label>
        <textarea
          id="ck-chat-text"
          value={draft}
          disabled={sending}
          onChange={(event) => onDraft(event.target.value)}
          placeholder="Nhắn một câu…"
        />
        <Button
          variant="primary"
          size="compact"
          onClick={() => {
            void send();
          }}
          disabled={!connected || sending || !draft.trim()}
        >
          {sending ? 'Đang gửi…' : 'Gửi'}
        </Button>
      </form>
      {!connected && <p role="status">Chat đang chờ kết nối.</p>}
      {error && (
        <p role="alert" className="ck-error">
          {error}
        </p>
      )}
    </div>
  );
}
