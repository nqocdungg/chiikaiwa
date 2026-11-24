import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createIdempotencyKey } from '../../services/api-client.js';
import { getIdentityEpoch } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import { useAuth } from '../auth/use-auth.js';
import { defaultMatchingApi, FALLBACK_CATALOGS } from './matching-api.js';

export const MATCH_POLL_INTERVAL_MS = 2000;
export const MATCH_MAX_BACKOFF_MS = 16000;
export const MATCH_HEARTBEAT_INTERVAL_MS = 10000;
export const MATCH_LONG_WAIT_MS = 120000;

/**
 * @typedef {'loading' | 'busyOther' | 'criteria' | 'searching' | 'proposal' | 'ended'} MatchPhase
 * @typedef {'cancelled' | 'rejected' | 'expired' | 'leaseExpired'} MatchEndedReason
 * @typedef {{ tone?: 'error' | 'info' | 'warning', message: string, retry?: () => void }} MatchNotice
 * @typedef {{
 *   level: string,
 *   desiredMinutes: number,
 *   allowAdjacent: boolean,
 *   countryCode: string,
 *   ageGroup: string,
 *   gender: string,
 * }} MatchFormState
 */

/** @param {unknown} caught */
function isAbortError(caught) {
  return caught instanceof DOMException && caught.name === 'AbortError';
}

/** @param {unknown} caught */
function isRetryable(caught) {
  return caught instanceof ApiError && caught.isRetryable();
}

/**
 * Executes an async operation and provides a self-contained retry closure
 * without referencing hook callbacks before declaration.
 *
 * @template T
 * @param {() => Promise<T | undefined>} operation
 * @param {(result: T) => void | Promise<void>} onSuccess
 * @param {(caught: unknown, retry: () => void) => void | Promise<void>} onFailure
 */
async function performOperation(operation, onSuccess, onFailure) {
  try {
    const result = await operation();
    if (result !== undefined) {
      await onSuccess(result);
    }
  } catch (caught) {
    const retry = () => void performOperation(operation, onSuccess, onFailure);
    await onFailure(caught, retry);
  }
}

/** @param {unknown} caught */
function toErrorMessage(caught) {
  if (!(caught instanceof ApiError)) {
    return 'Chưa thể hoàn tất yêu cầu. Vui lòng thử lại.';
  }
  switch (caught.code) {
    case 'ACTOR_BUSY':
      return 'Bạn đang tham gia một luồng luyện tập khác. Trạng thái hiện tại đã được đồng bộ lại.';
    case 'PROPOSAL_EXPIRED':
      return 'Đề nghị ghép đã hết hạn. Chiikaiwa không tự tìm lại.';
    case 'PAIR_BLOCKED':
      return 'Không thể ghép với đối tác này. Lượt ghép đã được giải phóng.';
    case 'VERSION_CONFLICT':
      return 'Trạng thái ghép vừa thay đổi. Dữ liệu mới nhất từ máy chủ đã được tải lại.';
    case 'IDEMPOTENCY_CONFLICT':
      return 'Yêu cầu thử lại không còn khớp với thao tác ban đầu. Hãy kiểm tra lại trạng thái.';
    case 'VALIDATION_FAILED':
      return 'Tiêu chí tìm kiếm chưa hợp lệ. Hãy kiểm tra các trường đã chọn.';
    case 'ACCOUNT_LOCKED':
      return 'Tài khoản hiện không thể tham gia ghép tự động.';
    case 'AUTH_REQUIRED':
    case 'SESSION_EXPIRED':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'FORBIDDEN':
    case 'CSRF_INVALID':
      return 'Không thể xác thực thao tác. Vui lòng tải lại trang trước khi thử lại.';
    case 'RATE_LIMITED':
      return caught.retryAfter
        ? `Bạn thao tác quá nhanh. Hãy thử lại sau ${caught.retryAfter} giây.`
        : 'Bạn thao tác quá nhanh. Hãy chờ một lúc rồi thử lại.';
    case 'RESOURCE_NOT_FOUND':
      return 'Chức năng hoặc lượt ghép hiện không khả dụng trên máy chủ.';
    case 'SERVICE_UNAVAILABLE':
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return 'Chưa xác nhận được yêu cầu đã hoàn tất do lỗi kết nối. Bạn có thể thử lại cùng thao tác.';
    default:
      return caught.message || 'Chưa thể hoàn tất yêu cầu. Vui lòng thử lại.';
  }
}

/** @param {import('../auth/auth-context.js').SelfUser | null} user */
function createInitialForm(user) {
  const profile = user?.profile;
  return {
    level: typeof profile?.level === 'string' ? profile.level : '',
    desiredMinutes: 20,
    allowAdjacent: false,
    countryCode: '',
    ageGroup: '',
    gender: '',
  };
}

/** @param {import('./matching-api.js').ActiveSearch} search @returns {MatchFormState} */
function formFromActiveSearch(search) {
  return {
    level: search.criteria.level,
    desiredMinutes: search.criteria.desiredMinutes,
    allowAdjacent: search.criteria.allowAdjacent,
    countryCode: search.criteria.filters?.countryCode ?? '',
    ageGroup: search.criteria.filters?.ageGroup ?? '',
    gender: search.criteria.filters?.gender ?? '',
  };
}

/**
 * @param {{ matchingApi?: import('./matching-api.js').MatchingApiAdapter }} [options]
 */
export function useMatchingFlow({ matchingApi = defaultMatchingApi } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState(/** @type {MatchPhase} */ ('loading'));
  const [reloadKey, setReloadKey] = useState(0);
  const [catalogs, setCatalogs] = useState(
    /** @type {import('./matching-api.js').MatchingCatalogs} */ (
      FALLBACK_CATALOGS
    ),
  );
  const [catalogsWarning, setCatalogsWarning] = useState('');
  const [rawForm, setRawForm] = useState(() => createInitialForm(user));
  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const [coordination, setCoordination] = useState(
    /** @type {import('./matching-api.js').CoordinationState | null} */ (null),
  );
  const [proposal, setProposal] = useState(
    /** @type {import('./matching-api.js').MatchProposal | null} */ (null),
  );
  const [serverTime, setServerTime] = useState(() => new Date().toISOString());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [longWaitDismissed, setLongWaitDismissed] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [notice, setNotice] = useState(
    /** @type {MatchNotice | null} */ (null),
  );
  const [endedReason, setEndedReason] = useState(
    /** @type {MatchEndedReason} */ ('cancelled'),
  );

  const intentKeysRef = useRef(/** @type {Map<string, string>} */ (new Map()));
  const pendingRef = useRef(false);
  const syncSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const phaseRef = useRef(phase);
  const coordinationRef = useRef(coordination);
  const proposalRef = useRef(proposal);

  const profileLevel =
    typeof user?.profile?.level === 'string' ? user.profile.level : '';
  /** @type {MatchFormState} */
  const form = {
    ...rawForm,
    level: rawForm.level || profileLevel,
  };

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    coordinationRef.current = coordination;
  }, [coordination]);

  useEffect(() => {
    proposalRef.current = proposal;
  }, [proposal]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateServerClock = useCallback(
    (/** @type {string} */ nextServerTime) => {
      setServerTime(nextServerTime);
      const parsed = Date.parse(nextServerTime);
      if (Number.isFinite(parsed)) {
        const now = Date.now();
        setClockNow(now);
        setServerOffsetMs(parsed - now);
      }
    },
    [],
  );

  const enterSession = useCallback(
    (/** @type {string} */ sessionId) => {
      navigate(`/room/${encodeURIComponent(sessionId)}`, { replace: true });
    },
    [navigate],
  );

  const applyProposalState = useCallback(
    (
      /** @type {import('./matching-api.js').MatchProposal} */ loadedProposal,
      /** @type {string} */ nextServerTime,
    ) => {
      updateServerClock(nextServerTime);
      proposalRef.current = loadedProposal;
      setProposal(loadedProposal);
      if (loadedProposal.status === 'accepted' && loadedProposal.sessionId) {
        enterSession(loadedProposal.sessionId);
        return;
      }
      if (loadedProposal.status === 'pending') {
        phaseRef.current = 'proposal';
        setPhase('proposal');
        return;
      }
      if (loadedProposal.status === 'rejected') {
        setEndedReason('rejected');
      } else if (loadedProposal.status === 'expired') {
        setEndedReason('expired');
      } else {
        setEndedReason('cancelled');
      }
      phaseRef.current = 'ended';
      setPhase('ended');
    },
    [enterSession, updateServerClock],
  );

  const applyCoordinationState = useCallback(
    async (
      /** @type {import('./matching-api.js').CoordinationState} */ nextCoord,
      /** @type {string} */ nextServerTime,
      /** @type {{ signal?: AbortSignal, seq: number, startEpoch: number, fromPoll?: boolean }} */ ctx,
    ) => {
      if (
        !mountedRef.current ||
        ctx.seq !== syncSeqRef.current ||
        ctx.startEpoch !== getIdentityEpoch()
      ) {
        return;
      }
      updateServerClock(nextServerTime);
      coordinationRef.current = nextCoord;
      setCoordination(nextCoord);

      if (nextCoord.mode === 'inSession' && nextCoord.resourceId) {
        enterSession(nextCoord.resourceId);
        return;
      }

      if (nextCoord.mode === 'proposed' && nextCoord.resourceId) {
        const proposalRes = await matchingApi.readProposal(
          nextCoord.resourceId,
          { signal: ctx.signal },
        );
        if (
          !mountedRef.current ||
          ctx.seq !== syncSeqRef.current ||
          ctx.startEpoch !== getIdentityEpoch()
        ) {
          return;
        }
        applyProposalState(proposalRes.data, proposalRes.serverTime);
        return;
      }

      if (nextCoord.mode === 'searching' && nextCoord.search) {
        const prevRequestId = coordinationRef.current?.search?.requestId;
        if (prevRequestId && prevRequestId !== nextCoord.search.requestId) {
          setLongWaitDismissed(false);
        }
        setProposal(null);
        setRawForm(formFromActiveSearch(nextCoord.search));
        setPhase('searching');
        return;
      }

      if (
        nextCoord.mode === 'inviting' ||
        nextCoord.mode === 'requestingInvite'
      ) {
        setProposal(null);
        setPhase('busyOther');
        return;
      }

      // mode === 'idle'
      setProposal(null);
      if (ctx.fromPoll && phaseRef.current === 'searching') {
        // Server released the search (e.g. lease expired while tab was sleeping or reconciled).
        // Per BR-05 / BE-028: never auto re-search!
        setEndedReason('leaseExpired');
        setPhase('ended');
        return;
      }
      if (ctx.fromPoll && phaseRef.current === 'proposal') {
        setEndedReason('expired');
        setPhase('ended');
        return;
      }
      if (phaseRef.current !== 'ended') {
        setPhase('criteria');
      }
    },
    [applyProposalState, enterSession, matchingApi, updateServerClock],
  );

  const syncFromServer = useCallback(
    async (
      /** @type {{ signal?: AbortSignal, fromPoll?: boolean }} */ options = {},
    ) => {
      const seq = ++syncSeqRef.current;
      const startEpoch = getIdentityEpoch();
      const coordRes = await matchingApi.readCoordination({
        signal: options.signal,
      });
      await applyCoordinationState(coordRes.data, coordRes.serverTime, {
        signal: options.signal,
        seq,
        startEpoch,
        fromPoll: options.fromPoll,
      });
    },
    [applyCoordinationState, matchingApi],
  );

  // Initial load: coordination + catalogs
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      setNotice(null);
      const catalogsPromise = matchingApi
        .readCatalogs({ signal: controller.signal })
        .then((loaded) => {
          if (mountedRef.current) {
            setCatalogs(loaded);
            setCatalogsWarning('');
          }
        })
        .catch((caught) => {
          if (isAbortError(caught)) return;
          if (mountedRef.current) {
            setCatalogsWarning(
              'Không tải được danh mục mới nhất từ máy chủ; đang dùng danh mục mặc định.',
            );
          }
        });

      try {
        await syncFromServer({ signal: controller.signal, fromPoll: false });
      } catch (caught) {
        if (isAbortError(caught)) return;
        if (!mountedRef.current) return;
        if (caught instanceof ApiError && caught.isAuthRequired()) {
          navigate('/login', { replace: true });
          return;
        }
        setNotice({
          tone: 'error',
          message: toErrorMessage(caught),
          retry: () => {
            setPhase('loading');
            setReloadKey((k) => k + 1);
          },
        });
      }
      await catalogsPromise;
    })();

    return () => controller.abort();
  }, [matchingApi, navigate, reloadKey, syncFromServer]);

  // Run an idempotent mutation with duplicate-submit lock & retry key preservation
  const runMutation = useCallback(
    async (
      /** @type {string} */ intent,
      /** @type {(idempotencyKey: string) => Promise<any>} */ action,
    ) => {
      if (pendingRef.current) return undefined;
      pendingRef.current = true;
      setPendingAction(intent);
      setNotice(null);
      setFieldErrors({});
      let key = intentKeysRef.current.get(intent);
      if (!key) {
        key = createIdempotencyKey();
        intentKeysRef.current.set(intent, key);
      }
      try {
        const result = await action(key);
        intentKeysRef.current.delete(intent);
        return result;
      } catch (caught) {
        if (!isRetryable(caught)) {
          intentKeysRef.current.delete(intent);
        }
        throw caught;
      } finally {
        pendingRef.current = false;
        if (mountedRef.current) {
          setPendingAction('');
        }
      }
    },
    [],
  );

  const handleAuthOrFatalError = useCallback(
    (/** @type {unknown} */ caught) => {
      if (caught instanceof ApiError && caught.isAuthRequired()) {
        navigate('/login', { replace: true });
        return true;
      }
      return false;
    },
    [navigate],
  );

  // Elapsed wait clock tick (only updates state in interval callback)
  const activeQueuedAt = coordination?.search?.queuedAt ?? '';
  useEffect(() => {
    if (phase !== 'searching' || !activeQueuedAt) {
      return undefined;
    }
    const intervalId = globalThis.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [activeQueuedAt, phase]);

  const parsedQueuedAt = activeQueuedAt
    ? Date.parse(activeQueuedAt)
    : Number.NaN;
  const elapsedSearchMs =
    phase === 'searching' && Number.isFinite(parsedQueuedAt)
      ? Math.max(0, clockNow + serverOffsetMs - parsedQueuedAt)
      : 0;

  const longWaitVisible =
    phase === 'searching' &&
    !longWaitDismissed &&
    elapsedSearchMs >= MATCH_LONG_WAIT_MS;

  // Non-overlapping 2s polling with 2/4/8/16s error backoff while searching
  const activeSearchRequestId = coordination?.search?.requestId ?? '';
  useEffect(() => {
    if (phase !== 'searching' || !activeSearchRequestId) {
      return undefined;
    }
    let active = true;
    let backoffMs = MATCH_POLL_INTERVAL_MS;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @type {AbortController | undefined} */
    let controller;

    const poll = async () => {
      controller = new AbortController();
      try {
        await syncFromServer({ signal: controller.signal, fromPoll: true });
        if (!active) return;
        backoffMs = MATCH_POLL_INTERVAL_MS;
        setNotice((current) => (current?.tone === 'error' ? null : current));
      } catch (caught) {
        if (!active || isAbortError(caught)) return;
        if (handleAuthOrFatalError(caught)) {
          active = false;
          return;
        }
        if (caught instanceof ApiError && caught.isForbidden()) {
          active = false;
          setNotice({ tone: 'error', message: toErrorMessage(caught) });
          return;
        }
        setNotice({ tone: 'error', message: toErrorMessage(caught) });
        backoffMs = Math.min(backoffMs * 2, MATCH_MAX_BACKOFF_MS);
      } finally {
        if (active) {
          timer = globalThis.setTimeout(poll, backoffMs);
        }
      }
    };

    timer = globalThis.setTimeout(poll, MATCH_POLL_INTERVAL_MS);
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
      controller?.abort();
    };
  }, [activeSearchRequestId, handleAuthOrFatalError, phase, syncFromServer]);

  // Non-overlapping 10s heartbeat while searching
  useEffect(() => {
    if (phase !== 'searching' || !activeSearchRequestId) {
      return undefined;
    }
    let active = true;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @type {AbortController | undefined} */
    let controller;

    const beat = async () => {
      controller = new AbortController();
      const seqAtStart = syncSeqRef.current;
      const epochAtStart = getIdentityEpoch();
      try {
        const res = await matchingApi.sendHeartbeat(activeSearchRequestId, {
          signal: controller.signal,
        });
        if (
          !active ||
          !mountedRef.current ||
          epochAtStart !== getIdentityEpoch() ||
          seqAtStart !== syncSeqRef.current
        ) {
          return;
        }
        updateServerClock(res.serverTime);
        setCoordination((current) =>
          current?.mode === 'searching' &&
          current.search?.requestId === activeSearchRequestId
            ? {
                ...current,
                search: {
                  ...current.search,
                  leaseUntil: res.data.leaseUntil,
                },
              }
            : current,
        );
      } catch (caught) {
        if (!active || isAbortError(caught)) return;
        if (handleAuthOrFatalError(caught)) {
          active = false;
          return;
        }
        if (
          caught instanceof ApiError &&
          (caught.status === 404 || caught.status === 409)
        ) {
          // Search may have transitioned to proposed or expired; sync authoritative state
          try {
            await syncFromServer({ fromPoll: true });
          } catch {
            // Polling will surface persistent network errors.
          }
        }
      } finally {
        if (active) {
          timer = globalThis.setTimeout(beat, MATCH_HEARTBEAT_INTERVAL_MS);
        }
      }
    };

    timer = globalThis.setTimeout(beat, MATCH_HEARTBEAT_INTERVAL_MS);
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
      controller?.abort();
    };
  }, [
    activeSearchRequestId,
    handleAuthOrFatalError,
    matchingApi,
    phase,
    syncFromServer,
    updateServerClock,
  ]);

  // Non-overlapping 2s polling with 2/4/8/16s backoff while proposal is pending
  const activeProposalId = proposal?.id ?? '';
  const activeProposalStatus = proposal?.status ?? '';
  useEffect(() => {
    if (
      phase !== 'proposal' ||
      !activeProposalId ||
      activeProposalStatus !== 'pending'
    ) {
      return undefined;
    }
    let active = true;
    let backoffMs = MATCH_POLL_INTERVAL_MS;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @type {AbortController | undefined} */
    let controller;

    const pollProposal = async () => {
      controller = new AbortController();
      const seq = ++syncSeqRef.current;
      const startEpoch = getIdentityEpoch();
      try {
        const res = await matchingApi.readProposal(activeProposalId, {
          signal: controller.signal,
        });
        if (
          !active ||
          !mountedRef.current ||
          seq !== syncSeqRef.current ||
          startEpoch !== getIdentityEpoch()
        ) {
          return;
        }
        backoffMs = MATCH_POLL_INTERVAL_MS;
        setNotice((current) => (current?.tone === 'error' ? null : current));
        applyProposalState(res.data, res.serverTime);
      } catch (caught) {
        if (!active || isAbortError(caught)) return;
        if (handleAuthOrFatalError(caught)) {
          active = false;
          return;
        }
        if (caught instanceof ApiError && caught.isForbidden()) {
          active = false;
          setNotice({ tone: 'error', message: toErrorMessage(caught) });
          return;
        }
        setNotice({ tone: 'error', message: toErrorMessage(caught) });
        backoffMs = Math.min(backoffMs * 2, MATCH_MAX_BACKOFF_MS);
      } finally {
        if (active) {
          timer = globalThis.setTimeout(pollProposal, backoffMs);
        }
      }
    };

    timer = globalThis.setTimeout(pollProposal, MATCH_POLL_INTERVAL_MS);
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
      controller?.abort();
    };
  }, [
    activeProposalId,
    activeProposalStatus,
    applyProposalState,
    handleAuthOrFatalError,
    matchingApi,
    phase,
  ]);

  // Background tab resume: sync authoritative state immediately when tab becomes visible
  useEffect(() => {
    if (phase !== 'searching' && phase !== 'proposal') return undefined;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendingRef.current) return;
      void syncFromServer({ fromPoll: true }).catch(() => {
        // Polling loop will display errors if persistent.
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [phase, syncFromServer]);

  /** Starts a new matching search. */
  const startSearch = useCallback(async () => {
    const errors = /** @type {Record<string, string>} */ ({});
    if (!form.level) {
      errors.level = 'Vui lòng chọn trình độ tiếng Nhật của bạn.';
    }
    if (![10, 20, 30].includes(Number(form.desiredMinutes))) {
      errors.desiredMinutes = 'Vui lòng chọn thời lượng 10, 20 hoặc 30 phút.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    intentKeysRef.current.delete('create-search');

    /** @type {import('./matching-api.js').MatchingCriteria} */
    const criteria = {
      level: form.level,
      desiredMinutes: Number(form.desiredMinutes),
      allowAdjacent: form.allowAdjacent,
      filters: {
        ...(form.countryCode ? { countryCode: form.countryCode } : {}),
        ...(form.ageGroup ? { ageGroup: form.ageGroup } : {}),
        ...(form.gender ? { gender: form.gender } : {}),
      },
    };

    await performOperation(
      async () => {
        const seq = ++syncSeqRef.current;
        const startEpoch = getIdentityEpoch();
        const created = await runMutation('create-search', (idempotencyKey) =>
          matchingApi.createSearch(criteria, { idempotencyKey }),
        );
        return created ? { created, seq, startEpoch } : undefined;
      },
      async ({ created, seq, startEpoch }) => {
        setLongWaitDismissed(false);
        await applyCoordinationState(created.data, created.serverTime, {
          seq,
          startEpoch,
          fromPoll: false,
        });
      },
      async (caught, retry) => {
        if (handleAuthOrFatalError(caught)) return;
        if (caught instanceof ApiError && caught.isValidationError()) {
          setFieldErrors(caught.getFieldErrors());
        }
        if (caught instanceof ApiError && caught.code === 'ACTOR_BUSY') {
          try {
            await syncFromServer({ fromPoll: false });
          } catch {
            // Keep conflict notice below.
          }
        }
        setNotice({
          tone: 'error',
          message: toErrorMessage(caught),
          retry: isRetryable(caught) ? retry : undefined,
        });
      },
    );
  }, [
    applyCoordinationState,
    form.ageGroup,
    form.allowAdjacent,
    form.countryCode,
    form.desiredMinutes,
    form.gender,
    form.level,
    handleAuthOrFatalError,
    matchingApi,
    runMutation,
    syncFromServer,
  ]);

  /**
   * Cancels the active search and waits for server confirmation before transitioning.
   * @param {'ended' | 'editCriteria' | 'invitation' | 'review'} nextAction
   */
  const cancelSearchAndThen = useCallback(
    async (nextAction = 'ended') => {
      const currentCoord = coordinationRef.current;
      const requestId = currentCoord?.search?.requestId;
      if (!currentCoord || !requestId) return;

      const intent = `cancel-search-${requestId}`;
      intentKeysRef.current.delete(intent);
      const expectedVersion = currentCoord.version;

      await performOperation(
        () =>
          runMutation(intent, (idempotencyKey) =>
            matchingApi.cancelSearch(
              { requestId, expectedVersion },
              { idempotencyKey },
            ),
          ),
        () => {
          ++syncSeqRef.current;
          setCoordination((prev) =>
            prev ? { mode: 'idle', version: prev.version + 1 } : null,
          );
          setProposal(null);
          setLongWaitDismissed(false);

          if (nextAction === 'editCriteria') {
            setPhase('criteria');
          } else if (nextAction === 'invitation') {
            navigate('/invitation?mode=create');
          } else if (nextAction === 'review') {
            navigate('/saved');
          } else {
            setEndedReason('cancelled');
            setPhase('ended');
          }
        },
        async (caught, retry) => {
          if (handleAuthOrFatalError(caught)) return;
          if (
            caught instanceof ApiError &&
            (caught.isVersionConflict() || caught.status === 404)
          ) {
            try {
              await syncFromServer({ fromPoll: false });
            } catch {
              // Keep conflict notice.
            }
          }
          setNotice({
            tone: 'error',
            message: toErrorMessage(caught),
            retry: isRetryable(caught) ? retry : undefined,
          });
        },
      );
    },
    [
      handleAuthOrFatalError,
      matchingApi,
      navigate,
      runMutation,
      syncFromServer,
    ],
  );

  /**
   * Accepts or rejects the current match proposal.
   * @param {'accept' | 'reject'} decision
   */
  const respondProposal = useCallback(
    async (/** @type {'accept' | 'reject'} */ decision) => {
      const currentProposal = proposalRef.current;
      if (!currentProposal || currentProposal.status !== 'pending') return;

      const intent = `${decision}-proposal-${currentProposal.id}-v${currentProposal.version}`;
      intentKeysRef.current.delete(intent);
      const snapshot = {
        id: currentProposal.id,
        version: currentProposal.version,
      };

      await performOperation(
        async () => {
          const seq = ++syncSeqRef.current;
          const startEpoch = getIdentityEpoch();
          const res = await runMutation(intent, (idempotencyKey) =>
            matchingApi.respondToProposal(snapshot, decision, {
              idempotencyKey,
            }),
          );
          return res ? { res, seq, startEpoch } : undefined;
        },
        ({ res, seq, startEpoch }) => {
          if (
            !mountedRef.current ||
            seq !== syncSeqRef.current ||
            startEpoch !== getIdentityEpoch()
          ) {
            return;
          }
          applyProposalState(res.data, res.serverTime);
        },
        async (caught, retry) => {
          if (handleAuthOrFatalError(caught)) return;
          if (
            caught instanceof ApiError &&
            (caught.isVersionConflict() ||
              caught.code === 'PROPOSAL_EXPIRED' ||
              caught.code === 'PAIR_BLOCKED')
          ) {
            try {
              await syncFromServer({ fromPoll: false });
            } catch {
              // Keep error notice below.
            }
          }
          setNotice({
            tone: 'error',
            message: toErrorMessage(caught),
            retry: isRetryable(caught) ? retry : undefined,
          });
        },
      );
    },
    [
      applyProposalState,
      handleAuthOrFatalError,
      matchingApi,
      runMutation,
      syncFromServer,
    ],
  );

  /** Cancels the current proposal and releases both actors. */
  const cancelActiveProposal = useCallback(async () => {
    const currentProposal = proposalRef.current;
    if (!currentProposal) return;

    const intent = `cancel-proposal-${currentProposal.id}-v${currentProposal.version}`;
    intentKeysRef.current.delete(intent);
    const snapshot = {
      id: currentProposal.id,
      version: currentProposal.version,
    };

    await performOperation(
      () =>
        runMutation(intent, (idempotencyKey) =>
          matchingApi.cancelProposal(snapshot, { idempotencyKey }),
        ),
      () => {
        ++syncSeqRef.current;
        setProposal(null);
        setEndedReason('cancelled');
        setPhase('ended');
      },
      async (caught, retry) => {
        if (handleAuthOrFatalError(caught)) return;
        if (
          caught instanceof ApiError &&
          (caught.isVersionConflict() ||
            caught.code === 'PROPOSAL_EXPIRED' ||
            caught.status === 404)
        ) {
          try {
            await syncFromServer({ fromPoll: false });
          } catch {
            // Keep error notice below.
          }
        }
        setNotice({
          tone: 'error',
          message: toErrorMessage(caught),
          retry: isRetryable(caught) ? retry : undefined,
        });
      },
    );
  }, [handleAuthOrFatalError, matchingApi, runMutation, syncFromServer]);

  const continueWaiting = useCallback(() => {
    setLongWaitDismissed(true);
  }, []);

  const returnToCriteria = useCallback(() => {
    setNotice(null);
    setProposal(null);
    setLongWaitDismissed(false);
    setPhase('criteria');
  }, []);

  const syncProposalOnExpire = useCallback(() => {
    if (pendingRef.current) return;
    void syncFromServer({ fromPoll: true }).catch(() => {
      // Polling loop handles persistent errors.
    });
  }, [syncFromServer]);

  const updateForm = useCallback(
    (/** @type {Partial<MatchFormState>} */ patch) => {
      setRawForm((current) => ({ ...current, ...patch }));
      setFieldErrors((current) => {
        if (Object.keys(current).length === 0) return current;
        const next = { ...current };
        for (const key of Object.keys(patch)) {
          delete next[key];
        }
        return next;
      });
    },
    [],
  );

  return {
    user,
    phase,
    catalogs,
    catalogsWarning,
    form,
    fieldErrors,
    coordination,
    proposal,
    serverTime,
    elapsedSearchMs,
    longWaitVisible,
    pendingAction,
    notice,
    endedReason,
    setNotice,
    updateForm,
    startSearch,
    cancelSearch: () => cancelSearchAndThen('ended'),
    editCriteriaFromSearch: () => cancelSearchAndThen('editCriteria'),
    switchToInvitationFromSearch: () => cancelSearchAndThen('invitation'),
    switchToReviewFromSearch: () => cancelSearchAndThen('review'),
    continueWaiting,
    respondProposal,
    cancelActiveProposal,
    returnToCriteria,
    syncProposalOnExpire,
    goHome: () => navigate('/home'),
  };
}
