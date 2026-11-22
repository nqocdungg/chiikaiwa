import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import logo from '../../assets/brand/chii-logo.svg';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Avatar, Badge, Card } from '../../components/ui/surfaces.jsx';
import { createIdempotencyKey } from '../../services/api-client.js';
import { getIdentityEpoch } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import { useAuth } from '../auth/use-auth.js';
import {
  DEFAULT_BLOCKS_LIMIT,
  deleteMyBlock,
  formatSafetyDateTime,
  formatSafetyError,
  listMyBlocks,
  resolvePartnerDisplayName,
} from './safety-api.js';
import './safety.css';

const SESSION_EXPIRED_NOTICE =
  'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.';

/**
 * SC-18: Danh sách chặn của người học (04 SC-18, UF-11, 07 §10).
 */
export function BlockListPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const isMountedRef = useRef(true);

  const [items, setItems] = useState(
    /** @type {import('./safety-api.js').BlockItem[]} */ ([]),
  );
  const [nextCursor, setNextCursor] = useState(
    /** @type {string | null} */ (null),
  );
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState(
    /** @type {string | null} */ (null),
  );
  const [loadMoreError, setLoadMoreError] = useState(
    /** @type {string | null} */ (null),
  );
  const [statusNotice, setStatusNotice] = useState(
    /** @type {string | null} */ (null),
  );

  // Unblock confirmation modal state
  const [selectedBlock, setSelectedBlock] = useState(
    /** @type {import('./safety-api.js').BlockItem | null} */ (null),
  );
  const [unblockPending, setUnblockPending] = useState(false);
  const [unblockError, setUnblockError] = useState(
    /** @type {{ message: string, retryable: boolean } | null} */ (null),
  );
  const unblockPendingRef = useRef(false);
  const unblockIntentRef = useRef(
    /** @type {{ blockId: string, idempotencyKey: string | null }} */ ({
      blockId: '',
      idempotencyKey: null,
    }),
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleLifecycleError = useCallback(
    (/** @type {unknown} */ err) => {
      if (!(err instanceof ApiError)) {
        return false;
      }
      if (err.isGuestExpired()) {
        navigate('/expired', { replace: true });
        return true;
      }
      if (err.isAuthRequired()) {
        auth.invalidateSession?.(SESSION_EXPIRED_NOTICE);
        navigate('/login', { replace: true });
        return true;
      }
      if (err.code === 'ACCOUNT_LOCKED') {
        auth.updateUser?.({ status: 'locked' });
        return false;
      }
      return false;
    },
    [auth, navigate],
  );

  const handleRetryInitial = () => {
    setLoading(true);
    setListError(null);
    setLoadMoreError(null);
    setReloadToken((count) => count + 1);
  };

  useEffect(() => {
    let isActive = true;
    const abortController = new AbortController();
    const startEpoch = getIdentityEpoch();

    listMyBlocks({
      limit: DEFAULT_BLOCKS_LIMIT,
      signal: abortController.signal,
    })
      .then((res) => {
        if (!isActive || startEpoch !== getIdentityEpoch()) {
          return;
        }
        setItems(Array.isArray(res.data?.items) ? res.data.items : []);
        setNextCursor(res.data?.nextCursor ?? null);
        setListError(null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (!isActive || startEpoch !== getIdentityEpoch()) {
          return;
        }
        if (handleLifecycleError(err)) {
          return;
        }
        const formatted = formatSafetyError(
          err,
          'Không thể tải danh sách chặn lúc này. Vui lòng thử lại.',
        );
        setListError(formatted.message);
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
  }, [handleLifecycleError, reloadToken]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore || loading) {
      return;
    }
    const startEpoch = getIdentityEpoch();
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const res = await listMyBlocks({
        limit: DEFAULT_BLOCKS_LIMIT,
        cursor: nextCursor,
      });
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      const nextItems = Array.isArray(res.data?.items) ? res.data.items : [];
      setItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const uniqueNext = nextItems.filter(
          (item) => !existingIds.has(item.id),
        );
        return [...prev, ...uniqueNext];
      });
      setNextCursor(res.data?.nextCursor ?? null);
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      if (handleLifecycleError(err)) {
        return;
      }
      const formatted = formatSafetyError(
        err,
        'Không thể tải thêm danh sách chặn. Vui lòng thử lại.',
      );
      setLoadMoreError(formatted.message);
    } finally {
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setLoadingMore(false);
      }
    }
  };

  /**
   * Opens unblock confirmation modal for a specific block item.
   * @param {import('./safety-api.js').BlockItem} item
   */
  const openUnblockDialog = (item) => {
    setSelectedBlock(item);
    setUnblockError(null);
    unblockIntentRef.current = { blockId: item.id, idempotencyKey: null };
  };

  const closeUnblockDialog = () => {
    if (unblockPendingRef.current) {
      return;
    }
    setSelectedBlock(null);
    setUnblockError(null);
    unblockIntentRef.current = { blockId: '', idempotencyKey: null };
  };

  const confirmUnblock = async () => {
    if (!selectedBlock || unblockPendingRef.current) {
      return;
    }

    const blockId = selectedBlock.id;
    const partnerName = resolvePartnerDisplayName(selectedBlock.partner);

    let idempotencyKey = unblockIntentRef.current.idempotencyKey;
    if (!idempotencyKey || unblockIntentRef.current.blockId !== blockId) {
      idempotencyKey = createIdempotencyKey();
      unblockIntentRef.current = { blockId, idempotencyKey };
    }

    const startEpoch = getIdentityEpoch();
    unblockPendingRef.current = true;
    setUnblockPending(true);
    setUnblockError(null);
    setStatusNotice(null);

    try {
      await deleteMyBlock(blockId, { idempotencyKey });
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      unblockIntentRef.current = { blockId: '', idempotencyKey: null };
      setItems((prev) => prev.filter((item) => item.id !== blockId));
      setSelectedBlock(null);
      setStatusNotice(
        `Đã gỡ bản chặn của bạn với ${partnerName}. Nếu đối tác vẫn chặn bạn, hai người vẫn không thể ghép cặp lại.`,
      );
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      if (handleLifecycleError(err)) {
        return;
      }

      if (err instanceof ApiError && err.status === 404) {
        unblockIntentRef.current = { blockId: '', idempotencyKey: null };
        setItems((prev) => prev.filter((item) => item.id !== blockId));
        setSelectedBlock(null);
        setStatusNotice(
          'Bản chặn này không còn tồn tại trong danh sách của bạn.',
        );
        return;
      }

      const formatted = formatSafetyError(
        err,
        'Chưa gỡ được bản chặn. Vui lòng thử lại.',
      );
      if (!formatted.retryable) {
        unblockIntentRef.current = { blockId: '', idempotencyKey: null };
      }
      setUnblockError({
        message: formatted.message,
        retryable: formatted.retryable,
      });
    } finally {
      unblockPendingRef.current = false;
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setUnblockPending(false);
      }
    }
  };

  const selectedPartnerName = selectedBlock
    ? resolvePartnerDisplayName(selectedBlock.partner)
    : '';

  return (
    <section data-screen-id="SC-18" className="ck-account-page ck-safety-page">
      <div className="ck-account-topbar">
        <Link
          className="ck-brand-lockup"
          to="/home"
          aria-label="Chiikaiwa, trang chính"
        >
          <img src={logo} alt="" />
          <span>Chiikaiwa</span>
        </Link>
        <nav aria-label="Điều hướng tài khoản">
          <Link to="/profile" className="ck-text-button">
            Quay lại hồ sơ
          </Link>
          <Link to="/home" className="ck-button ck-button--secondary">
            Về trang chính
          </Link>
        </nav>
      </div>

      <header className="ck-account-header">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Danh sách chặn</h1>
          <p className="mt-1 text-muted">
            Chỉ hiển thị các bản chặn do bạn tạo. Gỡ chặn chỉ xóa bản chặn của
            bạn; nếu đối tác vẫn chặn bạn, hai người vẫn không thể ghép cặp hoặc
            vào phòng qua mã mời.
          </p>
        </div>
      </header>

      {statusNotice ? (
        <div
          className="ck-alert ck-alert--success"
          role="status"
          aria-live="polite"
        >
          <p>{statusNotice}</p>
        </div>
      ) : null}

      <Card className="ck-safety-card">
        {loading ? (
          <div className="ck-safety-state" role="status" aria-live="polite">
            <p className="text-muted">Đang tải danh sách chặn…</p>
          </div>
        ) : listError ? (
          <div className="ck-alert ck-alert--error" role="alert">
            <div className="ck-alert__body">
              <strong>Không thể tải danh sách chặn</strong>
              <p className="mt-1">{listError}</p>
            </div>
            <Button
              variant="secondary"
              size="compact"
              onClick={handleRetryInitial}
            >
              Thử tải lại
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="ck-safety-empty">
            <Icon name="shield" size={36} />
            <h2>Chưa có ai trong danh sách chặn</h2>
            <p className="text-muted">
              Khi bạn chặn một đối tác trong phiên luyện hoặc từ màn hình tổng
              kết, bản chặn của bạn sẽ xuất hiện tại đây để quản lý.
            </p>
          </div>
        ) : (
          <>
            <ul className="ck-safety-list" aria-label="Các đối tác đã chặn">
              {items.map((item) => {
                const partnerName = resolvePartnerDisplayName(item.partner);
                const isGuestPartner = item.partner.actorKey
                  .toLowerCase()
                  .startsWith('guest:');
                const level = item.partner.profile?.level;

                return (
                  <li key={item.id} className="ck-safety-list__item">
                    <div className="ck-safety-list__partner">
                      <Avatar name={partnerName} size={40} />
                      <div className="ck-safety-list__meta">
                        <div className="ck-safety-list__name-row">
                          <strong className="ck-safety-list__name">
                            {partnerName}
                          </strong>
                          {isGuestPartner ? <Badge>Khách</Badge> : null}
                          {level ? <Badge tone="accent">{level}</Badge> : null}
                        </div>
                        <span className="ck-safety-list__date">
                          Đã chặn lúc {formatSafetyDateTime(item.createdAt)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => openUnblockDialog(item)}
                    >
                      Gỡ chặn
                    </Button>
                  </li>
                );
              })}
            </ul>

            {loadMoreError ? (
              <div className="ck-alert ck-alert--error mt-4" role="alert">
                <div className="ck-alert__body">
                  <p>{loadMoreError}</p>
                </div>
                <Button
                  variant="secondary"
                  size="compact"
                  loading={loadingMore}
                  onClick={() => {
                    void handleLoadMore();
                  }}
                >
                  Thử tải thêm lại
                </Button>
              </div>
            ) : null}

            {nextCursor ? (
              <div className="ck-safety-pagination">
                <Button
                  variant="secondary"
                  size="compact"
                  loading={loadingMore}
                  onClick={() => {
                    void handleLoadMore();
                  }}
                >
                  {loadingMore ? 'Đang tải thêm…' : 'Tải thêm'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Dialog
        open={Boolean(selectedBlock)}
        onClose={closeUnblockDialog}
        title={`Gỡ chặn ${selectedPartnerName}?`}
        description="Thao tác này chỉ gỡ bản chặn do bạn tạo."
        closeLabel="Đóng xác nhận gỡ chặn"
        closeDisabled={unblockPending}
        footer={
          <>
            <Button
              variant="secondary"
              size="compact"
              disabled={unblockPending}
              onClick={closeUnblockDialog}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              size="compact"
              loading={unblockPending}
              onClick={() => {
                void confirmUnblock();
              }}
            >
              {unblockPending
                ? 'Đang gỡ chặn…'
                : unblockError?.retryable
                  ? 'Thử gỡ chặn lại'
                  : 'Xác nhận gỡ chặn'}
            </Button>
          </>
        }
      >
        <div className="ck-safety-unblock-body">
          <p>
            Nếu {selectedPartnerName} vẫn đang chặn bạn ở chiều ngược lại, hai
            người vẫn sẽ không thể ghép cặp tự động hoặc vào phòng qua mã mời.
          </p>
          {unblockError ? (
            <div
              className="ck-safety-alert ck-safety-alert--error"
              role="alert"
            >
              <p>{unblockError.message}</p>
            </div>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}
