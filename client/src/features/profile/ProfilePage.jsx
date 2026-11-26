import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Input, PasswordInput, Select } from '../../components/ui/forms.jsx';
import { Avatar, Badge, Card } from '../../components/ui/surfaces.jsx';
import { api, createIdempotencyKey } from '../../services/api-client.js';
import { getIdentityEpoch, setPrivateCache } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import {
  DEFAULT_AVATAR_KEY,
  MAX_PROFILE_INTERESTS,
  buildProfilePatchPayload,
  createDraftFromUser,
  mergeDraftChangesOntoUser,
  validateConfirmNewPasswordInput,
  validateCurrentPasswordInput,
  validateDisplayNameInput,
  validateNewPasswordInput,
} from '../auth/account-validation.js';
import { useAuth } from '../auth/use-auth.js';

/**
 * @typedef {import('../auth/auth-context.js').SelfUser} SelfUser
 * @typedef {import('../auth/account-validation.js').ProfileDraft} ProfileDraft
 */

/**
 * @typedef {Object} CatalogItem
 * @property {string} code
 * @property {string} label
 */

/**
 * @typedef {Object} CatalogsData
 * @property {CatalogItem[]} levels
 * @property {CatalogItem[]} goals
 * @property {CatalogItem[]} interests
 * @property {CatalogItem[]} languages
 * @property {CatalogItem[]} countries
 * @property {CatalogItem[]} ageGroups
 * @property {CatalogItem[]} genders
 * @property {CatalogItem[]} avatars
 */

const PASSWORD_CHANGED_RELOGIN_NOTICE =
  'Đổi mật khẩu thành công. Phiên đăng nhập cũ đã bị thu hồi, vui lòng đăng nhập lại bằng mật khẩu mới.';

const SESSION_EXPIRED_RELOGIN_NOTICE =
  'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.';

/**
 * Resolves the active SC-04 section from location.hash.
 * @param {string} hash
 * @returns {'overview' | 'edit' | 'password'}
 */
function resolveProfileSection(hash) {
  if (hash === '#profile-section-heading') {
    return 'edit';
  }
  if (hash === '#password-change-section-heading') {
    return 'password';
  }
  return 'overview';
}

/**
 * Resolves a human-readable Vietnamese label from catalog items.
 * @param {CatalogItem[]} options
 * @param {string} code
 * @returns {string}
 */
function findCatalogLabel(options, code) {
  if (!code) {
    return '';
  }
  return options.find((item) => item.code === code)?.label ?? code;
}

/**
 * @param {Object} props
 * @param {SelfUser} props.initialUser
 * @param {string} props.role
 * @param {(patch: Partial<SelfUser>) => void} props.updateUser
 * @param {(notice: string) => void} props.onSessionRevoked
 * @param {() => Promise<void>} props.onRefreshSession
 */
function ProfileWorkspace({
  initialUser,
  role,
  updateUser,
  onSessionRevoked,
  onRefreshSession,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [baseUser, setBaseUser] = useState(
    /** @type {SelfUser} */ (initialUser),
  );
  const [draft, setDraft] = useState(() => createDraftFromUser(initialUser));

  const [catalogs, setCatalogs] = useState(
    /** @type {CatalogsData | null} */ (null),
  );
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState(
    /** @type {string | null} */ (null),
  );

  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(
    /** @type {string | null} */ (null),
  );
  const [profileError, setProfileError] = useState(
    /** @type {string | null} */ (null),
  );
  const [profileFieldErrors, setProfileFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const [conflictState, setConflictState] = useState(
    /** @type {{ message: string, currentVersion: number | null } | null} */ (
      null
    ),
  );
  const [identityConflictMessage, setIdentityConflictMessage] = useState(
    /** @type {string | null} */ (null),
  );
  const [isReloadingProfile, setIsReloadingProfile] = useState(false);
  const [isSyncingConflict, setIsSyncingConflict] = useState(false);

  // Idempotency-Key tracker for retrying the exact same profile update intent after a retryable error
  const retryIntentRef = useRef(
    /** @type {{ payloadHash: string, idempotencyKey: string | null }} */ ({
      payloadHash: '',
      idempotencyKey: null,
    }),
  );

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState(
    /** @type {string | null} */ (null),
  );
  const [passwordFieldErrors, setPasswordFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );

  useEffect(() => {
    let isActive = true;
    const startEpoch = getIdentityEpoch();
    api
      .get('/catalogs')
      .then((res) => {
        if (!isActive || startEpoch !== getIdentityEpoch()) {
          return;
        }
        const data = /** @type {CatalogsData} */ (res.data);
        setCatalogs(data);
        setCatalogsError(null);
      })
      .catch((err) => {
        if (!isActive || startEpoch !== getIdentityEpoch()) {
          return;
        }
        const message =
          err instanceof ApiError && err.code !== 'NETWORK_ERROR'
            ? err.message
            : 'Không thể tải danh mục lựa chọn. Vui lòng thử lại.';
        setCatalogsError(message);
      })
      .finally(() => {
        if (isActive && startEpoch === getIdentityEpoch()) {
          setCatalogsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleRetryCatalogs = async () => {
    const startEpoch = getIdentityEpoch();
    setCatalogsLoading(true);
    setCatalogsError(null);
    try {
      const res = await api.get('/catalogs');
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      const data = /** @type {CatalogsData} */ (res.data);
      setCatalogs(data);
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      const message =
        err instanceof ApiError && err.code !== 'NETWORK_ERROR'
          ? err.message
          : 'Không thể tải danh mục lựa chọn. Vui lòng thử lại.';
      setCatalogsError(message);
    } finally {
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setCatalogsLoading(false);
      }
    }
  };

  /**
   * Updates a draft field, marks the form dirty, clears stale validation/success messages,
   * and invalidates any cached retry Idempotency-Key when user intent changes.
   *
   * @template {keyof ProfileDraft} K
   * @param {K} field
   * @param {ProfileDraft[K]} value
   * @param {string} [errorFieldKey]
   */
  const updateDraftField = (field, value, errorFieldKey) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setProfileSuccess(null);
    setProfileError(null);
    retryIntentRef.current = { payloadHash: '', idempotencyKey: null };

    const keyToClear =
      errorFieldKey ??
      (field === 'displayName' || field === 'avatarKey'
        ? field
        : `profile.${field}`);
    setProfileFieldErrors((prev) => {
      if (!prev[keyToClear]) {
        return prev;
      }
      const next = { ...prev };
      delete next[keyToClear];
      return next;
    });
  };

  /**
   * Toggles an interest code in the draft (max 3 items per contract 07 §2.3).
   * @param {string} code
   */
  const handleToggleInterest = (code) => {
    const exists = draft.interests.includes(code);
    const next = exists
      ? draft.interests.filter((item) => item !== code)
      : [...draft.interests, code];

    setDraft((prev) => ({ ...prev, interests: next }));
    setProfileSuccess(null);
    setProfileError(null);
    retryIntentRef.current = { payloadHash: '', idempotencyKey: null };

    if (next.length > MAX_PROFILE_INTERESTS) {
      setProfileFieldErrors((prev) => ({
        ...prev,
        'profile.interests': `Chỉ được chọn tối đa ${MAX_PROFILE_INTERESTS} sở thích.`,
      }));
    } else {
      setProfileFieldErrors((prev) => {
        if (!prev['profile.interests']) {
          return prev;
        }
        const copy = { ...prev };
        delete copy['profile.interests'];
        return copy;
      });
    }
  };

  /**
   * Resets the form draft back to the current baseline SelfUser.
   */
  const handleResetDraft = () => {
    setDraft(createDraftFromUser(baseUser));
    setProfileFieldErrors({});
    setProfileError(null);
    setProfileSuccess(null);
    setConflictState(null);
    retryIntentRef.current = { payloadHash: '', idempotencyKey: null };
  };

  /**
   * Handles submitting PATCH /api/v1/me/profile.
   * @param {import('react').FormEvent<HTMLFormElement>} event
   */
  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (profileSubmitting || isSyncingConflict) {
      return;
    }

    setProfileSuccess(null);
    setProfileError(null);

    const displayCheck = validateDisplayNameInput(draft.displayName);
    if (displayCheck.error) {
      setProfileFieldErrors({ displayName: displayCheck.error });
      return;
    }

    if (draft.interests.length > MAX_PROFILE_INTERESTS) {
      setProfileFieldErrors({
        'profile.interests': `Chỉ được chọn tối đa ${MAX_PROFILE_INTERESTS} sở thích.`,
      });
      return;
    }

    setProfileFieldErrors({});
    const payload = buildProfilePatchPayload(baseUser, draft);
    const payloadHash = JSON.stringify(payload);

    let idempotencyKey = retryIntentRef.current.idempotencyKey;
    if (!idempotencyKey || retryIntentRef.current.payloadHash !== payloadHash) {
      idempotencyKey = createIdempotencyKey();
      retryIntentRef.current = { payloadHash, idempotencyKey };
    }

    const startEpoch = getIdentityEpoch();
    setProfileSubmitting(true);

    try {
      const res = await api.patch('/me/profile', payload, {
        idempotencyKey,
        headers: {
          'X-Expected-Actor': baseUser.id,
        },
      });
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      retryIntentRef.current = { payloadHash: '', idempotencyKey: null };
      const updatedSelf = /** @type {SelfUser} */ (res.data);
      setBaseUser(updatedSelf);
      setDraft(createDraftFromUser(updatedSelf));
      setConflictState(null);
      setIdentityConflictMessage(null);
      setProfileFieldErrors({});
      setProfileError(null);
      setProfileSuccess('Đã lưu hồ sơ cá nhân thành công.');

      updateUser(updatedSelf);
      setPrivateCache('/me/profile', updatedSelf, startEpoch);
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      if (err instanceof ApiError) {
        if (!err.isRetryable()) {
          retryIntentRef.current = { payloadHash: '', idempotencyKey: null };
        }

        if (err.isAuthRequired()) {
          onSessionRevoked(SESSION_EXPIRED_RELOGIN_NOTICE);
          return;
        }

        if (err.code === 'IDENTITY_CONFLICT') {
          setConflictState(null);
          setIdentityConflictMessage(
            err.message ||
              'Tài khoản đăng nhập đã thay đổi. Vui lòng tải lại hồ sơ trước khi lưu.',
          );
          return;
        }

        if (err.code === 'ACCOUNT_LOCKED') {
          updateUser({ status: 'locked' });
          setProfileError(
            err.message || 'Tài khoản của bạn hiện đang bị khóa.',
          );
          return;
        }

        if (err.isValidationError()) {
          const fieldMap = err.getFieldErrors();
          setProfileFieldErrors(fieldMap);
          setProfileError(
            err.message || 'Dữ liệu nhập chưa hợp lệ. Vui lòng kiểm tra lại.',
          );
          return;
        }

        if (err.isVersionConflict() || err.code === 'IDEMPOTENCY_CONFLICT') {
          const currentVersion =
            typeof err.details?.currentVersion === 'number'
              ? err.details.currentVersion
              : null;
          setConflictState({
            message:
              err.message ||
              'Dữ liệu đã thay đổi ở phiên làm việc khác. Vui lòng đồng bộ phiên bản mới nhất trước khi lưu.',
            currentVersion,
          });
          return;
        }

        if (err.isRateLimited()) {
          const waitHint =
            typeof err.retryAfter === 'number' && err.retryAfter > 0
              ? ` Vui lòng thử lại sau ${err.retryAfter} giây.`
              : ' Vui lòng thử lại sau ít phút.';
          setProfileError(`${err.message}${waitHint}`);
          return;
        }

        setProfileError(
          err.message || 'Chưa lưu được hồ sơ. Vui lòng thử lại.',
        );
      } else {
        setProfileError('Chưa lưu được hồ sơ. Vui lòng thử lại.');
      }
    } finally {
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setProfileSubmitting(false);
      }
    }
  };

  /**
   * Synchronizes the latest server profile version on VERSION_CONFLICT.
   * When `keepCurrentDraft` is true, user's current form input is preserved so they can review and save.
   * When `keepCurrentDraft` is false, form inputs are reset to the server's latest data.
   *
   * @param {boolean} keepCurrentDraft
   */
  const handleResolveConflict = async (keepCurrentDraft) => {
    if (isSyncingConflict) {
      return;
    }

    const startEpoch = getIdentityEpoch();
    setIsSyncingConflict(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      const res = await api.get('/auth/me');
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      const data = /** @type {{ kind?: string, user?: SelfUser }} */ (res.data);
      if (data?.kind === 'user' && data.user) {
        const latestUser = data.user;
        if (latestUser.id !== baseUser.id) {
          setConflictState(null);
          setIdentityConflictMessage(
            'Tài khoản đăng nhập đã thay đổi. Vui lòng tải lại hồ sơ trước khi lưu.',
          );
          return;
        }

        const nextDraft = keepCurrentDraft
          ? mergeDraftChangesOntoUser(baseUser, draft, latestUser)
          : createDraftFromUser(latestUser);

        setBaseUser(latestUser);
        setDraft(nextDraft);
        updateUser(latestUser);
        retryIntentRef.current = { payloadHash: '', idempotencyKey: null };
        setConflictState(null);

        if (keepCurrentDraft) {
          setProfileSuccess(
            `Đã đồng bộ phiên bản mới nhất (v${latestUser.version}). Nội dung bạn đang nhập được giữ nguyên, hãy kiểm tra và bấm "Lưu thay đổi".`,
          );
        } else {
          setProfileFieldErrors({});
          setProfileSuccess(
            `Đã tải lại dữ liệu mới nhất từ máy chủ (v${latestUser.version}).`,
          );
        }
        return;
      }

      onSessionRevoked(SESSION_EXPIRED_RELOGIN_NOTICE);
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      if (err instanceof ApiError && err.isAuthRequired()) {
        onSessionRevoked(SESSION_EXPIRED_RELOGIN_NOTICE);
        return;
      }
      setProfileError(
        err instanceof ApiError
          ? err.message
          : 'Không thể đồng bộ dữ liệu hồ sơ mới nhất. Vui lòng thử lại.',
      );
    } finally {
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setIsSyncingConflict(false);
      }
    }
  };

  /**
   * Reloads the active session/profile when the signed-in account changed in another tab.
   */
  const handleReloadProfile = async () => {
    if (isReloadingProfile) {
      return;
    }
    setIsReloadingProfile(true);
    try {
      await onRefreshSession();
    } finally {
      if (isMountedRef.current) {
        setIsReloadingProfile(false);
      }
    }
  };

  /**
   * Handles submitting POST /api/v1/auth/password-change.
   * @param {import('react').FormEvent<HTMLFormElement>} event
   */
  const handlePasswordChangeSubmit = async (event) => {
    event.preventDefault();
    if (passwordSubmitting) {
      return;
    }

    setPasswordError(null);

    const currentPasswordErr = validateCurrentPasswordInput(currentPassword);
    const newPasswordErr = validateNewPasswordInput(newPassword);
    const confirmNewPasswordErr = validateConfirmNewPasswordInput(
      newPassword,
      confirmNewPassword,
    );

    if (currentPasswordErr || newPasswordErr || confirmNewPasswordErr) {
      /** @type {Record<string, string>} */
      const nextErrors = {};
      if (currentPasswordErr) {
        nextErrors.currentPassword = currentPasswordErr;
      }
      if (newPasswordErr) {
        nextErrors.newPassword = newPasswordErr;
      }
      if (confirmNewPasswordErr) {
        nextErrors.confirmNewPassword = confirmNewPasswordErr;
      }
      setPasswordFieldErrors(nextErrors);
      return;
    }

    setPasswordFieldErrors({});
    const startEpoch = getIdentityEpoch();
    setPasswordSubmitting(true);

    try {
      await api.post('/auth/password-change', {
        currentPassword,
        newPassword,
      });

      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      onSessionRevoked(PASSWORD_CHANGED_RELOGIN_NOTICE);
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      if (err instanceof ApiError) {
        if (err.code === 'SESSION_EXPIRED' || err.code === 'AUTH_REQUIRED') {
          onSessionRevoked(SESSION_EXPIRED_RELOGIN_NOTICE);
          return;
        }

        if (err.code === 'ACCOUNT_LOCKED') {
          updateUser({ status: 'locked' });
          setPasswordError(
            err.message || 'Tài khoản của bạn hiện đang bị khóa.',
          );
          return;
        }

        if (err.code === 'INVALID_CREDENTIALS') {
          const msg = err.message || 'Mật khẩu hiện tại không chính xác.';
          setPasswordFieldErrors({ currentPassword: msg });
          setPasswordError(msg);
          return;
        }

        if (err.isValidationError()) {
          const fields = err.getFieldErrors();
          setPasswordFieldErrors(fields);
          setPasswordError(
            err.message ||
              'Dữ liệu mật khẩu chưa hợp lệ. Vui lòng kiểm tra lại.',
          );
          return;
        }

        if (err.isRateLimited()) {
          const waitHint =
            typeof err.retryAfter === 'number' && err.retryAfter > 0
              ? ` Vui lòng thử lại sau ${err.retryAfter} giây.`
              : ' Vui lòng thử lại sau ít phút.';
          setPasswordError(`${err.message}${waitHint}`);
          return;
        }

        setPasswordError(
          err.message || 'Không thể đổi mật khẩu lúc này. Vui lòng thử lại.',
        );
      } else {
        setPasswordError('Không thể đổi mật khẩu lúc này. Vui lòng thử lại.');
      }
    } finally {
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setPasswordSubmitting(false);
      }
    }
  };

  const avatarOptions = catalogs?.avatars?.length
    ? catalogs.avatars
    : [
        {
          code: baseUser.avatarKey || DEFAULT_AVATAR_KEY,
          label: baseUser.avatarKey || DEFAULT_AVATAR_KEY,
        },
      ];

  const levelOptions = catalogs?.levels ?? [];
  const goalOptions = catalogs?.goals ?? [];
  const languageOptions = catalogs?.languages ?? [];
  const countryOptions = catalogs?.countries ?? [];
  const ageGroupOptions = catalogs?.ageGroups ?? [];
  const genderOptions = catalogs?.genders ?? [];
  const interestOptions = catalogs?.interests ?? [];

  const displayNameError = profileFieldErrors.displayName;
  const avatarKeyError = profileFieldErrors.avatarKey;
  const levelError = profileFieldErrors['profile.level'];
  const goalError = profileFieldErrors['profile.goal'];
  const nativeLangError = profileFieldErrors['profile.nativeLanguageCode'];
  const countryError = profileFieldErrors['profile.countryCode'];
  const ageGroupError = profileFieldErrors['profile.ageGroup'];
  const genderError = profileFieldErrors['profile.gender'];
  const interestsError = profileFieldErrors['profile.interests'];

  const isAdmin = baseUser.role === 'admin' || role === 'admin';
  const avatarDisplayName =
    draft.displayName.trim() || baseUser.displayName || 'U';
  const basePathname = location.pathname || '/profile';
  const activeSection = resolveProfileSection(location.hash);

  const savedProfile = baseUser.profile ?? {};
  const savedDisplayName = baseUser.displayName?.trim() || 'Người học';
  const savedLevelLabel =
    typeof savedProfile.level === 'string' && savedProfile.level
      ? findCatalogLabel(levelOptions, savedProfile.level)
      : '';
  const savedAvatarLabel = findCatalogLabel(
    avatarOptions,
    baseUser.avatarKey || DEFAULT_AVATAR_KEY,
  );
  const savedGoalLabel =
    typeof savedProfile.goal === 'string' && savedProfile.goal
      ? findCatalogLabel(goalOptions, savedProfile.goal)
      : '';
  const savedPersonalDetails = [
    typeof savedProfile.nativeLanguageCode === 'string' &&
    savedProfile.nativeLanguageCode
      ? findCatalogLabel(languageOptions, savedProfile.nativeLanguageCode)
      : '',
    typeof savedProfile.countryCode === 'string' && savedProfile.countryCode
      ? findCatalogLabel(countryOptions, savedProfile.countryCode)
      : '',
    typeof savedProfile.ageGroup === 'string' && savedProfile.ageGroup
      ? findCatalogLabel(ageGroupOptions, savedProfile.ageGroup)
      : '',
    typeof savedProfile.gender === 'string' && savedProfile.gender
      ? findCatalogLabel(genderOptions, savedProfile.gender)
      : '',
  ].filter(Boolean);
  const savedInterestLabels = Array.isArray(savedProfile.interests)
    ? savedProfile.interests
        .filter((code) => typeof code === 'string' && code.length > 0)
        .map((code) => findCatalogLabel(interestOptions, code))
    : [];

  const handleStartEdit = () => {
    setProfileSuccess(null);
    navigate({ pathname: basePathname, hash: '#profile-section-heading' });
  };

  const handleCancelEdit = () => {
    handleResetDraft();
    navigate({ pathname: basePathname, hash: '' });
  };

  const catalogsAlert = catalogsError ? (
    <div className="ck-alert ck-alert--warning" role="alert">
      <div className="ck-alert__body">
        <strong>Chưa tải được danh mục lựa chọn</strong>
        <p className="mt-1">{catalogsError}</p>
      </div>
      <Button
        variant="secondary"
        size="compact"
        onClick={handleRetryCatalogs}
        disabled={catalogsLoading}
      >
        {catalogsLoading ? 'Đang tải...' : 'Thử tải lại danh mục'}
      </Button>
    </div>
  ) : null;

  return (
    <section data-screen-id="SC-04" className="ck-account-page ck-profile-page">
      <h1 className="sr-only">Hồ sơ cá nhân</h1>

      <div className="ck-account-layout">
        <aside className="ck-account-sidebar" aria-label="Cài đặt tài khoản">
          <div className="ck-account-sidebar__head">
            <p className="ck-account-eyebrow" lang="ja">
              アカウント
            </p>
            <h2 className="ck-account-sidebar__title">Tài khoản</h2>
          </div>

          <nav
            className="ck-account-sidebar__nav"
            aria-label="Điều hướng tài khoản"
          >
            <Link
              to={{ pathname: basePathname, hash: '' }}
              aria-current={activeSection === 'overview' ? 'page' : undefined}
              className={`ck-account-sidebar__item ${activeSection === 'overview' ? 'ck-account-sidebar__item--active' : ''}`}
            >
              <strong>Hồ sơ của tôi</strong>
              <small>Thông tin công khai</small>
            </Link>
            <Link
              to={{ pathname: basePathname, hash: '#profile-section-heading' }}
              aria-current={activeSection === 'edit' ? 'page' : undefined}
              className={`ck-account-sidebar__item ${activeSection === 'edit' ? 'ck-account-sidebar__item--active' : ''}`}
            >
              <strong>Chỉnh sửa hồ sơ</strong>
              <small>Tên, trình độ, chủ đề</small>
            </Link>
            <Link
              to={{
                pathname: basePathname,
                hash: '#password-change-section-heading',
              }}
              aria-current={activeSection === 'password' ? 'page' : undefined}
              className={`ck-account-sidebar__item ${activeSection === 'password' ? 'ck-account-sidebar__item--active' : ''}`}
            >
              <strong>Đổi mật khẩu</strong>
              <small>Bảo mật tài khoản</small>
            </Link>
            {isAdmin ? (
              <Link to="/admin" className="ck-account-sidebar__item">
                <strong>Khu vực quản trị</strong>
                <small>Quay lại trang quản trị</small>
              </Link>
            ) : (
              <Link to="/blocks" className="ck-account-sidebar__item">
                <strong>Danh sách đã chặn</strong>
                <small>Quản lý người đã chặn</small>
              </Link>
            )}
          </nav>
        </aside>

        <div className="ck-account-main">
          {activeSection === 'overview' ? (
            <>
              <header className="ck-account-section-header">
                <p className="ck-account-eyebrow" lang="ja">
                  プロフィール
                </p>
                <h2 className="ck-account-section-title">Hồ sơ của tôi</h2>
                <p className="ck-account-section-subtitle">
                  Thông tin này giúp bạn luyện hiểu thêm về bạn trước khi bắt
                  đầu hội thoại.
                </p>
              </header>

              {catalogsAlert}

              {profileSuccess ? (
                <div
                  className="ck-alert ck-alert--success"
                  role="status"
                  aria-live="polite"
                >
                  <p>{profileSuccess}</p>
                </div>
              ) : null}

              <Card className="ck-profile-card ck-profile-card--overview">
                <div className="ck-profile-overview__top">
                  <div className="ck-profile-overview__identity">
                    <Avatar
                      name={savedDisplayName}
                      size={64}
                      className="ck-profile-overview__avatar"
                    />
                    <div className="ck-profile-overview__meta">
                      <div className="ck-profile-overview__name-row">
                        <strong className="ck-profile-overview__name">
                          {savedDisplayName}
                        </strong>
                        {savedLevelLabel ? (
                          <Badge tone="accent">{savedLevelLabel}</Badge>
                        ) : null}
                        {isAdmin ? <Badge tone="accent">Quản trị</Badge> : null}
                      </div>
                      <span className="ck-profile-overview__email">
                        {baseUser.email}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    size="compact"
                    className="ck-profile-action-btn ck-profile-overview__edit-btn"
                    onClick={handleStartEdit}
                  >
                    Chỉnh sửa hồ sơ
                  </Button>
                </div>

                <dl className="ck-profile-overview__dl">
                  <div className="ck-profile-overview__row">
                    <dt>Ảnh đại diện</dt>
                    <dd>{savedAvatarLabel}</dd>
                  </div>
                  <div className="ck-profile-overview__row">
                    <dt>Mục tiêu học</dt>
                    <dd>
                      {savedGoalLabel || (
                        <span className="text-muted">Chưa cập nhật</span>
                      )}
                    </dd>
                  </div>
                  <div className="ck-profile-overview__row">
                    <dt>Thông tin cá nhân</dt>
                    <dd>
                      {savedPersonalDetails.length > 0 ? (
                        savedPersonalDetails.join(' · ')
                      ) : (
                        <span className="text-muted">Chưa cập nhật</span>
                      )}
                    </dd>
                  </div>
                  <div className="ck-profile-overview__row">
                    <dt>Chủ đề yêu thích</dt>
                    <dd>
                      {savedInterestLabels.length > 0 ? (
                        <div className="ck-profile-topic-list">
                          {savedInterestLabels.map((label) => (
                            <span key={label} className="ck-profile-topic-tag">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">
                          Chưa chọn chủ đề yêu thích
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>
            </>
          ) : null}

          {activeSection === 'edit' ? (
            <>
              <header className="ck-account-section-header">
                <p className="ck-account-eyebrow" lang="ja">
                  プロフィール編集
                </p>
                <h2
                  id="profile-section-heading"
                  className="ck-account-section-title"
                >
                  Chỉnh sửa hồ sơ
                </h2>
                <p className="ck-account-section-subtitle">
                  Cập nhật thông tin để tìm được những người luyện có cùng sở
                  thích.
                </p>
              </header>

              {catalogsAlert}

              {profileSuccess ? (
                <div
                  className="ck-alert ck-alert--success"
                  role="status"
                  aria-live="polite"
                >
                  <p>{profileSuccess}</p>
                </div>
              ) : null}

              {profileError ? (
                <div className="ck-alert ck-alert--error" role="alert">
                  <p>{profileError}</p>
                </div>
              ) : null}

              {identityConflictMessage ? (
                <div className="ck-alert ck-alert--error" role="alert">
                  <div>
                    <strong className="block">
                      Tài khoản đăng nhập đã thay đổi
                    </strong>
                    <p className="mt-1">{identityConflictMessage}</p>
                    <div className="ck-actions mt-3">
                      <Button
                        type="button"
                        variant="primary"
                        size="compact"
                        onClick={handleReloadProfile}
                        loading={isReloadingProfile}
                      >
                        {isReloadingProfile
                          ? 'Đang tải lại...'
                          : 'Tải lại hồ sơ'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {conflictState ? (
                <div className="ck-alert ck-alert--warning" role="alert">
                  <div>
                    <strong className="block">
                      Xung đột phiên bản dữ liệu
                    </strong>
                    <p className="mt-1">{conflictState.message}</p>
                    {conflictState.currentVersion !== null ? (
                      <p className="mt-1 text-sm">
                        Dữ liệu trên máy chủ hiện mới hơn bản biểu mẫu bạn đang
                        mở. Nội dung bạn vừa nhập vẫn được giữ nguyên.
                      </p>
                    ) : null}
                    <div className="ck-actions mt-3">
                      <Button
                        variant="primary"
                        size="compact"
                        onClick={() => handleResolveConflict(true)}
                        loading={isSyncingConflict}
                      >
                        {isSyncingConflict
                          ? 'Đang đồng bộ...'
                          : 'Đồng bộ phiên bản mới và giữ nội dung đang nhập'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => handleResolveConflict(false)}
                        disabled={isSyncingConflict}
                      >
                        Hoàn tác theo dữ liệu máy chủ
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <Card className="ck-profile-card">
                <form
                  className="ck-form"
                  onSubmit={handleProfileSubmit}
                  noValidate
                >
                  <fieldset
                    className="ck-form border-0 p-0 m-0 min-w-0"
                    disabled={
                      profileSubmitting ||
                      isSyncingConflict ||
                      Boolean(identityConflictMessage)
                    }
                  >
                    {/* Avatar preset */}
                    <div className="ck-profile-avatar-row">
                      <Avatar
                        name={avatarDisplayName}
                        size={64}
                        className="ck-profile-overview__avatar"
                      />
                      <fieldset className="ck-fieldset flex-1 min-w-0">
                        <legend className="ck-legend">
                          Ảnh đại diện (Avatar preset)
                        </legend>
                        <div
                          className="ck-choice-grid"
                          role="radiogroup"
                          aria-label="Chọn ảnh đại diện"
                        >
                          {avatarOptions.map((item) => {
                            const isSelected = draft.avatarKey === item.code;
                            return (
                              <label
                                key={item.code}
                                className={`ck-choice-chip ${isSelected ? 'ck-choice-chip--selected' : ''}`}
                              >
                                <input
                                  type="radio"
                                  name="avatarKey"
                                  value={item.code}
                                  checked={isSelected}
                                  onChange={() =>
                                    updateDraftField(
                                      'avatarKey',
                                      item.code,
                                      'avatarKey',
                                    )
                                  }
                                />
                                <span>{item.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        {avatarKeyError ? (
                          <p
                            className="ck-field__message ck-field__message--error"
                            role="alert"
                          >
                            {avatarKeyError}
                          </p>
                        ) : null}
                      </fieldset>
                    </div>

                    {/* Display Name + Read-only Email */}
                    <div className="ck-form-row">
                      <Input
                        id="profile-display-name"
                        name="displayName"
                        type="text"
                        label="Tên hiển thị"
                        required
                        value={draft.displayName}
                        onChange={(e) =>
                          updateDraftField(
                            'displayName',
                            e.target.value,
                            'displayName',
                          )
                        }
                        helperText="Từ 1 đến 100 ký tự (khoảng trắng đầu/cuối sẽ tự động được cắt gọn)."
                        error={displayNameError}
                      />

                      <Input
                        id="profile-email"
                        name="email"
                        type="email"
                        label="Email"
                        value={baseUser.email}
                        readOnly
                        disabled
                        helperText="Email không thể thay đổi tại đây."
                      />
                    </div>

                    {/* Optional select fields */}
                    <div className="ck-form-row">
                      <Select
                        label="Trình độ tiếng Nhật"
                        id="profile-level"
                        error={levelError}
                        name="level"
                        value={draft.level}
                        onChange={(e) =>
                          updateDraftField(
                            'level',
                            e.target.value,
                            'profile.level',
                          )
                        }
                        disabled={catalogsLoading && levelOptions.length === 0}
                      >
                        <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                        {draft.level &&
                        !levelOptions.some(
                          (opt) => opt.code === draft.level,
                        ) ? (
                          <option value={draft.level}>{draft.level}</option>
                        ) : null}
                        {levelOptions.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Mục tiêu học"
                        id="profile-goal"
                        error={goalError}
                        name="goal"
                        value={draft.goal}
                        onChange={(e) =>
                          updateDraftField(
                            'goal',
                            e.target.value,
                            'profile.goal',
                          )
                        }
                        disabled={catalogsLoading && goalOptions.length === 0}
                      >
                        <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                        {draft.goal &&
                        !goalOptions.some((opt) => opt.code === draft.goal) ? (
                          <option value={draft.goal}>{draft.goal}</option>
                        ) : null}
                        {goalOptions.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="ck-form-row">
                      <Select
                        label="Tiếng mẹ đẻ"
                        id="profile-native-language"
                        error={nativeLangError}
                        name="nativeLanguageCode"
                        value={draft.nativeLanguageCode}
                        onChange={(e) =>
                          updateDraftField(
                            'nativeLanguageCode',
                            e.target.value,
                            'profile.nativeLanguageCode',
                          )
                        }
                        disabled={
                          catalogsLoading && languageOptions.length === 0
                        }
                      >
                        <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                        {draft.nativeLanguageCode &&
                        !languageOptions.some(
                          (opt) => opt.code === draft.nativeLanguageCode,
                        ) ? (
                          <option value={draft.nativeLanguageCode}>
                            {draft.nativeLanguageCode}
                          </option>
                        ) : null}
                        {languageOptions.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Quốc gia đang sinh sống"
                        id="profile-country"
                        error={countryError}
                        name="countryCode"
                        value={draft.countryCode}
                        onChange={(e) =>
                          updateDraftField(
                            'countryCode',
                            e.target.value,
                            'profile.countryCode',
                          )
                        }
                        disabled={
                          catalogsLoading && countryOptions.length === 0
                        }
                      >
                        <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                        {draft.countryCode &&
                        !countryOptions.some(
                          (opt) => opt.code === draft.countryCode,
                        ) ? (
                          <option value={draft.countryCode}>
                            {draft.countryCode}
                          </option>
                        ) : null}
                        {countryOptions.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="ck-form-row">
                      <Select
                        label="Nhóm tuổi"
                        id="profile-age-group"
                        error={ageGroupError}
                        name="ageGroup"
                        value={draft.ageGroup}
                        onChange={(e) =>
                          updateDraftField(
                            'ageGroup',
                            e.target.value,
                            'profile.ageGroup',
                          )
                        }
                        disabled={
                          catalogsLoading && ageGroupOptions.length === 0
                        }
                      >
                        <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                        {draft.ageGroup &&
                        !ageGroupOptions.some(
                          (opt) => opt.code === draft.ageGroup,
                        ) ? (
                          <option value={draft.ageGroup}>
                            {draft.ageGroup}
                          </option>
                        ) : null}
                        {ageGroupOptions.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Giới tính"
                        id="profile-gender"
                        error={genderError}
                        name="gender"
                        value={draft.gender}
                        onChange={(e) =>
                          updateDraftField(
                            'gender',
                            e.target.value,
                            'profile.gender',
                          )
                        }
                        disabled={catalogsLoading && genderOptions.length === 0}
                      >
                        <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                        {draft.gender &&
                        !genderOptions.some(
                          (opt) => opt.code === draft.gender,
                        ) ? (
                          <option value={draft.gender}>{draft.gender}</option>
                        ) : null}
                        {genderOptions.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {/* Interests (max 3) */}
                    <fieldset className="ck-fieldset">
                      <legend className="ck-legend">
                        Chủ đề yêu thích ({draft.interests.length}/
                        {MAX_PROFILE_INTERESTS})
                      </legend>
                      <small className="text-muted">
                        Chọn tối đa {MAX_PROFILE_INTERESTS} chủ đề bạn muốn trò
                        chuyện khi ghép đôi.
                      </small>
                      <div
                        className="ck-choice-grid mt-2"
                        role="group"
                        aria-label="Chọn sở thích"
                      >
                        {interestOptions.map((item) => {
                          const isChecked = draft.interests.includes(item.code);
                          const isMaxReached =
                            !isChecked &&
                            draft.interests.length >= MAX_PROFILE_INTERESTS;
                          return (
                            <label
                              key={item.code}
                              className={`ck-choice-pill ${isChecked ? 'ck-choice-pill--active' : ''} ${isMaxReached ? 'ck-choice-chip--disabled' : ''}`}
                            >
                              <input
                                type="checkbox"
                                name="interests"
                                value={item.code}
                                checked={isChecked}
                                onChange={() => handleToggleInterest(item.code)}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      {interestsError ? (
                        <p
                          className="ck-field__message ck-field__message--error"
                          role="alert"
                        >
                          {interestsError}
                        </p>
                      ) : null}
                    </fieldset>

                    <div className="ck-profile-form-footer">
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        className="ck-profile-action-btn"
                        onClick={handleCancelEdit}
                        disabled={profileSubmitting || isSyncingConflict}
                      >
                        Hủy
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="compact"
                        className="ck-profile-action-btn"
                        loading={profileSubmitting}
                        disabled={isSyncingConflict}
                      >
                        {profileSubmitting
                          ? 'Đang lưu hồ sơ...'
                          : 'Lưu thay đổi'}
                      </Button>
                    </div>
                  </fieldset>
                </form>
              </Card>
            </>
          ) : null}

          {activeSection === 'password' ? (
            <>
              <header className="ck-account-section-header">
                <p className="ck-account-eyebrow" lang="ja">
                  セキュリティ
                </p>
                <h2
                  id="password-change-section-heading"
                  className="ck-account-section-title"
                >
                  Đổi mật khẩu
                </h2>
                <p className="ck-account-section-subtitle">
                  Sử dụng mật khẩu mạnh và không dùng lại mật khẩu ở dịch vụ
                  khác. Sau khi đổi, mọi phiên hiện tại sẽ được đăng xuất.
                </p>
              </header>

              {passwordError ? (
                <div className="ck-alert ck-alert--error" role="alert">
                  <p>{passwordError}</p>
                </div>
              ) : null}

              <Card className="ck-profile-card ck-profile-card--password">
                <form
                  className="ck-form"
                  onSubmit={handlePasswordChangeSubmit}
                  noValidate
                >
                  <PasswordInput
                    id="profile-current-password"
                    name="currentPassword"
                    autoComplete="current-password"
                    label="Mật khẩu hiện tại"
                    required
                    showLabel="Hiện mật khẩu hiện tại"
                    hideLabel="Ẩn mật khẩu hiện tại"
                    value={currentPassword}
                    disabled={passwordSubmitting}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      setPasswordError(null);
                      setPasswordFieldErrors((prev) => {
                        if (!prev.currentPassword) return prev;
                        const next = { ...prev };
                        delete next.currentPassword;
                        return next;
                      });
                    }}
                    error={passwordFieldErrors.currentPassword}
                  />

                  <PasswordInput
                    id="profile-new-password"
                    name="newPassword"
                    autoComplete="new-password"
                    label="Mật khẩu mới"
                    required
                    showLabel="Hiện mật khẩu mới"
                    hideLabel="Ẩn mật khẩu mới"
                    value={newPassword}
                    disabled={passwordSubmitting}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPasswordError(null);
                      setPasswordFieldErrors((prev) => {
                        if (!prev.newPassword && !prev.confirmNewPassword) {
                          return prev;
                        }
                        const next = { ...prev };
                        delete next.newPassword;
                        delete next.confirmNewPassword;
                        return next;
                      });
                    }}
                    helperText="Từ 8 đến 128 ký tự (giữ nguyên khoảng trắng, không tự cắt)."
                    error={passwordFieldErrors.newPassword}
                  />

                  <PasswordInput
                    id="profile-confirm-new-password"
                    name="confirmNewPassword"
                    autoComplete="new-password"
                    label="Xác nhận mật khẩu mới"
                    required
                    showLabel="Hiện xác nhận mật khẩu mới"
                    hideLabel="Ẩn xác nhận mật khẩu mới"
                    value={confirmNewPassword}
                    disabled={passwordSubmitting}
                    onChange={(e) => {
                      setConfirmNewPassword(e.target.value);
                      setPasswordError(null);
                      setPasswordFieldErrors((prev) => {
                        if (!prev.confirmNewPassword) return prev;
                        const next = { ...prev };
                        delete next.confirmNewPassword;
                        return next;
                      });
                    }}
                    error={passwordFieldErrors.confirmNewPassword}
                  />

                  <div className="ck-profile-password-footer">
                    <Link to="/forgot-password" className="ck-text-button">
                      Quên mật khẩu hiện tại?
                    </Link>
                    <Button
                      type="submit"
                      variant="primary"
                      size="compact"
                      className="ck-profile-action-btn"
                      loading={passwordSubmitting}
                    >
                      {passwordSubmitting
                        ? 'Đang cập nhật mật khẩu...'
                        : 'Đổi mật khẩu'}
                    </Button>
                  </div>
                </form>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ProfilePage() {
  const {
    user,
    kind,
    role,
    status,
    updateUser,
    invalidateSession,
    refreshSession,
  } = useAuth();
  const [revokedSessionNotice, setRevokedSessionNotice] = useState(
    /** @type {string | null} */ (null),
  );

  /**
   * Transitions the screen into the revoked/expired credential state and clears AuthContext.
   * @param {string} notice
   */
  const handleSessionRevoked = useCallback(
    (/** @type {string} */ notice) => {
      setRevokedSessionNotice(notice);
      if (typeof invalidateSession === 'function') {
        invalidateSession(notice);
      }
    },
    [invalidateSession],
  );

  // If password was changed or session was revoked while on ProfilePage
  if (revokedSessionNotice) {
    return (
      <section data-screen-id="SC-04" className="ck-account-page">
        <header className="ck-account-header">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Hồ sơ cá nhân</h1>
            <p className="mt-1 text-muted">
              Quản lý thông tin tài khoản và bảo mật.
            </p>
          </div>
        </header>

        <div className="ck-card" role="status" aria-live="polite">
          <div className="ck-alert ck-alert--success">
            <strong className="block">Phiên đăng nhập đã được thu hồi</strong>
            <p className="mt-1">{revokedSessionNotice}</p>
          </div>
          <div className="ck-actions mt-4">
            <Link to="/login" className="ck-button ck-button--primary">
              Đăng nhập lại
            </Link>
            <Link to="/" className="ck-button ck-button--secondary">
              Về trang chủ
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Account locked state
  if (status === 'locked' || user?.status === 'locked') {
    return (
      <section data-screen-id="SC-04" className="ck-account-page">
        <header className="ck-account-header">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Hồ sơ cá nhân</h1>
            <p className="mt-1 text-muted">
              Trạng thái tài khoản cần được kiểm tra.
            </p>
          </div>
        </header>

        <div className="ck-card" role="alert">
          <div className="ck-alert ck-alert--error">
            <strong className="block">
              Tài khoản đang bị khóa (ACCOUNT_LOCKED)
            </strong>
            <p className="mt-1">
              Tài khoản của bạn hiện đang bị tạm khóa nên không thể chỉnh sửa hồ
              sơ hoặc đổi mật khẩu.
            </p>
          </div>
          <div className="ck-actions mt-4">
            <Link to="/" className="ck-button ck-button--secondary">
              Về trang chủ
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Fallback when user session is revoked or unauthenticated
  if (kind !== 'user' || !user) {
    return (
      <section data-screen-id="SC-04" className="ck-account-page">
        <header className="ck-account-header">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Hồ sơ cá nhân</h1>
            <p className="mt-1 text-muted">
              Quản lý thông tin tài khoản và bảo mật.
            </p>
          </div>
        </header>

        <div className="ck-card" role="status" aria-live="polite">
          <h2 className="text-lg font-semibold text-ink">
            Yêu cầu đăng nhập lại
          </h2>
          <p className="mt-2 text-muted">
            Phiên đăng nhập hiện tại không còn hiệu lực. Vui lòng đăng nhập lại
            để tiếp tục quản lý hồ sơ cá nhân.
          </p>
          <div className="ck-actions mt-4">
            <Link to="/login" className="ck-button ck-button--primary">
              Đăng nhập lại
            </Link>
            <Link to="/" className="ck-button ck-button--secondary">
              Về trang chủ
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <ProfileWorkspace
      key={user.id}
      initialUser={user}
      role={role}
      updateUser={updateUser}
      onSessionRevoked={handleSessionRevoked}
      onRefreshSession={refreshSession}
    />
  );
}
