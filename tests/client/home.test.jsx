import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Home } from '../../client/src/features/home/Home.jsx';
import { AuthContext } from '../../client/src/features/auth/auth-context.js';
import { api } from '../../client/src/services/api-client.js';
import { getIdentityEpoch } from '../../client/src/services/cache.js';

describe('FE-002: SC-03 Trang chính (Home) Integration Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Helper render Home với AuthContext tùy chỉnh
   * @param {Object} [options]
   * @param {Partial<import('../../client/src/features/auth/auth-context.js').AuthState>} [options.authState]
   * @param {() => void} [options.onStart]
   */
  function renderHome({ authState = {}, onStart } = {}) {
    const defaultAuth = {
      user: {
        id: 'u-456',
        email: 'hoang@example.com',
        displayName: 'Minh Hoàng',
        avatarKey: 'avatar-default',
        role: /** @type {const} */ ('learner'),
        profile: { level: 'N3' },
        version: 2,
        status: /** @type {const} */ ('active'),
      },
      guest: null,
      kind: /** @type {const} */ ('user'),
      role: /** @type {const} */ ('learner'),
      status: /** @type {const} */ ('active'),
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

    return {
      ...render(
        <AuthContext.Provider value={defaultAuth}>
          <MemoryRouter initialEntries={['/home']}>
            <Home onStart={onStart} />
          </MemoryRouter>
        </AuthContext.Provider>,
      ),
      mockLogout: defaultAuth.logout,
    };
  }

  it('renders real authenticated user information in header (07 §5.1)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome({
      authState: {
        user: {
          id: 'u-456',
          email: 'hoang@example.com',
          displayName: 'Minh Hoàng',
          avatarKey: 'avatar-default',
          role: 'learner',
          profile: { level: 'N3' },
          version: 2,
          status: 'active',
        },
      },
    });

    // Heading "Trang chính"
    expect(screen.getByRole('heading', { name: 'Trang chính' })).toBeVisible();

    // Tên thật và level N3 từ API
    expect(screen.getByText('Minh Hoàng')).toBeVisible();
    expect(screen.getByText('N3')).toBeVisible();

    // Avatar hiển thị chữ cái đầu M
    expect(screen.getByText('M')).toBeVisible();

    // Link đến hồ sơ cá nhân /profile
    expect(
      screen.getByRole('link', { name: /Hồ sơ cá nhân: Minh Hoàng/i }),
    ).toHaveAttribute('href', '/profile');
  });

  it('renders navigation links to learning areas without mock demo previews', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    // 3 mục góc học tập: Chủ đề (/topics), Đã lưu (/saved), Lịch sử (/history)
    expect(
      screen.getByRole('link', { name: 'Học theo chủ đề' }),
    ).toHaveAttribute('href', '/topics');
    expect(screen.getByRole('link', { name: 'Ôn cá nhân' })).toHaveAttribute(
      'href',
      '/saved',
    );
    expect(
      screen.getByRole('link', { name: 'Lịch sử luyện tập' }),
    ).toHaveAttribute('href', '/history');

    // Nút dùng mã mời dẫn tới /invitation
    expect(screen.getByRole('link', { name: 'Dùng mã mời' })).toHaveAttribute(
      'href',
      '/invitation',
    );

    // Không còn text demo "Bản demo · Dữ liệu mẫu"
    expect(screen.queryByText(/Bản demo · Dữ liệu mẫu/i)).toBeNull();
  });

  it('displays busy banner and prevents second flow when actor is inSession (SC-03 contract)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        mode: 'inSession',
        resourceId: '507f1f77bcf86cd799439011',
        version: 5,
      },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    // Banner hiển thị thông báo phiên đang chạy
    expect(
      await screen.findByText(
        /Bạn đang có một phiên hội thoại đang hoạt động/i,
      ),
    ).toBeVisible();

    // Nút điều hướng vào lại đúng session
    const resumeBtn = screen.getByRole('link', { name: /Vào lại phòng/i });
    expect(resumeBtn).toHaveAttribute('href', '/room/507f1f77bcf86cd799439011');

    // Nút tìm bạn mới bị disabled để chống tạo luồng thứ hai
    expect(
      screen.getByRole('button', { name: /Tìm bạn luyện/i }),
    ).toBeDisabled();
  });

  it('displays busy banner when actor is in searching queue (SC-03)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'searching', version: 3 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    expect(
      await screen.findByText(
        /Bạn đang trong hàng đợi tìm bạn luyện Tomodachi/i,
      ),
    ).toBeVisible();

    const queueBtn = screen.getByRole('link', { name: /Xem trạng thái/i });
    expect(queueBtn).toHaveAttribute('href', '/match');
  });

  it('degrades gracefully when coordination API fails without breaking home UI', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Network error'));

    renderHome();

    // Vẫn hiển thị trang chính bình thường
    expect(screen.getByRole('heading', { name: 'Trang chính' })).toBeVisible();
    expect(
      await screen.findByText(
        /Không thể đồng bộ trạng thái điều phối mới nhất/i,
      ),
    ).toBeVisible();
  });

  it('triggers logout when clicking logout button', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    const { mockLogout } = renderHome();

    const logoutBtn = screen.getByRole('button', {
      name: 'Đăng xuất khỏi tài khoản',
    });
    fireEvent.click(logoutBtn);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('calls onStart prop when provided for backward compatibility with KaiwaDemo/Storybook', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    const onStartMock = vi.fn();
    renderHome({ onStart: onStartMock });

    const startBtn = screen.getByRole('button', {
      name: /Tìm bạn luyện/i,
    });
    fireEvent.click(startBtn);

    expect(onStartMock).toHaveBeenCalledTimes(1);
  });
});
