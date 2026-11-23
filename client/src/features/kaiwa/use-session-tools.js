import { useCallback, useEffect, useRef, useState } from 'react';
import { createIdempotencyKey } from '../../services/api-client.js';
import { ApiError } from '../../services/errors.js';
import {
  findSavedKnowledge,
  getSessionHints,
  getSessionPersonal,
  putSessionNote,
  saveSessionKnowledge,
  unsaveSessionKnowledge,
} from './session-learning-api.js';

/** @param {unknown} error @param {string} fallback */
function errorMessage(error, fallback) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}

/**
 * Personal tools are independent from shared controller state. The hook keeps
 * the note draft mounted while the right panel is switched or collapsed.
 * @param {{sessionId: string, cardId?: string, scenarioVersionId?: string, deckVersionId?: string}} input
 */
export function useSessionTools({
  sessionId,
  cardId,
  scenarioVersionId,
  deckVersionId,
}) {
  const [personal, setPersonal] = useState(
    /** @type {import('./session-learning-api.js').PersonalSession|null} */ (
      null
    ),
  );
  const [personalPending, setPersonalPending] = useState(true);
  const [personalError, setPersonalError] = useState('');
  const [note, setNoteState] = useState('');
  const [noteStatus, setNoteStatus] = useState(
    /** @type {'loading'|'saved'|'draft'|'saving'|'error'|'conflict'} */ (
      'loading'
    ),
  );
  const [noteError, setNoteError] = useState('');
  const [hints, setHints] = useState(/** @type {string[]} */ ([]));
  const [knowledge, setKnowledge] = useState(
    /** @type {import('./session-learning-api.js').HintKnowledge[]} */ ([]),
  );
  const [hintsPending, setHintsPending] = useState(false);
  const [hintsError, setHintsError] = useState('');
  const [hintsReload, setHintsReload] = useState(0);
  const [knowledgePending, setKnowledgePending] = useState(
    /** @type {Set<string>} */ (new Set()),
  );
  const [knowledgeErrors, setKnowledgeErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const draftRef = useRef('');
  const dirtyRef = useRef(false);
  const personalRef = useRef(personal);
  const savingPromiseRef = useRef(/** @type {Promise<boolean>|null} */ (null));
  const saveFailureRef = useRef(
    /** @type {{status: 'error'|'conflict', message: string}|null} */ (null),
  );
  const aliveRef = useRef(true);
  const savedItemsRef = useRef(
    /** @type {Map<string, import('./session-learning-api.js').SavedItem>} */ (
      new Map()
    ),
  );
  const noteRetryRef = useRef(
    /** @type {{intent: string, key: string}|null} */ (null),
  );

  useEffect(() => {
    personalRef.current = personal;
  }, [personal]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadPersonal = useCallback(async () => {
    const controller = new AbortController();
    setPersonalPending(true);
    setPersonalError('');
    try {
      const loaded = await getSessionPersonal(sessionId, controller.signal);
      if (!aliveRef.current) return;
      setPersonal(loaded);
      personalRef.current = loaded;
      if (!dirtyRef.current) {
        const value = loaded.note ?? '';
        draftRef.current = value;
        setNoteState(value);
        setNoteStatus('saved');
      }
    } catch (error) {
      if (!controller.signal.aborted && aliveRef.current) {
        setPersonalError(
          errorMessage(error, 'Không tải được dữ liệu cá nhân của phiên.'),
        );
        setNoteStatus('error');
        setNoteError('Không tải được ghi chú. Hãy thử lại.');
      }
    } finally {
      if (aliveRef.current) setPersonalPending(false);
    }
    return () => controller.abort();
  }, [sessionId]);

  useEffect(() => {
    let stopped = false;
    queueMicrotask(() => {
      if (!stopped) void loadPersonal();
    });
    return () => {
      stopped = true;
    };
    // Loading once per session is intentional; draft changes must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    setHints([]);
    setKnowledge([]);
    setHintsError('');
    setKnowledgeErrors({});
    savedItemsRef.current.clear();
    if (!cardId) {
      setHintsPending(false);
      return undefined;
    }
    const controller = new AbortController();
    setHintsPending(true);
    void getSessionHints(sessionId, cardId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setHints(data.hints);
        setKnowledge(data.knowledge);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setHintsError(
            errorMessage(error, 'Không tải được gợi ý của tình huống.'),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setHintsPending(false);
      });
    return () => controller.abort();
  }, [cardId, hintsReload, sessionId]);

  const saveNote = useCallback(async () => {
    if (savingPromiseRef.current) return savingPromiseRef.current;
    const current = personalRef.current;
    if (!current) return false;
    const value = draftRef.current;
    const intent = `${current.noteVersion}:${value}`;
    const key =
      noteRetryRef.current?.intent === intent
        ? noteRetryRef.current.key
        : createIdempotencyKey();
    const pending = (async () => {
      noteRetryRef.current = null;
      saveFailureRef.current = null;
      setNoteStatus('saving');
      setNoteError('');
      try {
        const updated = await putSessionNote(
          sessionId,
          current.noteVersion,
          value,
          { idempotencyKey: key },
        );
        personalRef.current = updated;
        if (!aliveRef.current) return false;
        setPersonal(updated);
        if (draftRef.current === value) {
          dirtyRef.current = false;
          setNoteStatus('saved');
          return true;
        }
        setNoteStatus('draft');
        return false;
      } catch (error) {
        if (!aliveRef.current) return false;
        if (error instanceof ApiError && error.isVersionConflict()) {
          const message =
            'Ghi chú đã thay đổi ở nơi khác. Bản đang nhập vẫn được giữ.';
          saveFailureRef.current = { status: 'conflict', message };
          setNoteStatus('conflict');
          setNoteError(message);
        } else {
          if (error instanceof ApiError && error.isRetryable())
            noteRetryRef.current = { intent, key };
          const message = errorMessage(
            error,
            'Chưa lưu được ghi chú. Bản nhập vẫn được giữ.',
          );
          saveFailureRef.current = { status: 'error', message };
          setNoteStatus('error');
          setNoteError(message);
        }
        return false;
      }
    })();
    savingPromiseRef.current = pending;
    try {
      return await pending;
    } finally {
      savingPromiseRef.current = null;
    }
  }, [sessionId]);

  const savePendingNote = useCallback(async () => {
    if (savingPromiseRef.current) await savingPromiseRef.current;
    if (!dirtyRef.current) return true;
    return saveNote();
  }, [saveNote]);

  const getPendingNote = useCallback(() => {
    if (!dirtyRef.current) return null;
    return {
      noteDraft: draftRef.current,
      noteFailure: saveFailureRef.current,
    };
  }, []);

  /** @param {string} value */
  function setNote(value) {
    dirtyRef.current = true;
    draftRef.current = value;
    saveFailureRef.current = null;
    setNoteState(value);
    setNoteError('');
    setNoteStatus('draft');
  }

  async function resolveNoteConflict() {
    try {
      const loaded = await getSessionPersonal(sessionId);
      if (!aliveRef.current) return;
      personalRef.current = loaded;
      setPersonal(loaded);
      setNoteError('');
      setNoteStatus('draft');
    } catch (error) {
      if (aliveRef.current)
        setNoteError(
          errorMessage(error, 'Chưa tải được phiên bản ghi chú mới.'),
        );
    }
  }

  /** @param {string} knowledgeId */
  async function toggleKnowledge(knowledgeId) {
    if (
      knowledgePending.has(knowledgeId) ||
      !scenarioVersionId ||
      !deckVersionId
    )
      return;
    const item = knowledge.find((entry) => entry.id === knowledgeId);
    if (!item) return;
    const controller = new AbortController();
    setKnowledgePending((current) => new Set(current).add(knowledgeId));
    setKnowledgeErrors((current) => ({ ...current, [knowledgeId]: '' }));
    try {
      if (item.isSaved) {
        const saved =
          savedItemsRef.current.get(knowledgeId) ??
          (await findSavedKnowledge(knowledgeId, controller.signal));
        if (!saved) throw new Error('Không tìm thấy mục đã lưu để cập nhật.');
        await unsaveSessionKnowledge(saved, {
          idempotencyKey: createIdempotencyKey(),
          signal: controller.signal,
        });
        savedItemsRef.current.delete(knowledgeId);
      } else {
        const saved = await saveSessionKnowledge(
          item,
          { sessionId, scenarioVersionId, deckVersionId },
          {
            idempotencyKey: createIdempotencyKey(),
            signal: controller.signal,
          },
        );
        savedItemsRef.current.set(knowledgeId, saved);
      }
      setKnowledge((current) =>
        current.map((entry) =>
          entry.id === knowledgeId
            ? { ...entry, isSaved: !entry.isSaved }
            : entry,
        ),
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setKnowledgeErrors((current) => ({
          ...current,
          [knowledgeId]: errorMessage(
            error,
            'Không cập nhật được mục kiến thức này.',
          ),
        }));
    } finally {
      setKnowledgePending((current) => {
        const next = new Set(current);
        next.delete(knowledgeId);
        return next;
      });
    }
  }

  return {
    personal,
    personalPending,
    personalError,
    reloadPersonal: loadPersonal,
    note,
    noteStatus,
    noteError,
    setNote,
    saveNote,
    savePendingNote,
    getPendingNote,
    resolveNoteConflict,
    hints,
    knowledge,
    hintsPending,
    hintsError,
    reloadHints: () => setHintsReload((current) => current + 1),
    knowledgePending,
    knowledgeErrors,
    toggleKnowledge,
  };
}
