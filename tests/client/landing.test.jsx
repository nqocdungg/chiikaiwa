import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Landing } from '../../client/src/features/landing/Landing.jsx';
import { App } from '../../client/src/App.jsx';
import { api } from '../../client/src/services/api-client.js';
import { getIdentityEpoch } from '../../client/src/services/cache.js';
import { ApiError } from '../../client/src/services/errors.js';
import { AuthContext } from '../../client/src/features/auth/auth-context.js';

describe('FE-002: SC-01 Public Landing Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Helper render Landing với AuthContext tùy chỉnh
   * @param {Partial<import('../../client/src/features/auth/auth-context.js').AuthState>} authState
   */
  function renderLandingWithAuth(authState = {}) {
    /** @type {import('../../client/src/features/auth/auth-context.js').AuthState} */
    const defaultAuth = {
      user: null,
      guest: null,
      kind: 'unauthenticated',
      role: 'anonymous',
      status: null,
      isLoading: false,
      error: null,
      checkAuth: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      updateUser: vi.fn(),
      refreshSession: vi.fn(),
      ...authState,
    };

    return render(
      <AuthContext.Provider value={defaultAuth}>
        <MemoryRouter initialEntries={['/']}>
          <Landing />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it('renders landing page for anonymous visitors without forcing login (AC 2)', () => {
    const { container } = renderLandingWithAuth({
      kind: 'unauthenticated',
      role: 'anonymous',
    });

    // Tiêu đề & khẩu hiệu chính
    expect(
      screen.getByRole('heading', {
        name: 'Không gian luyện nói tiếng Nhật 1-1',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/Luyện hội thoại tiếng Nhật 1-1 cùng bạn học/i),
    ).toBeVisible();

    // CTA cho khách chưa đăng nhập: Đăng nhập, Đăng ký, Nhập mã mời, Bắt đầu ngay
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Đăng ký' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(
      screen.getAllByRole('link', { name: /Nhập mã mời|Dùng mã mời/i }).length,
    ).toBeGreaterThan(0);
    const startCta = screen.getByRole('link', { name: /Bắt đầu ngay/i });
    expect(startCta).toHaveAttribute('href', '/register');
    expect(startCta).toBeVisible();

    // Ghi chú thiết bị mic/camera là tùy chọn
    expect(screen.getByText(/Mic và camera là tùy chọn/i)).toBeVisible();

    // Dàn linh vật minh họa Usagi & Hachiware với alt="" chuẩn a11y trang trí (NFR-08)
    const mascotImgs = container.querySelectorAll('.ck-mascot-img');
    expect(mascotImgs.length).toBeGreaterThanOrEqual(2);
    mascotImgs.forEach((img) => {
      expect(img).toHaveAttribute('alt', '');
    });
  });

  it('renders landing page with entry to Home when learner is already logged in (04 SC-01)', () => {
    renderLandingWithAuth({
      kind: 'user',
      role: 'learner',
      status: 'active',
      user: {
        id: 'user123',
        email: 'learner@example.com',
        displayName: 'Lan Anh',
        avatarKey: 'avatar-1',
        role: 'learner',
        version: 1,
      },
    });

    // Không ép hiển thị form đăng ký / đăng nhập
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();

    // Hiển thị lối vào Trang chính (không có aria-current="page" vì không phải trang hiện tại - L2)
    const homeNavLink = screen.getByRole('link', { name: 'Trang chính' });
    expect(homeNavLink).toHaveAttribute('href', '/home');
    expect(homeNavLink).not.toHaveAttribute('aria-current');

    const homeCta = screen.getByRole('link', { name: /Vào trang chính/i });
    expect(homeCta).toHaveAttribute('href', '/home');
    expect(homeCta).toBeVisible();
  });

  it('renders non-interactive placeholder in nav but keeps hero CTA accessible while loading (D1)', () => {
    const { rerender } = renderLandingWithAuth({ isLoading: true });

    // Khi isLoading=true: không có link Đăng nhập, Đăng ký tương tác được trong header nav
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Đăng ký' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Trang chính' })).toBeNull();

    // CTA "Bắt đầu ngay" trong hero KHÔNG bị disabled, khách vẫn bấm được bình thường (D1)
    const heroBtn = screen.getByRole('link', { name: /Bắt đầu ngay/i });
    expect(heroBtn).toHaveAttribute('href', '/register');
    expect(heroBtn).toBeVisible();

    // Khi auth check hoàn tất cho khách chưa đăng nhập
    rerender(
      <AuthContext.Provider
        value={{
          user: null,
          guest: null,
          kind: 'unauthenticated',
          role: 'anonymous',
          status: null,
          isLoading: false,
          error: null,
          checkAuth: vi.fn(),
          login: vi.fn(),
          logout: vi.fn(),
          register: vi.fn(),
          updateUser: vi.fn(),
          refreshSession: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={['/']}>
          <Landing />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    // Link Đăng nhập và Đăng ký xuất hiện trong nav
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Đăng ký' })).toBeVisible();
  });

  it('renders default guest CTAs when auth check fails with 500 error on real stack (D1)', async () => {
    vi.spyOn(api, 'get').mockImplementation(function (path) {
      if (path === '/auth/me') {
        return Promise.reject(
          new ApiError({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Server error during auth check',
          }),
        );
      }
      return Promise.resolve({ data: {}, meta: {}, epoch: getIdentityEpoch() });
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    // Khi auth check lỗi, landing vẫn hiển thị giao diện khách thân thiện mà không chặn người dùng
    expect(
      await screen.findByRole('link', { name: 'Đăng nhập' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Đăng ký' })).toBeVisible();
    const heroBtn = screen.getByRole('link', { name: /Bắt đầu ngay/i });
    expect(heroBtn).toHaveAttribute('href', '/register');
    expect(heroBtn).toBeVisible();
  });

  it('updates hero CTA to entry when user is confirmed authenticated after loading (D1)', () => {
    const { rerender } = renderLandingWithAuth({ isLoading: true });

    // Ban đầu khi loading: CTA khách
    expect(screen.getByRole('link', { name: /Bắt đầu ngay/i })).toHaveAttribute(
      'href',
      '/register',
    );

    // Sau khi tải xong: xác nhận đã đăng nhập learner
    rerender(
      <AuthContext.Provider
        value={{
          user: {
            id: 'u-1',
            email: 'lananh@example.com',
            displayName: 'Lan Anh',
            avatarKey: 'avatar-1',
            role: 'learner',
            version: 1,
          },
          guest: null,
          kind: 'user',
          role: 'learner',
          status: 'active',
          isLoading: false,
          error: null,
          checkAuth: vi.fn(),
          login: vi.fn(),
          logout: vi.fn(),
          register: vi.fn(),
          updateUser: vi.fn(),
          refreshSession: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={['/']}>
          <Landing />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    // CTA đổi thành "Vào trang chính"
    const homeCta = screen.getByRole('link', { name: /Vào trang chính/i });
    expect(homeCta).toHaveAttribute('href', '/home');
    expect(homeCta).toBeVisible();
  });

  it('navigates admin user to /admin instead of /home (Task Handoff FE-002)', () => {
    renderLandingWithAuth({
      kind: 'user',
      role: 'admin',
      status: 'active',
      user: {
        id: 'admin999',
        email: 'admin@chiikaiwa.internal',
        displayName: 'Quản trị viên',
        avatarKey: 'avatar-admin',
        role: 'admin',
        version: 1,
      },
    });

    // Header nav link
    expect(
      screen.getByRole('link', { name: 'Khu vực quản trị' }),
    ).toHaveAttribute('href', '/admin');

    // Welcome section CTA
    const adminCta = screen.getByRole('link', { name: /Vào khu quản trị/i });
    expect(adminCta).toHaveAttribute('href', '/admin');
    expect(adminCta).toBeVisible();
  });

  it('does not contain fake metrics, testimonials, streak, or gamification elements (AC 1, AC 3)', () => {
    renderLandingWithAuth();

    // Tuyệt đối không có số liệu giả, chuỗi ngày streak hay cấp độ game
    expect(screen.queryByText(/streak|chuỗi|hạng|điểm thưởng/i)).toBeNull();
    expect(
      screen.queryByText(/100% thành thạo|10,000 học viên|đánh giá 5 sao/i),
    ).toBeNull();
  });
});
