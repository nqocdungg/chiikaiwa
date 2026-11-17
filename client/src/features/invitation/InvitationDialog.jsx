import { useRef, useState } from 'react';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Countdown } from '../../components/ui/Countdown.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/forms.jsx';
import { Avatar, Badge } from '../../components/ui/surfaces.jsx';
import {
  isValidInvitationCode,
  normalizeInvitationCode,
} from './invitation-api.js';
import './invitation.css';
import { useInvitationFlow } from './use-invitation-flow.js';

/** @param {{notice: {tone?: string, message: string, retry?: () => void, field?: string}|null}} props */
function InvitationNotice({ notice }) {
  if (!notice || notice.field === 'code') return null;
  return (
    <div
      className={`ck-invitation-notice ck-invitation-notice--${notice.tone ?? 'info'}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.message}</span>
      {notice.retry ? (
        <Button variant="secondary" size="compact" onClick={notice.retry}>
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}

/** @param {{flow: ReturnType<typeof useInvitationFlow>, inputRef: import('react').RefObject<HTMLInputElement|null>}} props */
function JoinCodeView({ flow, inputRef }) {
  const [code, setCode] = useState('');
  const normalizedCode = normalizeInvitationCode(code);
  const isValid = isValidInvitationCode(normalizedCode);
  const isSubmitting = flow.pendingAction === 'join-code';
  return (
    <form
      className="ck-invitation-form"
      onSubmit={(event) => {
        event.preventDefault();
        void flow.submitCode(normalizedCode);
      }}
    >
      <Input
        inputRef={inputRef}
        id="invitation-code"
        label="Mã mời"
        value={code}
        maxLength={10}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck="false"
        placeholder="VD: ABCD234567"
        error={flow.notice?.field === 'code' ? flow.notice.message : undefined}
        onChange={(event) => {
          setCode(event.target.value.toUpperCase());
          if (flow.notice?.field === 'code') flow.setNotice(null);
        }}
      />
      <InvitationNotice notice={flow.notice} />
      <div className="ck-invitation-actions ck-invitation-actions--start">
        <Button
          type="submit"
          variant="primary"
          disabled={!isValid}
          loading={isSubmitting}
        >
          Gửi yêu cầu tham gia
        </Button>
        <Button variant="ghost" onClick={flow.handleClose}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

/** @param {{flow: ReturnType<typeof useInvitationFlow>}} props */
function HostWaitingView({ flow }) {
  const [copyState, setCopyState] = useState('');
  const invitation = flow.invitation;
  if (!invitation) return null;
  const invitationCode = invitation.code;

  async function copyCode() {
    if (!invitationCode) return;
    try {
      await navigator.clipboard.writeText(invitationCode);
      setCopyState('Đã sao chép mã.');
    } catch {
      setCopyState('Chưa sao chép được. Hãy chọn và sao chép mã thủ công.');
    }
  }

  return (
    <>
      <div className="ck-invitation-code-card">
        <Countdown
          className="ck-invitation-countdown"
          expiresAt={invitation.expiresAt}
          serverTime={flow.serverTime}
          onExpire={flow.syncHost}
        />
        <strong>{invitationCode}</strong>
        <Button
          className="ck-invitation-copy"
          variant="ghost"
          size="compact"
          leadingIcon={<Icon name="copy" size={18} />}
          onClick={copyCode}
        >
          Sao chép mã
        </Button>
      </div>
      {copyState ? (
        <p className="ck-invitation-copy-status" role="status">
          {copyState}
        </p>
      ) : null}
      <div className="ck-invitation-waiting" role="status" aria-live="polite">
        <span className="ck-invitation-waiting__indicator" aria-hidden="true">
          <span />
        </span>
        <span>
          <strong>Đang chờ yêu cầu tham gia</strong>
          <small>Yêu cầu mới sẽ tự động xuất hiện tại đây.</small>
        </span>
      </div>
      <InvitationNotice notice={flow.notice} />
      <div className="ck-invitation-actions ck-invitation-actions--end">
        <Button
          variant="secondary"
          loading={flow.pendingAction === 'cancel-invitation'}
          onClick={() => void flow.cancelInvitation()}
        >
          Hủy mã mời
        </Button>
      </div>
    </>
  );
}

/** @param {{flow: ReturnType<typeof useInvitationFlow>}} props */
function HostRequestView({ flow }) {
  const request = flow.requests[0];
  if (!request) return <HostWaitingView flow={flow} />;
  const level =
    typeof request.requester.profile?.level === 'string'
      ? request.requester.profile.level
      : '';
  const isRejecting = flow.pendingAction.startsWith('reject-request');
  const isAccepting = flow.pendingAction.startsWith('accept-request');
  return (
    <>
      <div className="ck-invitation-request-card">
        <Avatar name={request.requester.displayName} size={48} />
        <div className="ck-invitation-request-card__identity">
          <strong>{request.requester.displayName}</strong>
          <small>
            {[level, 'Vừa nhập mã mời'].filter(Boolean).join(' · ')}
          </small>
        </div>
        <Badge tone="accent">{flow.requests.length} yêu cầu</Badge>
      </div>
      <InvitationNotice notice={flow.notice} />
      <div className="ck-invitation-actions ck-invitation-actions--split">
        <Button
          variant="secondary"
          loading={isRejecting}
          disabled={isAccepting}
          onClick={() => void flow.respond('reject')}
        >
          Từ chối
        </Button>
        <Button
          variant="primary"
          loading={isAccepting}
          disabled={isRejecting}
          leadingIcon={<Icon name="check" />}
          onClick={() => void flow.respond('accept')}
        >
          Chấp nhận
        </Button>
      </div>
    </>
  );
}

/** @param {{flow: ReturnType<typeof useInvitationFlow>}} props */
function RequestWaitingView({ flow }) {
  const request = flow.inviteRequest;
  if (!request) return null;
  return (
    <>
      <div className="ck-invitation-request-waiting">
        <span
          className="ck-invitation-request-waiting__icon"
          aria-hidden="true"
        >
          <Icon name="clock" size={26} />
        </span>
        <strong>Yêu cầu đã được gửi</strong>
        <p>Chưa thể vào phòng cho tới khi chủ phòng chấp nhận.</p>
        <Countdown
          expiresAt={request.expiresAt}
          serverTime={flow.serverTime}
          onExpire={flow.syncRequester}
        />
      </div>
      <InvitationNotice notice={flow.notice} />
      <div className="ck-invitation-actions ck-invitation-actions--center">
        <Button
          variant="secondary"
          loading={flow.pendingAction === 'cancel-request'}
          onClick={() => void flow.cancelRequest()}
        >
          Hủy yêu cầu
        </Button>
      </div>
    </>
  );
}

/** @param {{flow: ReturnType<typeof useInvitationFlow>}} props */
function EndedView({ flow }) {
  const isHost = Boolean(flow.invitation);
  const copy = {
    rejected: {
      title: 'Yêu cầu chưa được chấp nhận',
      description: 'Bạn có thể nhập một mã khác khi đã sẵn sàng.',
    },
    expired: {
      title: 'Mã mời đã hết hạn',
      description: 'Chiikaiwa sẽ không tự giữ chỗ hoặc tạo yêu cầu mới.',
    },
    used: {
      title: 'Phòng mời đã đóng',
      description: 'Mã này không nhận thêm yêu cầu tham gia.',
    },
    cancelled: {
      title: 'Đã dừng tại đây',
      description: 'Chiikaiwa sẽ không tự tìm lại hoặc giữ chỗ cũ.',
    },
  }[flow.endedReason] ?? {
    title: 'Đã dừng tại đây',
    description: 'Chiikaiwa sẽ không tự tìm lại hoặc giữ chỗ cũ.',
  };

  return (
    <div className="ck-invitation-ended">
      <p>{copy.description}</p>
      <InvitationNotice notice={flow.notice} />
      <div className="ck-invitation-actions ck-invitation-actions--center">
        {isHost ? (
          <Button
            variant="primary"
            loading={flow.pendingAction === 'create-invitation'}
            onClick={() => void flow.createHostInvitation()}
          >
            Tạo mã mới
          </Button>
        ) : (
          <Button variant="primary" onClick={flow.resetJoin}>
            Nhập mã khác
          </Button>
        )}
        <Button variant="ghost" onClick={flow.goHome}>
          Về trang chủ
        </Button>
      </div>
      <span className="sr-only">{copy.title}</span>
    </div>
  );
}

export function InvitationDialog() {
  const flow = useInvitationFlow();
  const inputRef = useRef(null);
  const isPending = Boolean(flow.pendingAction);
  /** @type {string} */
  let eyebrow;
  /** @type {string} */
  let title;
  let description = '';
  let align = 'start';
  let headingAdornment;
  let content;

  if (flow.phase === 'loading') {
    eyebrow = 'Phòng riêng';
    title = 'Đang mở phòng mời';
    description = 'Đang đồng bộ trạng thái hiện tại của bạn.';
    content = (
      <>
        <p className="ck-invitation-loading">Vui lòng chờ…</p>
        <InvitationNotice notice={flow.notice} />
      </>
    );
  } else if (flow.phase === 'join') {
    eyebrow =
      flow.kind === 'unauthenticated'
        ? 'Tham gia với vai trò khách'
        : 'Tham gia phòng riêng';
    title = 'Nhập mã mời';
    description =
      flow.kind === 'unauthenticated'
        ? 'Khách gửi yêu cầu bằng mã và chờ chủ phòng chấp nhận.'
        : 'Gửi yêu cầu bằng mã và chờ chủ phòng chấp nhận.';
    content = <JoinCodeView flow={flow} inputRef={inputRef} />;
  } else if (flow.phase === 'hostWaiting') {
    eyebrow = 'Phòng riêng · 1 người bạn';
    title = 'Mời bạn cùng luyện';
    description =
      'Gửi mã này cho một người. Phòng sẽ khóa khi bạn chấp nhận yêu cầu.';
    content = <HostWaitingView flow={flow} />;
  } else if (flow.phase === 'hostRequest') {
    eyebrow = 'Có người xin vào';
    title = 'Một yêu cầu mới';
    description = 'Chỉ một người có thể vào phòng bằng mã này.';
    content = <HostRequestView flow={flow} />;
  } else if (flow.phase === 'requestWaiting') {
    eyebrow = 'Đang chờ chấp nhận';
    title = 'Chờ chủ phòng phản hồi';
    description = 'Yêu cầu đang giữ chỗ; bạn có thể hủy nếu không muốn chờ.';
    content = <RequestWaitingView flow={flow} />;
  } else {
    const endedTitle =
      flow.endedReason === 'rejected'
        ? 'Yêu cầu chưa được chấp nhận'
        : flow.endedReason === 'expired'
          ? 'Mã mời đã hết hạn'
          : flow.endedReason === 'used'
            ? 'Phòng mời đã đóng'
            : 'Đã dừng tại đây';
    eyebrow = 'Lượt chờ đã kết thúc';
    title = endedTitle;
    align = 'center';
    headingAdornment = (
      <span className="ck-invitation-ended-icon" aria-hidden="true">
        <Icon name="close" size={25} />
      </span>
    );
    content = <EndedView flow={flow} />;
  }

  return (
    <Dialog
      open
      onClose={flow.handleClose}
      title={title}
      eyebrow={eyebrow}
      description={description}
      headingAdornment={headingAdornment}
      size="form"
      friendly
      align={/** @type {'start'|'center'} */ (align)}
      className="ck-invitation-dialog"
      closeLabel="Đóng luồng phòng mời"
      closeDisabled={isPending}
      closeOnBackdrop={false}
      initialFocusRef={flow.phase === 'join' ? inputRef : undefined}
    >
      {content}
    </Dialog>
  );
}
