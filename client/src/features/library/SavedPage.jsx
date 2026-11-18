import { useCallback, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { ApiError } from '../../services/errors.js';
import {
  collectLibraryItems,
  libraryPath,
  matchesLibraryText,
  readLibrary,
  readSavedPage,
  unsaveKnowledge,
} from './library-api.js';
import { useLibraryPage, useLibraryWrite } from './library-hooks.js';
import {
  LibraryIntro,
  LibraryKnowledge,
  LibraryMore,
  LibrarySearch,
  LibraryStatus,
} from './LibraryParts.jsx';

/** @typedef {import('./library-api.js').SavedItem} SavedItem */
/** @typedef {import('./library-api.js').SavedSource} SavedSource */

const sourceDate = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });

export function SavedPage() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('q') ?? '';

  return (
    <section data-screen-id="SC-12">
      <LibraryIntro saved />
      <form
        className="ck-library-saved-search"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setParams(
            libraryPath('', { q: String(data.get('q')).trim() }).slice(1),
          );
        }}
      >
        <LibrarySearch
          key={filter}
          id="saved-search"
          name="q"
          label="Tìm trong kiến thức đã lưu"
          placeholder="Nhập từ vựng, mẫu câu hoặc nghĩa…"
          defaultValue={filter}
        />
        <Button type="submit" variant="secondary" size="compact">
          Tìm
        </Button>
      </form>
      <SavedItems key={filter} filter={filter} />
    </section>
  );
}

/** @param {{filter: string}} props */
function SavedItems({ filter }) {
  const load = useCallback(
    /** @param {string|null} cursor @param {AbortSignal} signal */
    async (cursor, signal) => {
      if (!filter) return readSavedPage(cursor, signal);
      const items = await collectLibraryItems(readSavedPage, signal);
      return {
        items: items.filter(({ knowledge }) =>
          matchesLibraryText({
            filter,
            values: [
              knowledge.expression,
              knowledge.reading,
              knowledge.meaning,
            ],
          }),
        ),
        nextCursor: null,
      };
    },
    [filter],
  );
  const page = useLibraryPage(load);
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const [source, setSource] = useState(/** @type {SavedItem|null} */ (null));

  /** @param {string} id */
  function remove(id) {
    heading.current?.focus();
    page.setData((items) => items?.filter((item) => item.id !== id) ?? null);
  }

  return (
    <>
      <div className="ck-library-section-heading">
        <h2 className="ck-library-section-title" ref={heading} tabIndex={-1}>
          Kiến thức đã lưu
        </h2>
        {page.data?.length ? (
          <Link className="ck-library-cta" to="/study?scope=saved&mode=all">
            Bắt đầu ôn tập
          </Link>
        ) : null}
      </div>
      <LibraryStatus
        {...page}
        empty={!page.data?.length}
        retry={page.reload}
        emptyText={
          filter
            ? 'Không tìm thấy mục đã lưu phù hợp.'
            : 'Bạn chưa lưu mục kiến thức nào.'
        }
      >
        <div className="ck-library-grid">
          {page.data?.map((item) => (
            <SavedCard
              key={item.id}
              item={item}
              onSources={() => setSource(item)}
              remove={() => remove(item.id)}
              refresh={page.reload}
            />
          ))}
        </div>
      </LibraryStatus>
      {!page.pending &&
        !page.error &&
        !page.data?.length &&
        !page.hasMore &&
        !filter && (
          <Link className="ck-library-text-link ck-library-back" to="/topics">
            Khám phá kho chủ đề <span aria-hidden="true">›</span>
          </Link>
        )}
      <LibraryMore {...page} />
      {source && (
        <SourceDialog
          key={source.id}
          item={source}
          onClose={() => setSource(null)}
        />
      )}
    </>
  );
}

/** @param {{item: SavedItem, onSources: () => void, remove: () => void, refresh: () => void}} props */
function SavedCard({ item, onSources, remove, refresh }) {
  const { write, pending, error } = useLibraryWrite();
  return (
    <LibraryKnowledge item={item.knowledge}>
      <div className="ck-library-card-actions">
        <Button
          variant="ghost"
          size="compact"
          aria-label={`Xem nguồn: ${item.knowledge.expression}`}
          onClick={onSources}
        >
          Xem nguồn
        </Button>
        <Button
          variant="secondary"
          size="compact"
          aria-label={`Bỏ lưu ${item.knowledge.expression}`}
          loading={pending}
          onClick={() => {
            void write(
              `remove:${item.id}:${item.version}`,
              async (options) => {
                await unsaveKnowledge(item, options);
                remove();
              },
              refresh,
            );
          }}
        >
          Bỏ lưu
        </Button>
      </div>
      {error && (
        <p className="ck-library-action-error" role="alert">
          {error}
        </p>
      )}
    </LibraryKnowledge>
  );
}

/** @param {{item: SavedItem, onClose: () => void}} props */
function SourceDialog({ item, onClose }) {
  const load = useCallback(
    /** @param {string|null} cursor @param {AbortSignal} signal */
    async (cursor, signal) => {
      const page = /** @type {import('./library-api.js').Page<SavedSource>} */ (
        await readLibrary(
          libraryPath(
            `/me/saved-items/${encodeURIComponent(item.id)}/sources`,
            { cursor },
          ),
          signal,
        )
      );
      const versionIds = [
        ...new Set(page.items.map((source) => source.deckVersionId)),
      ];
      const topics = new Map(
        await Promise.all(
          versionIds.map(async (versionId) => {
            try {
              const topic =
                /** @type {import('./library-api.js').TopicDetail} */ (
                  await readLibrary(
                    `/topic-versions/${encodeURIComponent(versionId)}`,
                    signal,
                  )
                );
              return /** @type {const} */ ([versionId, topic.title]);
            } catch (error) {
              if (
                error instanceof ApiError &&
                [403, 404].includes(error.status)
              ) {
                return /** @type {const} */ ([versionId, null]);
              }
              throw error;
            }
          }),
        ),
      );
      return {
        ...page,
        items: page.items.map((source) => ({
          ...source,
          title: topics.get(source.deckVersionId),
        })),
      };
    },
    [item.id],
  );
  const page = useLibraryPage(load);

  return (
    <Dialog open onClose={onClose} title="Nguồn đã lưu" size="form">
      <p className="ck-library-source-expression" lang="ja">
        {item.knowledge.expression}
      </p>
      <LibraryStatus
        {...page}
        empty={!page.data?.length}
        retry={page.reload}
        emptyText="Mục này chưa có nguồn học liệu."
      >
        <ul className="ck-library-sources">
          {page.data?.map((source) => (
            <li
              key={JSON.stringify([
                source.deckVersionId,
                source.knowledgeVersionId,
                source.sessionId,
                source.scenarioVersionId,
              ])}
            >
              <div>
                <strong>{source.title ?? 'Bộ hội thoại'}</strong>
                {!source.title && (
                  <p>
                    Học liệu nguồn hiện không còn khả dụng với quyền truy cập
                    của bạn.
                  </p>
                )}
                <span>
                  {source.sessionId ? 'Từ phiên luyện nói' : 'Từ kho chủ đề'} ·{' '}
                  <time dateTime={source.createdAt}>
                    {sourceDate.format(new Date(source.createdAt))}
                  </time>
                </span>
              </div>
              {source.title && (
                <Link
                  className="ck-library-text-link"
                  to={libraryPath(
                    `/topics/${encodeURIComponent(source.deckVersionId)}`,
                    {
                      knowledge: item.knowledge.id,
                      revision: source.knowledgeVersionId,
                    },
                  )}
                >
                  Xem bản nguồn <span aria-hidden="true">›</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </LibraryStatus>
      <LibraryMore {...page} />
    </Dialog>
  );
}
