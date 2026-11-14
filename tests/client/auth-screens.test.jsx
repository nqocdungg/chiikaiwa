import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../client/src/App.jsx';
import {
  resolvePostLoginRedirect,
  validateLoginForm,
  validateRegisterForm,
} from '../../client/src/features/auth/auth-validation.js';
import { api } from '../../client/src/services/api-client.js';
import {
  clearPrivateCache,
  getPrivateCache,
  setIdentityKey,
  setPrivateCache,
} from '../../client/src/services/cache.js';
import { ApiError } from '../../client/src/services/errors.js';

describe('FE-009 Auth Screens (/login, /register) & Logout Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setIdentityKey(null);
    clearPrivateCache();
    globalThis.localStorage?.clear?.();
    globalThis.sessionStorage?.clear?.();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Validation & Safe Redirect Helpers', () => {
    it('preserves leading and trailing spaces in password without trimming on login and register', () => {
      const loginRes = validateLoginForm({
        email: '  minh.anh@example.com  ',
        password: '  matkhau123  ',
      });
      expect(loginRes.valid).toBe(true);
      expect(loginRes.payload).toEqual({
        email: 'minh.anh@example.com',
        password: '  matkhau123  ',
      });

      const registerRes = validateRegisterForm({
        displayName: '  Minh Anh  ',
        email: '  minh.anh@example.com  ',
        password: '  8kytupass  ',
        confirmPassword: '  8kytupass  ',
      });
      expect(registerRes.valid).toBe(true);
      expect(registerRes.payload).toEqual({
        displayName: 'Minh Anh',
        email: 'minh.anh@example.com',
        password: '  8kytupass  ',
      });
      expect(registerRes.payload).not.toHaveProperty('confirmPassword');
      expect(registerRes.payload).not.toHaveProperty('role');
    });

    it('enforces 8-128 Unicode code points on register password and detects confirmPassword mismatch without trimming', () => {
      const tooShort = validateRegisterForm({
        displayName: 'Minh Anh',
        email: 'minh.anh@example.com',
        password: '1234567',
        confirmPassword: '1234567',
      });
      expect(tooShort.valid).toBe(false);
      expect(tooShort.fieldErrors.password).toMatch(/8 đến 128 ký tự/i);

      const mismatch = validateRegisterForm({
        displayName: 'Minh Anh',
        email: 'minh.anh@example.com',
        password: 'matkhau123',
        confirmPassword: 'matkhau123 ',
      });
      expect(mismatch.valid).toBe(false);
      expect(mismatch.fieldErrors.confirmPassword).toMatch(/không khớp/i);
    });

    it('blocks external URLs, protocol-relative URLs, auth loops, and cross-role targets in resolvePostLoginRedirect', () => {
      expect(resolvePostLoginRedirect('//evil.com/phish', 'learner')).toBe(
        '/home',
      );
      expect(resolvePostLoginRedirect('https://evil.com', 'learner')).toBe(
        '/home',
      );
      expect(resolvePostLoginRedirect('/\\evil.com', 'learner')).toBe('/home');
      expect(resolvePostLoginRedirect('/login', 'learner')).toBe('/home');
      expect(resolvePostLoginRedirect('/register', 'learner')).toBe('/home');
      expect(resolvePostLoginRedirect('/forgot-password', 'learner')).toBe(
        '/home',
      );
      expect(resolvePostLoginRedirect('/reset-password', 'learner')).toBe(
        '/home',
      );
      expect(resolvePostLoginRedirect('/admin/users', 'learner')).toBe('/home');
      expect(
        resolvePostLoginRedirect(
          { pathname: '/decks', search: '?filter=n5' },
          'learner',
        ),
      ).toBe('/decks?filter=n5');

      expect(resolvePostLoginRedirect('/decks', 'admin')).toBe('/admin');
      expect(resolvePostLoginRedirect('//evil.com', 'admin')).toBe('/admin');
      expect(resolvePostLoginRedirect('/login', 'admin')).toBe('/admin');
      expect(
        resolvePostLoginRedirect({ pathname: '/admin/topics' }, 'admin'),
      ).toBe('/admin/topics');
    });
  });

  describe('Register Screen (/register)', () => {
    it('submits { email, password, displayName } on 201 without auto-login or storing tokens in web storage', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          user: {
            id: '507f1f77bcf86cd799439011',
            email: 'minh.anh@example.com',
            displayName: 'Minh Anh',
            avatarKey: 'avatar_1',
            role: 'learner',
            version: 1,
          },
        },
        meta: {},
        epoch: 0,
      });

      render(
        <MemoryRouter initialEntries={['/register']}>
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole('heading', { name: 'Đăng ký' }),
      ).toBeVisible();

      fireEvent.change(screen.getByLabelText('Tên hiển thị'), {
        target: { value: '  Minh Anh  ' },
      });
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: '  minh.anh@example.com  ' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), {
        target: { value: '  matkhau123  ' },
      });
      fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
        target: { value: '  matkhau123  ' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledTimes(1);
      });

      expect(postSpy).toHaveBeenCalledWith('/auth/register', {
        displayName: 'Minh Anh',
        email: 'minh.anh@example.com',
        password: '  matkhau123  ',
      });

      expect(await screen.findByTestId('register-success-state')).toBeVisible();
      expect(
        screen.getByText(/Tài khoản đã được tạo thành công/i),
      ).toBeVisible();
      expect(globalThis.localStorage?.length ?? 0).toBe(0);
      expect(globalThis.sessionStorage?.length ?? 0).toBe(0);

      // Navigate to /login from confirmation CTA and verify pre-filled email + notice
      fireEvent.click(
        screen.getByRole('link', { name: /Đi tới trang đăng nhập/i }),
      );
      expect(
        await screen.findByRole('heading', { name: 'Đăng nhập' }),
      ).toBeVisible();
      expect(screen.getByLabelText('Email')).toHaveValue(
        'minh.anh@example.com',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        /Đăng ký tài khoản thành công/i,
      );
    });

    it('displays duplicate email error (409 EMAIL_EXISTS) without showing success', async () => {
      vi.spyOn(api, 'post').mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'EMAIL_EXISTS',
          message: 'Email đã được đăng ký.',
        }),
      );

      render(
        <MemoryRouter initialEntries={['/register']}>
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Tên hiển thị'), {
        target: { value: 'Minh Anh' },
      });
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'existing@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), {
        target: { value: 'matkhau123' },
      });
      fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
        target: { value: 'matkhau123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Email này đã được sử dụng/i,
      );
      expect(
        screen.queryByTestId('register-success-state'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Login Screen (/login)', () => {
    it('logs in learner and redirects to /home (or safe internal from route)', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          user: {
            id: '507f1f77bcf86cd799439011',
            email: 'learner@example.com',
            displayName: 'Hạnh Nhi',
            avatarKey: 'avatar_1',
            role: 'learner',
            status: 'active',
            version: 1,
          },
          expiresAt: '2026-12-01T00:00:00.000Z',
        },
        meta: {},
        epoch: 0,
      });

      render(
        <MemoryRouter
          initialEntries={[
            { pathname: '/login', state: { from: { pathname: '/decks' } } },
          ]}
        >
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'learner@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), {
        target: { value: '  secret123  ' },
      });

      // Toggle show/hide password
      const toggleBtn = screen.getByRole('button', { name: 'Hiện mật khẩu' });
      fireEvent.click(toggleBtn);
      expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'text');

      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/auth/login', {
          email: 'learner@example.com',
          password: '  secret123  ',
        });
      });

      expect(
        await screen.findByRole('heading', { name: 'Bộ thẻ cá nhân' }),
      ).toBeVisible();
    });

    it('redirects admin to /admin after login and ignores unsafe external from state', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          user: {
            id: '507f1f77bcf86cd799439099',
            email: 'admin@example.com',
            displayName: 'Admin Chiikaiwa',
            avatarKey: 'avatar_2',
            role: 'admin',
            status: 'active',
            version: 1,
          },
          expiresAt: '2026-12-01T00:00:00.000Z',
        },
        meta: {},
        epoch: 0,
      });

      render(
        <MemoryRouter
          initialEntries={[
            { pathname: '/login', state: { from: '//evil.example.com/steal' } },
          ]}
        >
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'admin@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), {
        target: { value: 'adminpass123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

      expect(
        await screen.findByRole('heading', { name: 'Khu vực quản trị' }),
      ).toBeVisible();
    });

    it('surfaces 401 INVALID_CREDENTIALS, 403 ACCOUNT_LOCKED, 429 RATE_LIMITED, and network errors without redirecting', async () => {
      const postSpy = vi
        .spyOn(api, 'post')
        .mockRejectedValueOnce(
          new ApiError({
            status: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'Sai thông tin đăng nhập.',
          }),
        )
        .mockRejectedValueOnce(
          new ApiError({
            status: 403,
            code: 'ACCOUNT_LOCKED',
            message: 'Tài khoản bị khóa.',
          }),
        )
        .mockRejectedValueOnce(
          new ApiError({
            status: 429,
            code: 'RATE_LIMITED',
            message: 'Quá nhiều yêu cầu.',
            retryAfter: 30,
          }),
        )
        .mockRejectedValueOnce(
          new ApiError({
            status: 0,
            code: 'NETWORK_ERROR',
            message: 'Mất kết nối.',
          }),
        );

      render(
        <MemoryRouter initialEntries={['/login']}>
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'learner@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), {
        target: { value: 'wrongpass123' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Email hoặc mật khẩu chưa đúng/i,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Tài khoản của bạn hiện đã bị khóa/i,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/30 giây/i);

      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Không thể kết nối tới máy chủ/i,
      );
      expect(postSpy).toHaveBeenCalledTimes(4);
      expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    });

    it('prevents duplicate submit while login request is in flight', async () => {
      /** @type {((value: import('../../client/src/services/api-client.js').ApiResponse) => void) | null} */
      let resolveLogin = null;
      const postSpy = vi.spyOn(api, 'post').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve;
          }),
      );

      render(
        <MemoryRouter initialEntries={['/login']}>
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'learner@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), {
        target: { value: 'secret123' },
      });

      const submitBtn = screen.getByRole('button', { name: 'Đăng nhập' });
      fireEvent.click(submitBtn);
      expect(
        screen.getByRole('button', { name: 'Đang đăng nhập...' }),
      ).toBeDisabled();

      // Second click while disabled should not trigger a second API call
      fireEvent.click(
        screen.getByRole('button', { name: 'Đang đăng nhập...' }),
      );
      expect(postSpy).toHaveBeenCalledTimes(1);

      if (resolveLogin) {
        /** @type {(value: import('../../client/src/services/api-client.js').ApiResponse) => void} */ (
          resolveLogin
        )({
          data: {
            user: {
              id: '507f1f77bcf86cd799439011',
              email: 'learner@example.com',
              displayName: 'Hạnh Nhi',
              avatarKey: 'avatar_1',
              role: 'learner',
              status: 'active',
              version: 1,
            },
            expiresAt: '2026-12-01T00:00:00.000Z',
          },
          meta: {},
          epoch: 0,
        });
      }

      expect(
        await screen.findByRole('heading', { name: 'Trang chính' }),
      ).toBeVisible();
    });
  });

  describe('Logout Flow & Private Cache Isolation', () => {
    it('calls POST /auth/logout, clears private cache on 204, and surfaces error without faking success on 503', async () => {
      const postSpy = vi
        .spyOn(api, 'post')
        // 1. Login user A
        .mockResolvedValueOnce({
          data: {
            user: {
              id: 'user-a-id',
              email: 'usera@example.com',
              displayName: 'User A',
              avatarKey: 'avatar_1',
              role: 'learner',
              status: 'active',
              version: 1,
            },
            expiresAt: '2026-12-01T00:00:00.000Z',
          },
          meta: {},
          epoch: 0,
        })
        // 2. First logout attempt fails with 503 SERVICE_UNAVAILABLE
        .mockRejectedValueOnce(
          new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Dịch vụ tạm gián đoạn.',
          }),
        )
        // 3. Second logout attempt succeeds with 204
        .mockResolvedValueOnce({
          data: null,
          meta: {},
          epoch: 1,
        });

      render(
        <MemoryRouter initialEntries={['/login']}>
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'usera@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), {
        target: { value: 'secret123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

      expect(
        await screen.findByRole('heading', { name: 'Trang chính' }),
      ).toBeVisible();
      expect(screen.getByText('User A')).toBeVisible();

      // Store private cache entry for User A
      setPrivateCache('decks:list', ['deck-private-user-a']);
      expect(getPrivateCache('decks:list')).toEqual(['deck-private-user-a']);

      // First logout fails with 503 -> must surface error and stay on /home (not fake success)
      fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Hệ thống đang tạm thời gián đoạn/i,
      );
      expect(
        screen.getByRole('heading', { name: 'Trang chính' }),
      ).toBeVisible();

      // Second logout succeeds with 204 -> clears user state & private cache and redirects to /login
      fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
      expect(
        await screen.findByRole('heading', { name: 'Đăng nhập' }),
      ).toBeVisible();
      expect(getPrivateCache('decks:list')).toBeUndefined();
      expect(postSpy).toHaveBeenNthCalledWith(2, '/auth/logout', {});
      expect(postSpy).toHaveBeenNthCalledWith(3, '/auth/logout', {});
    });
  });
});
