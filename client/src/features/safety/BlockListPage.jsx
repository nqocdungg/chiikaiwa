import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Avatar, Card } from '../../components/ui/surfaces.jsx';
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
 * SC-18: Danh sách đã chặn của người học (04 SC-18, UF-11, 07 §10, Figma 80-1304).
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
    <section
      data-screen-id="SC-18"
      className="ck-account-page ck-safety-page ck-safety-page--blocks"
    >
      <div className="ck-safety-layout">
        <aside className="ck-safety-sidebar" aria-label="Cài đặt tài khoản">
          <div className="ck-safety-sidebar__head">
            <p className="ck-safety-eyebrow" lang="ja">
              アカウント
            </p>
            <h2 className="ck-safety-sidebar__title">Tài khoản</h2>
          </div>

          <nav
            className="ck-safety-sidebar__nav"
            aria-label="Điều hướng tài khoản"
          >
            <Link to="/profile" className="ck-safety-sidebar__item">
              <strong>Hồ sơ của tôi</strong>
              <small>Thông tin công khai</small>
            </Link>
            <Link
              to="/profile#profile-section-heading"
              className="ck-safety-sidebar__item"
            >
              <strong>Chỉnh sửa hồ sơ</strong>
              <small>Tên, trình độ, chủ đề</small>
            </Link>
            <Link
              to="/profile#password-change-section-heading"
              className="ck-safety-sidebar__item"
            >
              <strong>Đổi mật khẩu</strong>
              <small>Bảo mật tài khoản</small>
            </Link>
            <Link
              to="/blocks"
              aria-current="page"
              className="ck-safety-sidebar__item ck-safety-sidebar__item--active"
            >
              <strong>Danh sách đã chặn</strong>
              <small>Quản lý người đã chặn</small>
            </Link>
          </nav>
        </aside>

        <div className="ck-safety-main">
          <header className="ck-safety-header">
            <p className="ck-safety-eyebrow" lang="ja">
              ブロックリスト
            </p>
            <h1 className="ck-safety-title">Danh sách đã chặn</h1>
            <p className="ck-safety-subtitle">
              Những người trong danh sách này không thể tìm hoặc gửi yêu cầu
              luyện nói cho bạn.
            </p>
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
              <div className="ck-safety-state-pad">
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
              </div>
            ) : items.length === 0 ? (
              <div className="ck-safety-empty">
                <Icon name="shield" size={36} />
                <h2>Chưa có ai trong danh sách chặn</h2>
                <p className="text-muted">
                  Khi bạn chặn một đối tác trong phiên luyện hoặc từ màn hình
                  tổng kết, bản chặn của bạn sẽ xuất hiện tại đây để quản lý.
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
                          <Avatar
                            name={partnerName}
                            size={40}
                            className="ck-safety-list__avatar"
                          />
                          <div className="ck-safety-list__meta">
                            <strong className="ck-safety-list__name">
                              {partnerName}
                            </strong>
                            <span
                              className="ck-safety-list__sub"
                              title={`Đã chặn lúc ${formatSafetyDateTime(item.createdAt)}`}
                            >
                              {isGuestPartner && level ? (
                                <>
                                  <span>Khách</span> · Trình độ{' '}
                                  <span>{level}</span>
                                </>
                              ) : level ? (
                                <>
                                  Trình độ <span>{level}</span>
                                </>
                              ) : isGuestPartner ? (
                                <span>Khách</span>
                              ) : (
                                <>
                                  Đã chặn lúc{' '}
                                  {formatSafetyDateTime(item.createdAt)}
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="compact"
                          className="ck-safety-unblock-btn"
                          onClick={() => openUnblockDialog(item)}
                        >
                          Bỏ chặn
                        </Button>
                      </li>
                    );
                  })}
                </ul>

                {loadMoreError ? (
                  <div className="ck-safety-state-pad">
                    <div className="ck-alert ck-alert--error" role="alert">
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
        </div>
      </div>

      <Dialog
        friendly
        size="compact"
        className="ck-safety-modal"
        open={Boolean(selectedBlock)}
        onClose={closeUnblockDialog}
        title={`Bỏ chặn ${selectedPartnerName}?`}
        description="Thao tác này chỉ gỡ bản chặn do bạn tạo."
        closeLabel="Đóng xác nhận bỏ chặn"
        closeDisabled={unblockPending}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={unblockPending}
              onClick={closeUnblockDialog}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={unblockPending}
              onClick={() => {
                void confirmUnblock();
              }}
            >
              {unblockPending
                ? 'Đang bỏ chặn…'
                : unblockError?.retryable
                  ? 'Thử bỏ chặn lại'
                  : 'Xác nhận bỏ chặn'}
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
