import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Select } from '../../components/ui/forms.jsx';
import { Avatar, Badge } from '../../components/ui/surfaces.jsx';
import { getCatalogLabel } from './matching-api.js';
import { useMatchingFlow } from './use-matching-flow.js';
import './matching.css';

const COUNTDOWN_SEGMENTS = 30;
const RING_RADIUS = 38;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Cute line-art Chiikawa head mark matching Figma `Enter Kaiwa / 02 · Đang tìm` (4-914).
 */
function SearchingMascotGlyph() {
  return (
    <svg
      className="ck-match-mascot-glyph"
      width="64"
      height="56"
      viewBox="0 0 64 56"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M17 17C14 9 20 5 25 10C29 8.5 35 8.5 39 10C44 5 50 9 47 17C52 21 54 29 51 37C48 45 40 48 32 48C24 48 16 45 13 37C10 29 12 21 17 17Z"
        fill="#FFFFFF"
        stroke="#3B2A30"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse cx="19.5" cy="31.5" rx="4" ry="2.6" fill="#F4B6C9" />
      <ellipse cx="44.5" cy="31.5" rx="4" ry="2.6" fill="#F4B6C9" />
      <circle cx="24" cy="26" r="2.2" fill="#3B2A30" />
      <circle cx="40" cy="26" r="2.2" fill="#3B2A30" />
      <path
        d="M27.5 31.5C28.7 33.4 30.8 33.4 32 31.2C33.2 33.4 35.3 33.4 36.5 31.5"
        stroke="#3B2A30"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 88x88 countdown per Figma `SegmentedCountdown` (31-8195) and waiting ring (11-5422).
 * Computes remaining time from server-derived expiresAt/serverTime without
 * treating the browser timer as an authorization decision.
 *
 * @param {{
 *   expiresAt: string,
 *   serverTime?: string,
 *   totalSeconds?: number,
 *   variant?: 'segmented' | 'ring',
 *   onExpire?: () => void,
 * }} props
 */
function SegmentedCountdown({
  expiresAt,
  serverTime,
  totalSeconds = 30,
  variant = 'segmented',
  onExpire,
}) {
  const [remaining, setRemaining] = useState(
    /** @type {number | null} */ (null),
  );
  const notifiedExpiryRef = useRef('');

  useEffect(() => {
    const expiry = Date.parse(expiresAt);
    const parsedServerTime = serverTime ? Date.parse(serverTime) : Number.NaN;
    const offset = Number.isFinite(parsedServerTime)
      ? parsedServerTime - Date.now()
      : 0;
    const tick = () => {
      const next = Number.isFinite(expiry)
        ? Math.min(
            totalSeconds,
            Math.max(0, Math.ceil((expiry - (Date.now() + offset)) / 1000)),
          )
        : 0;
      setRemaining(next);
    };
    const firstTick = globalThis.setTimeout(tick, 0);
    const timer = globalThis.setInterval(tick, 1000);
    return () => {
      globalThis.clearTimeout(firstTick);
      globalThis.clearInterval(timer);
    };
  }, [expiresAt, serverTime, totalSeconds]);

  useEffect(() => {
    if (
      remaining !== null &&
      remaining === 0 &&
      onExpire &&
      notifiedExpiryRef.current !== expiresAt
    ) {
      notifiedExpiryRef.current = expiresAt;
      onExpire();
    }
  }, [expiresAt, onExpire, remaining]);

  const activeSegments =
    remaining === null
      ? COUNTDOWN_SEGMENTS
      : Math.ceil((remaining / totalSeconds) * COUNTDOWN_SEGMENTS);
  const ratio =
    remaining === null ? 1 : Math.max(0, Math.min(1, remaining / totalSeconds));
  const dashOffset = RING_CIRCUMFERENCE * (1 - ratio);
  const displayValue =
    remaining === null ? '--' : String(remaining).padStart(2, '0');
  const accessibleLabel =
    remaining === null
      ? 'Đang tính thời gian còn lại'
      : `Còn ${remaining} giây để xác nhận`;

  return (
    <div
      className={
        variant === 'ring'
          ? 'ck-match-segmented-countdown ck-match-segmented-countdown--ring'
          : 'ck-match-segmented-countdown'
      }
      role="timer"
      aria-label={accessibleLabel}
    >
      <svg
        className="ck-match-segmented-countdown__ring"
        width="88"
        height="88"
        viewBox="0 0 88 88"
        aria-hidden="true"
      >
        {variant === 'ring' ? (
          <>
            <circle
              cx="44"
              cy="44"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="4.5"
              className="ck-match-segmented-countdown__track"
            />
            <circle
              cx="44"
              cy="44"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 44 44)"
              className="ck-match-segmented-countdown__arc"
            />
          </>
        ) : (
          Array.from({ length: COUNTDOWN_SEGMENTS }, (_, index) => {
            const angleDeg = index * (360 / COUNTDOWN_SEGMENTS);
            const isActive = index < activeSegments;
            return (
              <line
                key={index}
                x1="44"
                y1="6.5"
                x2="44"
                y2="14"
                strokeWidth="2.6"
                strokeLinecap="round"
                transform={`rotate(${angleDeg} 44 44)`}
                className={
                  isActive
                    ? 'ck-match-segmented-countdown__seg--active'
                    : 'ck-match-segmented-countdown__seg'
                }
              />
            );
          })
        )}
      </svg>
      <span className="ck-match-segmented-countdown__value" aria-hidden="true">
        <strong>{displayValue}</strong>
        <small>giây</small>
      </span>
    </div>
  );
}

/** @param {number} ms */
function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** @param {{ notice: import('./use-matching-flow.js').MatchNotice | null }} props */
function MatchNoticeBanner({ notice }) {
  if (!notice) return null;
  const tone = notice.tone ?? 'info';
  return (
    <div
      className={`ck-match-notice ck-match-notice--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
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

/**
 * Optional, non-blocking device check per SC-05 & Figma `29-6405`.
 * Never requests media permission on mount and never blocks searching.
 */
function OptionalDeviceCheck() {
  const [status, setStatus] = useState(
    /** @type {'idle' | 'checking' | 'ready' | 'denied' | 'unavailable'} */ (
      'idle'
    ),
  );
  const [detail, setDetail] = useState('');
  const streamRef = useRef(/** @type {MediaStream | null} */ (null));

  const stopTracks = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  };

  useEffect(() => stopTracks, []);

  async function runCheck() {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setStatus('unavailable');
      setDetail(
        'Trình duyệt hiện không hỗ trợ kiểm tra thiết bị. Bạn vẫn có thể tìm bạn và vào phòng bằng chat.',
      );
      return;
    }
    setStatus('checking');
    setDetail('');
    stopTracks();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;
      stopTracks();
      setStatus('ready');
      setDetail(
        'Micro đã sẵn sàng. Bạn có thể bật hoặc tắt chủ động khi vào phòng.',
      );
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('denied');
        setDetail(
          'Quyền micro đang bị từ chối trong trình duyệt. Bạn vẫn có thể tìm bạn và tham gia phòng bình thường.',
        );
      } else {
        setStatus('unavailable');
        setDetail(
          'Không tìm thấy micro khả dụng. Bạn vẫn có thể tiếp tục tìm bạn và dùng chat trong phòng.',
        );
      }
    }
  }

  return (
    <div className="ck-match-device-box">
      <div className="ck-match-device-box__row">
        <div className="ck-match-device-box__lead">
          <span className="ck-match-device-box__icons" aria-hidden="true">
            <Icon name="mic" size={16} />
            <Icon name="camera" size={16} />
          </span>
          <div>
            <strong>Kiểm tra mic/cam sau</strong>
            <p className="ck-match-device-box__status">
              Không thiết bị nào tự bật. Bạn có thể bỏ qua trước khi kết nối.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="compact"
          loading={status === 'checking'}
          onClick={() => void runCheck()}
        >
          {status === 'ready' ? 'Kiểm tra lại micro' : 'Kiểm tra micro'}
        </Button>
      </div>
      {detail ? (
        <p className="ck-match-device-box__status" role="status">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/** @param {{ flow: ReturnType<typeof useMatchingFlow> }} props */
function CriteriaView({ flow }) {
  const [filtersOpen, setFiltersOpen] = useState(() =>
    Boolean(flow.form.countryCode || flow.form.ageGroup || flow.form.gender),
  );
  const profile = flow.user?.profile;
  const goalLabel = getCatalogLabel(flow.catalogs.goals, profile?.goal);
  const langLabel = getCatalogLabel(
    flow.catalogs.languages,
    profile?.nativeLanguageCode,
  );
  const interestLabels = Array.isArray(profile?.interests)
    ? profile.interests
        .map((code) => getCatalogLabel(flow.catalogs.interests, code))
        .filter(Boolean)
    : [];

  const activeFilterParts = [
    flow.form.countryCode
      ? getCatalogLabel(flow.catalogs.countries, flow.form.countryCode)
      : '',
    flow.form.ageGroup
      ? getCatalogLabel(flow.catalogs.ageGroups, flow.form.ageGroup)
      : '',
    flow.form.gender
      ? getCatalogLabel(flow.catalogs.genders, flow.form.gender)
      : '',
  ].filter(Boolean);
  const filterSummary =
    activeFilterParts.length > 0
      ? activeFilterParts.join(' · ')
      : 'Bất kỳ · Thoải mái';

  const isSubmitting = flow.pendingAction === 'create-search';
  const canSubmit = Boolean(flow.form.level && flow.form.desiredMinutes);

  return (
    <Dialog
      open
      friendly
      size="form"
      eyebrow="GHÉP CẶP TỰ ĐỘNG"
      title="Tìm bạn luyện nói"
      description="Chọn tiêu chí vừa đủ để Chiikaiwa tìm một người phù hợp."
      className="ck-match-dialog ck-match-dialog--criteria"
      closeLabel="Đóng tìm bạn luyện nói"
      closeDisabled={isSubmitting}
      closeOnBackdrop={false}
      onClose={flow.goHome}
    >
      <form
        className="ck-match-criteria-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void flow.startSearch();
        }}
      >
        <fieldset className="ck-match-fieldset">
          <legend>
            Trình độ hiện tại <span aria-hidden="true">*</span>
          </legend>
          <div
            className="ck-match-radio-grid ck-match-radio-grid--levels"
            role="radiogroup"
            aria-label="Trình độ hiện tại"
          >
            {flow.catalogs.levels.map((item) => {
              const selected = flow.form.level === item.code;
              return (
                <label
                  key={item.code}
                  className={`ck-match-radio-pill ${selected ? 'ck-match-radio-pill--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="match-level"
                    value={item.code}
                    checked={selected}
                    onChange={() => flow.updateForm({ level: item.code })}
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
          {flow.fieldErrors.level ? (
            <p className="ck-field__message ck-field__message--error mt-2">
              {flow.fieldErrors.level}
            </p>
          ) : !flow.user?.profile?.level ? (
            <p className="ck-field__message mt-2">
              Hồ sơ của bạn chưa có trình độ. Hãy chọn trình độ cho lượt tìm
              này.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="ck-match-fieldset">
          <legend>
            Thời lượng mong muốn <span aria-hidden="true">*</span>
          </legend>
          <div
            className="ck-match-radio-grid ck-match-radio-grid--durations"
            role="radiogroup"
            aria-label="Thời lượng mong muốn"
          >
            {flow.catalogs.durations.map((item) => {
              const selected = Number(flow.form.desiredMinutes) === item.code;
              return (
                <label
                  key={item.code}
                  className={`ck-match-radio-pill ${selected ? 'ck-match-radio-pill--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="match-duration"
                    value={String(item.code)}
                    checked={selected}
                    onChange={() =>
                      flow.updateForm({ desiredMinutes: item.code })
                    }
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
          {flow.fieldErrors.desiredMinutes ? (
            <p className="ck-field__message ck-field__message--error mt-2">
              {flow.fieldErrors.desiredMinutes}
            </p>
          ) : null}
        </fieldset>

        <label className="ck-match-checkbox">
          <input
            type="checkbox"
            checked={flow.form.allowAdjacent}
            onChange={(event) =>
              flow.updateForm({ allowAdjacent: event.target.checked })
            }
          />
          <span className="ck-match-checkbox__text">
            <strong>Cho phép chênh 1 cấp</strong>
            <small>
              Chỉ ghép lệch 1 cấp liền kề (ví dụ N4–N3) khi cả hai bên cùng bật
              tùy chọn này.
            </small>
          </span>
        </label>

        <div className="ck-match-filters-box">
          <button
            type="button"
            className="ck-match-filters-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <span className="ck-match-filters-toggle__label">
              Bộ lọc tùy chọn
            </span>
            <span className="ck-match-filters-toggle__right">
              <span className="ck-match-filters-toggle__summary">
                {filterSummary}
              </span>
              <svg
                className={`ck-match-chevron ${filtersOpen ? 'ck-match-chevron--open' : ''}`}
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          {filtersOpen ? (
            <div className="ck-match-filters-panel">
              <p className="ck-match-section__note">
                Bộ lọc áp dụng hai chiều. Để trống nghĩa là không giới hạn; nếu
                chọn giá trị cụ thể, đối tác thiếu thông tin tương ứng sẽ không
                khớp.
              </p>
              <div className="ck-match-filters-grid">
                <Select
                  id="match-country"
                  label="Quốc gia đang sinh sống"
                  value={flow.form.countryCode}
                  onChange={(event) =>
                    flow.updateForm({ countryCode: event.target.value })
                  }
                >
                  <option value="">Không giới hạn</option>
                  {flow.catalogs.countries.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </Select>

                <Select
                  id="match-age-group"
                  label="Nhóm tuổi"
                  value={flow.form.ageGroup}
                  onChange={(event) =>
                    flow.updateForm({ ageGroup: event.target.value })
                  }
                >
                  <option value="">Không giới hạn</option>
                  {flow.catalogs.ageGroups.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </Select>

                <Select
                  id="match-gender"
                  label="Giới tính"
                  value={flow.form.gender}
                  onChange={(event) =>
                    flow.updateForm({ gender: event.target.value })
                  }
                >
                  <option value="">Không giới hạn</option>
                  {flow.catalogs.genders.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ck-match-soft-summary">
          <span className="ck-match-soft-summary__label">
            Ưu tiên mềm từ hồ sơ:
          </span>
          <div className="ck-match-soft-summary__items">
            {goalLabel ? <Badge tone="accent">{goalLabel}</Badge> : null}
            {interestLabels.map((label) => (
              <Badge key={label} tone="neutral">
                {label}
              </Badge>
            ))}
            {langLabel ? <Badge tone="neutral">{langLabel}</Badge> : null}
            {!goalLabel && interestLabels.length === 0 && !langLabel ? (
              <span className="ck-match-section__note">
                Chưa khai báo (để trống vẫn tìm bình thường)
              </span>
            ) : null}
          </div>
          <Link to="/profile" className="ck-match-soft-summary__link">
            Cập nhật hồ sơ
          </Link>
        </div>

        <OptionalDeviceCheck />

        {flow.catalogsWarning ? (
          <MatchNoticeBanner
            notice={{ tone: 'warning', message: flow.catalogsWarning }}
          />
        ) : null}

        {flow.notice ? <MatchNoticeBanner notice={flow.notice} /> : null}

        <div className="ck-match-actions ck-match-actions--start">
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            loading={isSubmitting}
            leadingIcon={<Icon name="search" size={18} />}
          >
            Bắt đầu tìm
          </Button>
          <Button variant="ghost" onClick={flow.goHome}>
            Để sau
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** @param {{ flow: ReturnType<typeof useMatchingFlow> }} props */
function SearchingView({ flow }) {
  const search = flow.coordination?.search;
  if (!search) return null;

  const isCancelling = flow.pendingAction.startsWith('cancel-search');
  const { criteria } = search;
  const activeFilters = [
    criteria.filters?.countryCode
      ? `Quốc gia: ${getCatalogLabel(flow.catalogs.countries, criteria.filters.countryCode)}`
      : '',
    criteria.filters?.ageGroup
      ? `Nhóm tuổi: ${getCatalogLabel(flow.catalogs.ageGroups, criteria.filters.ageGroup)}`
      : '',
    criteria.filters?.gender
      ? `Giới tính: ${getCatalogLabel(flow.catalogs.genders, criteria.filters.gender)}`
      : '',
  ].filter(Boolean);

  return (
    <Dialog
      open
      friendly
      size="compact"
      align="center"
      title="Đang tìm bạn luyện..."
      className="ck-match-dialog ck-match-dialog--compact ck-match-searching-dialog"
      footerClassName="ck-match-dialog__footer-center"
      closeLabel="Hủy tìm bạn luyện"
      closeDisabled={isCancelling}
      closeOnBackdrop={false}
      onClose={() => void flow.cancelSearch()}
      headingAdornment={<SearchingMascotGlyph />}
      footer={
        <Button
          variant="secondary"
          loading={isCancelling}
          onClick={() => void flow.cancelSearch()}
        >
          Hủy tìm
        </Button>
      }
    >
      <div className="ck-match-searching-body">
        <p className="ck-match-searching-criteria">
          {criteria.level} · {criteria.desiredMinutes} phút
        </p>

        <p className="ck-match-searching-helper">
          Chiikaiwa đang tìm người phù hợp.
          <br />
          Bạn có thể hủy tìm bất cứ lúc nào.
        </p>

        <p
          className="ck-match-searching-status"
          role="status"
          aria-live="polite"
        >
          Đã chờ: <strong>{formatElapsed(flow.elapsedSearchMs)}</strong> ·{' '}
          {criteria.allowAdjacent ? 'Cho phép chênh 1 cấp' : 'Chỉ cùng cấp'}
          {activeFilters.length > 0
            ? ` · ${activeFilters.join(' · ')}`
            : ' · Không giới hạn bộ lọc'}
        </p>

        {flow.longWaitVisible ? (
          <section
            className="ck-match-long-wait"
            aria-label="Gợi ý khi chờ lâu"
          >
            <h3>Đã chờ hơn 2 phút chưa có đề nghị ghép</h3>
            <p>
              Bạn có thể tiếp tục giữ lượt tìm hiện tại (không tự nới bộ lọc),
              sửa tiêu chí để tìm mới, mời bạn bằng mã hoặc chuyển sang ôn tập.
            </p>
            <div className="ck-match-long-wait__actions">
              <Button
                variant="primary"
                size="compact"
                disabled={isCancelling}
                onClick={flow.continueWaiting}
              >
                Tiếp tục chờ
              </Button>
              <Button
                variant="secondary"
                size="compact"
                loading={isCancelling}
                onClick={() => void flow.editCriteriaFromSearch()}
              >
                Sửa tiêu chí
              </Button>
              <Button
                variant="secondary"
                size="compact"
                disabled={isCancelling}
                onClick={() => void flow.switchToInvitationFromSearch()}
              >
                Mời bằng mã
              </Button>
              <Button
                variant="ghost"
                size="compact"
                disabled={isCancelling}
                onClick={() => void flow.switchToReviewFromSearch()}
              >
                Ôn tập
              </Button>
            </div>
          </section>
        ) : null}

        {flow.notice ? (
          <div className="mt-4 w-full text-left">
            <MatchNoticeBanner notice={flow.notice} />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * @param {{
 *   flow: ReturnType<typeof useMatchingFlow>,
 *   formatCommonCriteria?: (commonCriteria: unknown, catalogs: import('./matching-api.js').MatchingCatalogs) => string[],
 * }} props
 */
function ProposalView({ flow, formatCommonCriteria }) {
  const proposal = flow.proposal;
  if (!proposal) return null;

  const { partner } = proposal;
  const partnerLevel = partner.profile?.level ?? '';
  const partnerGoal = getCatalogLabel(
    flow.catalogs.goals,
    partner.profile?.goal,
  );
  const partnerLang = getCatalogLabel(
    flow.catalogs.languages,
    partner.profile?.nativeLanguage,
  );
  const partnerLine = [
    partnerLevel,
    `${proposal.suggestedMinutes} phút`,
    partnerGoal,
    partnerLang,
  ]
    .filter(Boolean)
    .join(' · ');

  // Proposal.commonCriteria sub-schema is pending BE-028 contract sign-off.
  // Production renders a neutral summary unless an explicit formatter is supplied.
  const commonItems = formatCommonCriteria
    ? formatCommonCriteria(proposal.commonCriteria, flow.catalogs)
    : [];
  const isAccepting = flow.pendingAction.startsWith('accept-proposal');
  const isRejecting = flow.pendingAction.startsWith('reject-proposal');
  const isCancelling = flow.pendingAction.startsWith('cancel-proposal');
  const anyPending = Boolean(flow.pendingAction);

  // Frame 04 · Chờ đối phương xác nhận (node-id=11-5422)
  if (proposal.acceptedByMe && !proposal.acceptedByPartner) {
    return (
      <Dialog
        open
        friendly
        size="compact"
        align="center"
        title={`Đang chờ ${partner.displayName} xác nhận`}
        className="ck-match-dialog ck-match-dialog--compact ck-match-waiting-dialog"
        footerClassName="ck-match-dialog__footer-center"
        closeLabel="Hủy đề nghị ghép"
        closeDisabled={anyPending}
        closeOnBackdrop={false}
        onClose={() => void flow.cancelActiveProposal()}
        headingAdornment={
          <div className="ck-match-pair-avatars" aria-hidden="true">
            <Avatar
              name={flow.user?.displayName || 'Bạn'}
              size={32}
              className="ck-match-pair-avatars__item"
            />
            <span className="ck-match-pair-avatars__line" />
            <Avatar
              name={partner.displayName}
              size={32}
              className="ck-match-pair-avatars__item"
            />
          </div>
        }
        footer={
          <Button
            variant="secondary"
            loading={isCancelling}
            disabled={anyPending && !isCancelling}
            onClick={() => void flow.cancelActiveProposal()}
          >
            Hủy
          </Button>
        }
      >
        <div className="ck-match-waiting-body">
          <p
            className="ck-match-waiting-status"
            role="status"
            aria-live="polite"
          >
            Bạn đã đồng ý. Đang chờ bạn luyện
          </p>

          <div className="ck-match-proposal-countdown-wrap">
            <SegmentedCountdown
              variant="ring"
              expiresAt={proposal.expiresAt}
              serverTime={flow.serverTime}
              totalSeconds={30}
              onExpire={flow.syncProposalOnExpire}
            />
          </div>

          {flow.notice ? (
            <div className="mt-4 w-full text-left">
              <MatchNoticeBanner notice={flow.notice} />
            </div>
          ) : null}
        </div>
      </Dialog>
    );
  }

  // Frame 03 · Tìm được bạn (node-id=11-5275, Dialog 30-7759)
  return (
    <Dialog
      open
      friendly
      size="compact"
      title="Bạn luyện phù hợp"
      className="ck-match-dialog ck-match-proposal-dialog"
      footerClassName="ck-match-proposal-dialog__footer"
      closeLabel="Hủy đề nghị ghép"
      closeDisabled={anyPending}
      closeOnBackdrop={false}
      onClose={() => void flow.cancelActiveProposal()}
      footer={
        <>
          <Button
            variant="secondary"
            loading={isRejecting}
            disabled={anyPending && !isRejecting}
            onClick={() => void flow.respondProposal('reject')}
          >
            Bỏ qua
          </Button>
          <Button
            variant="primary"
            loading={isAccepting}
            disabled={anyPending && !isAccepting}
            onClick={() => void flow.respondProposal('accept')}
          >
            Luyện cùng
          </Button>
        </>
      }
    >
      {/* Partner row: 56px pink avatar + allowed info only (never email) */}
      <div className="ck-match-proposal-partner">
        <Avatar
          name={partner.displayName}
          size={48}
          className="ck-match-proposal-partner__avatar"
        />
        <div className="ck-match-proposal-partner__info">
          <p className="ck-match-proposal-partner__name">
            {partner.displayName}
          </p>
          <p className="ck-match-proposal-partner__meta">{partnerLine}</p>
        </div>
      </div>

      {/* Dedicated 30s segmented countdown (Figma 31-8195) */}
      <div className="ck-match-proposal-countdown-wrap">
        <SegmentedCountdown
          variant="segmented"
          expiresAt={proposal.expiresAt}
          serverTime={flow.serverTime}
          totalSeconds={30}
          onExpire={flow.syncProposalOnExpire}
        />
      </div>

      {/* Common criteria row between subtle dividers */}
      <div className="ck-match-proposal-common">
        <span className="ck-match-proposal-common__label">Điểm chung</span>
        {commonItems.length > 0 ? (
          <ul className="ck-match-common-list">
            {commonItems.map((item) => (
              <li key={item}>
                <Badge tone="neutral" className="ck-match-common-pill">
                  {item}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <span className="ck-match-section__note">
            Thỏa mãn điều kiện trình độ và bộ lọc của hai bên.
          </span>
        )}
      </div>

      {flow.notice ? (
        <div className="mt-4">
          <MatchNoticeBanner notice={flow.notice} />
        </div>
      ) : null}
    </Dialog>
  );
}

/** @param {{ flow: ReturnType<typeof useMatchingFlow> }} props */
function EndedView({ flow }) {
  const reasonLabel = {
    cancelled: 'Đã hủy lượt tìm bạn',
    rejected: 'Đề nghị ghép chưa được chấp nhận',
    expired: 'Đề nghị ghép đã hết hạn',
    leaseExpired: 'Lượt tìm đã hết hạn giữ chỗ',
  }[flow.endedReason];

  return (
    <Dialog
      open
      friendly
      size="compact"
      align="center"
      title="Đã dừng tại đây"
      className="ck-match-dialog ck-match-dialog--compact ck-match-ended-dialog"
      footerClassName="ck-match-dialog__footer-center"
      closeLabel="Về trang chủ"
      onClose={flow.goHome}
      headingAdornment={
        <div className="ck-match-ended-head">
          <span className="ck-match-ended__icon" aria-hidden="true">
            <Icon name="close" size={22} />
          </span>
          <span className="ck-match-ended__pill">Lượt chờ đã kết thúc</span>
        </div>
      }
      footer={
        <>
          <Button variant="primary" onClick={flow.returnToCriteria}>
            Thiết lập lượt mới
          </Button>
          <Button variant="ghost" onClick={flow.goHome}>
            Về trang chủ
          </Button>
        </>
      }
    >
      <div className="ck-match-ended">
        <p className="ck-match-ended__subtitle">
          Chiikaiwa sẽ không tự tìm lại hoặc giữ chỗ cũ.
        </p>
        <p className="ck-match-ended__reason">{reasonLabel}</p>

        {flow.notice ? (
          <div className="w-full text-left">
            <MatchNoticeBanner notice={flow.notice} />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/** @param {{ flow: ReturnType<typeof useMatchingFlow> }} props */
function BusyOtherView({ flow }) {
  return (
    <Dialog
      open
      friendly
      size="compact"
      align="center"
      title="Bạn đang ở một luồng luyện tập khác"
      className="ck-match-dialog ck-match-dialog--compact"
      footerClassName="ck-match-dialog__footer-center"
      closeLabel="Về trang chủ"
      onClose={flow.goHome}
      headingAdornment={
        <span className="ck-match-ended__icon" aria-hidden="true">
          <Icon name="lock" size={22} />
        </span>
      }
      footer={
        <>
          <Link to="/invitation" className="ck-button ck-button--primary">
            Xem phòng mời
          </Link>
          <Button variant="ghost" onClick={flow.goHome}>
            Về trang chủ
          </Button>
        </>
      }
    >
      <div className="ck-match-ended">
        <p className="ck-match-ended__subtitle">
          Mỗi tài khoản chỉ tham gia một luồng chờ hoặc phòng tại một thời điểm.
          Hãy hoàn tất hoặc hủy phòng mời hiện tại trước khi tìm bạn tự động.
        </p>
      </div>
    </Dialog>
  );
}

/**
 * SC-05: Auto-matching screen ("Tìm bạn luyện nói", Figma `Enter Kaiwa` 4-4).
 *
 * @param {{
 *   matchingApi?: import('./matching-api.js').MatchingApiAdapter,
 *   formatCommonCriteria?: (commonCriteria: unknown, catalogs: import('./matching-api.js').MatchingCatalogs) => string[],
 * }} [props]
 */
export function MatchPage({ matchingApi, formatCommonCriteria } = {}) {
  const flow = useMatchingFlow({ matchingApi });

  return (
    <section className="ck-match-page" data-screen-id="SC-05">
      <h1 className="sr-only">Tìm bạn luyện nói</h1>

      {flow.phase === 'loading' ? (
        <Dialog
          open
          friendly
          size="compact"
          align="center"
          title="Tìm bạn luyện nói"
          className="ck-match-dialog ck-match-dialog--compact"
          footerClassName="ck-match-dialog__footer-center"
          closeLabel="Về trang chủ"
          onClose={flow.goHome}
          footer={
            <Button variant="ghost" onClick={flow.goHome}>
              Về trang chủ
            </Button>
          }
        >
          <div className="ck-match-ended">
            {!flow.notice ? (
              <div role="status" aria-live="polite">
                <p className="ck-match-ended__subtitle">
                  Đang kiểm tra trạng thái ghép bạn của bạn…
                </p>
              </div>
            ) : null}
            {flow.notice ? (
              <div className="w-full text-left">
                <MatchNoticeBanner notice={flow.notice} />
              </div>
            ) : null}
          </div>
        </Dialog>
      ) : null}

      {flow.phase === 'busyOther' ? <BusyOtherView flow={flow} /> : null}
      {flow.phase === 'criteria' ? <CriteriaView flow={flow} /> : null}
      {flow.phase === 'searching' ? <SearchingView flow={flow} /> : null}
      {flow.phase === 'proposal' ? (
        <ProposalView flow={flow} formatCommonCriteria={formatCommonCriteria} />
      ) : null}
      {flow.phase === 'ended' ? <EndedView flow={flow} /> : null}
    </section>
  );
}
