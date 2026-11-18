import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthContext } from '../../client/src/features/auth/auth-context.js';
import { InvitationDialog } from '../../client/src/features/invitation/InvitationDialog.jsx';
import { api } from '../../client/src/services/api-client.js';
import { ApiError } from '../../client/src/services/errors.js';

const invitationId = '507f1f77bcf86cd799439011';
const requestId = '507f1f77bcf86cd799439012';
const sessionId = '507f1f77bcf86cd799439013';
const serverTime = '2026-11-17T10:00:00.000Z';
const expiresAt = '2026-11-17T10:10:00.000Z';

const invitation = {
  id: invitationId,
  code: 'ABCD234567',
  status: 'open',
  version: 2,
  expiresAt,
};

const inviteRequest = {
  id: requestId,
  invitationId,
  requester: {
    actorKey: 'user:507f1f77bcf86cd799439099',
    displayName: 'Khánh Linh',
    profile: { level: 'N4' },
  },
  status: 'pending',
  version: 3,
  expiresAt,
};

/** @param {unknown} data */
function response(data) {
  return { data, meta: { serverTime }, epoch: 0 };
}

/** @param {{kind?: 'user'|'guest'|'unauthenticated', path?: string, strict?: boolean}} [options] */
function renderInvitation({
  kind = 'user',
  path = '/invitation?mode=join',
  strict = false,
} = {}) {
  const refreshSession = vi.fn().mockResolvedValue(undefined);
  const isUser = kind === 'user';
  const value = {
    user: isUser
      ? {
          id: '507f1f77bcf86cd799439001',
          email: 'learner@example.com',
          displayName: 'Minh Anh',
          avatarKey: 'default',
          role: /** @type {const} */ ('learner'),
          version: 1,
          status: /** @type {const} */ ('active'),
        }
      : null,
    guest: kind === 'guest' ? { status: 'waiting' } : null,
    kind,
    role: isUser
      ? /** @type {const} */ ('learner')
      : kind === 'guest'
        ? /** @type {const} */ ('guest')
        : /** @type {const} */ ('anonymous'),
    status: kind === 'unauthenticated' ? null : /** @type {const} */ ('active'),
    isLoading: false,
    isCheckingAuth: false,
    isLoginPending: false,
    error: null,
    checkAuth: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    updateUser: vi.fn(),
    refreshSession,
  };

  const content = (
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/invitation" element={<InvitationDialog />} />
          <Route path="/room/:sessionId" element={<h1>Phòng hội thoại</h1>} />
          <Route path="/home" element={<h1>Trang chính</h1>} />
          <Route path="/" element={<h1>Landing</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

  return {
    refreshSession,
    ...render(strict ? <StrictMode>{content}</StrictMode> : content),
  };
}

describe('FE-008 invitation and guest dialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ['learner', 'user', '/invitation-requests'],
    ['anonymous guest', 'unauthenticated', '/guest-trials'],
  ])(
    'uses the shared code form for %s with the correct endpoint',
    async (_, kind, endpoint) => {
      if (kind === 'user') {
        vi.spyOn(api, 'get').mockResolvedValueOnce(response({ mode: 'idle' }));
      }
      const post = vi
        .spyOn(api, 'post')
        .mockResolvedValueOnce(
          response(
            kind === 'user'
              ? inviteRequest
              : { request: inviteRequest, guest: { status: 'waiting' } },
          ),
        );
      const { refreshSession } = renderInvitation({
        kind: /** @type {'user'|'unauthenticated'} */ (kind),
      });

      expect(
        await screen.findByRole('heading', { name: 'Nhập mã mời' }),
      ).toBeVisible();
      fireEvent.change(screen.getByLabelText('Mã mời'), {
        target: { value: 'abcd234567' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Gửi yêu cầu tham gia' }),
      );

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0][0]).toBe(endpoint);
      expect(post.mock.calls[0][1]).toEqual({ code: 'ABCD234567' });
      expect(post.mock.calls[0][2]?.idempotencyKey).toBeTruthy();
      expect(await screen.findByText('Yêu cầu đã được gửi')).toBeVisible();
      expect(refreshSession).toHaveBeenCalledTimes(kind === 'user' ? 0 : 1);
    },
  );

  it('creates a host invitation from the Home create intent and shows server code/deadline', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce(response({ mode: 'idle' }));
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce(response(invitation));

    renderInvitation({ path: '/invitation?mode=create' });

    expect(await screen.findByText('ABCD234567')).toBeVisible();
    expect(screen.getByText('Đang chờ yêu cầu tham gia')).toBeVisible();
    expect(screen.getByRole('timer')).toHaveTextContent(/^Còn/);
    expect(post).toHaveBeenCalledWith(
      '/invitations',
      {},
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it('restarts coordination recovery after the StrictMode setup request is aborted', async () => {
    let coordinationCalls = 0;
    vi.spyOn(api, 'get').mockImplementation((_path, options) => {
      coordinationCalls += 1;
      if (coordinationCalls > 1) {
        return Promise.resolve(response({ mode: 'idle' }));
      }
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce(response(invitation));

    renderInvitation({ path: '/invitation?mode=create', strict: true });

    expect(await screen.findByText('ABCD234567')).toBeVisible();
    expect(coordinationCalls).toBe(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('keeps the create view when coordination recovery fails instead of showing the join form', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(
      new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Network unavailable',
      }),
    );

    renderInvitation({ path: '/invitation?mode=create' });

    expect(
      await screen.findByRole('heading', { name: 'Đang mở phòng mời' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Nhập mã mời' })).toBeNull();
  });

  it('shows the newest pending requester and only enters the room after server acceptance', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/me/coordination') {
        return response({ mode: 'inviting', resourceId: invitationId });
      }
      if (path === `/invitations/${invitationId}`) return response(invitation);
      if (String(path).includes('/requests?')) {
        return response({ items: [inviteRequest] });
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce(
      response({
        ...inviteRequest,
        status: 'accepted',
        version: 4,
        sessionId,
      }),
    );

    renderInvitation();

    expect(await screen.findByText('Khánh Linh')).toBeVisible();
    expect(screen.queryByText('Phòng hội thoại')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }));

    expect(await screen.findByText('Phòng hội thoại')).toBeVisible();
    expect(post).toHaveBeenCalledWith(
      `/invitation-requests/${requestId}/responses`,
      { expectedVersion: 3, decision: 'accept' },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(get).toHaveBeenCalled();
  });

  it('retries an uncertain join with the same Idempotency-Key', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce(response({ mode: 'idle' }));
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Unavailable',
        }),
      )
      .mockResolvedValueOnce(response(inviteRequest));

    renderInvitation();
    await screen.findByRole('heading', { name: 'Nhập mã mời' });
    fireEvent.change(screen.getByLabelText('Mã mời'), {
      target: { value: 'ABCD234567' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Gửi yêu cầu tham gia' }),
    );

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    fireEvent.click(retry);
    expect(await screen.findByText('Yêu cầu đã được gửi')).toBeVisible();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][2]?.idempotencyKey).toBe(
      post.mock.calls[0][2]?.idempotencyKey,
    );
  });

  it('cancels with the current version and does not create another invitation automatically', async () => {
    const post = vi.spyOn(api, 'post');
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/me/coordination') {
        return response({ mode: 'inviting', resourceId: invitationId });
      }
      if (path === `/invitations/${invitationId}`) return response(invitation);
      if (String(path).includes('/requests?')) return response({ items: [] });
      throw new Error(`Unexpected GET ${path}`);
    });
    const remove = vi
      .spyOn(api, 'delete')
      .mockResolvedValueOnce(response(undefined));

    renderInvitation();
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy mã mời' }));

    expect(
      await screen.findByRole('heading', { name: 'Đã dừng tại đây' }),
    ).toBeVisible();
    expect(remove).toHaveBeenCalledWith(
      `/invitations/${invitationId}?expectedVersion=2`,
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps identity conflict on the shared guest form without creating a waiting state', async () => {
    vi.spyOn(api, 'post').mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'IDENTITY_CONFLICT',
        message: 'Conflict',
      }),
    );
    renderInvitation({ kind: 'unauthenticated' });
    fireEvent.change(screen.getByLabelText('Mã mời'), {
      target: { value: 'ABCD234567' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Gửi yêu cầu tham gia' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bạn đang dùng phiên tài khoản',
    );
    expect(screen.queryByText('Yêu cầu đã được gửi')).toBeNull();
  });
});
