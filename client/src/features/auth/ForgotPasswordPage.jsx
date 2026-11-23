import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { usagi } from '../../assets/mascots/mascots.js';
import { AuthLayout } from '../../components/layout/AuthLayout.jsx';
import { Button } from '../../components/ui/controls.jsx';
import { Input } from '../../components/ui/forms.jsx';
import { Badge } from '../../components/ui/surfaces.jsx';
import { api } from '../../services/api-client.js';
import { getIdentityEpoch } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import { validateEmailInput } from './account-validation.js';

const NEUTRAL_RESET_REQUEST_MESSAGE =
  'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.';

export function ForgotPasswordPage() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState(
    /** @type {string | null} */ (null),
  );
  const [serviceError, setServiceError] = useState(
    /** @type {string | null} */ (null),
  );
  const [neutralMessage, setNeutralMessage] = useState(
    /** @type {string | null} */ (null),
  );

  /**
   * @param {import('react').FormEvent<HTMLFormElement>} event
   */
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setServiceError(null);
    setNeutralMessage(null);

    const emailCheck = validateEmailInput(email);
    if (emailCheck.error) {
      setFieldError(emailCheck.error);
      return;
    }

    setFieldError(null);
    const startEpoch = getIdentityEpoch();
    setIsSubmitting(true);

    try {
      const res = await api.post('/auth/password-reset-requests', {
        email: emailCheck.email,
      });

      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      const data = /** @type {{ message?: string } | null} */ (res.data);
      const message =
        typeof data?.message === 'string' && data.message.trim()
          ? data.message
          : NEUTRAL_RESET_REQUEST_MESSAGE;

      setNeutralMessage(message);
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      if (err instanceof ApiError) {
        if (err.isValidationError()) {
          const fields = err.getFieldErrors();
          if (fields.email) {
            setFieldError(fields.email);
            return;
          }
          setServiceError(
            err.message || 'Email không hợp lệ. Vui lòng kiểm tra lại.',
          );
          return;
        }

        if (err.isRateLimited()) {
          const waitHint =
            typeof err.retryAfter === 'number' && err.retryAfter > 0
              ? ` Vui lòng thử lại sau ${err.retryAfter} giây.`
              : ' Vui lòng thử lại sau ít phút.';
          setServiceError(`${err.message}${waitHint}`);
          return;
        }

        setServiceError(
          err.message ||
            'Dịch vụ gửi email tạm thời không khả dụng. Vui lòng thử lại sau.',
        );
      } else {
        setServiceError(
          'Dịch vụ gửi email tạm thời không khả dụng. Vui lòng thử lại sau.',
        );
      }
    } finally {
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <section
      data-screen-id="SC-02"
      className="ck-auth-screen ck-auth-screen--recovery"
    >
      <AuthLayout mascot={usagi} mascotAlt="Mascot thỏ Chiikaiwa">
        <div className="ck-auth-card">
          <div className="ck-auth-panel__topbar">
            <Link to="/" className="ck-auth-back-link">
              <span aria-hidden="true">←</span>
              <span>Về trang chủ</span>
            </Link>
          </div>

          <header className="ck-auth-card__header">
            <Badge tone="accent">Khôi phục mật khẩu</Badge>
            <h1 className="ck-auth-title">Quên mật khẩu</h1>
            <p className="ck-auth-subtitle">
              Nhập email đăng ký để nhận liên kết đặt lại mật khẩu dùng một lần
              (hiệu lực 15 phút).
            </p>
          </header>

          {neutralMessage ? (
            <div className="ck-alert ck-alert--success" role="status">
              <strong className="block">Đã tiếp nhận yêu cầu</strong>
              <p className="mt-1">{neutralMessage}</p>
              <p className="mt-1 text-xs">
                Liên kết trong thư chỉ sử dụng được một lần trong vòng 15 phút.
                Chức năng này chỉ đặt lại mật khẩu qua email đăng ký, không mở
                khóa tài khoản hoặc khôi phục tài khoản đã mất quyền truy cập
                email.
              </p>
            </div>
          ) : null}

          {serviceError ? (
            <div className="ck-alert ck-alert--error" role="alert">
              <p>{serviceError}</p>
            </div>
          ) : null}

          <form className="ck-auth-form" onSubmit={handleSubmit} noValidate>
            <Input
              id="reset-request-email"
              name="email"
              type="email"
              autoComplete="email"
              label="Email đăng ký"
              required
              placeholder="ban@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldError(null);
                setServiceError(null);
              }}
              disabled={isSubmitting}
              helperText="Hệ thống sẽ gửi liên kết đặt lại mật khẩu nếu địa chỉ email tương ứng với tài khoản đang hoạt động."
              error={fieldError ?? undefined}
            />

            <div className="ck-actions">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={isSubmitting}
              >
                {isSubmitting
                  ? 'Đang gửi yêu cầu...'
                  : 'Gửi liên kết đặt lại mật khẩu'}
              </Button>
              <Link
                to="/login"
                className="ck-button ck-button--secondary ck-button--full"
              >
                Quay lại đăng nhập
              </Link>
            </div>
          </form>
        </div>
      </AuthLayout>
    </section>
  );
}
