import { useState } from 'react';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Friends } from '../../components/Friends.jsx';
import { knowledge } from '../../demo/kaiwa-fixtures.js';

/** @param {{phase: import('../../demo/kaiwa-fixtures.js').Phase, scenarioTitle: string, outcomes: {title: string, result: string}[], note: string, noteStatus: string, saved: string[], onHome: () => void}} props */
export function SessionSummary({
  phase,
  scenarioTitle,
  outcomes,
  note,
  noteStatus,
  saved,
  onHome,
}) {
  const [message, setMessage] = useState('');
  return (
    <main className="ck-summary">
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
            {noteStatus === 'error'
              ? 'Chưa lưu được ghi chú.'
              : noteStatus === 'saved'
                ? 'Đã lưu trong bản demo · Chưa lưu lên server'
                : 'Bản nhập thử · Chưa lưu'}
          </small>
        </section>
        <div className="ck-actions">
          {phase !== 'selecting' && (
            <Button
              variant="primary"
              onClick={() =>
                setMessage(
                  'Luồng học chủ đề, flashcard và quiz chưa kết nối trong bản demo.',
                )
              }
            >
              Học tiếp chủ đề <Icon name="book" size={17} />
            </Button>
          )}
          <Button onClick={onHome}>Về trang chính</Button>
        </div>
        {message && <p role="status">{message}</p>}
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
