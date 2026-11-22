import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Avatar, Badge, Card } from '../../components/ui/surfaces.jsx';
import { getIdentityEpoch } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import { useAuth } from '../auth/use-auth.js';
import { getSession } from '../kaiwa/session-api.js';
import { SafetyActionDialog } from '../safety/SafetyActionDialog.jsx';
import {
  formatSafetyError,
  resolvePartnerDisplayName,
  resolveSessionPartner,
} from '../safety/safety-api.js';

const END_REASON_LABELS = {
  completed: 'Đã hoàn thành',
  left: 'Một thành viên đã rời phòng',
  blocked: 'Phiên kết thúc do chặn đối tác',
  selectionTimeout: 'Hết thời gian chọn bộ chủ đề',
  reconnectTimeout: 'Hết thời gian chờ kết nối lại',
  accountLocked: 'Tài khoản bị khóa',
  guestExpired: 'Hết thời hạn dùng thử của khách',
};

/**
 * Formats activeDurationMs into mm:ss.
 * @param {number | undefined} durationMs
 * @returns {string}
 */
function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor((durationMs ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * SC-10 route view: displays real session summary metadata and SC-17 safety actions
 * (report / block partner) for verified session members.
 */
export function SessionSummaryPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();

  const [session, setSession] = useState(
    /** @type {import('../kaiwa/session-api.js').Session | null} */ (null),
  );
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState(
    /** @type {string | null} */ (null),
  );

  const handleRetrySession = () => {
    setLoading(true);
    setError(null);
    setReloadToken((count) => count + 1);
  };

  useEffect(() => {
    let isActive = true;
    const abortController = new AbortController();
    const startEpoch = getIdentityEpoch();

    getSession(sessionId, abortController.signal)
      .then((res) => {
        if (!isActive || startEpoch !== getIdentityEpoch()) {
          return;
        }
        setSession(res.data);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (!isActive || startEpoch !== getIdentityEpoch()) {
          return;
        }
        if (err instanceof ApiError && err.isGuestExpired()) {
          navigate('/expired', { replace: true });
          return;
        }
        if (err instanceof ApiError && err.isAuthRequired()) {
          auth.invalidateSession?.(
            'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          );
          navigate('/login', { replace: true });
          return;
        }
        const formatted = formatSafetyError(
          err,
          'Không thể tải thông tin tổng kết phiên. Vui lòng thử lại.',
        );
        setError(formatted.message);
      })
      .finally(() => {
        if (isActive && startEpoch === getIdentityEpoch()) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [auth, navigate, reloadToken, sessionId]);

  const partner = resolveSessionPartner(session?.members, {
    kind: auth.kind,
    userId: auth.user?.id ?? null,
  });
  const partnerName = resolvePartnerDisplayName(partner);
  const isGuest = auth.kind === 'guest';
  const endReasonKey =
    /** @type {keyof typeof END_REASON_LABELS | undefined} */ (
      /** @type {{ endReason?: string }} */ (session)?.endReason
    );
  const endReasonText = endReasonKey
    ? (END_REASON_LABELS[endReasonKey] ?? endReasonKey)
    : session?.status === 'ended'
      ? 'Đã kết thúc'
      : 'Đang diễn ra';

  return (
    <section data-screen-id="SC-10" className="ck-account-page ck-safety-page">
      <header className="ck-account-header">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Tổng kết phiên</h1>
          <p className="mt-1 text-muted">
            Xem thông tin phiên luyện và thao tác an toàn nếu cần thiết.
          </p>
        </div>
        <div className="ck-account-meta">
          <Link
            to={isGuest ? '/invitation' : '/home'}
            className="ck-button ck-button--secondary"
          >
            {isGuest ? 'Về phòng mời' : 'Về trang chính'}
          </Link>
          {!isGuest ? (
            <Link to="/blocks" className="ck-text-button">
              Danh sách chặn
            </Link>
          ) : null}
        </div>
      </header>

      {safetyNotice ? (
        <div
          className="ck-alert ck-alert--success"
          role="status"
          aria-live="polite"
        >
          <p>{safetyNotice}</p>
        </div>
      ) : null}

      <Card className="ck-safety-card">
        {loading ? (
          <div className="ck-safety-state" role="status" aria-live="polite">
            <p className="text-muted">Đang tải thông tin phiên…</p>
          </div>
        ) : error ? (
          <div className="ck-alert ck-alert--error" role="alert">
            <div className="ck-alert__body">
              <strong>Không thể tải tổng kết phiên</strong>
              <p className="mt-1">{error}</p>
            </div>
            <Button
              variant="secondary"
              size="compact"
              onClick={handleRetrySession}
            >
              Thử tải lại
            </Button>
          </div>
        ) : session ? (
          <div className="ck-safety-summary">
            <div className="ck-safety-target">
              <Avatar name={partnerName} size={48} />
              <div className="ck-safety-target__info">
                <span className="ck-safety-target__label">
                  Đối tác phiên luyện
                </span>
                <strong className="ck-safety-target__name">
                  {partnerName}
                </strong>
              </div>
              <Badge>{endReasonText}</Badge>
            </div>

            <dl className="ck-safety-summary__dl">
              <div>
                <dt>Thời lượng kết nối</dt>
                <dd>{formatDuration(session.activeDurationMs)}</dd>
              </div>
              <div>
                <dt>Trạng thái phiên</dt>
                <dd>{endReasonText}</dd>
              </div>
            </dl>

            {partner ? (
              <div className="ck-safety-summary__actions">
                <Button
                  variant="secondary"
                  size="compact"
                  leadingIcon={<Icon name="shield" size={18} />}
                  onClick={() => setSafetyOpen(true)}
                >
                  Báo cáo / Chặn đối tác
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {session && partner ? (
        <SafetyActionDialog
          open={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          sessionId={session.id}
          partner={partner}
          inActiveSession={false}
          isGuest={isGuest}
          onReported={() => {
            setSafetyNotice(
              'Báo cáo của bạn đã được tiếp nhận. Thao tác này không tự chặn đối tác.',
            );
          }}
          onBlocked={() => {
            setSafetyNotice(
              `Đã chặn ${partnerName}. Hai người sẽ không thể ghép cặp hoặc vào phòng qua mã mời.`,
            );
          }}
        />
      ) : null}
    </section>
  );
}
