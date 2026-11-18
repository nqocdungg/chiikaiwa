import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { useAuth } from '../auth/use-auth.js';
import {
  collectLibraryItems,
  libraryPath,
  matchesLibraryText,
  readLibrary,
} from './library-api.js';
import { useLibraryPage } from './library-hooks.js';
import {
  LibraryIntro,
  LibraryMore,
  LibrarySearch,
  LibraryStatus,
  TopicCard,
} from './LibraryParts.jsx';

const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];

export function TopicsPage() {
  const { kind, guest } = useAuth();
  const [params, setParams] = useSearchParams();
  const level = params.get('level') ?? '';
  const query = params.get('q') ?? '';

  return (
    <section data-screen-id="SC-11">
      <LibraryIntro />
      {kind === 'guest' ? (
        <TrialTopic key={guest?.sessionId} sessionId={guest?.sessionId} />
      ) : (
        <>
          <form
            className="ck-library-filters"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setParams(
                libraryPath('', {
                  q: String(form.get('q')).trim(),
                  level,
                }).slice(1),
              );
            }}
          >
            <LibrarySearchInput key={query} query={query} />
            <label className="ck-library-field">
              Trình độ
              <select
                value={level}
                onChange={(event) =>
                  setParams(
                    libraryPath('', {
                      q: query,
                      level: event.target.value,
                    }).slice(1),
                  )
                }
              >
                <option value="">Tất cả</option>
                {levels.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary" size="compact">
              Tìm
            </Button>
          </form>
          <PublishedTopics
            key={JSON.stringify([query, level])}
            filter={query}
            level={level}
          />
        </>
      )}
    </section>
  );
}

/** @param {{query: string}} props */
function LibrarySearchInput({ query }) {
  return (
    <LibrarySearch
      id="topic-search"
      name="q"
      label="Tìm bộ hội thoại"
      placeholder="Nhập tên hoặc nội dung…"
      defaultValue={query}
    />
  );
}

/** @param {{filter: string, level: string}} props */
function PublishedTopics({ filter, level }) {
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
      <h2 className="ck-library-section-title">
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
        <div className="ck-library-grid">
          {page.data?.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      </LibraryStatus>
      <LibraryMore {...page} />
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
      <h2 className="ck-library-section-title">Bộ hội thoại của lượt thử</h2>
      <LibraryStatus
        {...page}
        empty={!page.data?.length}
        retry={page.reload}
        emptyText="Phiên của bạn chưa có bộ hội thoại."
      >
        <div className="ck-library-grid">
          {page.data?.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      </LibraryStatus>
      <Link className="ck-library-text-link" to="/invitation">
        Quay lại phòng mời
      </Link>
    </>
  );
}
