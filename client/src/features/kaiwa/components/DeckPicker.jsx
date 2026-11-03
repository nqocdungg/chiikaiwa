import { Icon } from '../../../components/ui/controls.jsx';

/** @param {{decks: typeof import('../../../demo/kaiwa-fixtures.js').decks, disabled: boolean, onSelect: () => void}} props */
export function DeckPicker({ decks, disabled, onSelect }) {
  return (
    <>
      <div className="ck-section-heading">
        <h2>Hôm nay mình nói về…</h2>
        <p>Chọn một bộ chủ đề.</p>
      </div>
      <div className="ck-deck-list">
        {decks.map((deck, index) => (
          <button
            type="button"
            key={deck.title}
            disabled={disabled || index !== 0}
            title={
              index === 0
                ? 'Chọn bộ cà phê'
                : 'Chỉ minh họa, chưa có dữ liệu tình huống'
            }
            onClick={onSelect}
          >
            <Icon name="book" />
            <span>
              <strong>{deck.title}</strong>
              <small>
                {deck.level} · {deck.count} tình huống
                {index === 0 ? '' : ' · Minh họa'}
              </small>
            </span>
            <Icon name="arrow" size={17} />
          </button>
        ))}
      </div>
    </>
  );
}
