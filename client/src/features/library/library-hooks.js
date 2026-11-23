import { useCallback, useEffect, useRef, useState } from 'react';
import { createIdempotencyKey } from '../../services/api-client.js';
import { ApiError } from '../../services/errors.js';

/**
 * @template T
 * @param {(cursor: string|null, signal: AbortSignal) => Promise<import('./library-api.js').Page<T>>} load
 */
export function useLibraryPage(load) {
  const [data, setData] = useState(/** @type {T[]|null} */ (null));
  const [cursor, setCursor] = useState(/** @type {string|null} */ (null));
  const [error, setError] = useState(/** @type {unknown} */ (null));
  const [pending, setPending] = useState(true);
  const request = useRef(/** @type {AbortController|null} */ (null));

  const fetchPage = useCallback(
    /** @param {string|null} next */
    async (next) => {
      if (request.current) return;
      const controller = new AbortController();
      request.current = controller;
      setError(null);
      setPending(true);
      try {
        const page = await load(next, controller.signal);
        if (controller.signal.aborted) return;
        setData((items) =>
          next ? [...(items ?? []), ...page.items] : page.items,
        );
        setCursor(page.nextCursor ?? null);
      } catch (err) {
        if (!controller.signal.aborted) {
          if (!next) {
            setData(null);
            setCursor(null);
          }
          setError(err);
        }
      } finally {
        if (request.current === controller) {
          request.current = null;
          setPending(false);
        }
      }
    },
    [load],
  );

  useEffect(() => {
    let stopped = false;
    queueMicrotask(() => {
      if (!stopped) void fetchPage(null);
    });
    return () => {
      stopped = true;
      request.current?.abort();
      request.current = null;
    };
  }, [fetchPage]);

  return {
    data,
    setData,
    error,
    pending,
    hasMore: Boolean(cursor),
    more: () => fetchPage(cursor),
    reload: () => fetchPage(null),
  };
}

/** @param {unknown} error @param {string} fallback */
export function libraryError(error, fallback) {
  return error instanceof ApiError ? error.message : fallback;
}

export function useLibraryWrite() {
  const request = useRef(/** @type {AbortController|null} */ (null));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const retry = useRef(
    /** @type {{intent: string, key: string}|null} */ (null),
  );

  useEffect(() => () => request.current?.abort(), []);

  /**
   * @param {string} intent
   * @param {(options: {idempotencyKey: string, signal: AbortSignal}) => Promise<void>} perform
   * @param {() => void} refresh
   */
  async function write(intent, perform, refresh) {
    if (request.current) return;
    const controller = new AbortController();
    const key =
      retry.current?.intent === intent
        ? retry.current.key
        : createIdempotencyKey();
    request.current = controller;
    retry.current = null;
    setError('');
    setPending(true);
    try {
      await perform({ idempotencyKey: key, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.isRetryable()) {
        retry.current = { intent, key };
        setError('Chưa xác nhận được kết quả. Hãy bấm lại để thử tiếp.');
      } else if (
        err instanceof ApiError &&
        (err.isVersionConflict() || err.status === 404)
      ) {
        setError('Trạng thái đã thay đổi. Danh sách đang được tải lại.');
        refresh();
      } else {
        setError(libraryError(err, 'Không cập nhật được mục này.'));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return { write, error, pending };
}
