import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../../components/ui/controls.jsx';
import { useAuth } from '../auth/use-auth.js';
import {
  collectLibraryItems,
  libraryPath,
  matchesLibraryText,
  readLibrary,
} from './library-api.js';
import { useLibraryPage } from './library-hooks.js';
import { LibraryStatus } from './LibraryParts.jsx';
import { TopicIsland } from './TopicIsland.jsx';
import './topic-island.css';

const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];

export function TopicsPage() {
  const { kind, guest } = useAuth();
  const [params, setParams] = useSearchParams();
  const level = params.get('level') ?? '';
  const query = params.get('q') ?? '';
  const updateFilters = (
    /** @type {string} */ q,
    /** @type {string} */ nextLevel,
  ) => setParams(libraryPath('', { q, level: nextLevel }).slice(1));

  return (
    <section className="ck-topics-page" data-screen-id="SC-11">
      <div className="ck-topics-heading">
        <div className="ck-topics-heading__title">
          <h1>Kho chủ đề</h1>
          <p>Cùng Chiikawa khám phá các chủ đề luyện nói nhé!</p>
        </div>
        {kind !== 'guest' && (
          <div
            className="ck-island-toolbar"
            onKeyDown={(event) => {
              if (
                event.key === 'Escape' &&
                event.target instanceof HTMLElement
              ) {
                closeIslandTool(event.target);
              }
            }}
          >
            <details
              className="ck-island-tools"
              name="topic-toolbar"
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  event.currentTarget.querySelector('input')?.focus();
                }
              }}
            >
              <summary aria-label="Tìm chủ đề" title="Tìm chủ đề">
                <Icon name="search" size={22} />
              </summary>
              <form
                className="ck-island-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  updateFilters(String(data.get('q')).trim(), level);
                  closeIslandTool(event.currentTarget);
                }}
              >
                <input
                  key={query}
                  aria-label="Tìm bộ hội thoại"
                  name="q"
                  type="search"
                  placeholder="Tìm chủ đề…"
                  defaultValue={query}
                />
                <button type="submit" aria-label="Tìm">
                  <Icon name="search" size={20} />
                </button>
              </form>
            </details>
            <details
              className="ck-island-tools ck-island-tools--level"
              name="topic-toolbar"
            >
              <summary
                aria-label={`Lọc theo trình độ (${level || 'Tất cả'})`}
                title="Lọc theo trình độ"
                data-filtered={level ? true : undefined}
              >
                <Icon name="filter" size={22} />
                <span>{level || 'Tất cả'}</span>
              </summary>
              <label className="ck-island-level">
                <span className="ck-island-visually-hidden">Trình độ</span>
                <select
                  value={level}
                  onChange={(event) => {
                    updateFilters(query, event.target.value);
                    closeIslandTool(event.currentTarget);
                  }}
                >
                  <option value="">Tất cả</option>
                  {levels.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </details>
          </div>
        )}
      </div>
      {kind === 'guest' ? (
        <TrialTopic key={guest?.sessionId} sessionId={guest?.sessionId} />
      ) : (
        <PublishedTopics
          key={JSON.stringify([query, level])}
          filter={query}
          level={level}
          onFilter={updateFilters}
        />
      )}
    </section>
  );
}

/** @param {HTMLElement} control */
function closeIslandTool(control) {
  const tool = control.closest('details');
  if (!tool) return;
  tool.open = false;
  tool.querySelector('summary')?.focus();
}

/** @param {{filter: string, level: string, onFilter: (q: string, level: string) => void}} props */
function PublishedTopics({ filter, level, onFilter }) {
  const readPage = useCallback(
    /** @param {string|null} cursor @param {AbortSignal} signal */
    (cursor, signal) =>
      /** @type {Promise<import('./library-api.js').Page<import('./library-api.js').Topic>>} */ (
        readLibrary(libraryPath('/topics', { level, cursor }), signal)
      ),
    [level],
  );
  const load = useCallback(
    /** @param {string|null} cursor @param {AbortSignal} signal */
    async (cursor, signal) => {
      if (!filter) return readPage(cursor, signal);
      const items = await collectLibraryItems(readPage, signal);
      return {
        items: items.filter((item) =>
          matchesLibraryText({
            filter,
            values: [item.title, item.description],
          }),
        ),
        nextCursor: null,
      };
    },
    [filter, readPage],
  );
  const page = useLibraryPage(load);

  return (
    <>
      <h2 className="ck-island-visually-hidden">
        {filter ? 'Kết quả tìm kiếm' : 'Bộ hội thoại'}
      </h2>
      <LibraryStatus
        {...page}
        empty={!page.data?.length}
        retry={page.reload}
        emptyText={
          filter
            ? 'Không tìm thấy bộ hội thoại phù hợp.'
            : 'Chưa có bộ hội thoại ở trình độ này.'
        }
      >
        <TopicIsland
          topics={page.data ?? []}
          pending={page.pending}
          hasMore={page.hasMore}
          loadMore={page.more}
          clearFilters={filter || level ? () => onFilter('', '') : undefined}
          showSuggestions
          hasLoadError={Boolean(page.error)}
        />
      </LibraryStatus>
      {!page.data?.length && !page.pending && (filter || level) && (
        <button
          className="ck-button ck-button--secondary ck-island-clear"
          type="button"
          onClick={() => onFilter('', '')}
        >
          Xóa bộ lọc
        </button>
      )}
    </>
  );
}

/** @param {{sessionId?: string}} props */
function TrialTopic({ sessionId }) {
  const load = useCallback(
    /** @param {string|null} _cursor @param {AbortSignal} signal */
    async (_cursor, signal) => {
      if (!sessionId) return { items: [] };
      const session = /** @type {{deckVersionId?: string}} */ (
        await readLibrary(`/sessions/${encodeURIComponent(sessionId)}`, signal)
      );
      if (!session.deckVersionId) return { items: [] };
      const topic = /** @type {import('./library-api.js').TopicDetail} */ (
        await readLibrary(
          `/topic-versions/${encodeURIComponent(session.deckVersionId)}`,
          signal,
        )
      );
      return {
        items: [{ ...topic, versionId: topic.id, id: topic.contentId }],
      };
    },
    [sessionId],
  );
  const page = useLibraryPage(load);
  return (
    <>
      <h2 className="ck-island-visually-hidden">Bộ hội thoại của lượt thử</h2>
      <LibraryStatus
        {...page}
        empty={!page.data?.length}
        retry={page.reload}
        emptyText="Phiên của bạn chưa có bộ hội thoại."
      >
        <TopicIsland topics={page.data ?? []} />
      </LibraryStatus>
      <Link
        className="ck-library-text-link ck-island-trial-back"
        to="/invitation"
      >
        Quay lại phòng mời
      </Link>
    </>
  );
}
