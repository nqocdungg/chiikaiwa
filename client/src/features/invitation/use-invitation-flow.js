import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/use-auth.js';
import { api, createIdempotencyKey } from '../../services/api-client.js';
import { ApiError } from '../../services/errors.js';
import {
  cancelInvitation as cancelInvitationApi,
  cancelInviteRequest as cancelInviteRequestApi,
  createGuestTrial,
  createInvitation as createInvitationApi,
  createInviteRequest,
  isValidInvitationCode,
  normalizeInvitationCode,
  readInvitation,
  readInviteRequest,
  readPendingRequests,
  respondToInviteRequest,
} from './invitation-api.js';

const POLL_INTERVAL_MS = 2000;

/** @typedef {{tone?: string, message: string, retry?: () => void, field?: string}} InvitationNotice */

/**
 * @template T
 * @param {() => Promise<T | undefined>} operation
 * @param {(result: T) => void | Promise<void>} success
 * @param {(caught: unknown, retry: () => void) => void | Promise<void>} failure
 */
async function performOperation(operation, success, failure) {
  try {
    const result = await operation();
    if (result !== undefined) await success(result);
  } catch (caught) {
    const retry = () => void performOperation(operation, success, failure);
    await failure(caught, retry);
  }
}

/** @param {unknown} caught */
function errorMessage(caught) {
  if (!(caught instanceof ApiError)) {
    return 'Chưa thể hoàn tất yêu cầu. Vui lòng thử lại.';
  }
  switch (caught.code) {
    case 'INVITATION_UNAVAILABLE':
      return 'Mã mời không còn sử dụng được. Hãy kiểm tra mã hoặc xin mã mới.';
    case 'IDENTITY_CONFLICT':
      return 'Bạn đang dùng phiên tài khoản. Hãy tham gia bằng tài khoản hiện tại.';
    case 'ACTOR_BUSY':
      return 'Bạn đang có một luồng luyện tập khác. Hãy kết thúc luồng đó trước.';
    case 'PAIR_BLOCKED':
      return 'Không thể tham gia phòng mời này.';
    case 'ACCOUNT_LOCKED':
      return 'Tài khoản hiện không thể tham gia phòng mời.';
    case 'VERSION_CONFLICT':
      return 'Trạng thái phòng vừa thay đổi. Dữ liệu mới nhất đã được tải lại.';
    case 'IDEMPOTENCY_CONFLICT':
      return 'Yêu cầu thử lại không còn khớp với thao tác ban đầu.';
    case 'RATE_LIMITED':
      return caught.retryAfter
        ? `Bạn thao tác quá nhanh. Hãy thử lại sau ${caught.retryAfter} giây.`
        : 'Bạn thao tác quá nhanh. Hãy chờ một lúc rồi thử lại.';
    case 'GUEST_EXPIRED':
    case 'SESSION_EXPIRED':
      return 'Quyền truy cập tạm đã hết hạn.';
    case 'SERVICE_UNAVAILABLE':
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return 'Chưa xác nhận được yêu cầu đã hoàn tất. Hãy thử lại để kiểm tra cùng thao tác.';
    default:
      return caught.message || 'Chưa thể hoàn tất yêu cầu. Vui lòng thử lại.';
  }
}

/** @param {unknown} caught */
function isRetryable(caught) {
  return caught instanceof ApiError && caught.isRetryable();
}

export function useInvitationFlow() {
  const { kind, user, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const [phase, setPhase] = useState('loading');
  const [invitation, setInvitation] = useState(
    /** @type {import('./invitation-api.js').Invitation | null} */ (null),
  );
  const [requests, setRequests] = useState(
    /** @type {import('./invitation-api.js').InviteRequest[]} */ ([]),
  );
  const [inviteRequest, setInviteRequest] = useState(
    /** @type {import('./invitation-api.js').InviteRequest | null} */ (null),
  );
  const [serverTime, setServerTime] = useState(new Date().toISOString());
  const [pendingAction, setPendingAction] = useState('');
  const [notice, setNotice] = useState(
    /** @type {InvitationNotice | null} */ (null),
  );
  const [endedReason, setEndedReason] = useState('cancelled');
  const intentKeysRef = useRef(new Map());
  const pendingRef = useRef(false);

  const setFailure = useCallback(
    (/** @type {unknown} */ caught, /** @type {() => void} */ retry) => {
      setNotice({
        tone: 'error',
        message: errorMessage(caught),
        retry: isRetryable(caught) ? retry : undefined,
      });
    },
    [],
  );

  const runMutation = useCallback(
    async (
      /** @type {string} */ intent,
      /** @type {(key: string) => Promise<any>} */ action,
    ) => {
      if (pendingRef.current) return undefined;
      pendingRef.current = true;
      setPendingAction(intent);
      setNotice(null);
      let idempotencyKey = intentKeysRef.current.get(intent);
      if (!idempotencyKey) {
        idempotencyKey = createIdempotencyKey();
        intentKeysRef.current.set(intent, idempotencyKey);
      }
      try {
        const result = await action(idempotencyKey);
        intentKeysRef.current.delete(intent);
        return result;
      } catch (caught) {
        if (!isRetryable(caught)) intentKeysRef.current.delete(intent);
        throw caught;
      } finally {
        pendingRef.current = false;
        setPendingAction('');
      }
    },
    [],
  );

  const enterSession = useCallback(
    async (/** @type {string} */ sessionId) => {
      if (kind === 'guest') {
        try {
          await refreshSession();
        } catch {
          // SessionMemberRoute still verifies membership against the server.
        }
      }
      navigate(`/room/${encodeURIComponent(sessionId)}`, { replace: true });
    },
    [kind, navigate, refreshSession],
  );

  const loadHostState = useCallback(
    async (
      /** @type {string} */ invitationId,
      /** @type {AbortSignal | undefined} */ signal,
    ) => {
      const [loadedInvitation, loadedRequests] = await Promise.all([
        readInvitation(invitationId, { signal }),
        readPendingRequests(invitationId, { signal }),
      ]);
      setInvitation(loadedInvitation.data);
      setRequests(loadedRequests.data);
      setServerTime(loadedInvitation.serverTime);
      if (loadedInvitation.data.sessionId) {
        await enterSession(loadedInvitation.data.sessionId);
        return;
      }
      if (loadedInvitation.data.status !== 'open') {
        setEndedReason(loadedInvitation.data.status);
        setPhase('ended');
        return;
      }
      setPhase(loadedRequests.data.length ? 'hostRequest' : 'hostWaiting');
    },
    [enterSession],
  );

  const loadRequesterState = useCallback(
    async (
      /** @type {string} */ requestId,
      /** @type {AbortSignal | undefined} */ signal,
    ) => {
      const loaded = await readInviteRequest(requestId, { signal });
      setInviteRequest(loaded.data);
      setServerTime(loaded.serverTime);
      if (loaded.data.status === 'accepted' && loaded.data.sessionId) {
        await enterSession(loaded.data.sessionId);
        return;
      }
      if (loaded.data.status !== 'pending') {
        setEndedReason(loaded.data.status);
        setPhase('ended');
        return;
      }
      setPhase('requestWaiting');
    },
    [enterSession],
  );

  const createHostInvitation = useCallback(async () => {
    await performOperation(
      () =>
        runMutation('create-invitation', (idempotencyKey) =>
          createInvitationApi({ idempotencyKey }),
        ),
      (created) => {
        setInvitation(created.data);
        setRequests([]);
        setServerTime(created.serverTime);
        setPhase('hostWaiting');
      },
      (caught, retry) => setFailure(caught, retry),
    );
  }, [runMutation, setFailure]);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      if (kind === 'unauthenticated') {
        setPhase('join');
        return;
      }
      try {
        const response = await api.get('/me/coordination', {
          signal: controller.signal,
        });
        const coordination =
          /** @type {{mode?: string, resourceId?: string}} */ (response.data);
        if (coordination.mode === 'inSession' && coordination.resourceId) {
          await enterSession(coordination.resourceId);
        } else if (
          coordination.mode === 'inviting' &&
          coordination.resourceId
        ) {
          await loadHostState(coordination.resourceId, controller.signal);
        } else if (
          coordination.mode === 'requestingInvite' &&
          coordination.resourceId
        ) {
          await loadRequesterState(coordination.resourceId, controller.signal);
        } else if (coordination.mode === 'idle') {
          if (requestedMode === 'create' && kind === 'user') {
            await createHostInvitation();
          } else {
            setPhase('join');
          }
        } else {
          setNotice({
            tone: 'error',
            message:
              'Bạn đang có một luồng luyện tập khác. Hãy quay lại trang chính để tiếp tục.',
          });
          setPhase('join');
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError')
          return;
        setFailure(caught, () => navigate(0));
        setPhase(
          requestedMode === 'create' && kind === 'user' ? 'loading' : 'join',
        );
      }
    })();

    return () => controller.abort();
  }, [
    createHostInvitation,
    enterSession,
    kind,
    loadHostState,
    loadRequesterState,
    navigate,
    requestedMode,
    setFailure,
  ]);

  useEffect(() => {
    if (
      !invitation?.id ||
      invitation.status !== 'open' ||
      (phase !== 'hostWaiting' && phase !== 'hostRequest')
    ) {
      return undefined;
    }
    let active = true;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @type {AbortController | undefined} */
    let controller;
    const poll = async () => {
      controller = new AbortController();
      try {
        await loadHostState(invitation.id, controller.signal);
        if (active) setNotice(null);
      } catch (caught) {
        if (
          active &&
          !(caught instanceof DOMException && caught.name === 'AbortError')
        ) {
          setNotice({ tone: 'error', message: errorMessage(caught) });
        }
      } finally {
        if (active) timer = globalThis.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    timer = globalThis.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
      controller?.abort();
    };
  }, [invitation?.id, invitation?.status, loadHostState, phase]);

  useEffect(() => {
    if (!inviteRequest?.id || inviteRequest.status !== 'pending') {
      return undefined;
    }
    let active = true;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @type {AbortController | undefined} */
    let controller;
    const poll = async () => {
      controller = new AbortController();
      try {
        await loadRequesterState(inviteRequest.id, controller.signal);
        if (active) setNotice(null);
      } catch (caught) {
        if (
          active &&
          !(caught instanceof DOMException && caught.name === 'AbortError')
        ) {
          setNotice({ tone: 'error', message: errorMessage(caught) });
        }
      } finally {
        if (active) timer = globalThis.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    timer = globalThis.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
      controller?.abort();
    };
  }, [inviteRequest?.id, inviteRequest?.status, loadRequesterState]);

  const submitCode = useCallback(
    async (/** @type {string} */ rawCode, reuseIntent = false) => {
      const code = normalizeInvitationCode(rawCode);
      if (!reuseIntent) intentKeysRef.current.delete('join-code');
      if (!isValidInvitationCode(code)) {
        setNotice({
          tone: 'error',
          field: 'code',
          message: 'Mã mời phải gồm đúng 10 chữ cái in hoa hoặc chữ số hợp lệ.',
        });
        return;
      }
      await performOperation(
        () =>
          runMutation('join-code', (idempotencyKey) =>
            kind === 'unauthenticated'
              ? createGuestTrial(code, { idempotencyKey })
              : createInviteRequest(code, { idempotencyKey }),
          ),
        async (result) => {
          const request =
            kind === 'unauthenticated' ? result.data.request : result.data;
          setInviteRequest(request);
          setServerTime(result.serverTime);
          setPhase('requestWaiting');
          if (kind === 'unauthenticated') await refreshSession();
        },
        (caught, retry) => setFailure(caught, retry),
      );
    },
    [kind, refreshSession, runMutation, setFailure],
  );

  const cancelInvitation = useCallback(async () => {
    if (!invitation) return;
    await performOperation(
      () =>
        runMutation('cancel-invitation', (idempotencyKey) =>
          cancelInvitationApi(invitation, { idempotencyKey }),
        ),
      () => {
        setEndedReason('cancelled');
        setPhase('ended');
      },
      async (caught, retry) => {
        if (caught instanceof ApiError && caught.isVersionConflict()) {
          try {
            await loadHostState(invitation.id, undefined);
          } catch {
            // Keep the original conflict as the actionable message.
          }
        }
        setFailure(caught, retry);
      },
    );
  }, [invitation, loadHostState, runMutation, setFailure]);

  const cancelRequest = useCallback(async () => {
    if (!inviteRequest) return;
    await performOperation(
      () =>
        runMutation('cancel-request', (idempotencyKey) =>
          cancelInviteRequestApi(inviteRequest, { idempotencyKey }),
        ),
      () => {
        setEndedReason('cancelled');
        setPhase('ended');
      },
      async (caught, retry) => {
        if (caught instanceof ApiError && caught.isVersionConflict()) {
          try {
            await loadRequesterState(inviteRequest.id, undefined);
          } catch {
            // Keep the original conflict as the actionable message.
          }
        }
        setFailure(caught, retry);
      },
    );
  }, [inviteRequest, loadRequesterState, runMutation, setFailure]);

  const respond = useCallback(
    async (/** @type {'accept' | 'reject'} */ decision) => {
      const request = requests[0];
      if (!request) return;
      const intent = `${decision}-request-${request.id}`;
      await performOperation(
        () =>
          runMutation(intent, (idempotencyKey) =>
            respondToInviteRequest(request, decision, { idempotencyKey }),
          ),
        async (result) => {
          if (decision === 'accept' && result.data.sessionId) {
            await enterSession(result.data.sessionId);
            return;
          }
          setRequests((current) =>
            current.filter((item) => item.id !== request.id),
          );
          setPhase(requests.length > 1 ? 'hostRequest' : 'hostWaiting');
        },
        async (caught, retry) => {
          if (
            caught instanceof ApiError &&
            caught.isVersionConflict() &&
            invitation
          ) {
            try {
              await loadHostState(invitation.id, undefined);
            } catch {
              // Keep the original conflict as the actionable message.
            }
          }
          setFailure(caught, retry);
        },
      );
    },
    [
      enterSession,
      invitation,
      loadHostState,
      requests,
      runMutation,
      setFailure,
    ],
  );

  const handleClose = useCallback(() => {
    if (phase === 'hostWaiting' || phase === 'hostRequest') {
      void cancelInvitation();
    } else if (phase === 'requestWaiting') {
      void cancelRequest();
    } else {
      navigate(kind === 'user' ? '/home' : '/', { replace: true });
    }
  }, [cancelInvitation, cancelRequest, kind, navigate, phase]);

  const resetJoin = useCallback(() => {
    setInviteRequest(null);
    setNotice(null);
    setPhase('join');
  }, []);

  return {
    kind,
    user,
    phase,
    invitation,
    requests,
    inviteRequest,
    serverTime,
    pendingAction,
    notice,
    endedReason,
    setNotice,
    createHostInvitation,
    submitCode,
    cancelInvitation,
    cancelRequest,
    respond,
    handleClose,
    resetJoin,
    goHome: () => navigate(kind === 'user' ? '/home' : '/', { replace: true }),
    syncHost: () => {
      if (!invitation) return;
      void performOperation(
        async () => {
          await loadHostState(invitation.id, undefined);
          return true;
        },
        () => undefined,
        setFailure,
      );
    },
    syncRequester: () => {
      if (!inviteRequest) return;
      void performOperation(
        async () => {
          await loadRequesterState(inviteRequest.id, undefined);
          return true;
        },
        () => undefined,
        setFailure,
      );
    },
  };
}
