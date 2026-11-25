import { useCallback, useLayoutEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import chiikawaPeek from '../../assets/mascots/chiikawa-peek.webp';
import { Icon } from '../../components/ui/controls.jsx';
import { StudyIcon } from '../../components/ui/StudyIcon.jsx';
import { Badge } from '../../components/ui/surfaces.jsx';
import { useAuth } from '../auth/use-auth.js';
import {
  collectLibraryItems,
  libraryPath,
  matchesLibraryText,
  readLibrary,
} from './library-api.js';
import { useLibraryPage } from './library-hooks.js';
import { IslandWaterfront } from './IslandWaterfront.jsx';
import { LibraryStatus } from './LibraryParts.jsx';
import { TopicActions, TopicPresentation } from './TopicPresentation.jsx';
import { islandAsset, topicArt } from './topic-art.js';
import '../../components/ui/study-studio.css';
import './topic-island.css';

/** @typedef {import('./library-api.js').Topic} Topic */
const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];
const topicsPerIsland = 6;

/** @param {string} level */
function levelOrder(level) {
  const index = levels.indexOf(level);
  return index === -1 ? levels.length : index;
}

export function TopicsPage() {
  const { kind, guest } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedLevel = params.get('level') ?? '';
  const level = levels.includes(requestedLevel) ? requestedLevel : '';
  const query = params.get('q')?.trim() ?? '';
  const isTrial = kind === 'guest';
  const sessionId = guest?.sessionId;

  const load = useCallback(
    /** @param {string|null} _cursor @param {AbortSignal} signal */
    async (_cursor, signal) => {
      if (isTrial) {
        if (!sessionId) return { items: [] };
        const session = /** @type {{deckVersionId?: string}} */ (
          await readLibrary(
            '/sessions/' + encodeURIComponent(sessionId),
            signal,
          )
        );
        if (!session.deckVersionId) return { items: [] };
        const topic = /** @type {import('./library-api.js').TopicDetail} */ (
          await readLibrary(
            '/topic-versions/' + encodeURIComponent(session.deckVersionId),
            signal,
          )
        );
        return {
          items: [{ ...topic, versionId: topic.id, id: topic.contentId }],
        };
      }

      const items = await collectLibraryItems(
        (cursor, requestSignal) =>
          /** @type {Promise<import('./library-api.js').Page<Topic>>} */ (
            readLibrary(
              libraryPath('/topics', { level, cursor }),
              requestSignal,
            )
          ),
        signal,
      );
      if (!level)
        items.sort((a, b) => levelOrder(a.level) - levelOrder(b.level));
      return {
        items: query
          ? items.filter(({ title, description }) =>
              matchesLibraryText({
                filter: query,
                values: [title, description],
              }),
            )
          : items,
      };
    },
    [isTrial, level, query, sessionId],
  );

  /** @param {string} nextLevel @param {string} nextQuery */
  function changeFilters(nextLevel, nextQuery) {
    setParams(libraryPath('', { level: nextLevel, q: nextQuery }).slice(1));
  }

  return (
    <section className="ck-topic-island" data-screen-id="SC-11">
      <div className="ck-topic-island__header">
        <div>
          <h1>Khám phá đảo Chiikaiwa!</h1>
          <p>
            {isTrial
              ? 'Bộ hội thoại của lượt thử'
              : 'Chọn một bộ chủ đề và bắt đầu học ngay nhé!'}
          </p>
        </div>
        {!isTrial && (
          <div className="ck-topic-island__controls">
            <div
              className="ck-topic-filters"
              role="group"
              aria-label="Trình độ"
            >
              {['', ...levels].map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={level === item}
                  onClick={() => changeFilters(item, query)}
                >
                  {item || 'Tất cả'}
                </button>
              ))}
            </div>
            <details className="ck-topic-search" key={query}>
              <summary
                aria-label="Tìm bộ chủ đề"
                title="Tìm bộ chủ đề"
                data-active={Boolean(query)}
              >
                <Icon name="search" size={19} />
              </summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const value = String(new FormData(form).get('q')).trim();
                  form.closest('details')?.removeAttribute('open');
                  changeFilters(level, value);
                }}
              >
                <label htmlFor="topic-search">Tìm bộ chủ đề</label>
                <input
                  id="topic-search"
                  name="q"
                  type="search"
                  defaultValue={query}
                />
                <button type="submit">Tìm</button>
              </form>
            </details>
          </div>
        )}
      </div>
      <TopicCatalog
        key={JSON.stringify([isTrial, level, query, sessionId])}
        load={load}
        query={isTrial ? '' : query}
        isTrial={isTrial}
      />
    </section>
  );
}

/** @param {{load: (cursor: string|null, signal: AbortSignal) => Promise<import('./library-api.js').Page<Topic>>, query: string, isTrial: boolean}} props */
function TopicCatalog({ load, query, isTrial }) {
  const [params, setParams] = useSearchParams();
  const catalog = useLibraryPage(load);
  const total = Math.ceil((catalog.data?.length ?? 0) / topicsPerIsland);
  const rawPage = params.get('page') ?? '';
  const page =
    !isTrial && /^\d+$/u.test(rawPage)
      ? Math.max(1, Math.min(Number(rawPage), total))
      : 1;
  const start = (page - 1) * topicsPerIsland;
  const topics = catalog.data?.slice(start, start + topicsPerIsland) ?? [];
  const selected =
    topics.find(({ id }) => id === params.get('topic')) ?? topics[0];
  const detailPath = selected
    ? '/topics/' + encodeURIComponent(selected.versionId)
    : '';
  const state = { topicSearch: params.toString() };

  /** @param {number} next */
  function changePage(next) {
    setParams((previous) => {
      const values = new URLSearchParams(previous);
      if (next > 1) values.set('page', String(next));
      else values.delete('page');
      values.delete('topic');
      return values;
    });
  }

  return (
    <>
      <div className="ck-topic-map">
        <img
          className="ck-topic-map__terrain"
          src={islandAsset('terrain')}
          alt=""
        />
        <IslandWaterfront page={selected ? page : null} />
        <LibraryStatus
          {...catalog}
          empty={!selected}
          retry={catalog.reload}
          emptyText={
            query
              ? 'Không tìm thấy bộ chủ đề phù hợp.'
              : isTrial
                ? 'Lượt thử chưa có bộ chủ đề.'
                : 'Chưa có bộ chủ đề ở trình độ này.'
          }
        >
          <ul className="ck-topic-map__spots" aria-label="Bộ chủ đề trên đảo">
            {topics.map((topic) => {
              const art = topicArt(topic);
              const active = topic.id === selected?.id;
              return (
                <li key={topic.id}>
                  <button
                    type="button"
                    className="ck-topic-spot"
                    aria-label={topic.title + ', ' + topic.level}
                    aria-pressed={active}
                    onClick={() => {
                      if (active) return;
                      setParams(
                        (previous) => {
                          const values = new URLSearchParams(previous);
                          values.set('topic', topic.id);
                          return values;
                        },
                        { replace: true },
                      );
                    }}
                  >
                    <span className="ck-topic-spot__picture" aria-hidden="true">
                      <img
                        className="ck-topic-spot__building"
                        src={art.building}
                        alt=""
                      />
                      <img
                        className="ck-topic-spot__mascot"
                        data-mascot={art.mascotKind}
                        src={art.mascot}
                        alt=""
                      />
                    </span>
                    <span className="ck-topic-spot__sign">
                      <TopicSignTitle title={topic.title} />
                      <Badge tone="accent">{topic.level}</Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </LibraryStatus>
        {selected && !isTrial && (
          <IslandPagination page={page} total={total} onChange={changePage} />
        )}
      </div>
      {selected && (
        <aside className="ck-topic-preview" aria-label="Bộ chủ đề đã chọn">
          <div className="ck-topic-preview__content">
            <TopicPresentation topic={selected} />
            <TopicActions detailPath={detailPath} state={state} />
          </div>
          <div className="ck-home-start ck-topic-start">
            <Link
              className="ck-button ck-button--primary ck-button--hero ck-home-action ck-home-action--main"
              to={detailPath}
              state={state}
            >
              <span className="ck-button__content">
                <StudyIcon name="chat" size={28} />
                Bắt đầu học
                <StudyIcon name="chevron" size={24} />
              </span>
            </Link>
            <img
              className="ck-home-start-mascot"
              src={chiikawaPeek}
              alt=""
              width="60"
              height="60"
            />
          </div>
        </aside>
      )}
    </>
  );
}

/** @param {{title: string}} props */
function TopicSignTitle({ title }) {
  const target = useRef(/** @type {HTMLSpanElement | null} */ (null));
  useLayoutEffect(() => {
    const text = target.current;
    const box = text?.parentElement;
    if (!text || !box) return;

    function fitTitle() {
      if (!text || !box || !box.clientHeight) return;
      text.style.fontSize = '';
      let size = Number.parseFloat(getComputedStyle(text).fontSize);
      while (text.offsetHeight > box.clientHeight && size > 7) {
        size -= 0.5;
        text.style.fontSize = size + 'px';
      }
    }

    fitTitle();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(fitTitle);
    observer?.observe(box);
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) fitTitle();
    });
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [title]);

  return (
    <span className="ck-topic-spot__title">
      <span ref={target}>{title}</span>
    </span>
  );
}

/** @param {{page: number, total: number, onChange: (page: number) => void}} props */
function IslandPagination({ page, total, onChange }) {
  const first = Math.max(1, Math.min(page - 1, total - 2));
  const pages = Array.from({ length: Math.min(total, 3) }, (_, i) => first + i);

  return (
    <nav className="ck-island-pages" aria-label="Phân trang đảo">
      <button
        type="button"
        aria-label="Trang đảo trước"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
      >
        <StudyIcon name="chevron" />
      </button>
      <div>
        <p aria-live="polite">
          Trang đảo {page} / {total}
        </p>
        {total > 1 && (
          <div className="ck-island-pages__dots">
            {pages.map((number) => (
              <button
                key={number}
                type="button"
                aria-label={'Trang đảo ' + number}
                aria-current={number === page ? 'page' : undefined}
                onClick={() => number !== page && onChange(number)}
              />
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Trang đảo tiếp theo"
        onClick={() => onChange(page + 1)}
        disabled={page === total}
      >
        <StudyIcon name="chevron" />
      </button>
    </nav>
  );
}
