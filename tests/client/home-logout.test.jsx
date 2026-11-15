import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { App } from '../../client/src/App.jsx';
import { activeLocationRef } from '../../client/src/features/home/navigation-tracker.js';
import { api } from '../../client/src/services/api-client.js';
import { ApiError } from '../../client/src/services/errors.js';
import { getIdentityEpoch } from '../../client/src/services/cache.js';

describe('FE-002: SC-03 Home Logout Flow with Real Auth Stack', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    activeLocationRef.current = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Helper cung cấp điều hướng ngoài cho test
   * @type {import('react-router').NavigateFunction | null}
   */
  let navRef = null;

  function NavTracker() {
    const navigate = useNavigate();
    useEffect(() => {
      navRef = navigate;
    }, [navigate]);
    return null;
  }

  const mockLearner = {
    kind: 'user',
    user: {
      id: 'u-123',
      email: 'learner@example.com',
      displayName: 'Minh Hoàng',
      role: 'learner',
      profile: { level: 'N3' },
      version: 1,
      status: 'active',
    },
    role: 'learner',
    status: 'active',
  };

  function setupAuthMocks() {
    vi.spyOn(api, 'get').mockImplementation(function (path) {
      if (path === '/auth/me') {
        return Promise.resolve({
          data: mockLearner,
          meta: {},
          epoch: getIdentityEpoch(),
        });
      }
      if (path === '/me/coordination') {
        return Promise.resolve({
          data: { mode: 'idle', version: 1 },
          meta: {},
          epoch: getIdentityEpoch(),
        });
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });
  }

  it('shows alert banner, retains session, and moves focus to retry button when logout fails with 503 (A1-A4)', async () => {
    setupAuthMocks();
    const logoutSpy = vi.spyOn(api, 'post').mockImplementation(function (path) {
      if (path === '/auth/logout') {
        return Promise.reject(
          new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service is temporarily unavailable',
          }),
        );
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <NavTracker />
        <App />
      </MemoryRouter>,
    );

    // Chờ Home render với thông tin người học
    expect(await screen.findByText('Minh Hoàng')).toBeVisible();

    // Mở menu tài khoản
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);

    const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i });
    fireEvent.click(logoutBtn);

    // Banner role="alert" xuất hiện
    const alertBanner = await screen.findByRole('alert');
    expect(alertBanner).toBeVisible();

    // Tiêu đề & nội dung trung tính chuẩn contract (A2)
    expect(screen.getByText('Chưa đăng xuất được')).toBeVisible();
    expect(
      screen.getByText('Yêu cầu đăng xuất chưa hoàn tất. Hãy thử lại.'),
    ).toBeVisible();
    expect(screen.queryByText(/vẫn còn hiệu lực/i)).toBeNull();

    // Sau khi lỗi xong, không còn placeholder "Đang kiểm tra quyền truy cập..."
    expect(screen.queryByText(/Đang kiểm tra quyền truy cập/i)).toBeNull();

    // Người dùng vẫn ở trang chính /home
    expect(screen.getByRole('heading', { name: 'Trang chính' })).toBeVisible();

    // Focus tự động được chuyển vào nút "Thử đăng xuất lại" (A3)
    const retryBtn = screen.getByRole('button', { name: 'Thử đăng xuất lại' });
    expect(retryBtn).toHaveFocus();
    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  it('successfully logs out and redirects to /login on retry (A1, A5)', async () => {
    setupAuthMocks();
    let attempt = 0;
    vi.spyOn(api, 'post').mockImplementation(function (path) {
      if (path === '/auth/logout') {
        attempt++;
        if (attempt === 1) {
          return Promise.reject(
            new ApiError({
              status: 503,
              code: 'SERVICE_UNAVAILABLE',
              message: 'Temporary network failure',
            }),
          );
        }
        return Promise.resolve({
          data: {},
          meta: {},
          epoch: getIdentityEpoch(),
        });
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <NavTracker />
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Minh Hoàng')).toBeVisible();

    // Lần 1: click Đăng xuất -> Lỗi
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }));

    expect(await screen.findByRole('alert')).toBeVisible();

    // Bấm nút "Thử đăng xuất lại"
    const retryBtn = screen.getByRole('button', { name: 'Thử đăng xuất lại' });
    fireEvent.click(retryBtn);

    // Chuyển hướng thành công tới /login và thấy form đăng nhập
    expect(
      await screen.findByRole('heading', { name: 'Đăng nhập' }),
    ).toBeVisible();
  });

  it('does not re-display alert banner when navigating away and back (Back/Forward - A1)', async () => {
    setupAuthMocks();
    vi.spyOn(api, 'post').mockImplementation(function (path) {
      if (path === '/auth/logout') {
        return Promise.reject(
          new ApiError({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Logout failed',
          }),
        );
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <NavTracker />
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Minh Hoàng')).toBeVisible();

    // Thực hiện đăng xuất lỗi
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }));

    // Banner lỗi xuất hiện
    expect(await screen.findByRole('alert')).toBeVisible();

    // Người dùng điều hướng sang trang khác (ví dụ /profile)
    navRef?.('/profile');
    expect(
      await screen.findByRole('heading', { name: 'Hồ sơ cá nhân' }),
    ).toBeVisible();

    // Người dùng bấm Back quay lại /home
    navRef?.(-1);
    expect(
      await screen.findByRole('heading', { name: 'Trang chính' }),
    ).toBeVisible();

    // Banner lỗi KHÔNG được xuất hiện lại (A1)
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('closes alert banner and returns focus to account button when clicking Đóng (A3)', async () => {
    setupAuthMocks();
    vi.spyOn(api, 'post').mockImplementation(function (path) {
      if (path === '/auth/logout') {
        return Promise.reject(
          new ApiError({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Logout failed',
          }),
        );
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <NavTracker />
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Minh Hoàng')).toBeVisible();

    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }));

    expect(await screen.findByRole('alert')).toBeVisible();

    // Bấm nút "Đóng"
    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    fireEvent.click(closeBtn);

    // Banner biến mất
    expect(screen.queryByRole('alert')).toBeNull();

    // Focus được hoàn trả lại cho nút tài khoản (A3)
    const currentAccountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    expect(currentAccountBtn).toHaveFocus();
  });

  it('silently ignores AUTH_SUPERSEDED error without showing alert banner (A5)', async () => {
    setupAuthMocks();
    const logoutSpy = vi.spyOn(api, 'post').mockImplementation(function (path) {
      if (path === '/auth/logout') {
        return Promise.reject(
          new ApiError({
            status: 409,
            code: 'AUTH_SUPERSEDED',
            message: 'Yêu cầu đăng xuất đã bị thay thế bởi thao tác mới hơn.',
          }),
        );
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <NavTracker />
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Minh Hoàng')).toBeVisible();

    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }));

    // Chờ logoutSpy được gọi
    await vi.waitFor(() => {
      expect(logoutSpy).toHaveBeenCalledTimes(1);
    });

    // Chờ chữ "Đang kiểm tra quyền truy cập..." biến mất
    await vi.waitFor(() => {
      expect(screen.queryByText(/Đang kiểm tra quyền truy cập/i)).toBeNull();
    });

    // Chạy một nhịp trong act để flush render
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Kiểm tra heading "Trang chính" hiển thị và không có role="alert"
    expect(screen.getByRole('heading', { name: 'Trang chính' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('distinguishes between logout retry and coordination retry when both banners are visible (Should fix)', async () => {
    vi.spyOn(api, 'get').mockImplementation(function (path) {
      if (path === '/auth/me') {
        return Promise.resolve({
          data: mockLearner,
          meta: {},
          epoch: getIdentityEpoch(),
        });
      }
      if (path === '/me/coordination') {
        return Promise.reject(
          new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Coordination check failed',
          }),
        );
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    vi.spyOn(api, 'post').mockImplementation(function (path) {
      if (path === '/auth/logout') {
        return Promise.reject(
          new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Logout failed',
          }),
        );
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    render(
      <MemoryRouter initialEntries={['/home']}>
        <NavTracker />
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Minh Hoàng')).toBeVisible();

    // Banner điều phối lỗi xuất hiện
    expect(
      await screen.findByRole('heading', {
        name: 'Không thể kiểm tra trạng thái điều phối',
      }),
    ).toBeVisible();

    // Bấm đăng xuất lỗi
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }));

    // Banner đăng xuất lỗi xuất hiện
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByText('Chưa đăng xuất được')).toBeVisible();

    // Lúc này cả 2 banner cùng hiện: đúng 1 nút "Thử đăng xuất lại" và đúng 1 nút "Thử lại"
    const logoutRetryBtn = screen.getByRole('button', {
      name: 'Thử đăng xuất lại',
    });
    const coordRetryBtn = screen.getByRole('button', {
      name: 'Thử lại',
    });
    expect(logoutRetryBtn).toBeVisible();
    expect(coordRetryBtn).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Thử đăng xuất lại' }),
    ).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Thử lại' })).toHaveLength(1);

    // Focus nằm tại nút "Thử đăng xuất lại"
    expect(logoutRetryBtn).toHaveFocus();
  });

  it('preserves location search and hash when clearing logoutFailed history state (Nice to have)', async () => {
    setupAuthMocks();
    vi.spyOn(api, 'post').mockImplementation(function (path) {
      if (path === '/auth/logout') {
        return Promise.reject(
          new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Logout failed',
          }),
        );
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    /** @type {{ current: import('react-router').Location | null }} */
    const locationRef = { current: null };
    function LocationWatcher() {
      const location = useLocation();
      useEffect(() => {
        locationRef.current = location;
      }, [location]);
      return null;
    }

    render(
      <MemoryRouter initialEntries={['/home?ref=abc#top']}>
        <NavTracker />
        <LocationWatcher />
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Minh Hoàng')).toBeVisible();

    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }));

    expect(await screen.findByRole('alert')).toBeVisible();

    // Chờ effect xóa history.state thực hiện xong
    await vi.waitFor(() => {
      expect(locationRef.current?.state).toBeNull();
    });

    // URL vẫn bảo toàn pathname, search và hash
    expect(locationRef.current?.pathname).toBe('/home');
    expect(locationRef.current?.search).toBe('?ref=abc');
    expect(locationRef.current?.hash).toBe('#top');
  });

  it('does not forcefully redirect to /home when user navigated away during pending logout (Should fix)', async () => {
    setupAuthMocks();
    /** @type {((err: Error) => void) | null} */
    let rejectLogout = null;
    vi.spyOn(api, 'post').mockImplementation(function (path) {
      if (path === '/auth/logout') {
        return new Promise((_, reject) => {
          rejectLogout = reject;
        });
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    render(
      <MemoryRouter initialEntries={['/profile', '/home']} initialIndex={1}>
        <NavTracker />
        <App />
      </MemoryRouter>,
    );

    // Chờ Home render
    expect(await screen.findByText('Minh Hoàng')).toBeVisible();

    // Mở menu và bấm Đăng xuất
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/i }));

    // Khi logout đang in-flight, xuất hiện màn hình loading
    expect(screen.getByText(/Đang kiểm tra quyền truy cập/i)).toBeVisible();

    // Người dùng bấm Back quay về /profile
    await act(async () => {
      navRef?.(-1);
    });

    // Sau khi đã bấm Back sang /profile, API logout mới trả về lỗi 503
    await act(async () => {
      rejectLogout?.(
        new ApiError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Logout failed after delay',
        }),
      );
    });

    // Chờ microtasks flush và loading kết thúc
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Người dùng vẫn ở yên tại /profile, KHÔNG bị kéo ngược về /home
    expect(
      await screen.findByRole('heading', { name: 'Hồ sơ cá nhân' }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Trang chính' })).toBeNull();
  });
});
