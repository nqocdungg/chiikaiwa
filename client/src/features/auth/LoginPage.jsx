import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Input, PasswordInput } from '../../components/ui/forms.jsx';
import { AuthSplitLayout } from './AuthSplitLayout.jsx';
import {
  mapAuthApiError,
  resolvePostLoginRedirect,
  validateLoginForm,
} from './auth-validation.js';
import { useAuth } from './use-auth.js';
import loginScene from '../../assets/auth/login-scene.webp';

export function LoginPage() {
  const { login, isLoginPending, authNotice, clearAuthNotice } = useAuth();
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
  const isLoginBusy = isSubmitting || isLoginPending;

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
    if (isLoginBusy) {
      return;
    }

    setBannerError(null);
    const validation = validateLoginForm({ email, password });
    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
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
      setIsSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout
      eyebrow="おかえりなさい"
      greetingTranslation="Mừng bạn trở lại!"
      title="Chào mừng trở lại!"
      accessibleTitle="Đăng nhập"
      subtitle="Đăng nhập để tiếp tục những cuộc hội thoại của bạn."
      illustration={loginScene}
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
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          label="Email"
          placeholder="ban@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) {
              setFieldErrors((prev) => ({ ...prev, email: '' }));
            }
          }}
          disabled={isLoginBusy}
          error={fieldErrors.email || undefined}
        />

        <PasswordInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          label="Mật khẩu"
          placeholder="Nhập mật khẩu"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) {
              setFieldErrors((prev) => ({ ...prev, password: '' }));
            }
          }}
          disabled={isLoginBusy}
          error={fieldErrors.password || undefined}
        />

        <div className="ck-auth-meta-row">
          <Link to="/forgot-password" className="ck-auth-forgot-link">
            Quên mật khẩu?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          appearance="sticker"
          fullWidth
          loading={isLoginBusy}
        >
          {isLoginBusy ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
