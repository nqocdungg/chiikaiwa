import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { FormField, Input } from '../../components/ui/forms.jsx';
import { Avatar, Badge } from '../../components/ui/surfaces.jsx';
import { createIdempotencyKey } from '../../services/api-client.js';
import { getIdentityEpoch } from '../../services/cache.js';
import { ApiError } from '../../services/errors.js';
import { AuthContext } from '../auth/auth-context.js';
import {
  MAX_REPORT_DESCRIPTION_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  REPORT_REASON_SUGGESTIONS,
  countCodePoints,
  createBlock,
  createReport,
  formatSafetyDateTime,
  formatSafetyError,
  resolvePartnerDisplayName,
  validateReportForm,
} from './safety-api.js';
import './safety.css';

const SESSION_EXPIRED_NOTICE =
  'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.';

/**
 * SC-17: Báo cáo và chặn đối tác (tách biệt hai hành động theo 04 SC-17, UF-11, 07 §10).
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   sessionId: string,
 *   partner: import('./safety-api.js').SafetyPartner | null,
 *   inActiveSession?: boolean,
 *   onLeaveRoom?: () => void,
 *   leaving?: boolean,
 *   onBlocked?: (result: { id: string }) => void,
 *   onReported?: (result: import('./safety-api.js').ReportCreatedData) => void,
 *   isGuest?: boolean,
 * }} props
 */
export function SafetyActionDialog(props) {
  if (!props.open) {
    return null;
  }
  return (
    <SafetyActionDialogContent
      key={`${props.sessionId}:${props.partner?.actorKey ?? ''}`}
      {...props}
    />
  );
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   sessionId: string,
 *   partner: import('./safety-api.js').SafetyPartner | null,
 *   inActiveSession?: boolean,
 *   onLeaveRoom?: () => void,
 *   leaving?: boolean,
 *   onBlocked?: (result: { id: string }) => void,
 *   onReported?: (result: import('./safety-api.js').ReportCreatedData) => void,
 *   isGuest?: boolean,
 * }} props
 */
function SafetyActionDialogContent({
  open,
  onClose,
  sessionId,
  partner,
  inActiveSession = false,
  onLeaveRoom,
  leaving = false,
  onBlocked,
  onReported,
  isGuest = false,
}) {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const isMountedRef = useRef(true);
  const reasonInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const descriptionId = useId();

  // Report state
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [reportFieldErrors, setReportFieldErrors] = useState(
    /** @type {Record<string, string>} */ ({}),
  );
  const [reportError, setReportError] = useState(
    /** @type {{ message: string, retryable: boolean } | null} */ (null),
  );
  const [reportPending, setReportPending] = useState(false);
  const [reportReceipt, setReportReceipt] = useState(
    /** @type {import('./safety-api.js').ReportCreatedData | null} */ (null),
  );
  const reportPendingRef = useRef(false);
  const reportIntentRef = useRef(
    /** @type {{ payloadHash: string, idempotencyKey: string | null }} */ ({
      payloadHash: '',
      idempotencyKey: null,
    }),
  );

  // Block state (strictly independent from Report)
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [blockPending, setBlockPending] = useState(false);
  const [blockError, setBlockError] = useState(
    /** @type {{ message: string, retryable: boolean } | null} */ (null),
  );
  const [blockReceipt, setBlockReceipt] = useState(
    /** @type {{ id: string } | null} */ (null),
  );
  const blockPendingRef = useRef(false);
  const blockIntentRef = useRef(
    /** @type {{ payloadHash: string, idempotencyKey: string | null }} */ ({
      payloadHash: '',
      idempotencyKey: null,
    }),
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const partnerName = resolvePartnerDisplayName(partner);
  const targetActorKey = partner?.actorKey ?? '';
  const isBusy = reportPending || blockPending;

  /**
   * Handles auth/account/guest lifecycle errors consistently across report & block actions.
   * @param {unknown} err
   * @returns {boolean} true if handled via navigation/auth transition
   */
  const handleLifecycleError = (err) => {
    if (!(err instanceof ApiError)) {
      return false;
    }
    if (err.isGuestExpired()) {
      navigate('/expired', { replace: true });
      return true;
    }
    if (err.isAuthRequired()) {
      auth?.invalidateSession?.(SESSION_EXPIRED_NOTICE);
      navigate('/login', { replace: true });
      return true;
    }
    if (err.code === 'ACCOUNT_LOCKED') {
      auth?.updateUser?.({ status: 'locked' });
      return false;
    }
    return false;
  };

  /**
   * Updates report reason and clears stale retry intent when user changes intent.
   * @param {string} nextValue
   */
  const handleReasonChange = (nextValue) => {
    setReason(nextValue);
    setReportError(null);
    setReportReceipt(null);
    reportIntentRef.current = { payloadHash: '', idempotencyKey: null };
    setReportFieldErrors((prev) => {
      if (!prev.reason) return prev;
      const copy = { ...prev };
      delete copy.reason;
      return copy;
    });
  };

  /**
   * Updates report description and clears stale retry intent when user changes intent.
   * @param {string} nextValue
   */
  const handleDescriptionChange = (nextValue) => {
    setDescription(nextValue);
    setReportError(null);
    setReportReceipt(null);
    reportIntentRef.current = { payloadHash: '', idempotencyKey: null };
    setReportFieldErrors((prev) => {
      if (!prev.description) return prev;
      const copy = { ...prev };
      delete copy.description;
      return copy;
    });
  };

  /**
   * Submits POST /api/v1/reports, preserving Idempotency-Key on retryable errors.
   * @param {import('react').FormEvent<HTMLFormElement> | null} [event]
   */
  const submitReport = async (event = null) => {
    event?.preventDefault();
    if (reportPendingRef.current || !sessionId || !targetActorKey) {
      return;
    }

    const validation = validateReportForm({ reason, description });
    if (!validation.valid) {
      setReportFieldErrors(validation.fieldErrors);
      setReportError(null);
      return;
    }

    setReportFieldErrors({});
    setReportError(null);

    const payloadHash = JSON.stringify({
      sessionId,
      targetActorKey,
      reason: validation.reason,
      description: validation.description ?? '',
    });

    let idempotencyKey = reportIntentRef.current.idempotencyKey;
    if (
      !idempotencyKey ||
      reportIntentRef.current.payloadHash !== payloadHash
    ) {
      idempotencyKey = createIdempotencyKey();
      reportIntentRef.current = { payloadHash, idempotencyKey };
    }

    const startEpoch = getIdentityEpoch();
    reportPendingRef.current = true;
    setReportPending(true);

    try {
      const response = await createReport({
        sessionId,
        targetActorKey,
        reason: validation.reason,
        description: validation.description,
        idempotencyKey,
      });
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      reportIntentRef.current = { payloadHash: '', idempotencyKey: null };
      setReportReceipt(response.data);
      setReportError(null);
      setReportFieldErrors({});
      onReported?.(response.data);
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      if (handleLifecycleError(err)) {
        return;
      }

      const formatted = formatSafetyError(
        err,
        'Chưa gửi được báo cáo. Vui lòng thử lại.',
      );
      if (!formatted.retryable) {
        reportIntentRef.current = { payloadHash: '', idempotencyKey: null };
      }
      if (Object.keys(formatted.fieldErrors).length > 0) {
        setReportFieldErrors(formatted.fieldErrors);
      }
      setReportError({
        message: formatted.message,
        retryable: formatted.retryable,
      });
    } finally {
      reportPendingRef.current = false;
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setReportPending(false);
      }
    }
  };

  /**
   * Submits POST /api/v1/me/blocks (strictly separate from report),
   * preserving Idempotency-Key on retryable errors.
   */
  const submitBlock = async () => {
    if (blockPendingRef.current || !sessionId || !targetActorKey) {
      return;
    }

    setBlockError(null);

    const payloadHash = JSON.stringify({ sessionId, targetActorKey });
    let idempotencyKey = blockIntentRef.current.idempotencyKey;
    if (!idempotencyKey || blockIntentRef.current.payloadHash !== payloadHash) {
      idempotencyKey = createIdempotencyKey();
      blockIntentRef.current = { payloadHash, idempotencyKey };
    }

    const startEpoch = getIdentityEpoch();
    blockPendingRef.current = true;
    setBlockPending(true);

    try {
      const response = await createBlock({
        sessionId,
        targetActorKey,
        idempotencyKey,
      });
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }

      blockIntentRef.current = { payloadHash: '', idempotencyKey: null };
      setBlockReceipt(response.data);
      setConfirmingBlock(false);
      setBlockError(null);
      onBlocked?.(response.data);
    } catch (err) {
      if (!isMountedRef.current || startEpoch !== getIdentityEpoch()) {
        return;
      }
      if (handleLifecycleError(err)) {
        return;
      }

      const formatted = formatSafetyError(
        err,
        'Chưa thực hiện được thao tác chặn. Vui lòng thử lại.',
      );
      if (!formatted.retryable) {
        blockIntentRef.current = { payloadHash: '', idempotencyKey: null };
      }
      setBlockError({
        message: formatted.message,
        retryable: formatted.retryable,
      });
    } finally {
      blockPendingRef.current = false;
      if (isMountedRef.current && startEpoch === getIdentityEpoch()) {
        setBlockPending(false);
      }
    }
  };

  const reasonLength = countCodePoints(reason.trim());
  const descriptionLength = countCodePoints(description);
  const descriptionError = reportFieldErrors.description;
  const descriptionDescribedBy = descriptionError
    ? `${descriptionId}-error`
    : `${descriptionId}-helper`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="form"
      friendly
      className="ck-safety-modal"
      title="An toàn trong phiên"
      description="Báo cáo và chặn là hai thao tác độc lập. Bạn có thể chọn một trong hai hoặc rời phòng bất cứ lúc nào."
      closeLabel="Đóng hộp thoại an toàn"
      closeDisabled={isBusy}
      initialFocusRef={reasonInputRef}
      footerClassName="ck-safety-dialog__footer"
      footer={
        <>
          {inActiveSession && onLeaveRoom ? (
            <Button
              variant="danger"
              size="compact"
              onClick={onLeaveRoom}
              disabled={leaving}
            >
              {leaving ? 'Đang rời phòng…' : 'Rời phòng'}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="compact"
            onClick={onClose}
            disabled={isBusy}
          >
            Đóng
          </Button>
        </>
      }
    >
      <div className="ck-safety-dialog" data-screen-id="SC-17">
        {/* Target context summary (server-verified session & partner) */}
        <div className="ck-safety-target">
          <Avatar name={partnerName} size={40} />
          <div className="ck-safety-target__info">
            <span className="ck-safety-target__label">Đối tác trong phiên</span>
            <strong className="ck-safety-target__name">{partnerName}</strong>
          </div>
          {partner?.actorKey?.toLowerCase().startsWith('guest:') ? (
            <Badge>Khách</Badge>
          ) : null}
        </div>

        {/* Section 1: Report Partner */}
        <section
          className="ck-safety-section"
          aria-labelledby="ck-safety-report-heading"
        >
          <div className="ck-safety-section__head">
            <h3 id="ck-safety-report-heading" className="ck-safety-heading">
              Báo cáo đối tác
            </h3>
            <p className="ck-safety-note">
              Gửi báo cáo không tự động chặn đối tác và không kết thúc phiên
              hiện tại. Hệ thống không hỗ trợ tệp đính kèm hay ghi âm cuộc gọi.
            </p>
          </div>

          {reportReceipt ? (
            <div
              className="ck-safety-alert ck-safety-alert--success"
              role="status"
              aria-live="polite"
            >
              <strong>Báo cáo đã được tiếp nhận.</strong>
              <p>
                Mã tiếp nhận: <code>{reportReceipt.id}</code> · Thời điểm:{' '}
                {formatSafetyDateTime(reportReceipt.createdAt)}. Quản trị viên
                sẽ xem xét theo quy trình; thao tác này không tự chặn đối tác.
              </p>
            </div>
          ) : (
            <form
              className="ck-safety-form"
              onSubmit={(event) => {
                void submitReport(event);
              }}
              noValidate
            >
              {reportError ? (
                <div
                  className="ck-safety-alert ck-safety-alert--error"
                  role="alert"
                >
                  <p>{reportError.message}</p>
                  {reportError.retryable ? (
                    <div className="ck-safety-alert__actions">
                      <Button
                        variant="secondary"
                        size="compact"
                        loading={reportPending}
                        onClick={() => {
                          void submitReport();
                        }}
                      >
                        Thử gửi lại
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div
                className="ck-safety-suggestions"
                role="group"
                aria-label="Gợi ý lý do nhanh"
              >
                {REPORT_REASON_SUGGESTIONS.map((suggestion) => {
                  const selected = reason.trim() === suggestion;
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      className={`ck-safety-chip ${selected ? 'ck-safety-chip--selected' : ''}`}
                      aria-pressed={selected}
                      disabled={reportPending}
                      onClick={() => handleReasonChange(suggestion)}
                    >
                      {suggestion}
                    </button>
                  );
                })}
              </div>

              <Input
                inputRef={reasonInputRef}
                id="ck-safety-report-reason"
                name="reason"
                label="Lý do báo cáo"
                required
                value={reason}
                disabled={reportPending}
                onChange={(event) => handleReasonChange(event.target.value)}
                placeholder="Nhập hoặc chọn lý do báo cáo"
                error={reportFieldErrors.reason}
                helperText={`${reasonLength}/${MAX_REPORT_REASON_LENGTH} ký tự`}
              />

              <FormField
                label="Mô tả chi tiết (tùy chọn)"
                htmlFor={descriptionId}
                error={descriptionError}
                helperText={`${descriptionLength}/${MAX_REPORT_DESCRIPTION_LENGTH} ký tự · Văn bản thuần, không đính kèm tệp.`}
              >
                <textarea
                  id={descriptionId}
                  name="description"
                  className="ck-input ck-safety-textarea"
                  rows={3}
                  value={description}
                  disabled={reportPending}
                  onChange={(event) =>
                    handleDescriptionChange(event.target.value)
                  }
                  placeholder="Mô tả ngắn gọn tình huống xảy ra (không bắt buộc)"
                  aria-invalid={descriptionError ? 'true' : undefined}
                  aria-describedby={descriptionDescribedBy}
                />
              </FormField>

              <div className="ck-safety-form__actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="compact"
                  loading={reportPending}
                  disabled={!sessionId || !targetActorKey}
                >
                  {reportPending ? 'Đang gửi báo cáo…' : 'Gửi báo cáo'}
                </Button>
              </div>
            </form>
          )}
        </section>

        {/* Section 2: Block Partner (strictly independent action) */}
        <section
          className="ck-safety-section ck-safety-section--danger"
          aria-labelledby="ck-safety-block-heading"
        >
          <div className="ck-safety-section__head">
            <h3 id="ck-safety-block-heading" className="ck-safety-heading">
              Chặn đối tác
            </h3>
            <p className="ck-safety-note">
              {inActiveSession
                ? 'Chặn đối tác sẽ kết thúc phiên hiện tại cho cả hai người và ngăn ghép cặp lại qua cả tìm bạn tự động lẫn mã mời.'
                : 'Chặn đối tác sẽ ngăn hai người ghép cặp lại qua cả tìm bạn tự động lẫn mã mời.'}
            </p>
            {isGuest ? (
              <p className="ck-safety-note">
                Lưu ý: Chặn bằng quyền khách chỉ áp dụng trong phạm vi lượt thử
                hiện tại.
              </p>
            ) : null}
          </div>

          {blockError ? (
            <div
              className="ck-safety-alert ck-safety-alert--error"
              role="alert"
            >
              <p>{blockError.message}</p>
              {blockError.retryable ? (
                <div className="ck-safety-alert__actions">
                  <Button
                    variant="danger"
                    size="compact"
                    loading={blockPending}
                    onClick={() => {
                      void submitBlock();
                    }}
                  >
                    Thử chặn lại
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {blockReceipt ? (
            <div
              className="ck-safety-alert ck-safety-alert--success"
              role="status"
              aria-live="polite"
            >
              <strong>Đã chặn {partnerName}.</strong>
              <p>
                {inActiveSession
                  ? 'Phiên hiện tại sẽ kết thúc cho cả hai. Bạn có thể quản lý bản chặn trong Danh sách chặn.'
                  : 'Hai người sẽ không thể ghép cặp hoặc vào phòng qua mã mời. Bạn có thể gỡ bản chặn của mình trong Danh sách chặn.'}
              </p>
            </div>
          ) : confirmingBlock ? (
            <div
              className="ck-safety-confirm"
              role="region"
              aria-label="Xác nhận chặn đối tác"
            >
              <p className="ck-safety-confirm__text">
                <Icon name="shield" size={18} />
                <span>
                  {inActiveSession
                    ? `Xác nhận chặn ${partnerName}? Phiên luyện hiện tại sẽ kết thúc ngay cho cả hai người.`
                    : `Xác nhận chặn ${partnerName}? Hai người sẽ không thể ghép cặp lại cho đến khi bản chặn được gỡ.`}
                </span>
              </p>
              <div className="ck-safety-confirm__actions">
                <Button
                  variant="danger"
                  size="compact"
                  loading={blockPending}
                  onClick={() => {
                    void submitBlock();
                  }}
                >
                  {blockPending ? 'Đang chặn…' : 'Xác nhận chặn'}
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={blockPending}
                  onClick={() => {
                    setConfirmingBlock(false);
                    setBlockError(null);
                    blockIntentRef.current = {
                      payloadHash: '',
                      idempotencyKey: null,
                    };
                  }}
                >
                  Hủy
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                variant="danger"
                size="compact"
                disabled={blockPending || !sessionId || !targetActorKey}
                onClick={() => {
                  setConfirmingBlock(true);
                  setBlockError(null);
                }}
              >
                Chặn {partnerName}
              </Button>
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}
