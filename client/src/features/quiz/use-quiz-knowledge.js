import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collectLibraryItems,
  readLibrary,
  readSavedPage,
} from '../library/library-api.js';
import { formatQuizError } from './quiz-api.js';
import { useQuizLifecycle } from './use-quiz-lifecycle.js';

/** @typedef {import('../library/library-api.js').Knowledge} Knowledge */

/**
 * @param {string} deckVersionId
 * @param {boolean} [enabled]
 */
export function useQuizKnowledge(deckVersionId, enabled = true) {
  const handleLifecycle = useQuizLifecycle();

  /** @type {[Map<string, Knowledge>, (m: Map<string, Knowledge>) => void]} */
  const [knowledgeMap, setKnowledgeMap] = useState(() => new Map());
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(Boolean(deckVersionId && enabled));
  const [errorMessage, setErrorMessage] = useState('');
  const controllerRef = useRef(/** @type {AbortController | null} */ (null));

  const load = useCallback(async () => {
    if (!deckVersionId || !enabled) {
      setLoading(false);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setErrorMessage('');
    try {
      const loadTopicKnowledge = (
        /** @type {string|null} */ cursor,
        /** @type {AbortSignal} */ s,
      ) =>
        readLibrary(
          `/topic-versions/${encodeURIComponent(deckVersionId)}/knowledge${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
          s,
        );

      const [knowledgeList, savedList] = await Promise.all([
        collectLibraryItems(loadTopicKnowledge, controller.signal),
        collectLibraryItems(readSavedPage, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      const kMap = new Map();
      for (const item of knowledgeList) {
        kMap.set(item.versionId, item);
      }
      setKnowledgeMap(kMap);

      const sIds = new Set(
        savedList.map((s) => s.knowledge?.id).filter(Boolean),
      );
      setSavedIds(sIds);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (handleLifecycle(err)) {
        return;
      }
      setErrorMessage(
        formatQuizError(err, 'Không thể tải học liệu liên quan.'),
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [deckVersionId, enabled, handleLifecycle]);

  useEffect(() => {
    if (!deckVersionId || !enabled) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      controllerRef.current?.abort();
    };
  }, [deckVersionId, enabled, load]);

  return {
    knowledgeMap,
    savedIds,
    loading,
    error: errorMessage,
    reload: () => {
      void load();
    },
  };
}
