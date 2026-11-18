import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionState } from 'livekit-client';
import { useSessionRoom } from '../../client/src/features/kaiwa/use-session-room.js';
import {
  getMediaToken,
  getSession,
  leaveSession,
} from '../../client/src/features/kaiwa/session-api.js';
import { createMediaRoom } from '../../client/src/features/kaiwa/media-room.js';
import {
  clearPrivateCache,
  getIdentityEpoch,
} from '../../client/src/services/cache.js';
import { KaiwaRoom } from '../../client/src/features/kaiwa/KaiwaRoom.jsx';
import { RoomPreview } from '../../client/src/demo/RoomPreview.jsx';
import { MemoryRouter } from 'react-router';

vi.mock('../../client/src/features/kaiwa/session-api.js', () => ({
  getSession: vi.fn(),
  getMediaToken: vi.fn(),
  leaveSession: vi.fn(),
}));
vi.mock('../../client/src/features/kaiwa/media-room.js', () => ({
  createMediaRoom: vi.fn(),
}));

/** @type {import('../../client/src/features/kaiwa/session-api.js').Session} */
const preparing = {
  id: 'session-a',
  status: 'preparing',
  version: 1,
  members: [
    { actorKey: 'user:a', displayName: 'Minh Anh' },
    { actorKey: 'user:b', displayName: 'An Nhiên' },
  ],
  activeDurationMs: 0,
  selectionRemainingMs: 60000,
};
function response(data = preparing) {
  return { data, meta: {}, epoch: getIdentityEpoch() };
}
function deferred() {
  /** @type {(value: any) => void} */
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve: (/** @type {any} */ value) => resolve(value) };
}
function fakeMedia() {
  return {
    room: {
      state: ConnectionState.Connected,
      localParticipant: {
        identity: 'user:a',
        isCameraEnabled: false,
        isMicrophoneEnabled: false,
        getTrackPublication: () => undefined,
      },
      remoteParticipants: new Map(),
      canPlaybackAudio: true,
    },
    pendingDevices: new Set(),
    deviceErrors: new Map(),
    connect: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    setDevice: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getSession).mockImplementation(async () => response());
  vi.mocked(getMediaToken).mockResolvedValue({
    data: { url: 'wss://test.invalid', token: 'test-token', expiresAt: '' },
    meta: {},
    epoch: getIdentityEpoch(),
  });
  vi.mocked(leaveSession).mockImplementation(async () =>
    response({ ...preparing, status: 'ended', version: 2 }),
  );
  vi.mocked(createMediaRoom).mockImplementation(
    () => /** @type {any} */ (fakeMedia()),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('Session lifecycle', () => {
  it('does not treat an SDK connection as an active Session', async () => {
    const { result } = renderHook(() => useSessionRoom('session-a'));
    await act(async () => {});
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.media).not.toBeNull();
    expect(result.current.session?.status).toBe('preparing');
  });
  it('never connects a media-token response arriving after leave', async () => {
    const token = deferred();
    vi.mocked(getMediaToken).mockReturnValue(token.promise);
    const { result } = renderHook(() => useSessionRoom('session-a'));
    await act(async () => {});
    /** @type {Promise<void>|undefined} */
    let pending;
    await act(async () => {
      pending = result.current.connect();
    });
    await act(async () => {
      await result.current.leave();
    });
    await act(async () => {
      token.resolve({
        data: { url: 'wss://test.invalid', token: 'token' },
        epoch: getIdentityEpoch(),
      });
      await pending;
    });
    expect(createMediaRoom).not.toHaveBeenCalled();
    expect(result.current.session?.status).toBe('ended');
  });
  it('never connects a token arriving after server ended or unmount', async () => {
    for (const terminal of ['ended', 'unmount']) {
      const token = deferred();
      vi.mocked(getSession).mockImplementation(async () => response());
      vi.mocked(getMediaToken).mockReturnValue(token.promise);
      const { result, unmount } = renderHook(() => useSessionRoom('session-a'));
      await act(async () => {});
      /** @type {Promise<void>|undefined} */
      let pending;
      await act(async () => {
        pending = result.current.connect();
      });
      if (terminal === 'ended') {
        vi.mocked(getSession).mockImplementation(async () =>
          response({ ...preparing, status: 'ended', version: 2 }),
        );
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000);
        });
      } else unmount();
      await act(async () => {
        token.resolve({
          data: { url: 'wss://test.invalid', token: 'token' },
          epoch: getIdentityEpoch(),
        });
        await pending;
      });
      expect(createMediaRoom).not.toHaveBeenCalled();
      unmount();
    }
  });
  it('does not overlap Session polling and cleans its timer on unmount', async () => {
    const request = deferred();
    vi.mocked(getSession).mockReturnValue(request.promise);
    const { unmount } = renderHook(() => useSessionRoom('session-a'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
    });
    expect(getSession).toHaveBeenCalledOnce();
    await act(async () => {
      request.resolve(response());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(getSession).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(20000);
    expect(getSession).toHaveBeenCalledTimes(2);
  });
  it('uses 2/4/8/16 second backoff for failed requests', async () => {
    vi.mocked(getSession).mockRejectedValue(new Error('offline'));
    renderHook(() => useSessionRoom('session-a'));
    await act(async () => {});
    for (const [interval, count] of [
      [2000, 2],
      [4000, 3],
      [8000, 4],
      [16000, 5],
    ]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(interval);
      });
      expect(getSession).toHaveBeenCalledTimes(count);
    }
  });
  it('keeps the same leave idempotency key after an ambiguous failure', async () => {
    vi.mocked(leaveSession).mockRejectedValueOnce(new Error('timeout'));
    const { result } = renderHook(() => useSessionRoom('session-a'));
    await act(async () => {});
    await act(async () => {
      await result.current.leave();
    });
    expect(result.current.error).toBe('timeout');
    await act(async () => {
      await result.current.leave();
    });
    expect(vi.mocked(leaveSession).mock.calls[0][1]).toBe(
      vi.mocked(leaveSession).mock.calls[1][1],
    );
  });
  it('disconnects and wipes chat immediately when identity is invalidated', async () => {
    const media = fakeMedia();
    vi.mocked(createMediaRoom).mockReturnValue(/** @type {any} */ (media));
    const { result } = renderHook(() => useSessionRoom('session-a'));
    await act(async () => {});
    await act(async () => {
      await result.current.connect();
    });
    const options = vi.mocked(createMediaRoom).mock.calls[0][0];
    act(() =>
      options.onMessage({ id: '1', sender: 'user:b', text: 'private' }),
    );
    expect(result.current.messages).toHaveLength(1);
    await act(async () => {
      clearPrivateCache();
    });
    expect(media.dispose).toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
    expect(result.current.session).toBeNull();
  });
});

/** @param {Partial<ReturnType<typeof useSessionRoom>>} [overrides] */
function renderRoom(overrides = {}) {
  const media = fakeMedia();
  const live = {
    session: { ...preparing, status: /** @type {'active'} */ ('active') },
    messages: [],
    media: /** @type {any} */ (media),
    error: '',
    mediaError: '',
    connecting: false,
    leaving: false,
    accessDenied: false,
    connect: vi.fn(),
    leave: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
  const props = {
    initialStage: /** @type {'selecting'} */ ('selecting'),
    initialPanel: null,
    longContent: false,
    initialNoteError: false,
    showDemoTools: false,
    onHome: vi.fn(),
    live,
  };
  const view = render(<KaiwaRoom {...props} />);
  return { live, media, props, ...view };
}
describe('Connected room UI', () => {
  it('uses one connection or leave dialog and restores body scroll after exit', () => {
    const overflow = globalThis.document.body.style.overflow;
    const { unmount } = renderRoom({ session: preparing, media: null });
    fireEvent.click(screen.getByRole('button', { name: 'Hủy và rời phiên' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      screen.getByRole('dialog', { name: 'Rời phòng cho cả hai?' }),
    ).toBeDefined();
    unmount();
    expect(globalThis.document.body.style.overflow).toBe(overflow);
  });
  it('shows SDK reconnecting for both members even when remote participants are cached', () => {
    const media = fakeMedia();
    media.room.state = ConnectionState.Reconnecting;
    media.room.remoteParticipants.set('user:b', media.room.localParticipant);
    renderRoom({
      media: /** @type {any} */ (media),
      session: { ...preparing, status: 'reconnecting' },
    });
    expect(screen.getAllByText('Đang kết nối lại')).toHaveLength(2);
    expect(screen.queryByText('Đã kết nối')).toBeNull();
  });
  it('does not show deck selection heading or countdown when Session already has a card', () => {
    renderRoom({
      session: {
        ...preparing,
        status: 'active',
        deckVersionId: 'deck-a',
        currentCard: {
          title: 'Tình huống thật',
          context: 'Bối cảnh',
          objective: 'Mục tiêu',
          myRole: 'Vai của tôi',
        },
      },
    });
    expect(
      screen.getByRole('heading', { name: 'Tình huống thật' }),
    ).toBeDefined();
    expect(
      screen.queryByRole('heading', { name: 'Chọn bộ hội thoại' }),
    ).toBeNull();
    expect(screen.queryByText(/giây chọn bộ/u)).toBeNull();
  });
  it('shows preparing and permission failures without inventing partner readiness', () => {
    renderRoom({
      session: preparing,
      media: null,
      mediaError: 'Không cấp được quyền media.',
    });
    expect(screen.getByText('Sẵn sàng vào phòng?')).toBeDefined();
    expect(screen.getByText('Bạn luyện: Đang chờ kết nối')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Thử lại kết nối' }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Hủy và rời phiên' }),
    ).toBeDefined();
  });
  it('renders chat markup as text and a visible new-message indicator', () => {
    const text = '<script>alert(1)</script>';
    renderRoom({ messages: [{ id: '1', sender: 'user:b', text }] });
    expect(screen.getByText('Mới')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Chat · tin mới' }));
    expect(screen.getByText(text)).toBeDefined();
    expect(globalThis.document.querySelector('.ck-chat-log script')).toBeNull();
  });
  it('retains a chat draft across panel switches and protects pending sends', async () => {
    const { media } = renderRoom();
    const pending = deferred();
    media.send.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    fireEvent.change(screen.getByLabelText('Tin nhắn'), {
      target: { value: 'こんにちは' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ghi chú' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(
      /** @type {HTMLTextAreaElement} */ (screen.getByLabelText('Tin nhắn'))
        .value,
    ).toBe('こんにちは');
    expect(
      /** @type {HTMLButtonElement} */ (
        screen.getByRole('button', { name: 'Đang gửi…' })
      ).disabled,
    ).toBe(true);
    await act(async () => {
      pending.resolve(undefined);
    });
    expect(
      /** @type {HTMLTextAreaElement} */ (screen.getByLabelText('Tin nhắn'))
        .value,
    ).toBe('');
    expect(media.send).toHaveBeenCalledOnce();
  });
  it('provides an exit when Session permission is lost', () => {
    const { props } = renderRoom({
      session: null,
      accessDenied: true,
      error: 'Không có quyền.',
    });
    expect(screen.getByText('Không truy cập được phiên')).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Thử tải lại trạng thái' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
    expect(props.onHome).toHaveBeenCalledOnce();
  });
});

describe('Vite UI preview', () => {
  it('reuses the room and three design cards without calling media or Session services', () => {
    render(
      <MemoryRouter initialEntries={['/__dev/room?state=chat']}>
        <RoomPreview />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Phòng Kaiwa' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'カフェで' })).toBeDefined();
    expect(screen.getByRole('heading', { name: '大学生活' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'アルバイト' })).toBeDefined();
    expect(screen.getByText('よろしくお願いします！')).toBeDefined();
    expect(getSession).not.toHaveBeenCalled();
    expect(createMediaRoom).not.toHaveBeenCalled();
  });
});
