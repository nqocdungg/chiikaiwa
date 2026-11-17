import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Badge } from '../../components/ui/surfaces.jsx';
import {
  collectLibraryItems,
  libraryPath,
  readLibrary,
  readSavedPage,
  saveKnowledge,
  unsaveKnowledge,
} from './library-api.js';
import { useLibraryPage, useLibraryWrite } from './library-hooks.js';
import {
  LibraryKnowledge,
  LibraryMore,
  LibraryStatus,
} from './LibraryParts.jsx';

/** @typedef {import('./library-api.js').Knowledge} Knowledge */
/** @typedef {import('./library-api.js').SavedItem} SavedItem */

export function TopicDetailPage() {
  const { topicVersionId = '' } = useParams();
  const [params] = useSearchParams();
  return (
    <TopicDetail
      key={JSON.stringify([
        topicVersionId,
        params.get('knowledge'),
        params.get('revision'),
      ])}
      versionId={topicVersionId}
      knowledgeId={params.get('knowledge')}
      revision={params.get('revision')}
    />
  );
}

/** @param {{versionId: string, knowledgeId: string|null, revision: string|null}} props */
function TopicDetail({ versionId, knowledgeId, revision }) {
  const path = `/topic-versions/${encodeURIComponent(versionId)}`;
  const load = useCallback(
    /** @param {string|null} _cursor @param {AbortSignal} signal */
    async (_cursor, signal) => ({
      items: [
        /** @type {import('./library-api.js').TopicDetail} */ (
          await readLibrary(path, signal)
        ),
      ],
    }),
    [path],
  );
  const topicPage = useLibraryPage(load);
  const topic = topicPage.data?.[0];

  return (
    <section data-screen-id="SC-11">
      <Link className="ck-library-text-link ck-library-back" to="/topics">
        <span aria-hidden="true">‹</span> Kho chủ đề
      </Link>
      <LibraryStatus
        {...topicPage}
        empty={!topic}
        retry={topicPage.reload}
        emptyText="Không tìm thấy bộ hội thoại."
      >
        {topic && (
          <>
            <div className="ck-library-detail-heading">
              <div>
                <Badge tone="accent">{topic.level}</Badge>
                <h1>{topic.title}</h1>
                {topic.description && <p>{topic.description}</p>}
                <p className="ck-library-count">
                  {topic.knowledgeCount} mục kiến thức
                </p>
              </div>
              <div className="ck-library-actions">
                {topic.knowledgeCount > 0 && (
                  <Link
                    className="ck-library-cta"
                    to={libraryPath('/study', {
                      scope: 'topic',
                      topicVersionId: versionId,
                      mode: 'all',
                    })}
                  >
                    Ôn flashcard
                  </Link>
                )}
                {topic.questionCount > 0 && (
                  <Link
                    className="ck-library-cta ck-library-cta--secondary"
                    to={libraryPath('/quiz', { deckVersionId: versionId })}
                  >
                    Luyện quiz
                  </Link>
                )}
              </div>
            </div>
            <TopicKnowledge
              path={path}
              deckVersionId={versionId}
              knowledgeId={knowledgeId}
              revision={revision}
            />
          </>
        )}
      </LibraryStatus>
    </section>
  );
}

/** @param {{path: string, deckVersionId: string, knowledgeId: string|null, revision: string|null}} props */
function TopicKnowledge({ path, deckVersionId, knowledgeId, revision }) {
  const loadKnowledge = useCallback(
    /** @param {string|null} cursor @param {AbortSignal} signal */
    async (cursor, signal) => {
      /** @param {string|null} next @param {AbortSignal} abortSignal */
      const readPage = (next, abortSignal) =>
        /** @type {Promise<import('./library-api.js').Page<Knowledge>>} */ (
          readLibrary(
            libraryPath(`${path}/knowledge`, { cursor: next }),
            abortSignal,
          )
        );
      if (knowledgeId && revision) {
        return {
          items: await collectLibraryItems(
            readPage,
            signal,
            (item) => item.id === knowledgeId && item.versionId === revision,
          ),
        };
      }
      return readPage(cursor, signal);
    },
    [path, knowledgeId, revision],
  );
  const loadSaved = useCallback(
    /** @param {string|null} _cursor @param {AbortSignal} signal */
    async (_cursor, signal) => ({
      items: await collectLibraryItems(readSavedPage, signal),
    }),
    [],
  );
  const knowledge = useLibraryPage(loadKnowledge);
  const saved = useLibraryPage(loadSaved);
  const byKnowledge = new Map(
    saved.data?.map((item) => [item.knowledge.id, item]),
  );

  /** @param {string} id @param {SavedItem} [entry] */
  function updateSaved(id, entry) {
    saved.setData((items) => {
      const remaining = (items ?? []).filter(
        (item) => item.knowledge.id !== id,
      );
      return entry ? [...remaining, entry] : remaining;
    });
  }

  return (
    <>
      <div className="ck-library-section-heading">
        <h2 className="ck-library-section-title">
          {knowledgeId && revision
            ? 'Kiến thức ở bản nguồn'
            : 'Kiến thức trong chủ đề'}
        </h2>
        {knowledgeId && revision && (
          <Link
            className="ck-library-text-link"
            to={`/topics/${encodeURIComponent(deckVersionId)}`}
          >
            Xem cả chủ đề
          </Link>
        )}
      </div>
      {saved.error ? (
        <div className="ck-library-inline-status">
          <p role="alert">Không tải được trạng thái đã lưu.</p>
          <Button size="compact" variant="secondary" onClick={saved.reload}>
            Thử lại
          </Button>
        </div>
      ) : saved.pending ? (
        <p className="ck-library-count" role="status">
          Đang kiểm tra mục đã lưu…
        </p>
      ) : null}
      <LibraryStatus
        {...knowledge}
        empty={!knowledge.data?.length}
        retry={knowledge.reload}
        emptyText={
          knowledgeId && revision
            ? 'Không tìm thấy mục kiến thức trong bản nguồn này.'
            : 'Chủ đề này chưa có mục kiến thức.'
        }
      >
        <div className="ck-library-grid">
          {knowledge.data?.map((item) => (
            <TopicKnowledgeCard
              key={item.id}
              item={item}
              entry={byKnowledge.get(item.id)}
              deckVersionId={deckVersionId}
              ready={Boolean(saved.data && !saved.pending && !saved.error)}
              update={updateSaved}
              refresh={saved.reload}
            />
          ))}
        </div>
      </LibraryStatus>
      <LibraryMore {...knowledge} />
    </>
  );
}

/** @param {{item: Knowledge, entry?: SavedItem, deckVersionId: string, ready: boolean, update: (id: string, entry?: SavedItem) => void, refresh: () => void}} props */
function TopicKnowledgeCard({
  item,
  entry,
  deckVersionId,
  ready,
  update,
  refresh,
}) {
  const { write, pending, error } = useLibraryWrite();
  return (
    <LibraryKnowledge item={item} examples>
      <div className="ck-library-card-actions">
        <Button
          variant="secondary"
          size="compact"
          disabled={!ready}
          loading={pending}
          aria-label={`${entry ? 'Bỏ lưu' : 'Lưu'} ${item.expression}`}
          onClick={() => {
            void write(
              entry
                ? `remove:${entry.id}:${entry.version}`
                : `save:${item.versionId}`,
              async (options) => {
                if (entry) {
                  await unsaveKnowledge(entry, options);
                  update(item.id);
                } else {
                  update(
                    item.id,
                    await saveKnowledge(item, deckVersionId, options),
                  );
                }
              },
              refresh,
            );
          }}
        >
          {entry ? 'Bỏ lưu' : 'Lưu để ôn'}
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
