import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { api } from '../../services/api-client.js';
import { getIdentityEpoch } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import { validateNewPasswordInput } from './account-validation.js';
import { useAuth } from './use-auth.js';

/**
 * @param {Object} props
 * @param {string} props.normalizedToken
 */
function ResetPasswordContent({ normalizedToken }) {
  const { kind, invalidateSession } = useAuth();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const hasValidTokenParam =
    normalizedToken.length > 0 && normalizedToken.length <= 512;

  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState(
    /** @type {string | null} */ (null),
  );
  const [serviceError, setServiceError] = useState(
    /** @type {string | null} */ (null),
  );
  const [tokenInvalidMessage, setTokenInvalidMessage] = useState(
    /** @type {string | null} */ (null),
  );
  const [isSuccess, setIsSuccess] = useState(false);

  /**
   * @param {import('react').FormEvent<HTMLFormElement>} event
   */
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting || !hasValidTokenParam || isSuccess) {
      return;
    }

    setServiceError(null);

    const passwordErr = validateNewPasswordInput(newPassword);
    if (passwordErr) {
      setFieldError(passwordErr);
      return;
    }

    setFieldError(null);
    const startEpoch = getIdentityEpoch();
    setIsSubmitting(true);

    try {
      await api.post('/auth/password-resets', {
        token: normalizedToken,
        newPassword,
      });

      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      setNewPassword('');
      setIsSuccess(true);
      // Require explicit login after reset rather than retaining potentially revoked credentials in UI state.
      if (kind === 'user') {
        invalidateSession?.(
          'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.',
        );
      }
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      if (err instanceof ApiError) {
        if (err.code === 'RESET_TOKEN_INVALID') {
          setNewPassword('');
          setTokenInvalidMessage(
            err.message ||
              'Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được sử dụng.',
          );
          return;
        }

        if (err.isValidationError()) {
          const fields = err.getFieldErrors();
          if (fields.token) {
            setNewPassword('');
            setTokenInvalidMessage(
              fields.token ||
                'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
            );
            return;
          }
          if (fields.newPassword) {
            setFieldError(fields.newPassword);
            return;
          }
          setServiceError(
            err.message || 'Dữ liệu đặt lại mật khẩu chưa hợp lệ.',
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
            'Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.',
        );
      } else {
        setServiceError(
          'Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.',
        );
      }
    } finally {
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setIsSubmitting(false);
      }
    }
  };

  if (isSuccess) {
    return (
      <section
        data-screen-id="SC-02"
        className="ck-account-page ck-account-page--narrow"
      >
        <div className="ck-account-topbar">
          <Link className="ck-brand" to="/" aria-label="Chiikaiwa, trang chủ">
            <span lang="ja">ち</span>chiikaiwa
          </Link>
        </div>

        <header className="ck-account-header">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              Đặt lại mật khẩu
            </h1>
            <p className="mt-1 text-muted">
              Hoàn tất cập nhật mật khẩu cho tài khoản Chiikaiwa.
            </p>
          </div>
        </header>

        <div className="ck-card" role="status" aria-live="polite">
          <div className="ck-alert ck-alert--success">
            <strong className="block">Đặt lại mật khẩu thành công</strong>
            <p className="mt-1">
              Mật khẩu mới của bạn đã được lưu và các phiên đăng nhập cũ đã bị
              thu hồi. Vui lòng đăng nhập lại bằng mật khẩu mới.
            </p>
          </div>

          <div className="ck-actions mt-5">
            <Link to="/login" className="ck-button ck-button--primary">
              Đến trang đăng nhập
            </Link>
            <Link to="/" className="ck-button ck-button--secondary">
              Về trang chủ
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!hasValidTokenParam || tokenInvalidMessage) {
    const alertText =
      tokenInvalidMessage ||
      'Liên kết đặt lại mật khẩu không hợp lệ hoặc thiếu mã xác nhận. Vui lòng yêu cầu gửi lại liên kết mới.';

    return (
      <section
        data-screen-id="SC-02"
        className="ck-account-page ck-account-page--narrow"
      >
        <div className="ck-account-topbar">
          <Link className="ck-brand" to="/" aria-label="Chiikaiwa, trang chủ">
            <span lang="ja">ち</span>chiikaiwa
          </Link>
        </div>

        <header className="ck-account-header">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              Đặt lại mật khẩu
            </h1>
            <p className="mt-1 text-muted">
              Liên kết đặt lại mật khẩu chỉ có hiệu lực 15 phút và dùng một lần.
            </p>
          </div>
        </header>

        <div className="ck-card">
          <div className="ck-alert ck-alert--error" role="alert">
            <strong className="block">Liên kết không còn sử dụng được</strong>
            <p className="mt-1">{alertText}</p>
          </div>

          <div className="ck-actions mt-5">
            <Link
              to="/forgot-password"
              className="ck-button ck-button--primary"
            >
              Yêu cầu liên kết mới
            </Link>
            <Link to="/login" className="ck-button ck-button--secondary">
              Quay lại đăng nhập
            </Link>
            <Link to="/" className="ck-text-button">
              Về trang chủ
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-screen-id="SC-02"
      className="ck-account-page ck-account-page--narrow"
    >
      <div className="ck-account-topbar">
        <Link className="ck-brand" to="/" aria-label="Chiikaiwa, trang chủ">
          <span lang="ja">ち</span>chiikaiwa
        </Link>
      </div>

      <header className="ck-account-header">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Đặt lại mật khẩu</h1>
          <p className="mt-1 text-muted">
            Nhập mật khẩu mới cho tài khoản của bạn. Sau khi hoàn tất, bạn sẽ
            đăng nhập lại bằng mật khẩu mới.
          </p>
        </div>
      </header>

      <div className="ck-card">
        {serviceError ? (
          <div className="ck-alert ck-alert--error mb-4" role="alert">
            <p>{serviceError}</p>
          </div>
        ) : null}

        <form className="ck-form" onSubmit={handleSubmit} noValidate>
          <div className="ck-field">
            <label htmlFor="reset-new-password">Mật khẩu mới *</label>
            <input
              id="reset-new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setFieldError(null);
                setServiceError(null);
              }}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={
                fieldError
                  ? 'reset-new-password-error'
                  : 'reset-new-password-hint'
              }
            />
            <small id="reset-new-password-hint">
              Từ 8 đến 128 ký tự (giữ nguyên khoảng trắng, không tự cắt).
            </small>
            {fieldError ? (
              <span
                id="reset-new-password-error"
                className="ck-field-error"
                role="alert"
              >
                {fieldError}
              </span>
            ) : null}
          </div>

          <div className="ck-actions mt-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Đang cập nhật mật khẩu...' : 'Lưu mật khẩu mới'}
            </Button>
            <Link
              to="/forgot-password"
              className="ck-button ck-button--secondary"
            >
              Yêu cầu liên kết mới
            </Link>
            <Link to="/login" className="ck-text-button">
              Quay lại đăng nhập
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const rawToken = searchParams.get('token');
  const normalizedToken = typeof rawToken === 'string' ? rawToken.trim() : '';

  return (
    <ResetPasswordContent
      key={normalizedToken}
      normalizedToken={normalizedToken}
    />
  );
}
