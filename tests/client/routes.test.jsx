import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../../client/src/App.jsx';
import { api } from '../../client/src/services/api-client.js';
import { getIdentityEpoch } from '../../client/src/services/cache.js';

describe('Route protection, direct URL navigation and refresh', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders public landing route directly without blocking on auth', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App skipInitialAuthCheck />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Chiikaiwa' })).toBeVisible();
  });

  it('redirects unauthenticated user from protected /home to /login', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <MemoryRouter initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Đăng nhập' }),
    ).toBeVisible();
  });

  it('allows anonymous visitor to access /invitation (SC-06) for guest trial entry', async () => {
    render(
      <MemoryRouter initialEntries={['/invitation']}>
        <App skipInitialAuthCheck />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Nhập mã mời' })).toBeVisible();
  });

  it('allows anonymous visitor to stay on /invitation after /auth/me returns 401', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <MemoryRouter initialEntries={['/invitation']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Nhập mã mời' }),
    ).toBeVisible();
  });

  it('allows authenticated learner to access protected /home and /profile on direct URL', async () => {
    vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
      data: {
        kind: 'user',
        user: {
          id: 'u1',
          email: 'user@test.com',
          displayName: 'Test',
          role: 'learner',
          status: 'active',
          version: 1,
        },
      },
      meta: {},
      epoch: getIdentityEpoch(),
    }));

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Hồ sơ cá nhân' }),
    ).toBeVisible();
  });

  it('redirects logged-in learner away from admin route /admin to /home', async () => {
    vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
      data: {
        kind: 'user',
        user: {
          id: 'u1',
          email: 'user@test.com',
          displayName: 'Test',
          role: 'learner',
          status: 'active',
          version: 1,
        },
      },
      meta: {},
      epoch: getIdentityEpoch(),
    }));

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Trang chính' }),
    ).toBeVisible();
  });

  it.each(['/admin', '/home'])(
    'shows the admin area to an admin opening %s',
    async (path) => {
      vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
        data: {
          kind: 'user',
          user: {
            id: 'admin1',
            email: 'admin@test.com',
            displayName: 'Admin',
            role: 'admin',
            status: 'active',
            version: 1,
          },
        },
        meta: {},
        epoch: getIdentityEpoch(),
      }));

      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole('heading', { name: 'Khu vực quản trị' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Tìm bạn luyện nói' }),
      ).toBeNull();
      expect(api.get).toHaveBeenCalledTimes(1);
    },
  );

  it('redirects logged-in user away from /login to /home', async () => {
    vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
      data: {
        kind: 'user',
        user: {
          id: 'u1',
          email: 'user@test.com',
          displayName: 'Test',
          role: 'learner',
          status: 'active',
          version: 1,
        },
      },
      meta: {},
      epoch: getIdentityEpoch(),
    }));

    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Trang chính' }),
    ).toBeVisible();
  });

  it('displays locked account notice when user status is locked', async () => {
    vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
      data: {
        kind: 'user',
        user: {
          id: 'u1',
          email: 'locked@test.com',
          displayName: 'Locked',
          role: 'learner',
          status: 'locked',
          version: 1,
        },
      },
      meta: {},
      epoch: getIdentityEpoch(),
    }));

    render(
      <MemoryRouter initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Tài khoản đã bị khóa' }),
    ).toBeVisible();
  });

  it('redirects guest from user-only /home to /invitation', async () => {
    vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
      data: {
        kind: 'guest',
        guest: {
          sessionId: '507f1f77bcf86cd799439011',
          status: 'active',
        },
      },
      meta: {},
      epoch: getIdentityEpoch(),
    }));

    render(
      <MemoryRouter initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Nhập mã mời' }),
    ).toBeVisible();
  });

  it('verifies session membership with backend before allowing access to /room/:sessionId', async () => {
    const getSpy = vi
      .spyOn(api, 'get')
      .mockImplementationOnce(async () => ({
        data: {
          kind: 'user',
          user: {
            id: 'u1',
            email: 'user@test.com',
            displayName: 'Test',
            role: 'learner',
            status: 'active',
            version: 1,
          },
        },
        meta: {},
        epoch: getIdentityEpoch(),
      }))
      .mockImplementationOnce(async () => ({
        data: {
          id: '507f1f77bcf86cd799439011',
          status: 'active',
          version: 1,
        },
        meta: {},
        epoch: getIdentityEpoch(),
      }))
      .mockImplementation(async () => ({
        data: {
          id: '507f1f77bcf86cd799439011',
          status: 'active',
          version: 1,
          members: [
            { actorKey: 'user:u1', displayName: 'Test' },
            { actorKey: 'user:u2', displayName: 'Partner' },
          ],
          activeDurationMs: 0,
          selectionRemainingMs: 60000,
          slots: [],
          screenShare: { state: 'idle' },
        },
        meta: {},
        epoch: getIdentityEpoch(),
      }));

    render(
      <MemoryRouter initialEntries={['/room/507f1f77bcf86cd799439011']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Sẵn sàng vào phòng?' }),
    ).toBeVisible();
    expect(getSpy).toHaveBeenCalledWith('/sessions/507f1f77bcf86cd799439011');
  });

  it('denies access to /room/:sessionId and redirects to /expired when backend rejects session membership (404/403)', async () => {
    vi.spyOn(api, 'get')
      .mockImplementationOnce(async () => ({
        data: {
          kind: 'user',
          user: {
            id: 'u1',
            email: 'user@test.com',
            displayName: 'Not A Member',
            role: 'learner',
            status: 'active',
            version: 1,
          },
        },
        meta: {},
        epoch: getIdentityEpoch(),
      }))
      .mockRejectedValueOnce(
        Object.assign(new Error('Not Found'), {
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
        }),
      );

    render(
      <MemoryRouter initialEntries={['/room/507f1f77bcf86cd799439099']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Phiên làm việc đã kết thúc',
      }),
    ).toBeVisible();
  });

  it('redirects expired guest to /expired (SC-20)', async () => {
    vi.spyOn(api, 'get').mockImplementationOnce(async () => ({
      data: {
        kind: 'guest',
        guest: {
          sessionId: 'guest-s1',
          status: 'expired',
        },
      },
      meta: {},
      epoch: getIdentityEpoch(),
    }));

    render(
      <MemoryRouter initialEntries={['/room/507f1f77bcf86cd799439011']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Phiên làm việc đã kết thúc',
      }),
    ).toBeVisible();
  });
});
