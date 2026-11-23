import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ConnectionState } from 'livekit-client';
import { App } from '../../client/src/App.jsx';
import { AuthContext } from '../../client/src/features/auth/auth-context.js';
import { KaiwaRoom } from '../../client/src/features/kaiwa/KaiwaRoom.jsx';
import { BlockListPage } from '../../client/src/features/safety/BlockListPage.jsx';
import { SafetyActionDialog } from '../../client/src/features/safety/SafetyActionDialog.jsx';
import { SessionSummaryPage } from '../../client/src/features/session-summary/SessionSummaryPage.jsx';
import { api } from '../../client/src/services/api-client.js';
import { getIdentityEpoch } from '../../client/src/services/cache.js';
import { ApiError } from '../../client/src/services/errors.js';

const SESSION_ID = '507f1f77bcf86cd799439011';
const SELF_USER_ID = '507f1f77bcf86cd799439001';
const PARTNER_KEY = 'user:507f1f77bcf86cd799439002';
const GUEST_PARTNER_KEY = 'guest:507f1f77bcf86cd799439003';
const BLOCK_ID_1 = '507f1f77bcf86cd799439021';
const BLOCK_ID_2 = '507f1f77bcf86cd799439022';

/**
 * @param {Partial<import('../../client/src/features/auth/auth-context.js').AuthState>} [overrides]
 */
function createAuthValue(overrides = {}) {
  return {
    user: {
      id: SELF_USER_ID,
      email: 'learner@example.com',
      displayName: 'Hạnh Nhi',
      avatarKey: 'chiikawa',
      role: /** @type {'learner'} */ ('learner'),
      version: 1,
      status: /** @type {'active'} */ ('active'),
    },
    guest: null,
    kind: /** @type {'user'} */ ('user'),
    role: /** @type {'learner'} */ ('learner'),
    status: /** @type {'active'} */ ('active'),
    isLoading: false,
    isCheckingAuth: false,
    isLoginPending: false,
    error: null,
    checkAuth: vi.fn().mockResolvedValue(undefined),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    updateUser: vi.fn(),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    invalidateSession: vi.fn(),
    clearAuthNotice: vi.fn(),
    ...overrides,
  };
}

/**
 * @param {import('react').ReactNode} ui
 * @param {{
 *   initialEntries?: string[],
 *   authValue?: ReturnType<typeof createAuthValue>,
 * }} [options]
 */
function renderWithRouterAndAuth(
  ui,
  { initialEntries = ['/'], authValue = createAuthValue() } = {},
) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

function createDeferred() {
  /** @type {(value: any) => void} */
  let resolve;
  /** @type {(reason?: any) => void} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (/** @type {any} */ value) => resolve(value),
    reject: (/** @type {any} */ reason) => reject(reason),
  };
}

function createLiveRoomProp() {
  const refresh = vi.fn();
  const leave = vi.fn();
  return {
    session: {
      id: SESSION_ID,
      status: /** @type {'active'} */ ('active'),
      version: 3,
      members: [
        { actorKey: `user:${SELF_USER_ID}`, displayName: 'Hạnh Nhi' },
        { actorKey: PARTNER_KEY, displayName: 'An Nhiên' },
      ],
      activeDurationMs: 120000,
      selectionRemainingMs: 0,
    },
    messages: [],
    media: /** @type {any} */ ({
      room: {
        state: ConnectionState.Connected,
        localParticipant: {
          identity: `user:${SELF_USER_ID}`,
          isCameraEnabled: false,
          isMicrophoneEnabled: false,
          getTrackPublication: () => undefined,
        },
        remoteParticipants: new Map(),
        canPlaybackAudio: true,
      },
      pendingDevices: new Set(),
      deviceErrors: new Map(),
      connect: vi.fn(),
      dispose: vi.fn(),
      setDevice: vi.fn(),
      send: vi.fn(),
    }),
    error: '',
    mediaError: '',
    connecting: false,
    leaving: false,
    accessDenied: false,
    connect: vi.fn(),
    leave,
    refresh,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FE-013 Safety flows (SC-17 Report/Block & SC-18 Block List)', () => {
  it('opens SC-17 from active KaiwaRoom without obscuring Leave Room and keeps Leave usable inside the safety flow', async () => {
    const live = createLiveRoomProp();

    renderWithRouterAndAuth(
      <KaiwaRoom
        initialStage="selecting"
        initialPanel={null}
        longContent={false}
        initialNoteError={false}
        showDemoTools={false}
        onHome={vi.fn()}
        live={live}
      />,
    );

    // Both safety button and Leave Room button are visible in room header
    const safetyBtn = screen.getByRole('button', { name: 'Báo cáo / Chặn' });
    const leaveBtn = screen.getByRole('button', { name: 'Rời phòng' });
    expect(safetyBtn).toBeVisible();
    expect(leaveBtn).toBeVisible();

    fireEvent.click(safetyBtn);

    const dialog = screen.getByRole('dialog', { name: 'An toàn trong phiên' });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText('An Nhiên')).toBeVisible();

    // No file attachment input or report tracking page link (AC 1)
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(
      within(dialog).queryByRole('link', { name: /theo dõi báo cáo/i }),
    ).toBeNull();

    // Leave Room remains usable directly from within the safety dialog (AC 2)
    const dialogLeaveBtn = within(dialog).getByRole('button', {
      name: 'Rời phòng',
    });
    expect(dialogLeaveBtn).toBeEnabled();
    fireEvent.click(dialogLeaveBtn);

    // Opens LeaveDialog confirmation
    expect(
      screen.getByRole('dialog', { name: 'Rời phòng cho cả hai?' }),
    ).toBeVisible();
  });

  it('submits report independently without auto-blocking, prevents duplicate submission, and preserves Idempotency-Key on retry', async () => {
    const pendingDeferred = createDeferred();
    const postSpy = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Dịch vụ tạm gián đoạn.',
        }),
      )
      .mockImplementationOnce(() => pendingDeferred.promise);

    const onReported = vi.fn();
    const onBlocked = vi.fn();

    renderWithRouterAndAuth(
      <SafetyActionDialog
        open
        onClose={vi.fn()}
        sessionId={SESSION_ID}
        partner={{ actorKey: PARTNER_KEY, displayName: 'An Nhiên' }}
        inActiveSession
        onReported={onReported}
        onBlocked={onBlocked}
      />,
    );

    // Client validation blocks empty submission
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    const reasonInput = screen.getByLabelText(/Lý do báo cáo/i);
    expect(reasonInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Vui lòng nhập lý do báo cáo.')).toBeVisible();
    expect(postSpy).not.toHaveBeenCalled();

    // Fill reason & description and submit -> first attempt fails with retryable 503
    fireEvent.change(reasonInput, {
      target: { value: 'Ngôn từ không phù hợp' },
    });
    fireEvent.change(screen.getByLabelText(/Mô tả chi tiết/i), {
      target: { value: 'Đối tác nói lời thiếu tôn trọng.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Dịch vụ tạm gián đoạn.',
      );
    });
    expect(screen.queryByText('Báo cáo đã được tiếp nhận.')).toBeNull();
    expect(postSpy).toHaveBeenCalledTimes(1);
    const firstKey = postSpy.mock.calls[0][2]?.idempotencyKey;
    expect(typeof firstKey).toBe('string');
    expect(firstKey).toBeTruthy();

    // Retry keeps the exact same Idempotency-Key and stays pending until server confirms
    const retryBtn = screen.getByRole('button', { name: 'Thử gửi lại' });
    fireEvent.click(retryBtn);
    // Second click while pending must not send duplicate request
    fireEvent.click(screen.getByRole('button', { name: 'Đang gửi báo cáo…' }));
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(postSpy.mock.calls[1][0]).toBe('/reports');
    expect(postSpy.mock.calls[1][1]).toEqual({
      sessionId: SESSION_ID,
      targetActorKey: PARTNER_KEY,
      reason: 'Ngôn từ không phù hợp',
      description: 'Đối tác nói lời thiếu tôn trọng.',
    });
    expect(postSpy.mock.calls[1][2]?.idempotencyKey).toBe(firstKey);
    expect(screen.queryByText('Báo cáo đã được tiếp nhận.')).toBeNull();

    // Resolve 201 -> shows confirmation, never calls /me/blocks
    pendingDeferred.resolve({
      data: {
        id: '507f1f77bcf86cd799439099',
        status: 'new',
        createdAt: '2026-11-21T10:00:00.000Z',
      },
      meta: { requestId: 'req-1' },
      epoch: getIdentityEpoch(),
    });

    expect(await screen.findByText('Báo cáo đã được tiếp nhận.')).toBeVisible();
    expect(onReported).toHaveBeenCalledTimes(1);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(postSpy.mock.calls.every((call) => call[0] === '/reports')).toBe(
      true,
    );
  });

  it('requires explicit confirmation before blocking, preserves Idempotency-Key on retry, and triggers session refresh after 200', async () => {
    const postSpy = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'Lỗi kết nối mạng.',
        }),
      )
      .mockResolvedValueOnce({
        data: { id: BLOCK_ID_1 },
        meta: { requestId: 'req-block' },
        epoch: getIdentityEpoch(),
      });

    const onBlocked = vi.fn();

    renderWithRouterAndAuth(
      <SafetyActionDialog
        open
        onClose={vi.fn()}
        sessionId={SESSION_ID}
        partner={{ actorKey: PARTNER_KEY, displayName: 'An Nhiên' }}
        inActiveSession
        onBlocked={onBlocked}
      />,
    );

    // Step 1: click block button -> shows active session termination warning, does not call API yet
    fireEvent.click(screen.getByRole('button', { name: 'Chặn An Nhiên' }));
    expect(postSpy).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /Phiên luyện hiện tại sẽ kết thúc ngay cho cả hai người/i,
      ),
    ).toBeVisible();

    // Step 2: confirm block -> fails with NETWORK_ERROR (retryable)
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận chặn' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Lỗi kết nối mạng.');
    });
    expect(onBlocked).not.toHaveBeenCalled();
    expect(screen.queryByText('Đã chặn An Nhiên.')).toBeNull();

    const firstKey = postSpy.mock.calls[0][2]?.idempotencyKey;
    expect(firstKey).toBeTruthy();

    // Step 3: retry -> sends same Idempotency-Key and succeeds
    fireEvent.click(screen.getByRole('button', { name: 'Thử chặn lại' }));

    expect(await screen.findByText('Đã chặn An Nhiên.')).toBeVisible();
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(postSpy.mock.calls[1][0]).toBe('/me/blocks');
    expect(postSpy.mock.calls[1][1]).toEqual({
      sessionId: SESSION_ID,
      targetActorKey: PARTNER_KEY,
    });
    expect(postSpy.mock.calls[1][2]?.idempotencyKey).toBe(firstKey);
    expect(onBlocked).toHaveBeenCalledWith({ id: BLOCK_ID_1 });
  });

  it('redirects guest to /expired when report API returns 410 GUEST_EXPIRED', async () => {
    vi.spyOn(api, 'post').mockRejectedValueOnce(
      new ApiError({
        status: 410,
        code: 'GUEST_EXPIRED',
        message: 'Quyền truy cập tạm đã hết hạn.',
      }),
    );

    renderWithRouterAndAuth(
      <Routes>
        <Route
          path="/room"
          element={
            <SafetyActionDialog
              open
              onClose={vi.fn()}
              sessionId={SESSION_ID}
              partner={{ actorKey: PARTNER_KEY, displayName: 'Host' }}
              inActiveSession
              isGuest
            />
          }
        />
        <Route path="/expired" element={<h1>Phiên làm việc đã kết thúc</h1>} />
      </Routes>,
      {
        initialEntries: ['/room'],
        authValue: createAuthValue({
          user: null,
          guest: { sessionId: SESSION_ID, status: 'active' },
          kind: 'guest',
          role: 'guest',
        }),
      },
    );

    fireEvent.change(screen.getByLabelText(/Lý do báo cáo/i), {
      target: { value: 'Ngôn từ không phù hợp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Phiên làm việc đã kết thúc',
      }),
    ).toBeVisible();
  });

  it('renders SC-10 SessionSummaryPage with real session data and opens SC-17 without active-call warning', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        id: SESSION_ID,
        status: 'ended',
        endReason: 'left',
        version: 4,
        activeDurationMs: 185000,
        selectionRemainingMs: 0,
        members: [
          { actorKey: `user:${SELF_USER_ID}`, displayName: 'Hạnh Nhi' },
          { actorKey: PARTNER_KEY, displayName: 'An Nhiên' },
        ],
      },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderWithRouterAndAuth(
      <Routes>
        <Route
          path="/sessions/:sessionId/summary"
          element={<SessionSummaryPage />}
        />
      </Routes>,
      { initialEntries: [`/sessions/${SESSION_ID}/summary`] },
    );

    expect(await screen.findByText('An Nhiên')).toBeVisible();
    expect(screen.getByText('3:05')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Báo cáo / Chặn đối tác' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'An toàn trong phiên' });
    expect(dialog).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: 'Rời phòng' }),
    ).toBeNull();
  });

  it('handles loading, error+retry, pagination, and one-way unblock with Idempotency-Key preservation in SC-18 BlockListPage', async () => {
    const getSpy = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Máy chủ đang bận.',
        }),
      )
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: BLOCK_ID_1,
              partner: {
                actorKey: PARTNER_KEY,
                displayName: 'An Nhiên',
                profile: { level: 'N3' },
              },
              createdAt: '2026-11-20T08:00:00.000Z',
            },
          ],
          nextCursor: 'cursor-page-2',
        },
        meta: {},
        epoch: getIdentityEpoch(),
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: BLOCK_ID_2,
              partner: {
                actorKey: GUEST_PARTNER_KEY,
                displayName: 'Khách',
              },
              createdAt: '2026-11-19T08:00:00.000Z',
            },
          ],
          nextCursor: null,
        },
        meta: {},
        epoch: getIdentityEpoch(),
      });

    const deleteSpy = vi
      .spyOn(api, 'delete')
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Tạm thời không kết nối được.',
        }),
      )
      .mockResolvedValueOnce({
        data: null,
        meta: {},
        epoch: getIdentityEpoch(),
      });

    renderWithRouterAndAuth(<BlockListPage />, {
      initialEntries: ['/blocks'],
    });

    // Initial error -> retry loads first page
    expect(await screen.findByText('Máy chủ đang bận.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }));

    expect(await screen.findByText('An Nhiên')).toBeVisible();
    expect(screen.getByText('N3')).toBeVisible();

    // Load more page 2
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    expect(await screen.findAllByText('Khách')).toHaveLength(2);
    expect(getSpy).toHaveBeenLastCalledWith(
      '/me/blocks?limit=20&cursor=cursor-page-2',
      { signal: undefined },
    );

    // Unblock first item -> confirmation explains one-way semantics
    const unblockButtons = screen.getAllByRole('button', { name: 'Bỏ chặn' });
    fireEvent.click(unblockButtons[0]);

    const dialog = screen.getByRole('dialog', { name: 'Bỏ chặn An Nhiên?' });
    expect(
      within(dialog).getByText(/chỉ gỡ bản chặn do bạn tạo/i),
    ).toBeVisible();

    // First delete fails with 503 -> item must NOT be removed
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận bỏ chặn' }),
    );
    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Tạm thời không kết nối được.',
      );
    });
    expect(screen.getByText('An Nhiên')).toBeVisible();

    const firstKey = deleteSpy.mock.calls[0][1]?.idempotencyKey;
    expect(firstKey).toBeTruthy();

    // Retry delete keeps the same Idempotency-Key and removes item after 204
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Thử bỏ chặn lại' }),
    );
    await waitFor(() => {
      expect(screen.queryByText('An Nhiên')).toBeNull();
    });
    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy.mock.calls[1][0]).toBe(`/me/blocks/${BLOCK_ID_1}`);
    expect(deleteSpy.mock.calls[1][1]?.idempotencyKey).toBe(firstKey);
    expect(screen.getByRole('status')).toHaveTextContent(
      /Đã gỡ bản chặn của bạn với An Nhiên/i,
    );
  });

  it('shows empty state when user has no blocks and redirects guests away from /blocks', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { items: [], nextCursor: null },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderWithRouterAndAuth(<BlockListPage />, {
      initialEntries: ['/blocks'],
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Chưa có ai trong danh sách chặn',
      }),
    ).toBeVisible();

    cleanup();

    // Guest visiting /blocks via App is redirected to /invitation
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        kind: 'guest',
        guest: { sessionId: SESSION_ID, status: 'active' },
      },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    render(
      <MemoryRouter initialEntries={['/blocks']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Nhập mã mời' }),
    ).toBeVisible();
  });
});
