import { Icon } from '../../../components/ui/controls.jsx';
import { Badge, Card } from '../../../components/ui/surfaces.jsx';

/** @param {{decks: Array<{title: string, level: string, count: number, japaneseTitle?: string}>, disabled: boolean, onSelect: () => void, previewOnly?: boolean}} props */
export function DeckPicker({ decks, disabled, onSelect, previewOnly = false }) {
  return (
    <>
      <div className="ck-deck-list">
        {decks.map((deck, index) => (
          <Card
            key={deck.title}
            className="ck-conversation-set"
            interactive={!previewOnly}
            disabled={disabled || index !== 0}
            onClick={onSelect}
          >
            <Badge>{deck.level}</Badge>
            <div className="ck-deck-cover" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <h3 lang={deck.japaneseTitle ? 'ja' : undefined}>
              {deck.japaneseTitle ?? deck.title}
            </h3>
            {deck.japaneseTitle && <p>{deck.title}</p>}
            <div className="ck-deck-card-footer">
              <strong>{deck.count} tình huống</strong>
              <Icon name="arrow" size={16} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
