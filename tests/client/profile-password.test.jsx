import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../../client/src/App.jsx';
import { AuthProvider } from '../../client/src/features/auth/AuthContext.jsx';
import { buildProfilePatchPayload } from '../../client/src/features/auth/account-validation.js';
import { ProfilePage } from '../../client/src/features/profile/ProfilePage.jsx';
import { api } from '../../client/src/services/api-client.js';
import {
  clearPrivateCache,
  getIdentityEpoch,
  getPrivateCache,
  setIdentityKey,
  setPrivateCache,
} from '../../client/src/services/cache.js';
import { ApiError } from '../../client/src/services/errors.js';

const MOCK_CATALOGS = {
  levels: [
    { code: 'N5', label: 'N5' },
    { code: 'N4', label: 'N4' },
    { code: 'N3', label: 'N3' },
    { code: 'N2', label: 'N2' },
    { code: 'N1', label: 'N1' },
  ],
  durations: [
    { code: 10, label: '10 phút' },
    { code: 20, label: '20 phút' },
    { code: 30, label: '30 phút' },
  ],
  goals: [
    { code: 'dailyCommunication', label: 'Giao tiếp hằng ngày' },
    { code: 'travel', label: 'Du lịch' },
    { code: 'studyAndWork', label: 'Học tập và công việc' },
    { code: 'examPreparation', label: 'Củng cố kiến thức phục vụ kỳ thi' },
    { code: 'culturalExchange', label: 'Giao lưu văn hóa' },
  ],
  interests: [
    { code: 'music', label: 'Âm nhạc' },
    { code: 'filmAndAnime', label: 'Phim và anime' },
    { code: 'food', label: 'Ẩm thực' },
    { code: 'travel', label: 'Du lịch' },
    { code: 'books', label: 'Sách' },
    { code: 'games', label: 'Trò chơi' },
    { code: 'sports', label: 'Thể thao' },
    { code: 'technology', label: 'Công nghệ' },
  ],
  languages: [
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'ja', label: 'Tiếng Nhật' },
    { code: 'en', label: 'Tiếng Anh' },
  ],
  countries: [
    { code: 'VN', label: 'Việt Nam' },
    { code: 'JP', label: 'Nhật Bản' },
    { code: 'US', label: 'Hoa Kỳ' },
  ],
  ageGroups: [
    { code: 'under18', label: 'Dưới 18' },
    { code: '18to22', label: '18–22' },
    { code: '23to30', label: '23–30' },
    { code: 'over30', label: 'Trên 30' },
  ],
  genders: [
    { code: 'male', label: 'Nam' },
    { code: 'female', label: 'Nữ' },
    { code: 'other', label: 'Khác' },
  ],
  avatars: [
    { code: 'chiikawa', label: 'Chiikawa' },
    { code: 'hachiware', label: 'Hachiware' },
    { code: 'usagi', label: 'Usagi' },
  ],
};

/**
 * @param {Partial<import('../../client/src/features/auth/auth-context.js').SelfUser>} [overrides]
 * @returns {import('../../client/src/features/auth/auth-context.js').SelfUser}
 */
function createMockUser(overrides = {}) {
  return {
    id: '507f1f77bcf86cd799439011',
    email: 'hanhnhi@chiikaiwa.dev',
    displayName: 'Hạnh Nhi',
    avatarKey: 'chiikawa',
    role: 'learner',
    status: 'active',
    version: 1,
    profile: {
      level: 'N4',
      goal: 'travel',
      nativeLanguageCode: 'vi',
      interests: ['music', 'books'],
    },
    ...overrides,
  };
}

describe('FE-003 Profile, Change Password, Forgot Password & Reset Password UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPrivateCache();
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearPrivateCache();
  });

  describe('Profile screen (SC-04 /profile)', () => {
    it('loads catalogs and current Self DTO, and distinguishes omitted optional fields from fields cleared with null', async () => {
      const initialUser = createMockUser();
      const updatedUser = createMockUser({
        displayName: 'Hạnh Nhi Mới',
        avatarKey: 'usagi',
        version: 2,
        profile: {
          level: 'N3',
          nativeLanguageCode: 'vi',
          countryCode: 'JP',
          interests: ['music', 'books', 'food'],
        },
      });

      const getSpy = vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: initialUser },
            meta: { requestId: 'req-me' },
            epoch: getIdentityEpoch(),
          };
        }
        if (path === '/catalogs') {
          return {
            data: MOCK_CATALOGS,
            meta: { requestId: 'req-catalogs' },
            epoch: getIdentityEpoch(),
          };
        }
        throw new Error(`Unexpected GET ${path}`);
      });

      const patchSpy = vi
        .spyOn(api, 'patch')
        .mockImplementationOnce(async () => ({
          data: updatedUser,
          meta: { requestId: 'req-patch-1' },
          epoch: getIdentityEpoch(),
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        }));

      const { container } = render(
        <MemoryRouter initialEntries={['/profile']}>
          <App />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole('heading', { name: 'Hồ sơ của tôi' }),
      ).toBeVisible();
      expect(
        screen.getByRole('heading', { name: 'Hồ sơ cá nhân' }),
      ).toBeInTheDocument();

      // F-01 & F-02: single LearningHeader, no duplicate .ck-account-topbar, no version metadata badge
      expect(container.querySelectorAll('.ck-learning-header')).toHaveLength(1);
      expect(container.querySelector('.ck-account-topbar')).toBeNull();
      expect(screen.queryByText(/Phiên bản hồ sơ/u)).not.toBeInTheDocument();

      // Sidebar navigation items (matching Figma account sidebar + existing routes)
      expect(
        screen.getByRole('link', { name: /Hồ sơ của tôi/u }),
      ).toHaveAttribute('href', '/profile');
      expect(
        screen.getByRole('link', { name: /Chỉnh sửa hồ sơ/u }),
      ).toHaveAttribute('href', '/profile#profile-section-heading');
      expect(
        screen.getByRole('link', { name: /Đổi mật khẩu/u }),
      ).toHaveAttribute('href', '/profile#password-change-section-heading');
      expect(
        screen.getByRole('link', { name: /Danh sách đã chặn/u }),
      ).toHaveAttribute('href', '/blocks');
      expect(
        screen.queryByRole('link', { name: /Khu vực quản trị/u }),
      ).not.toBeInTheDocument();

      // Overview shows saved profile details resolved from catalogs
      await waitFor(() => {
        expect(screen.getByText('Du lịch')).toBeVisible();
      });
      expect(screen.getByText('Chiikawa')).toBeVisible();
      expect(screen.getByText('Âm nhạc')).toBeVisible();
      expect(screen.getByText('Sách')).toBeVisible();

      // Switch to Edit Profile view via primary CTA on overview card
      fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa hồ sơ' }));

      expect(
        await screen.findByRole('heading', { name: 'Chỉnh sửa hồ sơ' }),
      ).toBeVisible();

      // Wait for catalogs to populate select options
      await waitFor(() => {
        expect(screen.getByLabelText('Trình độ tiếng Nhật')).toHaveValue('N4');
      });

      expect(getSpy).toHaveBeenCalledWith('/catalogs');
      expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue('Hạnh Nhi');
      expect(screen.getByLabelText('Email')).toHaveValue(
        'hanhnhi@chiikaiwa.dev',
      );
      expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
      expect(screen.getByLabelText('Email')).toBeDisabled();
      expect(screen.getByLabelText('Mục tiêu học')).toHaveValue('travel');
      expect(screen.getByLabelText('Tiếng mẹ đẻ')).toHaveValue('vi');
      expect(screen.getByLabelText('Quốc gia đang sinh sống')).toHaveValue('');
      expect(screen.getByLabelText('Nhóm tuổi')).toHaveValue('');
      expect(screen.getByLabelText('Giới tính')).toHaveValue('');

      // Ensure non-contract fields (e.g. durations) are NOT rendered on the profile form
      expect(screen.queryByText('10 phút')).not.toBeInTheDocument();

      // Modify displayName, avatarKey, change level N4 -> N3, clear goal ('travel' -> ''), set countryCode ('JP'),
      // leave ageGroup & gender blank (should be omitted, NOT sent as null), and add 'food' to interests
      fireEvent.change(screen.getByLabelText('Tên hiển thị *'), {
        target: { value: '  Hạnh Nhi Mới  ' },
      });
      fireEvent.click(screen.getByRole('radio', { name: 'Usagi' }));
      fireEvent.change(screen.getByLabelText('Trình độ tiếng Nhật'), {
        target: { value: 'N3' },
      });
      fireEvent.change(screen.getByLabelText('Mục tiêu học'), {
        target: { value: '' },
      });
      fireEvent.change(screen.getByLabelText('Quốc gia đang sinh sống'), {
        target: { value: 'JP' },
      });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Ẩm thực' }));

      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledTimes(1);
      });

      const [patchPath, rawPatchBody, patchOptions] = patchSpy.mock.calls[0];
      const patchBody =
        /** @type {{ expectedVersion: number, displayName: string, avatarKey: string, profile: Record<string, unknown> }} */ (
          rawPatchBody
        );
      expect(patchPath).toBe('/me/profile');
      expect(patchBody).toEqual({
        expectedVersion: 1,
        displayName: 'Hạnh Nhi Mới',
        avatarKey: 'usagi',
        profile: {
          level: 'N3',
          goal: null,
          countryCode: 'JP',
          interests: ['music', 'books', 'food'],
        },
      });
      // ageGroup, gender, and unchanged nativeLanguageCode must be omitted
      expect(Object.keys(patchBody.profile)).toEqual([
        'level',
        'goal',
        'countryCode',
        'interests',
      ]);
      expect(patchOptions?.idempotencyKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      );

      // UI and cache updated after save (version stays hidden from user)
      expect(
        await screen.findByText('Đã lưu hồ sơ cá nhân thành công.'),
      ).toBeVisible();
      expect(screen.queryByText(/Phiên bản hồ sơ/u)).not.toBeInTheDocument();
      expect(getPrivateCache('/me/profile')).toEqual(updatedUser);

      // Navigate back to overview via sidebar -> reflects updated profile
      fireEvent.click(screen.getByRole('link', { name: /Hồ sơ của tôi/u }));
      expect(
        await screen.findByRole('heading', { name: 'Hồ sơ của tôi' }),
      ).toBeVisible();
      expect(screen.getAllByText('Hạnh Nhi Mới')).toHaveLength(2);
      expect(screen.getByText('Usagi')).toBeVisible();
      expect(screen.getByText('Ẩm thực')).toBeVisible();
    });

    it('enforces client-side input limits (displayName length, max 3 interests) and surfaces server 422 field errors without showing success', async () => {
      const initialUser = createMockUser({
        profile: {
          interests: ['music', 'books', 'food'],
        },
      });

      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: initialUser },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      const patchSpy = vi.spyOn(api, 'patch').mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'VALIDATION_FAILED',
          message: 'Dữ liệu đầu vào không hợp lệ.',
          details: {
            fields: [
              {
                path: 'profile.level',
                code: 'INVALID_ENUM',
                message: 'Trình độ không nằm trong danh mục cho phép.',
              },
            ],
          },
        }),
      );

      render(
        <MemoryRouter initialEntries={['/profile#profile-section-heading']}>
          <App />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: 'Âm nhạc' })).toBeChecked();
      });

      // 1. Selecting a 4th interest triggers MAX_PROFILE_INTERESTS error and blocks API call
      fireEvent.click(screen.getByRole('checkbox', { name: 'Trò chơi' }));
      expect(
        screen.getByText('Chỉ được chọn tối đa 3 sở thích.'),
      ).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      expect(patchSpy).not.toHaveBeenCalled();

      // Uncheck 4th interest to return to 3 valid interests
      fireEvent.click(screen.getByRole('checkbox', { name: 'Trò chơi' }));
      expect(
        screen.queryByText('Chỉ được chọn tối đa 3 sở thích.'),
      ).not.toBeInTheDocument();

      // 2. Blank displayName (whitespace only) triggers displayName validation error
      fireEvent.change(screen.getByLabelText('Tên hiển thị *'), {
        target: { value: '    ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      expect(
        screen.getByText(
          'Tên hiển thị sau khi cắt khoảng trắng phải từ 1 đến 100 ký tự.',
        ),
      ).toBeVisible();
      expect(patchSpy).not.toHaveBeenCalled();

      // 3. Valid client input -> server returns 422 field error -> surfaces field error, no success banner
      fireEvent.change(screen.getByLabelText('Tên hiển thị *'), {
        target: { value: 'Hạnh Nhi' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      expect(
        await screen.findByText('Trình độ không nằm trong danh mục cho phép.'),
      ).toBeVisible();
      expect(
        screen.getByLabelText('Trình độ tiếng Nhật'),
      ).toHaveAccessibleDescription(
        'Trình độ không nằm trong danh mục cho phép.',
      );
      expect(
        screen.queryByText('Đã lưu hồ sơ cá nhân thành công.'),
      ).not.toBeInTheDocument();
    });

    it('preserves user draft on 409 VERSION_CONFLICT and allows syncing latest version before saving without silently overwriting', async () => {
      const userV1 = createMockUser({ version: 1, displayName: 'Tên Cũ' });
      const userV3FromServer = createMockUser({
        version: 3,
        displayName: 'Tên Từ Tab Khác',
        profile: {
          level: 'N4',
          goal: 'studyAndWork',
          nativeLanguageCode: 'vi',
          interests: ['music'],
        },
      });
      const savedUserV4 = createMockUser({
        version: 4,
        displayName: 'Tên Đang Nhập',
        profile: {
          level: 'N2',
          goal: 'studyAndWork',
          nativeLanguageCode: 'vi',
          interests: ['music'],
        },
      });

      let meCallCount = 0;
      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          meCallCount += 1;
          return {
            data: {
              kind: 'user',
              user: meCallCount === 1 ? userV1 : userV3FromServer,
            },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      const patchSpy = vi
        .spyOn(api, 'patch')
        .mockRejectedValueOnce(
          new ApiError({
            status: 409,
            code: 'VERSION_CONFLICT',
            message: 'Dữ liệu đã thay đổi. Vui lòng tải lại.',
            details: { currentVersion: 3 },
          }),
        )
        .mockResolvedValueOnce({
          data: savedUserV4,
          meta: {},
          epoch: getIdentityEpoch(),
        });

      render(
        <MemoryRouter initialEntries={['/profile#profile-section-heading']}>
          <App />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue('Tên Cũ');
      });

      await waitFor(() => {
        const levelSelect = screen.getByLabelText('Trình độ tiếng Nhật');
        expect(levelSelect).toBeEnabled();
        expect(levelSelect.querySelector('option[value="N2"]')).not.toBeNull();
      });

      // User edits displayName and level
      fireEvent.change(screen.getByLabelText('Tên hiển thị *'), {
        target: { value: 'Tên Đang Nhập' },
      });
      fireEvent.change(screen.getByLabelText('Trình độ tiếng Nhật'), {
        target: { value: 'N2' },
      });

      // First save attempt hits 409 VERSION_CONFLICT
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      expect(
        await screen.findByText('Xung đột phiên bản dữ liệu'),
      ).toBeVisible();
      // User's typed values must be preserved!
      expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue(
        'Tên Đang Nhập',
      );
      expect(screen.getByLabelText('Trình độ tiếng Nhật')).toHaveValue('N2');
      expect(
        screen.queryByText('Đã lưu hồ sơ cá nhân thành công.'),
      ).not.toBeInTheDocument();

      // User clicks "Đồng bộ phiên bản mới và giữ nội dung đang nhập"
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Đồng bộ phiên bản mới và giữ nội dung đang nhập',
        }),
      );

      expect(
        await screen.findByText(/Đã đồng bộ phiên bản mới nhất \(v3\)/u),
      ).toBeVisible();
      expect(screen.queryByText(/Phiên bản hồ sơ/u)).not.toBeInTheDocument();
      // Draft values are still preserved
      expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue(
        'Tên Đang Nhập',
      );
      expect(screen.getByLabelText('Trình độ tiếng Nhật')).toHaveValue('N2');

      // Now user clicks Save again -> sends expectedVersion: 3 with a fresh Idempotency-Key
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledTimes(2);
      });

      const firstKey = patchSpy.mock.calls[0][2]?.idempotencyKey;
      const secondCallBody =
        /** @type {{ expectedVersion: number, displayName: string }} */ (
          patchSpy.mock.calls[1][1]
        );
      const secondKey = patchSpy.mock.calls[1][2]?.idempotencyKey;

      expect(secondCallBody.expectedVersion).toBe(3);
      expect(secondCallBody.displayName).toBe('Tên Đang Nhập');
      expect(secondKey).not.toBe(firstKey);
      expect(
        await screen.findByText('Đã lưu hồ sơ cá nhân thành công.'),
      ).toBeVisible();
    });

    it('reuses the same Idempotency-Key when retrying the exact same profile payload after a 503/network error, and prevents duplicate concurrent submissions', async () => {
      const initialUser = createMockUser({ version: 1 });
      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: initialUser },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      /** @type {(val: any) => void} */
      let resolveSecondPatch = () => {};
      const patchSpy = vi
        .spyOn(api, 'patch')
        .mockRejectedValueOnce(
          new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Máy chủ tạm thời gián đoạn.',
          }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSecondPatch = resolve;
            }),
        );

      render(
        <MemoryRouter initialEntries={['/profile#profile-section-heading']}>
          <App />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue('Hạnh Nhi');
      });

      fireEvent.change(screen.getByLabelText('Tên hiển thị *'), {
        target: { value: 'Hạnh Nhi Retry' },
      });

      // 1. First submit fails with 503 SERVICE_UNAVAILABLE
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      expect(
        await screen.findByText('Máy chủ tạm thời gián đoạn.'),
      ).toBeVisible();
      expect(
        screen.queryByText('Đã lưu hồ sơ cá nhân thành công.'),
      ).not.toBeInTheDocument();

      // 2. Retry same form without changing fields -> reuses exact same Idempotency-Key
      const saveBtn = screen.getByRole('button', { name: 'Lưu thay đổi' });
      fireEvent.click(saveBtn);
      // Duplicate click while pending must be ignored
      fireEvent.click(
        screen.getByRole('button', { name: 'Đang lưu hồ sơ...' }),
      );

      expect(patchSpy).toHaveBeenCalledTimes(2);
      const firstIdempotencyKey = patchSpy.mock.calls[0][2]?.idempotencyKey;
      const secondIdempotencyKey = patchSpy.mock.calls[1][2]?.idempotencyKey;
      expect(secondIdempotencyKey).toBe(firstIdempotencyKey);

      await act(async () => {
        resolveSecondPatch({
          data: createMockUser({ version: 2, displayName: 'Hạnh Nhi Retry' }),
          meta: {},
          epoch: getIdentityEpoch(),
        });
      });

      expect(
        await screen.findByText('Đã lưu hồ sơ cá nhân thành công.'),
      ).toBeVisible();
    });

    it('binds PATCH /me/profile to the opened account via X-Expected-Actor and requires reloading profile on 409 IDENTITY_CONFLICT', async () => {
      const accountA = createMockUser({
        id: '507f1f77bcf86cd799439011',
        displayName: 'Tài khoản A',
        version: 1,
      });
      const accountB = createMockUser({
        id: '507f1f77bcf86cd799439022',
        email: 'accountb@chiikaiwa.dev',
        displayName: 'Tài khoản B',
        version: 1,
      });

      let meCallCount = 0;
      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          meCallCount += 1;
          return {
            data: {
              kind: 'user',
              user: meCallCount === 1 ? accountA : accountB,
            },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      const patchSpy = vi.spyOn(api, 'patch').mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'IDENTITY_CONFLICT',
          message:
            'Tài khoản đăng nhập đã thay đổi. Vui lòng tải lại hồ sơ trước khi lưu.',
        }),
      );

      render(
        <MemoryRouter initialEntries={['/profile#profile-section-heading']}>
          <App />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue(
          'Tài khoản A',
        );
      });

      fireEvent.change(screen.getByLabelText('Tên hiển thị *'), {
        target: { value: 'Nháp của A' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledTimes(1);
      });
      expect(patchSpy.mock.calls[0][2]?.headers).toEqual({
        'X-Expected-Actor': accountA.id,
      });

      expect(
        await screen.findByText('Tài khoản đăng nhập đã thay đổi'),
      ).toBeVisible();
      expect(
        screen.queryByText('Đã lưu hồ sơ cá nhân thành công.'),
      ).not.toBeInTheDocument();

      // Reloading profile switches cleanly to account B and discards A's draft
      fireEvent.click(screen.getByRole('button', { name: 'Tải lại hồ sơ' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue(
          'Tài khoản B',
        );
      });
    });

    it('merges only user-edited fields onto the latest server profile on conflict sync without deleting untouched fields like countryCode', async () => {
      const userV1 = createMockUser({
        version: 1,
        displayName: 'Tên Cũ',
        profile: {
          level: 'N4',
          goal: 'travel',
          nativeLanguageCode: 'vi',
          interests: ['music', 'books'],
        },
      });
      const userV2WithJp = createMockUser({
        version: 2,
        displayName: 'Tên Cũ',
        profile: {
          level: 'N4',
          goal: 'travel',
          nativeLanguageCode: 'vi',
          countryCode: 'JP',
          interests: ['music', 'books'],
        },
      });
      const userV3Saved = createMockUser({
        version: 3,
        displayName: 'Tên Mới Tab 1',
        profile: {
          level: 'N4',
          goal: 'travel',
          nativeLanguageCode: 'vi',
          countryCode: 'JP',
          interests: ['music', 'books'],
        },
      });

      let meCallCount = 0;
      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          meCallCount += 1;
          return {
            data: {
              kind: 'user',
              user: meCallCount === 1 ? userV1 : userV2WithJp,
            },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      const patchSpy = vi
        .spyOn(api, 'patch')
        .mockRejectedValueOnce(
          new ApiError({
            status: 409,
            code: 'VERSION_CONFLICT',
            message: 'Dữ liệu đã thay đổi. Vui lòng tải lại.',
            details: { currentVersion: 2 },
          }),
        )
        .mockResolvedValueOnce({
          data: userV3Saved,
          meta: {},
          epoch: getIdentityEpoch(),
        });

      render(
        <MemoryRouter initialEntries={['/profile#profile-section-heading']}>
          <App />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue('Tên Cũ');
      });

      // Tab 1 only edits displayName; countryCode is untouched
      fireEvent.change(screen.getByLabelText('Tên hiển thị *'), {
        target: { value: 'Tên Mới Tab 1' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      expect(
        await screen.findByText('Xung đột phiên bản dữ liệu'),
      ).toBeVisible();

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Đồng bộ phiên bản mới và giữ nội dung đang nhập',
        }),
      );

      expect(
        await screen.findByText(/Đã đồng bộ phiên bản mới nhất \(v2\)/u),
      ).toBeVisible();
      expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue(
        'Tên Mới Tab 1',
      );
      expect(screen.getByLabelText('Quốc gia đang sinh sống')).toHaveValue(
        'JP',
      );

      // Re-submit after sync: must send new expectedVersion (2) and displayName, omitting countryCode
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledTimes(2);
      });
      const secondPayload = patchSpy.mock.calls[1][1];
      expect(secondPayload).toEqual({
        expectedVersion: 2,
        displayName: 'Tên Mới Tab 1',
      });
    });

    it('counts displayName by Unicode code points (allows 100 emojis without UTF-16 truncation and rejects 101 code points)', async () => {
      const initialUser = createMockUser({ version: 1 });
      const hundredEmojis = '😀'.repeat(100);
      const oneHundredOneEmojis = '😀'.repeat(101);

      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: initialUser },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({
        data: createMockUser({ version: 2, displayName: hundredEmojis }),
        meta: {},
        epoch: getIdentityEpoch(),
      });

      render(
        <MemoryRouter initialEntries={['/profile#profile-section-heading']}>
          <App />
        </MemoryRouter>,
      );

      const displayNameInput = await screen.findByLabelText('Tên hiển thị *');
      expect(displayNameInput).not.toHaveAttribute('maxlength');

      // 101 code points -> validation error on displayName field, no PATCH sent
      fireEvent.change(displayNameInput, {
        target: { value: oneHundredOneEmojis },
      });
      expect(displayNameInput).toHaveValue(oneHundredOneEmojis);
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      expect(displayNameInput).toHaveAccessibleDescription(
        'Tên hiển thị sau khi cắt khoảng trắng phải từ 1 đến 100 ký tự.',
      );
      expect(patchSpy).not.toHaveBeenCalled();

      // 100 code points (200 UTF-16 units) -> preserved in full and sent to server
      fireEvent.change(displayNameInput, {
        target: { value: hundredEmojis },
      });
      expect(displayNameInput).toHaveValue(hundredEmojis);
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledTimes(1);
      });
      expect(patchSpy.mock.calls[0][1]).toMatchObject({
        expectedVersion: 1,
        displayName: hundredEmojis,
      });
    });

    it('cancels edits back to baseline overview and navigates between overview, edit, and password sections via sidebar', async () => {
      const initialUser = createMockUser();
      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: initialUser },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });
      const patchSpy = vi.spyOn(api, 'patch');

      render(
        <MemoryRouter initialEntries={['/profile']}>
          <App />
        </MemoryRouter>,
      );

      // Default view is read-only overview ("Hồ sơ của tôi")
      expect(
        await screen.findByRole('heading', { name: 'Hồ sơ của tôi' }),
      ).toBeVisible();
      expect(screen.queryByLabelText('Tên hiển thị *')).not.toBeInTheDocument();

      // Switch to edit via sidebar link
      fireEvent.click(screen.getByRole('link', { name: /Chỉnh sửa hồ sơ/u }));
      const nameInput = await screen.findByLabelText('Tên hiển thị *');
      expect(nameInput).toHaveValue('Hạnh Nhi');
      expect(screen.getByLabelText('Email')).toHaveValue(
        'hanhnhi@chiikaiwa.dev',
      );
      expect(
        screen.getByText('Email không thể thay đổi tại đây.'),
      ).toBeVisible();

      // Mutate draft and click "Hủy" -> discards draft without API call and returns to overview
      fireEvent.change(nameInput, { target: { value: 'Tên Chưa Lưu' } });
      fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

      expect(patchSpy).not.toHaveBeenCalled();
      expect(
        await screen.findByRole('heading', { name: 'Hồ sơ của tôi' }),
      ).toBeVisible();
      expect(screen.getAllByText('Hạnh Nhi').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Tên Chưa Lưu')).not.toBeInTheDocument();

      // Re-open edit and verify draft was reset to baseline
      fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa hồ sơ' }));
      expect(await screen.findByLabelText('Tên hiển thị *')).toHaveValue(
        'Hạnh Nhi',
      );

      // Switch to Change Password view via sidebar link
      fireEvent.click(screen.getByRole('link', { name: /Đổi mật khẩu/u }));
      expect(
        await screen.findByRole('heading', { name: 'Đổi mật khẩu' }),
      ).toBeVisible();
      expect(
        screen.getByLabelText('Xác nhận mật khẩu mới *'),
      ).toBeInTheDocument();
    });

    it('shows a link back to /admin in the profile sidebar for active admins and navigates to /admin on click', async () => {
      const adminUser = createMockUser({
        role: 'admin',
        displayName: 'Quản trị viên',
        email: 'admin@chiikaiwa.dev',
      });

      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: adminUser },
            meta: { requestId: 'req-me-admin' },
            epoch: getIdentityEpoch(),
          };
        }
        if (path === '/catalogs') {
          return {
            data: MOCK_CATALOGS,
            meta: { requestId: 'req-catalogs-admin' },
            epoch: getIdentityEpoch(),
          };
        }
        throw new Error(`Unexpected GET ${path}`);
      });

      const { container } = render(
        <MemoryRouter initialEntries={['/profile']}>
          <App />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole('heading', { name: 'Hồ sơ của tôi' }),
      ).toBeVisible();
      expect(container.querySelector('.ck-learning-header')).toBeNull();
      expect(
        screen.queryByRole('link', { name: /Danh sách đã chặn/u }),
      ).not.toBeInTheDocument();

      const adminLink = screen.getByRole('link', {
        name: /Khu vực quản trị/u,
      });
      expect(adminLink).toBeVisible();
      expect(adminLink).toHaveAttribute('href', '/admin');

      fireEvent.click(adminLink);

      const adminHeading = await screen.findByRole('heading', {
        name: 'Khu vực quản trị',
      });
      expect(adminHeading).toBeVisible();
      expect(adminHeading.closest('[data-screen-id="SC-19"]')).not.toBeNull();
    });
  });

  describe('Change Password flow on SC-04 (/profile)', () => {
    it('validates password inputs without trimming, handles 401 INVALID_CREDENTIALS without faking success, and revokes old session + guides re-login on 204 success', async () => {
      const initialUser = createMockUser();
      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: initialUser },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      const postSpy = vi
        .spyOn(api, 'post')
        .mockRejectedValueOnce(
          new ApiError({
            status: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'Mật khẩu hiện tại không chính xác.',
          }),
        )
        .mockResolvedValueOnce({
          data: null,
          meta: { requestId: 'pwd-change-ok' },
          epoch: getIdentityEpoch(),
        });

      render(
        <MemoryRouter
          initialEntries={['/profile#password-change-section-heading']}
        >
          <App />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByLabelText('Mật khẩu hiện tại *'),
        ).toBeInTheDocument();
      });

      setPrivateCache('learner-secret-cache', { items: [1, 2, 3] });

      // 1. Short newPassword (< 8 code points) rejected client-side
      fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại *'), {
        target: { value: 'OldPass123' },
      });
      fireEvent.change(screen.getByLabelText('Mật khẩu mới *'), {
        target: { value: 'short' },
      });
      fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới *'), {
        target: { value: 'short' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

      expect(
        screen.getByText('Mật khẩu phải từ 8 đến 128 ký tự.'),
      ).toBeVisible();
      expect(postSpy).not.toHaveBeenCalled();

      // 2. Wrong currentPassword -> 401 INVALID_CREDENTIALS -> shows error, stays on page
      // Use a password with leading/trailing spaces to verify no trimming occurs
      const untrimmedNewPassword = '  NewSecretPass123  ';
      fireEvent.change(screen.getByLabelText('Mật khẩu mới *'), {
        target: { value: untrimmedNewPassword },
      });
      fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới *'), {
        target: { value: untrimmedNewPassword },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

      expect(
        await screen.findAllByText('Mật khẩu hiện tại không chính xác.'),
      ).not.toHaveLength(0);
      expect(postSpy).toHaveBeenCalledWith('/auth/password-change', {
        currentPassword: 'OldPass123',
        newPassword: untrimmedNewPassword,
      });

      // 3. Correct currentPassword -> 204 No Content -> clears private cache, revokes session, and guides to login
      fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại *'), {
        target: { value: 'CorrectOldPass123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

      // ProtectedRoute redirects to /login with the revocation notice visible
      expect(
        await screen.findByRole('heading', { name: 'Đăng nhập' }),
      ).toBeVisible();
      expect(
        screen.getByText(
          'Đổi mật khẩu thành công. Phiên đăng nhập cũ đã bị thu hồi, vui lòng đăng nhập lại bằng mật khẩu mới.',
        ),
      ).toBeVisible();

      // Private cache and storage must be clean (never storing password or JWT)
      expect(getPrivateCache('learner-secret-cache')).toBeUndefined();
      expect(globalThis.localStorage.length).toBe(0);
      expect(globalThis.sessionStorage.length).toBe(0);
    });

    it('rejects empty or mismatched confirm password without trimming and omits confirmNewPassword from POST /auth/password-change', async () => {
      const initialUser = createMockUser();
      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: initialUser },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: null,
        meta: { requestId: 'pwd-confirm-ok' },
        epoch: getIdentityEpoch(),
      });

      render(
        <MemoryRouter
          initialEntries={['/profile#password-change-section-heading']}
        >
          <App />
        </MemoryRouter>,
      );

      const currentInput = await screen.findByLabelText('Mật khẩu hiện tại *');
      const newInput = screen.getByLabelText('Mật khẩu mới *');
      const confirmInput = screen.getByLabelText('Xác nhận mật khẩu mới *');

      // 1. Missing confirmation triggers inline required message and skips API
      fireEvent.change(currentInput, { target: { value: 'OldPass123' } });
      fireEvent.change(newInput, { target: { value: '  MyNewPass99  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

      expect(confirmInput).toHaveAccessibleDescription(
        'Vui lòng nhập lại mật khẩu mới để xác nhận.',
      );
      expect(postSpy).not.toHaveBeenCalled();

      // 2. Trailing space mismatch must NOT be trimmed away (regression for non-trim contract)
      fireEvent.change(confirmInput, { target: { value: '  MyNewPass99' } });
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

      expect(confirmInput).toHaveAccessibleDescription(
        'Mật khẩu xác nhận không khớp với mật khẩu mới.',
      );
      expect(postSpy).not.toHaveBeenCalled();

      // 3. Exact match submits only { currentPassword, newPassword }
      fireEvent.change(confirmInput, { target: { value: '  MyNewPass99  ' } });
      expect(confirmInput).not.toHaveAttribute('aria-invalid', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledTimes(1);
      });
      expect(postSpy).toHaveBeenCalledWith('/auth/password-change', {
        currentPassword: 'OldPass123',
        newPassword: '  MyNewPass99  ',
      });
      expect(postSpy.mock.calls[0][1]).not.toHaveProperty('confirmNewPassword');
      expect(
        await screen.findByRole('heading', { name: 'Đăng nhập' }),
      ).toBeVisible();
    });

    it('renders re-login guidance and link directly in ProfilePage when mounted standalone', async () => {
      vi.spyOn(api, 'get').mockResolvedValue({
        data: MOCK_CATALOGS,
        meta: {},
        epoch: getIdentityEpoch(),
      });
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: null,
        meta: {},
        epoch: getIdentityEpoch(),
      });

      render(
        <MemoryRouter initialEntries={['/profile']}>
          <AuthProvider skipInitialCheck>
            <ProfilePage />
          </AuthProvider>
        </MemoryRouter>,
      );

      // When unauthenticated/revoked, ProfilePage shows re-login prompt and link to /login
      expect(
        screen.getByRole('heading', { name: 'Yêu cầu đăng nhập lại' }),
      ).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Đăng nhập lại' }),
      ).toHaveAttribute('href', '/login');
    });
  });

  describe('Forgot Password flow (SC-02 /forgot-password)', () => {
    it('displays neutral response on 202 without revealing email existence, and handles rate limit (429) and service errors (503)', async () => {
      vi.spyOn(api, 'get').mockRejectedValueOnce(
        new ApiError({
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'Unauthenticated',
        }),
      );

      const postSpy = vi
        .spyOn(api, 'post')
        .mockRejectedValueOnce(
          new ApiError({
            status: 429,
            code: 'RATE_LIMITED',
            message: 'Bạn đã gửi quá nhiều yêu cầu đặt lại mật khẩu.',
            retryAfter: 60,
          }),
        )
        .mockRejectedValueOnce(
          new ApiError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message:
              'Dịch vụ gửi email tạm thời không khả dụng. Vui lòng thử lại sau.',
          }),
        )
        .mockResolvedValueOnce({
          data: {
            message:
              'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.',
          },
          meta: { requestId: 'reset-req-202' },
          epoch: getIdentityEpoch(),
        });

      render(
        <MemoryRouter initialEntries={['/forgot-password']}>
          <App />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole('heading', { name: 'Quên mật khẩu' }),
      ).toBeVisible();

      // 1. Invalid email rejected client-side
      fireEvent.change(screen.getByLabelText('Email đăng ký *'), {
        target: { value: 'not-an-email' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Gửi liên kết đặt lại mật khẩu' }),
      );
      expect(screen.getByText('Email không đúng định dạng.')).toBeVisible();
      expect(postSpy).not.toHaveBeenCalled();

      // 2. 429 RATE_LIMITED shows retryAfter hint and does not report success
      fireEvent.change(screen.getByLabelText('Email đăng ký *'), {
        target: { value: '  unknown.user@example.com  ' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Gửi liên kết đặt lại mật khẩu' }),
      );

      expect(
        await screen.findByText(
          /Bạn đã gửi quá nhiều yêu cầu đặt lại mật khẩu\. Vui lòng thử lại sau 60 giây\./u,
        ),
      ).toBeVisible();
      expect(
        screen.queryByText('Đã tiếp nhận yêu cầu'),
      ).not.toBeInTheDocument();

      // 3. 503 SERVICE_UNAVAILABLE shows service error and keeps email input
      fireEvent.click(
        screen.getByRole('button', { name: 'Gửi liên kết đặt lại mật khẩu' }),
      );
      expect(
        await screen.findByText(
          'Dịch vụ gửi email tạm thời không khả dụng. Vui lòng thử lại sau.',
        ),
      ).toBeVisible();
      expect(screen.getByLabelText('Email đăng ký *')).toHaveValue(
        'unknown.user@example.com',
      );

      // 4. 202 Accepted displays neutral message
      fireEvent.click(
        screen.getByRole('button', { name: 'Gửi liên kết đặt lại mật khẩu' }),
      );
      expect(
        await screen.findByText(
          'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.',
        ),
      ).toBeVisible();
      expect(postSpy).toHaveBeenLastCalledWith(
        '/auth/password-reset-requests',
        {
          email: 'unknown.user@example.com',
        },
      );
    });
  });

  describe('Reset Password from link flow (SC-02 /reset-password)', () => {
    it('is accessible when anonymous and handles missing token with a link to request a new reset link', async () => {
      render(
        <MemoryRouter initialEntries={['/reset-password']}>
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole('heading', { name: 'Đặt lại mật khẩu' }),
      ).toBeVisible();
      expect(screen.getByText('Liên kết không còn sử dụng được')).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Yêu cầu liên kết mới' }),
      ).toHaveAttribute('href', '/forgot-password');
    });

    it('handles invalid/expired/used token (400 RESET_TOKEN_INVALID) and offers path to /forgot-password without leaking token to logs or storage', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      const secretToken = 'raw-secret-reset-token-1234567890abcdef'; // gitleaks:allow
      const postSpy = vi.spyOn(api, 'post').mockRejectedValueOnce(
        new ApiError({
          status: 400,
          code: 'RESET_TOKEN_INVALID',
          message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
        }),
      );

      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${secretToken}`]}>
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Mật khẩu mới *'), {
        target: { value: 'NewValidPassword123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));

      expect(
        await screen.findByText(
          'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Yêu cầu liên kết mới' }),
      ).toHaveAttribute('href', '/forgot-password');
      expect(postSpy).toHaveBeenCalledWith('/auth/password-resets', {
        token: secretToken,
        newPassword: 'NewValidPassword123',
      });

      // Ensure token was never logged or cached
      const loggedOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join(' ');
      expect(loggedOutput).not.toContain(secretToken);
      expect(globalThis.localStorage.length).toBe(0);
      expect(globalThis.sessionStorage.length).toBe(0);
    });

    it('resets password with valid token (204), does NOT auto-login, and provides link to /login', async () => {
      const validToken = 'valid-one-time-token-abcdef1234567890'; // gitleaks:allow
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: null,
        meta: { requestId: 'reset-204' },
        epoch: getIdentityEpoch(),
      });

      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${validToken}`]}>
          <App skipInitialAuthCheck />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Mật khẩu mới *'), {
        target: { value: 'MyBrandNewPassword99' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));

      expect(
        await screen.findByText('Đặt lại mật khẩu thành công'),
      ).toBeVisible();
      expect(postSpy).toHaveBeenCalledWith('/auth/password-resets', {
        token: validToken,
        newPassword: 'MyBrandNewPassword99',
      });

      const loginLink = screen.getByRole('link', {
        name: 'Đến trang đăng nhập',
      });
      expect(loginLink).toHaveAttribute('href', '/login');

      // Clicking "Đến trang đăng nhập" navigates to /login (proving user was NOT auto-logged-in; if auto-logged-in, PublicOnlyRoute would redirect to /home)
      fireEvent.click(loginLink);
      expect(
        await screen.findByRole('heading', { name: 'Đăng nhập' }),
      ).toBeVisible();
    });

    it('ignores stale responses when actor identity changes while profile save is in-flight', async () => {
      const initialUser = createMockUser({ version: 1 });
      vi.spyOn(api, 'get').mockImplementation(async (path) => {
        if (path === '/auth/me') {
          return {
            data: { kind: 'user', user: initialUser },
            meta: {},
            epoch: getIdentityEpoch(),
          };
        }
        return {
          data: MOCK_CATALOGS,
          meta: {},
          epoch: getIdentityEpoch(),
        };
      });

      /** @type {(val: any) => void} */
      let resolvePatch = () => {};
      vi.spyOn(api, 'patch').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePatch = resolve;
          }),
      );

      render(
        <MemoryRouter initialEntries={['/profile#profile-section-heading']}>
          <App />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Tên hiển thị *')).toHaveValue('Hạnh Nhi');
      });

      fireEvent.change(screen.getByLabelText('Tên hiển thị *'), {
        target: { value: 'Stale Actor Update' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      // Simulate identity change while PATCH is in-flight
      act(() => {
        setIdentityKey('another-actor-id');
      });

      await act(async () => {
        resolvePatch({
          data: createMockUser({
            version: 2,
            displayName: 'Stale Actor Update',
          }),
          meta: {},
          epoch: 0,
        });
      });

      // Must NOT show success or cache stale actor's profile under new epoch
      expect(
        screen.queryByText('Đã lưu hồ sơ cá nhân thành công.'),
      ).not.toBeInTheDocument();
      expect(getPrivateCache('/me/profile')).toBeUndefined();
    });
  });

  describe('buildProfilePatchPayload unit checks', () => {
    it('omits unset optional fields and sets null only for cleared optional fields', () => {
      const baseUser = createMockUser({
        version: 5,
        displayName: 'Nhi',
        avatarKey: 'chiikawa',
        profile: {
          level: 'N4',
          goal: 'travel',
          interests: ['music'],
        },
      });

      const payload = buildProfilePatchPayload(baseUser, {
        displayName: 'Nhi',
        avatarKey: 'chiikawa',
        level: 'N4', // unchanged -> omitted
        goal: '', // was 'travel', now '' -> null
        nativeLanguageCode: '', // was unset, still '' -> omitted
        countryCode: 'VN', // was unset, now 'VN' -> 'VN'
        ageGroup: '', // was unset -> omitted
        gender: '', // was unset -> omitted
        interests: ['music'], // unchanged -> omitted
      });

      expect(payload).toEqual({
        expectedVersion: 5,
        profile: {
          goal: null,
          countryCode: 'VN',
        },
      });
    });
  });
});

describe('FE-003 independent regression cases', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearPrivateCache();
  });
  function setup() {
    const user = createMockUser();
    vi.spyOn(api, 'get').mockImplementation(async (path) => ({
      data: path === '/auth/me' ? { kind: 'user', user } : MOCK_CATALOGS,
      meta: { requestId: 'regression-review' },
      epoch: getIdentityEpoch(),
    }));
    return user;
  }
  it('locks profile inputs while a save is pending and unlocks after success', async () => {
    const user = setup();
    /** @type {(value: any) => void} */
    let finish = () => {};
    vi.spyOn(api, 'patch').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <MemoryRouter initialEntries={['/profile#profile-section-heading']}>
        <App />
      </MemoryRouter>,
    );
    const input = await screen.findByLabelText('Tên hiển thị *');
    fireEvent.change(input, { target: { value: 'Submitted name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(input).toBeDisabled();
    expect(screen.getByLabelText('Trình độ tiếng Nhật')).toBeDisabled();
    await act(async () =>
      finish({ data: { ...user, displayName: 'Submitted name', version: 2 } }),
    );
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: 'Next edit' } });
    expect(input).toHaveValue('Next edit');
  });
  it.each(['/forgot-password', '/reset-password?token=review-token'])(
    'allows authenticated recovery route %s and renders single-surface AuthLayout without nested cards',
    async (path) => {
      setup();
      const { container } = render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );
      expect(
        await screen.findByRole('heading', {
          name: path.startsWith('/forgot')
            ? 'Quên mật khẩu'
            : 'Đặt lại mật khẩu',
        }),
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: 'Trang chính' }),
      ).not.toBeInTheDocument();
      expect(
        container.querySelector('.ck-auth-screen--recovery'),
      ).not.toBeNull();
      expect(
        container.querySelector('.ck-auth-layout__panel > .ck-auth-card'),
      ).not.toBeNull();
      expect(container.querySelector('.ck-account-page')).toBeNull();
      expect(container.querySelector('.ck-card')).toBeNull();
    },
  );
});
