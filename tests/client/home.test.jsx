import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Home } from '../../client/src/features/home/Home.jsx';
import { activeLocationRef } from '../../client/src/features/home/navigation-tracker.js';
import { AuthContext } from '../../client/src/features/auth/auth-context.js';
import { api } from '../../client/src/services/api-client.js';
import { getIdentityEpoch } from '../../client/src/services/cache.js';

describe('FE-002: SC-03 Trang chính (Home) Integration Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    activeLocationRef.current = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * Helper render Home với AuthContext tùy chỉnh và Routes điều hướng
   * @param {Object} [options]
   * @param {Partial<import('../../client/src/features/auth/auth-context.js').AuthState>} [options.authState]
   * @param {() => void} [options.onStart]
   * @param {string[]} [options.initialEntries]
   */
  function renderHome({
    authState = {},
    onStart,
    initialEntries = ['/home'],
  } = {}) {
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
      logout: vi.fn().mockResolvedValue(undefined),
      register: vi.fn(),
      updateUser: vi.fn(),
      refreshSession: vi.fn(),
      ...authState,
    };

    return {
      ...render(
        <AuthContext.Provider value={defaultAuth}>
          <MemoryRouter initialEntries={initialEntries}>
            <Routes>
              <Route path="/home" element={<Home onStart={onStart} />} />
              <Route path="/login" element={<div>Trang đăng nhập</div>} />
            </Routes>
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

    // Nút mở dropdown menu tài khoản (Disclosure pattern R2, B3, WCAG 2.5.3 Label in Name)
    const accountBtn = screen.getByRole('button', {
      name: 'Menu tài khoản: Minh Hoàng N3',
    });
    expect(accountBtn).toBeVisible();
    expect(accountBtn).toHaveAttribute(
      'aria-label',
      'Menu tài khoản: Minh Hoàng N3',
    );
    expect(accountBtn).toHaveAttribute('aria-expanded', 'false');
    expect(accountBtn).not.toHaveAttribute('aria-controls');
    expect(accountBtn).not.toHaveAttribute('aria-haspopup');

    // Click mở menu
    fireEvent.click(accountBtn);
    expect(accountBtn).toHaveAttribute('aria-expanded', 'true');
    expect(accountBtn).toHaveAttribute('aria-controls', 'ck-account-menu');

    // Dropdown panel không có aria-label thừa trên thẻ div (B3)
    const dropdownPanel = globalThis.document.getElementById('ck-account-menu');
    expect(dropdownPanel).not.toHaveAttribute('aria-label');

    // Link đến hồ sơ cá nhân /profile (Mục 1 trong dropdown - link thường theo R2)
    const profileLink = screen.getByRole('link', { name: /Hồ sơ của tôi/i });
    expect(profileLink).toHaveAttribute('href', '/profile');

    // Nút đăng xuất (Mục 2 trong dropdown - button thường theo R2)
    expect(screen.getByRole('button', { name: /Đăng xuất/i })).toBeVisible();
  });

  it('formats account button aria-label without trailing space when user has no level (WCAG 2.5.3)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome({
      authState: {
        user: {
          id: 'u-789',
          email: 'no-level@example.com',
          displayName: 'Lan Anh',
          avatarKey: 'avatar-default',
          role: 'learner',
          version: 1,
          status: 'active',
        },
      },
    });

    const accountBtn = screen.getByRole('button', {
      name: 'Menu tài khoản: Lan Anh',
    });
    expect(accountBtn).toBeVisible();
    expect(accountBtn).toHaveAttribute('aria-label', 'Menu tài khoản: Lan Anh');
  });

  it('renders navigation links to learning areas without mock demo previews (L1 Label in Name)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    // 3 mục góc học tập: Kho chủ đề (/topics), Đã lưu (/saved), Lịch sử (/history) - L1 text trực quan
    expect(screen.getByRole('link', { name: 'Kho chủ đề' })).toHaveAttribute(
      'href',
      '/topics',
    );
    expect(screen.getByRole('link', { name: 'Đã lưu' })).toHaveAttribute(
      'href',
      '/saved',
    );
    expect(screen.getByRole('link', { name: 'Lịch sử' })).toHaveAttribute(
      'href',
      '/history',
    );

    // 3 chip chủ đề hiển thị đầy đủ text Nhật - Việt mà không dùng aria-label lệch (B1)
    expect(
      screen.getByRole('link', { name: /カフェで.*Ở quán cà phê/i }),
    ).toHaveAttribute('href', '/topics');
    expect(
      screen.getByRole('link', { name: /道を聞く.*Hỏi đường/i }),
    ).toHaveAttribute('href', '/topics');
    expect(
      screen.getByRole('link', { name: /アルバイト.*Việc làm thêm/i }),
    ).toHaveAttribute('href', '/topics');

    // Chờ coordination check hoàn tất và chuyển sang trạng thái rảnh (idle)
    const inviteBtn = screen.getByRole('button', { name: 'Nhập mã' });
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

  it('announces the pending coordination check and disables new practice flows', () => {
    vi.spyOn(api, 'get').mockImplementationOnce(() => new Promise(() => {}));

    renderHome();

    expect(screen.getByRole('heading', { name: 'Trang chính' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang kiểm tra trạng thái điều phối',
    );

    // Nút tìm bạn luyện bị disabled khi đang chờ coordination check
    const startBtn = screen.getByRole('button', {
      name: /Tìm bạn luyện nói/i,
    });
    expect(startBtn).toBeDisabled();

    // Nút điều hướng "Luyện nói" trên header cũng bị disabled (L1)
    expect(screen.getByRole('button', { name: 'Luyện nói' })).toBeDisabled();

    // Hai CTA mã mời cũng bị disabled để chống tạo luồng khi chưa xác nhận rảnh (04 §3.4)
    expect(screen.getByRole('button', { name: 'Tạo mã mời' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nhập mã' })).toBeDisabled();
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
      screen.getByRole('button', { name: /Tìm bạn luyện nói/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tạo mã mời' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nhập mã' })).toBeDisabled();
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
    const startBtn = screen.getByRole('button', {
      name: /Tìm bạn luyện nói/i,
    });
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

  it('shows error banner and disables start button when coordination response lacks mode (L3 contract failure)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {},
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    // Response thiếu mode phải fail-closed
    expect(
      await screen.findByRole('heading', {
        name: 'Không thể kiểm tra trạng thái điều phối',
      }),
    ).toBeVisible();

    const startBtn = screen.getByRole('button', {
      name: /Tìm bạn luyện nói/i,
    });
    expect(startBtn).toBeDisabled();
  });

  it('treats inSession mode without resourceId as coordination error (B2 contract)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'inSession' },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Không thể kiểm tra trạng thái điều phối',
      }),
    ).toBeVisible();

    const startBtn = screen.getByRole('button', {
      name: /Tìm bạn luyện nói/i,
    });
    expect(startBtn).toBeDisabled();
  });

  it('treats unknown coordination mode as coordination error (B2 contract)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'invalidCustomMode', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Không thể kiểm tra trạng thái điều phối',
      }),
    ).toBeVisible();

    const startBtn = screen.getByRole('button', {
      name: /Tìm bạn luyện nói/i,
    });
    expect(startBtn).toBeDisabled();
  });

  it('encodes special characters in resourceId for room link (B2 contract)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        mode: 'inSession',
        resourceId: 'session/456?filter=1&test=true',
        version: 1,
      },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    const resumeLink = await screen.findByRole('link', {
      name: /Vào lại phòng/i,
    });
    expect(resumeLink).toHaveAttribute(
      'href',
      `/room/${encodeURIComponent('session/456?filter=1&test=true')}`,
    );
  });

  it('starts the Storybook demo without calling the coordination API', () => {
    const coordinationRequest = vi.spyOn(api, 'get');

    const onStartMock = vi.fn();
    renderHome({ onStart: onStartMock });

    const startBtn = screen.getByRole('button', {
      name: /Tìm bạn luyện nói/i,
    });
    fireEvent.click(startBtn);

    expect(onStartMock).toHaveBeenCalledTimes(1);
    expect(coordinationRequest).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Đang kiểm tra trạng thái điều phối/i),
    ).toBeNull();
  });

  it('navigates to /login on successful logout (R1 Test A)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    const logoutMock = vi.fn().mockResolvedValue(undefined);
    renderHome({ authState: { logout: logoutMock } });

    // Mở menu
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);

    // Bấm đăng xuất
    const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i });
    fireEvent.click(logoutBtn);

    // Chuyển hướng tới /login và thấy Trang đăng nhập
    expect(await screen.findByText('Trang đăng nhập')).toBeVisible();
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('retains session and shows alert banner with retry on logout failure (R1 Test B)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    const logoutMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error on logout'))
      .mockResolvedValueOnce(undefined);

    renderHome({ authState: { logout: logoutMock } });

    // Mở menu
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);

    const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i });
    fireEvent.click(logoutBtn);

    // Vẫn ở Home, thấy role="alert" và không thấy "Trang đăng nhập"
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByText('Chưa đăng xuất được')).toBeVisible();
    expect(
      screen.getByText('Yêu cầu đăng xuất chưa hoàn tất. Hãy thử lại.'),
    ).toBeVisible();
    expect(screen.queryByText(/vẫn còn hiệu lực/i)).toBeNull();
    expect(screen.queryByText('Trang đăng nhập')).toBeNull();

    // Bấm "Thử đăng xuất lại" -> logout được gọi lần 2 và chuyển hướng
    const retryLogoutBtn = screen.getByRole('button', {
      name: 'Thử đăng xuất lại',
    });
    fireEvent.click(retryLogoutBtn);

    expect(logoutMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Trang đăng nhập')).toBeVisible();
  });

  it('preserves logout error banner across unmount/remount cycle (R1 Test C: Gate simulation)', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    /** @type {(v: boolean) => void} */
    let setGateLoading = () => {};

    function Gate() {
      const [loading, setLoading] = useState(false);
      setGateLoading = setLoading;
      return loading ? <div>Đang tải quyền truy cập...</div> : <Home />;
    }

    const logoutMock = vi.fn().mockImplementation(async () => {
      setGateLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
      setGateLoading(false);
      throw new Error('Logout failed on backend');
    });

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
      logout: logoutMock,
      register: vi.fn(),
      updateUser: vi.fn(),
      refreshSession: vi.fn(),
    };

    render(
      <AuthContext.Provider value={defaultAuth}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/home" element={<Gate />} />
            <Route path="/login" element={<div>Trang đăng nhập</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    // Mở menu
    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);

    const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i });
    fireEvent.click(logoutBtn);

    // Chờ quá trình unmount/remount của Gate hoàn tất
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByText('Chưa đăng xuất được')).toBeVisible();
    expect(
      screen.getByText('Yêu cầu đăng xuất chưa hoàn tất. Hãy thử lại.'),
    ).toBeVisible();
    expect(screen.queryByText('Trang đăng nhập')).toBeNull();

    // Nút đóng banner dọn sạch state
    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('prevents double submission when logout is already in-flight (R1 Test D)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    let finishLogout = /** @type {(value?: unknown) => void} */ (() => {});
    const logoutMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLogout = resolve;
        }),
    );

    renderHome({ authState: { logout: logoutMock } });

    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });
    fireEvent.click(accountBtn);

    const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i });
    // Bấm liên tiếp 2 lần
    fireEvent.click(logoutBtn);
    fireEvent.click(logoutBtn);

    // Chỉ gọi đúng 1 lần
    expect(logoutMock).toHaveBeenCalledTimes(1);

    finishLogout();
    expect(await screen.findByText('Trang đăng nhập')).toBeVisible();
  });

  it('closes dropdown and returns focus to trigger button on Escape key (R2)', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: { mode: 'idle', version: 1 },
      meta: {},
      epoch: getIdentityEpoch(),
    });

    renderHome();

    const accountBtn = screen.getByRole('button', {
      name: /Menu tài khoản: Minh Hoàng/i,
    });

    // Mở menu
    fireEvent.click(accountBtn);
    expect(accountBtn).toHaveAttribute('aria-expanded', 'true');

    const logoutBtn = screen.getByRole('button', { name: /Đăng xuất/i });
    expect(logoutBtn).toBeVisible();

    // Focus vào một item bên trong dropdown
    logoutBtn.focus();
    expect(logoutBtn).toHaveFocus();

    // Bấm Escape
    fireEvent.keyDown(globalThis.document, { key: 'Escape' });

    // Menu đóng lại và focus được trả lại cho accountBtn
    expect(screen.queryByRole('button', { name: /Đăng xuất/i })).toBeNull();
    expect(accountBtn).toHaveAttribute('aria-expanded', 'false');
    expect(accountBtn).toHaveFocus();

    // Sau đó click lại nút tài khoản thì menu mở lại bình thường
    fireEvent.click(accountBtn);
    expect(screen.getByRole('button', { name: /Đăng xuất/i })).toBeVisible();
  });
});
