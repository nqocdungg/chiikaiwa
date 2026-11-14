import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { api, createIdempotencyKey } from '../../services/api-client.js';
import { getIdentityEpoch, setPrivateCache } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import {
  DEFAULT_AVATAR_KEY,
  MAX_PROFILE_INTERESTS,
  buildProfilePatchPayload,
  createDraftFromUser,
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
 * @param {Object} props
 * @param {SelfUser} props.initialUser
 * @param {string} props.role
 * @param {(patch: Partial<SelfUser>) => void} props.updateUser
 * @param {(notice: string) => void} props.onSessionRevoked
 */
function ProfileWorkspace({ initialUser, role, updateUser, onSessionRevoked }) {
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
  const [isDirty, setIsDirty] = useState(false);

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
    setIsDirty(true);
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
    setIsDirty(true);
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
    setIsDirty(false);
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
      const res = await api.patch('/me/profile', payload, { idempotencyKey });
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      retryIntentRef.current = { payloadHash: '', idempotencyKey: null };
      const updatedSelf = /** @type {SelfUser} */ (res.data);
      setBaseUser(updatedSelf);
      setDraft(createDraftFromUser(updatedSelf));
      setIsDirty(false);
      setConflictState(null);
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
        setBaseUser(latestUser);
        updateUser(latestUser);
        retryIntentRef.current = { payloadHash: '', idempotencyKey: null };
        setConflictState(null);

        if (keepCurrentDraft) {
          setIsDirty(true);
          setProfileSuccess(
            `Đã đồng bộ phiên bản mới nhất (v${latestUser.version}). Nội dung bạn đang nhập được giữ nguyên, hãy kiểm tra và bấm "Lưu hồ sơ".`,
          );
        } else {
          setDraft(createDraftFromUser(latestUser));
          setIsDirty(false);
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

    if (currentPasswordErr || newPasswordErr) {
      /** @type {Record<string, string>} */
      const nextErrors = {};
      if (currentPasswordErr) {
        nextErrors.currentPassword = currentPasswordErr;
      }
      if (newPasswordErr) {
        nextErrors.newPassword = newPasswordErr;
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
  const avatarInitial = (
    draft.displayName.trim()[0] ||
    baseUser.displayName?.[0] ||
    'U'
  ).toUpperCase();

  return (
    <section data-screen-id="SC-04" className="ck-account-page">
      <div className="ck-account-topbar">
        <Link
          className="ck-brand"
          to={isAdmin ? '/admin' : '/home'}
          aria-label="Chiikaiwa, trang chính"
        >
          <span lang="ja">ち</span>chiikaiwa
        </Link>
        <nav aria-label="Điều hướng tài khoản">
          {!isAdmin ? (
            <Link to="/blocks" className="ck-text-button">
              Danh sách chặn
            </Link>
          ) : null}
          <Link
            to={isAdmin ? '/admin' : '/home'}
            className="ck-button ck-button--secondary"
          >
            {isAdmin ? 'Khu vực quản trị' : 'Về trang chính'}
          </Link>
        </nav>
      </div>

      <header className="ck-account-header">
        <div className="ck-account-identity">
          <span className="ck-avatar" aria-hidden="true">
            {avatarInitial}
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-ink">Hồ sơ cá nhân</h1>
            <p className="mt-1 text-muted">
              Cập nhật thông tin hiển thị, mục tiêu học tập và bảo mật tài
              khoản.
            </p>
          </div>
        </div>
        <div className="ck-account-meta">
          <span className="ck-badge">{baseUser.email}</span>
          <span className="ck-badge">
            Vai trò: {isAdmin ? 'Quản trị' : 'Học viên'}
          </span>
          <span className="ck-badge">Phiên bản hồ sơ: v{baseUser.version}</span>
        </div>
      </header>

      {catalogsError ? (
        <div className="ck-alert ck-alert--warning" role="alert">
          <div className="ck-alert__body">
            <strong>Chưa tải được danh mục lựa chọn</strong>
            <p className="mt-1">{catalogsError}</p>
          </div>
          <Button
            variant="secondary"
            onClick={handleRetryCatalogs}
            disabled={catalogsLoading}
          >
            {catalogsLoading ? 'Đang tải...' : 'Thử tải lại danh mục'}
          </Button>
        </div>
      ) : null}

      <div className="ck-account-grid">
        {/* Card 1: Profile Form */}
        <article className="ck-card" aria-labelledby="profile-section-heading">
          <div className="ck-card__header">
            <h2
              id="profile-section-heading"
              className="text-lg font-semibold text-ink"
            >
              Thông tin &amp; mục tiêu học tập
            </h2>
            <p className="mt-1 text-sm text-muted">
              Các trường tùy chọn có thể để trống hoặc chọn &ldquo;Chưa chọn /
              Xóa lựa chọn&rdquo; để gỡ thông tin đã lưu.
            </p>
          </div>

          {profileSuccess ? (
            <div
              className="ck-alert ck-alert--success mb-4"
              role="status"
              aria-live="polite"
            >
              <p>{profileSuccess}</p>
            </div>
          ) : null}

          {profileError ? (
            <div className="ck-alert ck-alert--error mb-4" role="alert">
              <p>{profileError}</p>
            </div>
          ) : null}

          {conflictState ? (
            <div className="ck-alert ck-alert--warning mb-4" role="alert">
              <div>
                <strong className="block">Xung đột phiên bản dữ liệu</strong>
                <p className="mt-1">{conflictState.message}</p>
                {conflictState.currentVersion !== null ? (
                  <p className="mt-1 text-sm">
                    Phiên bản trên máy chủ hiện tại: v
                    {conflictState.currentVersion} (phiên bản biểu mẫu đang giữ:
                    v{baseUser.version}). Nội dung bạn vừa nhập vẫn được giữ
                    nguyên.
                  </p>
                ) : null}
                <div className="ck-actions mt-3">
                  <Button
                    variant="primary"
                    onClick={() => handleResolveConflict(true)}
                    disabled={isSyncingConflict}
                  >
                    {isSyncingConflict
                      ? 'Đang đồng bộ...'
                      : 'Đồng bộ phiên bản mới và giữ nội dung đang nhập'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleResolveConflict(false)}
                    disabled={isSyncingConflict}
                  >
                    Hoàn tác theo dữ liệu máy chủ
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <form className="ck-form" onSubmit={handleProfileSubmit} noValidate>
            <fieldset
              className="ck-form border-0 p-0 m-0 min-w-0"
              disabled={profileSubmitting || isSyncingConflict}
            >
              {/* Display Name */}
              <div className="ck-field">
                <label htmlFor="profile-display-name">Tên hiển thị *</label>
                <input
                  id="profile-display-name"
                  name="displayName"
                  type="text"
                  required
                  maxLength={120}
                  value={draft.displayName}
                  onChange={(e) =>
                    updateDraftField(
                      'displayName',
                      e.target.value,
                      'displayName',
                    )
                  }
                  aria-invalid={Boolean(displayNameError)}
                  aria-describedby={
                    displayNameError
                      ? 'profile-display-name-error'
                      : 'profile-display-name-hint'
                  }
                />
                <small id="profile-display-name-hint">
                  Từ 1 đến 100 ký tự (khoảng trắng đầu/cuối sẽ tự động được cắt
                  gọn).
                </small>
                {displayNameError ? (
                  <span
                    id="profile-display-name-error"
                    className="ck-field-error"
                    role="alert"
                  >
                    {displayNameError}
                  </span>
                ) : null}
              </div>

              {/* Avatar preset */}
              <fieldset className="ck-fieldset">
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
                  <span className="ck-field-error" role="alert">
                    {avatarKeyError}
                  </span>
                ) : null}
              </fieldset>

              {/* Optional select fields */}
              <div className="ck-form-row">
                <div className="ck-field">
                  <label htmlFor="profile-level">Trình độ tiếng Nhật</label>
                  <select
                    id="profile-level"
                    name="level"
                    value={draft.level}
                    onChange={(e) =>
                      updateDraftField('level', e.target.value, 'profile.level')
                    }
                    disabled={catalogsLoading && levelOptions.length === 0}
                    aria-invalid={Boolean(levelError)}
                  >
                    <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                    {draft.level &&
                    !levelOptions.some((opt) => opt.code === draft.level) ? (
                      <option value={draft.level}>{draft.level}</option>
                    ) : null}
                    {levelOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {levelError ? (
                    <span className="ck-field-error" role="alert">
                      {levelError}
                    </span>
                  ) : null}
                </div>

                <div className="ck-field">
                  <label htmlFor="profile-goal">Mục tiêu học</label>
                  <select
                    id="profile-goal"
                    name="goal"
                    value={draft.goal}
                    onChange={(e) =>
                      updateDraftField('goal', e.target.value, 'profile.goal')
                    }
                    disabled={catalogsLoading && goalOptions.length === 0}
                    aria-invalid={Boolean(goalError)}
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
                  </select>
                  {goalError ? (
                    <span className="ck-field-error" role="alert">
                      {goalError}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="ck-form-row">
                <div className="ck-field">
                  <label htmlFor="profile-native-language">Tiếng mẹ đẻ</label>
                  <select
                    id="profile-native-language"
                    name="nativeLanguageCode"
                    value={draft.nativeLanguageCode}
                    onChange={(e) =>
                      updateDraftField(
                        'nativeLanguageCode',
                        e.target.value,
                        'profile.nativeLanguageCode',
                      )
                    }
                    disabled={catalogsLoading && languageOptions.length === 0}
                    aria-invalid={Boolean(nativeLangError)}
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
                  </select>
                  {nativeLangError ? (
                    <span className="ck-field-error" role="alert">
                      {nativeLangError}
                    </span>
                  ) : null}
                </div>

                <div className="ck-field">
                  <label htmlFor="profile-country">
                    Quốc gia đang sinh sống
                  </label>
                  <select
                    id="profile-country"
                    name="countryCode"
                    value={draft.countryCode}
                    onChange={(e) =>
                      updateDraftField(
                        'countryCode',
                        e.target.value,
                        'profile.countryCode',
                      )
                    }
                    disabled={catalogsLoading && countryOptions.length === 0}
                    aria-invalid={Boolean(countryError)}
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
                  </select>
                  {countryError ? (
                    <span className="ck-field-error" role="alert">
                      {countryError}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="ck-form-row">
                <div className="ck-field">
                  <label htmlFor="profile-age-group">Nhóm tuổi</label>
                  <select
                    id="profile-age-group"
                    name="ageGroup"
                    value={draft.ageGroup}
                    onChange={(e) =>
                      updateDraftField(
                        'ageGroup',
                        e.target.value,
                        'profile.ageGroup',
                      )
                    }
                    disabled={catalogsLoading && ageGroupOptions.length === 0}
                    aria-invalid={Boolean(ageGroupError)}
                  >
                    <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                    {draft.ageGroup &&
                    !ageGroupOptions.some(
                      (opt) => opt.code === draft.ageGroup,
                    ) ? (
                      <option value={draft.ageGroup}>{draft.ageGroup}</option>
                    ) : null}
                    {ageGroupOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {ageGroupError ? (
                    <span className="ck-field-error" role="alert">
                      {ageGroupError}
                    </span>
                  ) : null}
                </div>

                <div className="ck-field">
                  <label htmlFor="profile-gender">Giới tính</label>
                  <select
                    id="profile-gender"
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
                    aria-invalid={Boolean(genderError)}
                  >
                    <option value="">-- Chưa chọn / Xóa lựa chọn --</option>
                    {draft.gender &&
                    !genderOptions.some((opt) => opt.code === draft.gender) ? (
                      <option value={draft.gender}>{draft.gender}</option>
                    ) : null}
                    {genderOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {genderError ? (
                    <span className="ck-field-error" role="alert">
                      {genderError}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Interests (max 3) */}
              <fieldset className="ck-fieldset">
                <legend className="ck-legend">
                  Sở thích ({draft.interests.length}/{MAX_PROFILE_INTERESTS})
                </legend>
                <small className="text-muted">
                  Chọn tối đa {MAX_PROFILE_INTERESTS} chủ đề bạn muốn trò chuyện
                  khi ghép đôi.
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
                        className={`ck-choice-chip ${isChecked ? 'ck-choice-chip--selected' : ''} ${isMaxReached ? 'ck-choice-chip--disabled' : ''}`}
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
                  <span className="ck-field-error" role="alert">
                    {interestsError}
                  </span>
                ) : null}
              </fieldset>

              <div className="ck-actions mt-4">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={profileSubmitting || isSyncingConflict}
                >
                  {profileSubmitting ? 'Đang lưu hồ sơ...' : 'Lưu hồ sơ'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResetDraft}
                  disabled={
                    profileSubmitting ||
                    isSyncingConflict ||
                    (!isDirty &&
                      Object.keys(profileFieldErrors).length === 0 &&
                      !profileError)
                  }
                >
                  Hoàn tác thay đổi
                </Button>
              </div>
            </fieldset>
          </form>
        </article>

        {/* Card 2: Change Password Form */}
        <article
          className="ck-card"
          aria-labelledby="password-change-section-heading"
        >
          <div className="ck-card__header">
            <h2
              id="password-change-section-heading"
              className="text-lg font-semibold text-ink"
            >
              Đổi mật khẩu
            </h2>
            <p className="mt-1 text-sm text-muted">
              Sau khi đổi mật khẩu thành công, tất cả phiên đăng nhập hiện tại
              sẽ bị thu hồi và bạn cần đăng nhập lại bằng mật khẩu mới.
            </p>
          </div>

          {passwordError ? (
            <div className="ck-alert ck-alert--error mb-4" role="alert">
              <p>{passwordError}</p>
            </div>
          ) : null}

          <form
            className="ck-form"
            onSubmit={handlePasswordChangeSubmit}
            noValidate
          >
            <div className="ck-field">
              <label htmlFor="profile-current-password">
                Mật khẩu hiện tại *
              </label>
              <input
                id="profile-current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
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
                aria-invalid={Boolean(passwordFieldErrors.currentPassword)}
                aria-describedby={
                  passwordFieldErrors.currentPassword
                    ? 'profile-current-password-error'
                    : undefined
                }
              />
              {passwordFieldErrors.currentPassword ? (
                <span
                  id="profile-current-password-error"
                  className="ck-field-error"
                  role="alert"
                >
                  {passwordFieldErrors.currentPassword}
                </span>
              ) : null}
            </div>

            <div className="ck-field">
              <label htmlFor="profile-new-password">Mật khẩu mới *</label>
              <input
                id="profile-new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(null);
                  setPasswordFieldErrors((prev) => {
                    if (!prev.newPassword) return prev;
                    const next = { ...prev };
                    delete next.newPassword;
                    return next;
                  });
                }}
                aria-invalid={Boolean(passwordFieldErrors.newPassword)}
                aria-describedby={
                  passwordFieldErrors.newPassword
                    ? 'profile-new-password-error'
                    : 'profile-new-password-hint'
                }
              />
              <small id="profile-new-password-hint">
                Từ 8 đến 128 ký tự (giữ nguyên khoảng trắng, không tự cắt).
              </small>
              {passwordFieldErrors.newPassword ? (
                <span
                  id="profile-new-password-error"
                  className="ck-field-error"
                  role="alert"
                >
                  {passwordFieldErrors.newPassword}
                </span>
              ) : null}
            </div>

            <div className="ck-actions mt-4">
              <Button
                type="submit"
                variant="primary"
                disabled={passwordSubmitting}
              >
                {passwordSubmitting
                  ? 'Đang cập nhật mật khẩu...'
                  : 'Đổi mật khẩu'}
              </Button>
              <Link to="/forgot-password" className="ck-text-button">
                Quên mật khẩu hiện tại?
              </Link>
            </div>
          </form>
        </article>
      </div>
    </section>
  );
}

export function ProfilePage() {
  const { user, kind, role, status, updateUser, invalidateSession } = useAuth();
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
    />
  );
}
