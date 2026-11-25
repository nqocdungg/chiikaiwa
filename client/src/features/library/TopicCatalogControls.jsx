import { useEffect, useId, useRef, useState } from 'react';
import { Button, Icon } from '../../components/ui/controls.jsx';

/** @typedef {'level'|'search'} CatalogControl */

/** @param {{level: string, levels: string[], query: string, onChange: (level: string, query: string) => void}} props */
export function TopicCatalogControls({ level, levels, query, onChange }) {
  const [expanded, setExpanded] = useState(
    /** @type {CatalogControl|null} */ (null),
  );
  const controls = useRef(/** @type {HTMLDivElement|null} */ (null));
  const levelButton = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const searchButton = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const input = useRef(/** @type {HTMLInputElement|null} */ (null));
  const levelId = useId();
  const searchId = useId();
  const levelOpen = expanded === 'level';
  const searchOpen = expanded === 'search';
  const levelLabel = level || 'Tất cả';

  useEffect(() => {
    if (!expanded) return;
    if (expanded === 'search') input.current?.focus();

    /** @param {PointerEvent} event */
    function dismissOutside(event) {
      if (
        event.target instanceof Node &&
        !controls.current?.contains(event.target)
      ) {
        setExpanded(null);
      }
    }

    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [expanded]);

  /** @param {CatalogControl} control */
  function close(control) {
    setExpanded(null);
    (control === 'level' ? levelButton : searchButton).current?.focus();
  }

  return (
    <div
      className="ck-topic-island__controls"
      ref={controls}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.preventDefault();
          close(expanded);
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setExpanded(null);
        }
      }}
    >
      <div className="ck-topic-morph-row">
        <div
          className="ck-topic-morph ck-topic-morph--level"
          data-expanded={levelOpen}
        >
          <Button
            variant="ghost"
            size="compact"
            buttonRef={levelButton}
            className="ck-topic-morph__trigger"
            aria-label={'Lọc trình độ: ' + levelLabel}
            aria-expanded={levelOpen}
            aria-controls={levelId}
            onClick={() => setExpanded(levelOpen ? null : 'level')}
          >
            {levelOpen ? (
              <Icon name="close" size={17} />
            ) : (
              <>
                <span>{levelLabel}</span>
                <span className="ck-topic-morph__caret" aria-hidden="true" />
              </>
            )}
          </Button>
          <div
            className="ck-topic-morph__body ck-topic-morph__levels"
            role="group"
            aria-label="Trình độ"
            id={levelId}
            inert={!levelOpen}
            aria-hidden={!levelOpen}
          >
            {['', ...levels].map((item) => (
              <Button
                key={item}
                variant="ghost"
                size="compact"
                aria-pressed={level === item}
                onClick={() => {
                  onChange(item, query);
                  close('level');
                }}
              >
                {item || 'Tất cả'}
              </Button>
            ))}
          </div>
        </div>

        <div
          className="ck-topic-morph ck-topic-morph--search"
          data-expanded={searchOpen}
          data-active={Boolean(query)}
        >
          <Button
            variant="ghost"
            size="compact"
            buttonRef={searchButton}
            className="ck-topic-morph__trigger"
            aria-label="Tìm bộ chủ đề"
            aria-expanded={searchOpen}
            aria-controls={searchId}
            onClick={() => {
              if (searchOpen) {
                close('search');
              } else {
                if (input.current) input.current.value = query;
                setExpanded('search');
              }
            }}
          >
            <Icon name={searchOpen ? 'close' : 'search'} size={19} />
          </Button>
          <form
            id={searchId}
            className="ck-topic-morph__body ck-topic-morph__search"
            role="search"
            aria-label="Tìm bộ chủ đề"
            inert={!searchOpen}
            aria-hidden={!searchOpen}
            onSubmit={(event) => {
              event.preventDefault();
              onChange(level, input.current?.value.trim() ?? '');
              close('search');
            }}
          >
            <input
              key={query}
              ref={input}
              name="q"
              type="search"
              aria-label="Từ khóa"
              placeholder="Tìm chủ đề…"
              defaultValue={query}
            />
            <Button type="submit" variant="ghost" size="compact">
              Tìm
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
