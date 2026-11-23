import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { Input, PasswordInput } from '../../components/ui/forms.jsx';
import { AuthSplitLayout } from './AuthSplitLayout.jsx';
import { mapAuthApiError, validateRegisterForm } from './auth-validation.js';
import { useAuth } from './use-auth.js';
import registerScene from './register-scene.webp';

export function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const locationState = /** @type {{from?: unknown} | null} */ (location.state);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
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
      greetingTranslation="Rất vui được gặp bạn!"
      title="Cùng luyện nói nhé!"
      accessibleTitle="Đăng ký"
      subtitle="Tạo tài khoản để lưu kiến thức và bắt đầu luyện tập."
      illustration={registerScene}
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
            className="ck-button ck-button--primary ck-button--sticker ck-button--full"
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
            <Input
              id="register-display-name"
              name="displayName"
              type="text"
              autoComplete="name"
              label="Tên hiển thị"
              placeholder="Ví dụ: Minh Anh"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (fieldErrors.displayName) {
                  setFieldErrors((prev) => ({ ...prev, displayName: '' }));
                }
              }}
              disabled={isSubmitting}
              error={fieldErrors.displayName || undefined}
            />

            <Input
              id="register-email"
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
              disabled={isSubmitting}
              error={fieldErrors.email || undefined}
            />

            <PasswordInput
              id="register-password"
              name="password"
              autoComplete="new-password"
              label="Mật khẩu"
              placeholder="Tạo mật khẩu"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: '' }));
                }
              }}
              disabled={isSubmitting}
              helperText="Ít nhất 8 ký tự, gồm 1 chữ hoa và 1 chữ số."
              error={fieldErrors.password || undefined}
            />

            <PasswordInput
              id="register-confirm-password"
              name="confirmPassword"
              autoComplete="new-password"
              label="Xác nhận mật khẩu"
              placeholder="Nhập lại mật khẩu"
              showLabel="Hiện mật khẩu xác nhận"
              hideLabel="Ẩn mật khẩu xác nhận"
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
              error={fieldErrors.confirmPassword || undefined}
            />

            <Button
              type="submit"
              variant="primary"
              appearance="sticker"
              fullWidth
              loading={isSubmitting}
            >
              {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
            </Button>
          </form>
        </>
      )}
    </AuthSplitLayout>
  );
}
