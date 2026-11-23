import { IconButton } from '../../../components/ui/controls.jsx';

/** @param {{item: (typeof import('../../../demo/kaiwa-fixtures.js').knowledge)[number] | import('../session-learning-api.js').HintKnowledge, saved: boolean, pending?: boolean, error?: string, onToggle: () => void}} props */
export function KnowledgeItem({
  item,
  saved,
  pending = false,
  error = '',
  onToggle,
}) {
  const expression = 'expression' in item ? item.expression : item.word;
  const example =
    'examples' in item ? item.examples[0]?.japanese : item.example;
  return (
    <article className="ck-knowledge">
      <IconButton
        name="star"
        label={`${saved ? 'Bỏ lưu' : 'Lưu'} ${expression}`}
        pressed={saved}
        disabled={pending}
        onClick={() => onToggle()}
      />
      <h3 lang="ja">{expression}</h3>
      <span>{item.reading}</span>
      <p>{item.meaning}</p>
      {example && (
        <p className="ck-example" lang="ja">
          {example}
        </p>
      )}
      {pending && (
        <span className="ck-save-status" role="status">
          Đang cập nhật…
        </span>
      )}
      {error && (
        <span className="ck-error" role="alert">
          {error}
        </span>
      )}
    </article>
  );
}
