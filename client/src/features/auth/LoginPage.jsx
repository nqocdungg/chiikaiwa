import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AuthSplitLayout } from './AuthSplitLayout.jsx';
import {
  mapAuthApiError,
  resolvePostLoginRedirect,
  validateLoginForm,
} from './auth-validation.js';
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

export function LoginPage() {
  const { login, authNotice, clearAuthNotice } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const locationState =
    /** @type {{from?: unknown, notice?: string, registeredEmail?: string} | null} */ (
      location.state
    );
  const initialEmail =
    typeof locationState?.registeredEmail === 'string'
      ? locationState.registeredEmail
      : '';
  const initialLocationNotice =
    typeof locationState?.notice === 'string' ? locationState.notice : null;

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const [bannerError, setBannerError] = useState(
    /** @type {string | null} */ (null),
  );
  const [localNotice, setLocalNotice] = useState(
    /** @type {string | null} */ (initialLocationNotice),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const activeNotice = authNotice || localNotice;

  const handleDismissNotice = () => {
    setLocalNotice(null);
    if (typeof clearAuthNotice === 'function') {
      clearAuthNotice();
    }
  };

  const handleSubmit = async (
    /** @type {import('react').FormEvent} */ event,
  ) => {
    event.preventDefault();
    if (submittingRef.current || isSubmitting) {
      return;
    }

    setBannerError(null);
    const validation = validateLoginForm({ email, password });
    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const loggedInUser = await login(validation.payload);
      setLocalNotice(null);
      if (typeof clearAuthNotice === 'function') {
        clearAuthNotice();
      }
      const nextTarget = resolvePostLoginRedirect(
        locationState?.from,
        loggedInUser?.role ?? 'learner',
      );
      navigate(nextTarget, { replace: true });
    } catch (err) {
      const errCode = /** @type {{code?: string}} */ (err)?.code;
      if (errCode === 'AUTH_SUPERSEDED') {
        return;
      }
      const mapped = mapAuthApiError(err, 'login');
      setFieldErrors(mapped.fieldErrors);
      setBannerError(mapped.bannerMessage);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout
      eyebrow="おかえりなさい"
      title="Chào mừng bạn trở lại!"
      accessibleTitle="Đăng nhập"
      subtitle="Đăng nhập để tiếp tục những cuộc hội thoại của bạn."
      footer={
        <p className="ck-auth-switch">
          <span>Chưa có tài khoản? </span>
          <Link
            to="/register"
            state={
              locationState?.from ? { from: locationState.from } : undefined
            }
            className="ck-auth-switch__link"
          >
            Đăng ký
          </Link>
        </p>
      }
    >
      {activeNotice ? (
        <div
          className="ck-auth-alert ck-auth-alert--notice"
          role="status"
          aria-live="polite"
        >
          <span>{activeNotice}</span>
          <button
            type="button"
            className="ck-auth-alert__dismiss"
            onClick={handleDismissNotice}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      ) : null}

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
          <label htmlFor="login-email" className="ck-auth-label">
            Email
          </label>
          <input
            id="login-email"
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
              fieldErrors.email ? 'login-email-error' : undefined
            }
          />
          {fieldErrors.email ? (
            <p id="login-email-error" className="ck-auth-field-error">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="ck-auth-field">
          <label htmlFor="login-password" className="ck-auth-label">
            Mật khẩu
          </label>
          <div className="ck-auth-password-wrap">
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
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
                fieldErrors.password ? 'login-password-error' : undefined
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
          {fieldErrors.password ? (
            <p id="login-password-error" className="ck-auth-field-error">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        <div className="ck-auth-meta-row">
          <Link to="/forgot-password" className="ck-auth-forgot-link">
            Quên mật khẩu?
          </Link>
        </div>

        <button
          type="submit"
          className="ck-auth-submit-btn"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </AuthSplitLayout>
  );
}
