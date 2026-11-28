import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { useAuth } from '../auth/use-auth.js';
import {
  deleteSessionNote,
  getSessionPersonal,
  getSessionSummary,
  putSessionNote,
  putSessionSelfAssessment,
} from '../kaiwa/session-learning-api.js';
import { createIdempotencyKey } from '../../services/api-client.js';
import { ApiError } from '../../services/errors.js';
import { libraryPath, readLibrary } from '../library/library-api.js';
import { SafetyActionDialog } from '../safety/SafetyActionDialog.jsx';
import {
  resolvePartnerDisplayName,
  resolveSessionPartner,
} from '../safety/safety-api.js';
import { SessionSummary } from './SessionSummary.jsx';

/** @param {unknown} error @param {string} fallback */
function message(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

/** @param {any[]} sources @param {AbortSignal} signal */
async function readSavedKnowledge(sources, signal) {
  const wanted = new Set(sources.map((source) => source.knowledgeVersionId));
  const decks = [...new Set(sources.map((source) => source.deckVersionId))];
  const found = new Map();
  for (const deckVersionId of decks) {
    let cursor = null;
    do {
      signal.throwIfAborted();
      const page =
        /** @type {{items: import('../library/library-api.js').Knowledge[], nextCursor?: string|null}} */ (
          await readLibrary(
            libraryPath(
              `/topic-versions/${encodeURIComponent(deckVersionId)}/knowledge`,
              { cursor },
            ),
            signal,
          )
        );
      for (const item of page.items) {
        if (wanted.has(item.versionId)) found.set(item.versionId, item);
      }
      cursor = page.nextCursor ?? null;
    } while (cursor && found.size < wanted.size);
  }
  return sources
    .map((source) => found.get(source.knowledgeVersionId))
    .filter((item, index, items) => item && items.indexOf(item) === index);
}

export function SessionSummaryPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const carriedNote =
    /** @type {{sessionId?: string, noteDraft?: string, noteFailure?: {status: 'error'|'conflict', message: string}|null}|null} */ (
      location.state
    );
  const pendingNoteRef = useRef(
    carriedNote?.sessionId === sessionId &&
      typeof carriedNote.noteDraft === 'string'
      ? carriedNote
      : null,
  );
  const { kind, user, invalidateSession } = useAuth();
  const [summary, setSummary] = useState(
    /** @type {import('../kaiwa/session-learning-api.js').SessionSummaryData|null} */ (
      null
    ),
  );
  const [savedKnowledge, setSavedKnowledge] = useState(
    /** @type {any[]} */ ([]),
  );
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState('saved');
  const [noteError, setNoteError] = useState('');
  const [assessment, setAssessment] = useState(
    /** @type {{confidence: number|null, comment: string}} */ ({
      confidence: null,
      comment: '',
    }),
  );
  const [assessmentStatus, setAssessmentStatus] = useState('idle');
  const [assessmentError, setAssessmentError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState('');
  const noteRef = useRef('');
  const assessmentRef = useRef(assessment);
  const noteRetry = useRef(
    /** @type {{intent: string, key: string}|null} */ (null),
  );
  const assessmentRetry = useRef(
    /** @type {{intent: string, key: string}|null} */ (null),
  );

  const load = useCallback(async () => {
    const controller = new AbortController();
    setPending(true);
    setError('');
    try {
      const data = await getSessionSummary(sessionId, controller.signal);
      const knowledge = await readSavedKnowledge(
        data.savedSources,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setSummary(data);
      setSavedKnowledge(knowledge);
      const pendingNote = pendingNoteRef.current;
      noteRef.current = pendingNote?.noteDraft ?? data.personal.note ?? '';
      setNote(noteRef.current);
      const hasPendingNote =
        pendingNote && noteRef.current !== (data.personal.note ?? '');
      setNoteStatus(
        hasPendingNote ? (pendingNote.noteFailure?.status ?? 'draft') : 'saved',
      );
      setNoteError(
        hasPendingNote ? (pendingNote.noteFailure?.message ?? '') : '',
      );
      assessmentRef.current = {
        confidence: data.personal.selfAssessment?.confidence ?? null,
        comment: data.personal.selfAssessment?.comment ?? '',
      };
      setAssessment(assessmentRef.current);
      setAssessmentStatus(data.personal.selfAssessment ? 'saved' : 'idle');
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') {
        return;
      }
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.isGuestExpired()) {
          navigate('/expired', { replace: true });
          return;
        }
        if (failure instanceof ApiError && failure.isAuthRequired()) {
          invalidateSession?.(
            'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          );
          navigate('/login', { replace: true });
          return;
        }
        setError(message(failure, 'Không tải được tổng kết phiên.'));
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
    return () => controller.abort();
  }, [invalidateSession, navigate, sessionId]);

  useEffect(() => {
    let stopped = false;
    queueMicrotask(() => {
      if (!stopped) void load();
    });
    return () => {
      stopped = true;
    };
  }, [load]);

  async function saveNote() {
    if (!summary || noteStatus === 'saving') return;
    const value = noteRef.current;
    const intent = `${summary.personal.noteVersion}:${value}`;
    const key =
      noteRetry.current?.intent === intent
        ? noteRetry.current.key
        : createIdempotencyKey();
    noteRetry.current = null;
    setNoteStatus('saving');
    setNoteError('');
    try {
      const personal = await putSessionNote(
        sessionId,
        summary.personal.noteVersion,
        value,
        { idempotencyKey: key },
      );
      setSummary((current) => current && { ...current, personal });
      setNoteStatus(noteRef.current === value ? 'saved' : 'draft');
      if (noteRef.current === value && pendingNoteRef.current) {
        pendingNoteRef.current = null;
        navigate(location.pathname, { replace: true, state: null });
      }
    } catch (failure) {
      if (failure instanceof ApiError && failure.isRetryable())
        noteRetry.current = { intent, key };
      setNoteStatus(
        failure instanceof ApiError && failure.isVersionConflict()
          ? 'conflict'
          : 'error',
      );
      setNoteError(
        failure instanceof ApiError && failure.isVersionConflict()
          ? 'Ghi chú đã thay đổi ở nơi khác. Bản đang nhập vẫn được giữ.'
          : message(failure, 'Chưa lưu được ghi chú.'),
      );
    }
  }

  async function removeNote() {
    if (!summary || deleting) return;
    setDeleting(true);
    setNoteError('');
    try {
      await deleteSessionNote(sessionId, summary.personal.noteVersion, {
        idempotencyKey: createIdempotencyKey(),
      });
      const personal = await getSessionPersonal(sessionId);
      setSummary((current) => current && { ...current, personal });
      noteRef.current = '';
      setNote('');
      setNoteStatus('saved');
      setConfirmDelete(false);
    } catch (failure) {
      setNoteStatus(
        failure instanceof ApiError && failure.isVersionConflict()
          ? 'conflict'
          : 'error',
      );
      setNoteError(
        failure instanceof ApiError && failure.isVersionConflict()
          ? 'Ghi chú đã thay đổi ở nơi khác. Hãy tải lại trước khi xóa.'
          : message(failure, 'Chưa xóa được ghi chú.'),
      );
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function saveAssessment() {
    if (
      !summary ||
      assessment.confidence === null ||
      assessmentStatus === 'saving'
    )
      return;
    const value = assessmentRef.current;
    const intent = `${summary.personal.version}:${value.confidence}:${value.comment}`;
    const key =
      assessmentRetry.current?.intent === intent
        ? assessmentRetry.current.key
        : createIdempotencyKey();
    assessmentRetry.current = null;
    setAssessmentStatus('saving');
    setAssessmentError('');
    try {
      const personal = await putSessionSelfAssessment(
        sessionId,
        summary.personal.version,
        {
          confidence: /** @type {number} */ (value.confidence),
          ...(value.comment ? { comment: value.comment } : {}),
        },
        { idempotencyKey: key },
      );
      setSummary((current) => current && { ...current, personal });
      setAssessmentStatus(
        assessmentRef.current.confidence === value.confidence &&
          assessmentRef.current.comment === value.comment
          ? 'saved'
          : 'draft',
      );
    } catch (failure) {
      if (failure instanceof ApiError && failure.isRetryable())
        assessmentRetry.current = { intent, key };
      setAssessmentStatus(
        failure instanceof ApiError && failure.isVersionConflict()
          ? 'conflict'
          : 'error',
      );
      setAssessmentError(
        failure instanceof ApiError && failure.isVersionConflict()
          ? 'Tự đánh giá đã thay đổi ở nơi khác. Nội dung đang nhập vẫn được giữ.'
          : message(failure, 'Chưa lưu được tự đánh giá.'),
      );
    }
  }

  async function refreshPersonalVersion() {
    try {
      const personal = await getSessionPersonal(sessionId);
      setSummary((current) => current && { ...current, personal });
      setNoteStatus((current) => (current === 'conflict' ? 'draft' : current));
      setAssessmentStatus((current) =>
        current === 'conflict' ? 'draft' : current,
      );
      setNoteError('');
      setAssessmentError('');
    } catch (failure) {
      const text = message(failure, 'Chưa tải được dữ liệu mới.');
      setNoteError(text);
      setAssessmentError(text);
    }
  }

  if (pending)
    return (
      <p className="ck-summary-status" role="status">
        Đang tải tổng kết phiên…
      </p>
    );
  if (error || !summary)
    return (
      <section className="ck-summary-status" role="alert">
        <h1>Chưa mở được tổng kết</h1>
        <p>{error || 'Không tìm thấy dữ liệu tổng kết.'}</p>
        <div className="ck-actions">
          <Button onClick={() => void load()}>Thử lại</Button>
          <Button
            variant="ghost"
            onClick={() => navigate(kind === 'guest' ? '/' : '/home')}
          >
            Về trang chính
          </Button>
        </div>
      </section>
    );

  const partner = resolveSessionPartner(summary.session?.members, {
    kind,
    userId: user?.id ?? null,
  });
  const partnerName = resolvePartnerDisplayName(partner);

  return (
    <>
      <SessionSummary
        sessionId={sessionId}
        summary={summary}
        savedKnowledge={savedKnowledge}
        note={note}
        noteStatus={noteStatus}
        noteError={noteError}
        onNoteChange={(value) => {
          noteRef.current = value;
          setNote(value);
          setNoteStatus('draft');
          setNoteError('');
        }}
        onNoteSave={() => void saveNote()}
        onNoteDelete={() => setConfirmDelete(true)}
        onRefreshPersonal={() => void refreshPersonalVersion()}
        assessment={assessment}
        assessmentStatus={assessmentStatus}
        assessmentError={assessmentError}
        onAssessmentChange={(next) => {
          assessmentRef.current = next;
          setAssessment(next);
          setAssessmentStatus('draft');
          setAssessmentError('');
        }}
        onAssessmentSave={() => void saveAssessment()}
        onHome={() => navigate(kind === 'guest' ? '/' : '/home')}
        safetyNotice={safetyNotice}
        onOpenSafety={partner ? () => setSafetyOpen(true) : undefined}
      />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Xóa ghi chú riêng?"
        description="Tự đánh giá của phiên vẫn được giữ nguyên."
        closeDisabled={deleting}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              Giữ ghi chú
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => void removeNote()}
            >
              Xóa ghi chú
            </Button>
          </>
        }
      >
        <p>Thao tác này chỉ xóa ghi chú của bạn trong phiên này.</p>
      </Dialog>
      {partner ? (
        <SafetyActionDialog
          open={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          sessionId={sessionId}
          partner={partner}
          inActiveSession={false}
          isGuest={kind === 'guest'}
          onReported={() => {
            setSafetyNotice(
              'Báo cáo của bạn đã được tiếp nhận. Thao tác này không tự chặn đối tác.',
            );
          }}
          onBlocked={() => {
            setSafetyNotice(
              `Đã chặn ${partnerName}. Hai người sẽ không thể ghép cặp hoặc vào phòng qua mã mời.`,
            );
          }}
        />
      ) : null}
    </>
  );
}
