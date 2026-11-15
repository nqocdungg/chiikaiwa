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

    // Avatar hiển thị initials MH theo Avatar component chuẩn
    expect(screen.getByText('MH')).toBeVisible();

    // Nút mở dropdown menu tài khoản
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    expect(accountBtn).toBeVisible();

    // Click mở menu
    fireEvent.click(accountBtn);

    // Link đến hồ sơ cá nhân /profile (Mục 1 trong dropdown)
    expect(
      screen.getByRole('menuitem', { name: /Hồ sơ của tôi/i }),
    ).toHaveAttribute('href', '/profile');

    // Nút đăng xuất (Mục 2 trong dropdown)
    expect(screen.getByRole('menuitem', { name: /Đăng xuất/i })).toBeVisible();
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

    // Chờ coordination check hoàn tất và chuyển sang trạng thái rảnh (idle)
    const inviteBtn = screen.getByRole('button', { name: 'Dùng mã mời' });
    expect(inviteBtn).toBeVisible();
    await vi.waitFor(() => {
      expect(inviteBtn).not.toBeDisabled();
    });

    // Nút tạo mã mời (active khi idle)
    const createInviteBtn = screen.getByRole('button', { name: 'Tạo mã mời' });
    expect(createInviteBtn).toBeVisible();
    await vi.waitFor(() => {
      expect(createInviteBtn).not.toBeDisabled();
    });

    // Không còn text demo "Bản demo · Dữ liệu mẫu"
    expect(screen.queryByText(/Bản demo · Dữ liệu mẫu/i)).toBeNull();
  });

  it('keeps start button and invitation CTAs disabled while coordination check is pending', () => {
    // Return a promise that does not resolve immediately
    vi.spyOn(api, 'get').mockImplementationOnce(() => new Promise(() => {}));

    renderHome();

    // Heading exists
    expect(screen.getByRole('heading', { name: 'Trang chính' })).toBeVisible();

    // Nút tìm bạn luyện bị disabled khi đang chờ coordination check
    const startBtn = screen.getByRole('button', { name: /Tìm bạn luyện/i });
    expect(startBtn).toBeDisabled();

    // Nút điều hướng "Luyện hội thoại" trên header cũng bị disabled
    expect(
      screen.getByRole('button', { name: 'Luyện hội thoại' }),
    ).toBeDisabled();

    // Hai CTA mã mời cũng bị disabled để chống tạo luồng khi chưa xác nhận rảnh (04 §3.4)
    expect(screen.getByRole('button', { name: 'Tạo mã mời' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dùng mã mời' })).toBeDisabled();
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

    // Nút tìm bạn mới và các CTA mã mời bị disabled để chống tạo luồng thứ hai
    expect(
      screen.getByRole('button', { name: /Tìm bạn luyện/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tạo mã mời' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dùng mã mời' })).toBeDisabled();
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

  it('shows error banner with retry option and disables start button when coordination fails', async () => {
    const apiGetSpy = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        data: { mode: 'idle', version: 1 },
        meta: {},
        epoch: getIdentityEpoch(),
      });

    renderHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Không thể kiểm tra trạng thái điều phối',
      }),
    ).toBeVisible();

    // Start button disabled during error
    const startBtn = screen.getByRole('button', { name: /Tìm bạn luyện/i });
    expect(startBtn).toBeDisabled();

    // Click retry
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    fireEvent.click(retryBtn);

    // After retry resolves idle, start button should be enabled
    expect(apiGetSpy).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(startBtn).not.toBeDisabled();
    });
    expect(
      screen.queryByRole('heading', {
        name: 'Không thể kiểm tra trạng thái điều phối',
      }),
    ).toBeNull();
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

  it('opens account dropdown on avatar click and invokes logout when clicking Đăng xuất', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    const { mockLogout } = renderHome();

    // Ban đầu dropdown chưa mở
    expect(screen.queryByRole('menuitem', { name: /Đăng xuất/i })).toBeNull();

    // Click mở menu
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);

    // Menu đã mở với 2 lựa chọn: Hồ sơ của tôi và Đăng xuất
    const profileItem = screen.getByRole('menuitem', {
      name: /Hồ sơ của tôi/i,
    });
    const logoutBtn = screen.getByRole('menuitem', { name: /Đăng xuất/i });
    expect(profileItem).toBeVisible();
    expect(logoutBtn).toBeVisible();

    // Bấm Đăng xuất
    fireEvent.click(logoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
