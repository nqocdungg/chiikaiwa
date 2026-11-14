import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AuthSplitLayout } from './AuthSplitLayout.jsx';
import { mapAuthApiError, validateRegisterForm } from './auth-validation.js';
import { useAuth } from './use-auth.js';

/**
 * @param {{ visible: boolean }} props
 */
function PasswordEyeIcon({ visible }) {
  if (visible) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const locationState = /** @type {{from?: unknown} | null} */ (location.state);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const [bannerError, setBannerError] = useState(
    /** @type {string | null} */ (null),
  );
  const [registeredAccount, setRegisteredAccount] = useState(
    /** @type {{email: string, displayName: string} | null} */ (null),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = async (
    /** @type {import('react').FormEvent} */ event,
  ) => {
    event.preventDefault();
    if (submittingRef.current || isSubmitting) {
      return;
    }

    setBannerError(null);
    const validation = validateRegisterForm({
      displayName,
      email,
      password,
      confirmPassword,
      requireConfirmPassword: confirmTouched,
    });

    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const createdUser = await register(validation.payload);
      setPassword('');
      setConfirmPassword('');
      setRegisteredAccount({
        email: createdUser?.email || validation.payload.email,
        displayName: createdUser?.displayName || validation.payload.displayName,
      });
    } catch (err) {
      const errCode = /** @type {{code?: string}} */ (err)?.code;
      if (errCode === 'AUTH_SUPERSEDED') {
        return;
      }
      const mapped = mapAuthApiError(err, 'register');
      setFieldErrors(mapped.fieldErrors);
      setBannerError(mapped.bannerMessage);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout
      eyebrow="はじめまして"
      title="Cùng bắt đầu luyện nói nhé!"
      accessibleTitle="Đăng ký"
      subtitle="Tạo tài khoản để lưu kiến thức và bắt đầu luyện tập."
      footer={
        <p className="ck-auth-switch">
          <span>Đã có tài khoản? </span>
          <Link
            to="/login"
            state={
              registeredAccount
                ? {
                    from: locationState?.from,
                    registeredEmail: registeredAccount.email,
                    notice:
                      'Đăng ký tài khoản thành công! Vui lòng đăng nhập để bắt đầu.',
                  }
                : locationState?.from
                  ? { from: locationState.from }
                  : undefined
            }
            className="ck-auth-switch__link"
          >
            Đăng nhập
          </Link>
        </p>
      }
    >
      {registeredAccount ? (
        <div
          className="ck-auth-success-box"
          role="status"
          aria-live="polite"
          data-testid="register-success-state"
        >
          <p className="ck-auth-success-box__title">
            Tài khoản đã được tạo thành công!
          </p>
          <p className="ck-auth-success-box__desc">
            Xin chào <strong>{registeredAccount.displayName}</strong> (
            <span>{registeredAccount.email}</span>). Vui lòng đăng nhập bằng tài
            khoản vừa tạo để bắt đầu luyện tập trên Chiikaiwa.
          </p>
          <Link
            to="/login"
            state={{
              from: locationState?.from,
              registeredEmail: registeredAccount.email,
              notice:
                'Đăng ký tài khoản thành công! Vui lòng đăng nhập để bắt đầu.',
            }}
            className="ck-auth-submit-btn ck-auth-submit-btn--link"
          >
            Đi tới trang đăng nhập
          </Link>
        </div>
      ) : (
        <>
          {bannerError ? (
            <div
              className="ck-auth-alert ck-auth-alert--error"
              role="alert"
              aria-live="assertive"
            >
              {bannerError}
            </div>
          ) : null}

          <form className="ck-auth-form" onSubmit={handleSubmit} noValidate>
            <div className="ck-auth-field">
              <label htmlFor="register-display-name" className="ck-auth-label">
                Tên hiển thị
              </label>
              <input
                id="register-display-name"
                name="displayName"
                type="text"
                autoComplete="name"
                placeholder="Ví dụ: Minh Anh"
                className={`ck-auth-input${fieldErrors.displayName ? ' is-invalid' : ''}`}
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (fieldErrors.displayName) {
                    setFieldErrors((prev) => ({ ...prev, displayName: '' }));
                  }
                }}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.displayName)}
                aria-describedby={
                  fieldErrors.displayName
                    ? 'register-display-name-error'
                    : undefined
                }
              />
              {fieldErrors.displayName ? (
                <p
                  id="register-display-name-error"
                  className="ck-auth-field-error"
                >
                  {fieldErrors.displayName}
                </p>
              ) : null}
            </div>

            <div className="ck-auth-field">
              <label htmlFor="register-email" className="ck-auth-label">
                Email
              </label>
              <input
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="ban@example.com"
                className={`ck-auth-input${fieldErrors.email ? ' is-invalid' : ''}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: '' }));
                  }
                }}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={
                  fieldErrors.email ? 'register-email-error' : undefined
                }
              />
              {fieldErrors.email ? (
                <p id="register-email-error" className="ck-auth-field-error">
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div className="ck-auth-field">
              <label htmlFor="register-password" className="ck-auth-label">
                Mật khẩu
              </label>
              <div className="ck-auth-password-wrap">
                <input
                  id="register-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Tạo mật khẩu"
                  className={`ck-auth-input ck-auth-input--password${fieldErrors.password ? ' is-invalid' : ''}`}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: '' }));
                    }
                  }}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password
                      ? 'register-password-hint register-password-error'
                      : 'register-password-hint'
                  }
                />
                <button
                  type="button"
                  className="ck-auth-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-pressed={showPassword}
                  disabled={isSubmitting}
                >
                  <PasswordEyeIcon visible={showPassword} />
                </button>
              </div>
              <p id="register-password-hint" className="ck-auth-field-hint">
                Ít nhất 8 ký tự, gồm 1 chữ hoa và 1 chữ số.
              </p>
              {fieldErrors.password ? (
                <p id="register-password-error" className="ck-auth-field-error">
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>

            <div className="ck-auth-field">
              <label
                htmlFor="register-confirm-password"
                className="ck-auth-label"
              >
                Xác nhận mật khẩu
              </label>
              <div className="ck-auth-password-wrap">
                <input
                  id="register-confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                  className={`ck-auth-input ck-auth-input--password${fieldErrors.confirmPassword ? ' is-invalid' : ''}`}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmTouched(true);
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        confirmPassword: '',
                      }));
                    }
                  }}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  aria-describedby={
                    fieldErrors.confirmPassword
                      ? 'register-confirm-password-error'
                      : undefined
                  }
                />
                <button
                  type="button"
                  className="ck-auth-password-toggle"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={
                    showConfirmPassword
                      ? 'Ẩn mật khẩu xác nhận'
                      : 'Hiện mật khẩu xác nhận'
                  }
                  aria-pressed={showConfirmPassword}
                  disabled={isSubmitting}
                >
                  <PasswordEyeIcon visible={showConfirmPassword} />
                </button>
              </div>
              {fieldErrors.confirmPassword ? (
                <p
                  id="register-confirm-password-error"
                  className="ck-auth-field-error"
                >
                  {fieldErrors.confirmPassword}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              className="ck-auth-submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
            </button>
          </form>
        </>
      )}
    </AuthSplitLayout>
  );
}
