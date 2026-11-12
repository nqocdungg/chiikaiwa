import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Landing } from '../../client/src/features/landing/Landing.jsx';
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
    expect(screen.getByRole('heading', { name: 'Chiikaiwa' })).toBeVisible();
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
    expect(screen.getByRole('button', { name: /Bắt đầu ngay/i })).toBeVisible();

    // Ghi chú thiết bị mic/camera là tùy chọn
    expect(screen.getByText(/Mic và camera là tùy chọn/i)).toBeVisible();

    // Dàn nhân vật minh họa Friends với alt="" chuẩn a11y trang trí (NFR-08)
    const friendsImg = container.querySelector('.ck-friends');
    expect(friendsImg).toBeInTheDocument();
    expect(friendsImg).toHaveAttribute('alt', '');
  });

  it('renders landing page with entry to Home when user is already logged in (04 SC-01)', () => {
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

    // Hiển thị lối vào Trang chính
    expect(screen.getByRole('link', { name: 'Trang chính' })).toHaveAttribute(
      'href',
      '/home',
    );
    expect(
      screen.getByRole('button', { name: /Vào trang chính/i }),
    ).toBeVisible();
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
