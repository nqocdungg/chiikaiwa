import { useEffect, useReducer, useRef, useState } from 'react';
import { getIdentityEpoch, onClearPrivateCache } from '../../services/cache.js';
import { createIdempotencyKey } from '../../services/api-client.js';
import { createMediaRoom } from './media-room.js';
import { getMediaToken, getSession, leaveSession } from './session-api.js';

/** @param {string} sessionId */
export function useSessionRoom(sessionId) {
  const [session, setSession] = useState(
    /** @type {import('./session-api.js').Session|null} */ (null),
  );
  const [messages, setMessages] = useState(
    /** @type {{id: string, sender: string, text: string}[]} */ ([]),
  );
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const sessionVersion = useRef(-1);
  const [, update] = useReducer((value) => value + 1, 0);
  const mediaRef = useRef(
    /** @type {ReturnType<typeof createMediaRoom>|null} */ (null),
  );
  const [media, setMedia] = useState(
    /** @type {ReturnType<typeof createMediaRoom>|null} */ (null),
  );
  const scope = useRef({ alive: false, epoch: 0 });
  const requestRef = useRef(/** @type {AbortController|null} */ (null));
  const refreshRef = useRef(() => {});
  const leaveKey = useRef(createIdempotencyKey());
  const connectingRef = useRef(false);
  const leavingRef = useRef(false);
  const connectionGeneration = useRef(0);
  useEffect(() => {
    const current = { alive: true, epoch: getIdentityEpoch() };
    const generation = connectionGeneration;
    scope.current = current;
    const abort = new AbortController();
    requestRef.current = abort;
    let delay = 2000;
    let failures = 0;
    let busy = false;
    let requested = false;
    let ended = false;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    const valid = () => current.alive && current.epoch === getIdentityEpoch();
    async function refresh() {
      if (!valid() || ended) return;
      if (busy) {
        requested = true;
        return;
      }
      clearTimeout(timer);
      busy = true;
      let succeeded = false;
      try {
        const result = await getSession(sessionId, abort.signal);
        if (!valid() || result.epoch !== current.epoch) return;
        setSession((previous) =>
          previous && previous.version > result.data.version
            ? previous
            : result.data,
        );
        setError('');
        sessionVersion.current = Math.max(
          sessionVersion.current,
          result.data.version,
        );
        delay = 2000;
        failures = 0;
        succeeded = true;
        if (result.data.status === 'ended') {
          ended = true;
          connectionGeneration.current++;
          setMessages([]);
          await mediaRef.current?.dispose();
          mediaRef.current = null;
          setMedia(null);
        }
      } catch (failure) {
        if (!valid()) return;
        const status = /** @type {{status?: number}} */ (failure)?.status;
        if (
          status === 401 ||
          status === 403 ||
          status === 404 ||
          status === 410
        ) {
          ended = true;
          connectionGeneration.current++;
          setSession(null);
          setAccessDenied(true);
          setMessages([]);
          await mediaRef.current?.dispose();
          mediaRef.current = null;
          setMedia(null);
        }
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không tải được trạng thái phiên.',
        );
        delay = Math.min(2000 * 2 ** Math.min(failures++, 3), 16000);
      } finally {
        busy = false;
        if (valid() && !ended) {
          timer = setTimeout(refresh, requested && succeeded ? 0 : delay);
          requested = false;
        }
      }
    }
    refreshRef.current = () => {
      void refresh();
    };
    void refresh();
    const unsubscribe = onClearPrivateCache(() => {
      current.alive = false;
      connectionGeneration.current++;
      abort.abort();
      clearTimeout(timer);
      void mediaRef.current?.dispose();
      mediaRef.current = null;
      setMedia(null);
      setSession(null);
      setAccessDenied(true);
      setMessages([]);
      setError(
        'Danh tính đã thay đổi. Hãy mở lại phòng với tài khoản hiện tại.',
      );
    });
    return () => {
      unsubscribe();
      current.alive = false;
      generation.current++;
      abort.abort();
      clearTimeout(timer);
      void mediaRef.current?.dispose();
      mediaRef.current = null;
    };
  }, [sessionId]);
  const valid = () =>
    scope.current.alive && scope.current.epoch === getIdentityEpoch();
  async function connect() {
    if (
      !session ||
      session.status === 'ended' ||
      connectingRef.current ||
      leavingRef.current ||
      !valid()
    )
      return;
    connectingRef.current = true;
    const attempt = ++connectionGeneration.current;
    const currentScope = scope.current;
    const isCurrent = () =>
      valid() &&
      scope.current === currentScope &&
      attempt === connectionGeneration.current;
    /** @type {ReturnType<typeof createMediaRoom>|null} */
    let createdMedia = null;
    setConnecting(true);
    setMediaError('');
    try {
      await mediaRef.current?.dispose();
      if (!isCurrent()) return;
      mediaRef.current = null;
      setMedia(null);
      const result = await getMediaToken(sessionId, requestRef.current?.signal);
      if (!isCurrent() || result.epoch !== currentScope.epoch) return;
      const media = createMediaRoom({
        sessionId,
        memberKeys: session.members.map((member) => member.actorKey),
        onChange: () => {
          if (isCurrent()) update();
        },
        onMessage: (message) => {
          if (isCurrent())
            setMessages((previous) =>
              previous.some((item) => item.id === message.id)
                ? previous
                : [...previous.slice(-199), message],
            );
        },
        onSessionUpdate: (version) => {
          if (version > sessionVersion.current) refreshRef.current();
        },
      });
      mediaRef.current = media;
      setMedia(media);
      createdMedia = media;
      await media.connect(result.data);
      if (!isCurrent()) {
        await media.dispose();
        return;
      }
      refreshRef.current();
    } catch (failure) {
      await createdMedia?.dispose();
      if (mediaRef.current === createdMedia) {
        mediaRef.current = null;
        if (isCurrent()) setMedia(null);
      }
      if (isCurrent())
        setMediaError(
          failure instanceof Error
            ? failure.message
            : 'Không kết nối được cuộc gọi.',
        );
    } finally {
      connectingRef.current = false;
      if (valid()) setConnecting(false);
    }
  }
  async function leave() {
    if (leavingRef.current || !valid()) return;
    leavingRef.current = true;
    connectionGeneration.current++;
    setLeaving(true);
    setError('');
    await mediaRef.current?.dispose();
    mediaRef.current = null;
    setMedia(null);
    setMessages([]);
    try {
      const result = await leaveSession(sessionId, leaveKey.current);
      if (valid() && result.epoch === scope.current.epoch) {
        setSession(result.data);
        refreshRef.current();
      }
    } catch (failure) {
      if (valid())
        setError(
          failure instanceof Error
            ? failure.message
            : 'Chưa xác nhận được việc rời phiên. Hãy thử lại.',
        );
    } finally {
      leavingRef.current = false;
      if (valid()) setLeaving(false);
    }
  }
  return {
    session,
    messages,
    media,
    error,
    mediaError,
    connecting,
    leaving,
    accessDenied,
    connect,
    leave,
    refresh: () => refreshRef.current(),
  };
}
