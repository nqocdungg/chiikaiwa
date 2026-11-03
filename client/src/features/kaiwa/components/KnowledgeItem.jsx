import { IconButton } from '../../../components/ui/controls.jsx';

/** @param {{item: (typeof import('../../../demo/kaiwa-fixtures.js').knowledge)[number], saved: boolean, onToggle: () => void}} props */
export function KnowledgeItem({ item, saved, onToggle }) {
  return (
    <article className="ck-knowledge">
      <IconButton
        name="star"
        label={`${saved ? 'Bỏ lưu' : 'Lưu'} ${item.word}`}
        pressed={saved}
        onClick={() => onToggle()}
      />
      <h3 lang="ja">{item.word}</h3>
      <span>{item.reading}</span>
      <p>{item.meaning}</p>
      <p className="ck-example" lang="ja">
        {item.example}
      </p>
    </article>
  );
}
