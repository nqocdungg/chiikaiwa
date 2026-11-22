import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Countdown } from '../../components/ui/Countdown.jsx';
import { FormField } from '../../components/ui/forms.jsx';
import { Avatar, Badge, Card } from '../../components/ui/surfaces.jsx';
import { getCatalogLabel } from './matching-api.js';
import { useMatchingFlow } from './use-matching-flow.js';
import './matching.css';

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
 * Optional, non-blocking device check per SC-05.
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
        <div>
          <strong>Kiểm tra thiết bị (tùy chọn)</strong>
          <p className="ck-match-device-box__status">
            Không bắt buộc cấp quyền micro/camera để tìm bạn hoặc vào phòng.
          </p>
        </div>
        <Button
          variant="secondary"
          size="compact"
          loading={status === 'checking'}
          leadingIcon={<Icon name="mic" size={18} />}
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

  const isSubmitting = flow.pendingAction === 'create-search';
  const canSubmit = Boolean(flow.form.level && flow.form.desiredMinutes);

  return (
    <Card className="ck-match-card">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void flow.startSearch();
        }}
      >
        <div className="ck-match-section">
          <div className="ck-match-section__head">
            <h2 className="ck-match-section__title">1. Tiêu chí bắt buộc</h2>
            <p className="ck-match-section__note">
              Chiikaiwa chỉ ghép đúng điều kiện cứng, không tự nới tiêu chí.
            </p>
          </div>

          <fieldset className="ck-match-fieldset">
            <legend>
              Trình độ tiếng Nhật <span aria-hidden="true">*</span>
            </legend>
            <div
              className="ck-match-radio-grid"
              role="radiogroup"
              aria-label="Trình độ tiếng Nhật"
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
              className="ck-match-radio-grid"
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
            ) : (
              <p className="ck-field__message mt-2">
                Thời lượng đề xuất khi ghép là mức ngắn hơn giữa hai bạn và chỉ
                mang tính gợi ý.
              </p>
            )}
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
                Chỉ ghép lệch 1 cấp liền kề (ví dụ N4–N3) khi cả hai bên cùng
                bật tùy chọn này.
              </small>
            </span>
          </label>
        </div>

        <div className="ck-match-section">
          <div className="ck-match-section__head">
            <h2 className="ck-match-section__title">
              2. Thông tin ưu tiên mềm (từ hồ sơ)
            </h2>
            <Link to="/profile" className="text-sm font-semibold underline">
              Cập nhật hồ sơ
            </Link>
          </div>
          <p className="ck-match-section__note">
            Mục tiêu, sở thích và tiếng mẹ đẻ chỉ dùng để ưu tiên ứng viên phù
            hợp hơn; để trống vẫn tìm được bình thường.
          </p>
          <div className="ck-match-profile-summary">
            {goalLabel ? (
              <Badge tone="accent">Mục tiêu: {goalLabel}</Badge>
            ) : null}
            {interestLabels.map((label) => (
              <Badge key={label} tone="neutral">
                Sở thích: {label}
              </Badge>
            ))}
            {langLabel ? (
              <Badge tone="neutral">Tiếng mẹ đẻ: {langLabel}</Badge>
            ) : null}
            {!goalLabel && interestLabels.length === 0 && !langLabel ? (
              <span className="text-sm text-muted">
                Chưa khai báo mục tiêu, sở thích hoặc tiếng mẹ đẻ (không bắt
                buộc).
              </span>
            ) : null}
          </div>
        </div>

        <div className="ck-match-section">
          <div className="ck-match-section__head">
            <h2 className="ck-match-section__title">
              3. Bộ lọc tùy chọn (áp dụng hai chiều)
            </h2>
            <button
              type="button"
              className="ck-match-filters-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {filtersOpen ? 'Thu gọn bộ lọc' : 'Mở bộ lọc tùy chọn'}
            </button>
          </div>
          <p className="ck-match-section__note">
            Để trống nghĩa là không giới hạn. Nếu chọn giá trị cụ thể, đối tác
            thiếu thông tin tương ứng sẽ không khớp.
          </p>

          {filtersOpen ? (
            <div className="ck-match-filters-grid">
              <FormField
                label="Quốc gia đang sinh sống"
                htmlFor="match-country"
              >
                <select
                  id="match-country"
                  className="ck-match-select"
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
                </select>
              </FormField>

              <FormField label="Nhóm tuổi" htmlFor="match-age-group">
                <select
                  id="match-age-group"
                  className="ck-match-select"
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
                </select>
              </FormField>

              <FormField label="Giới tính" htmlFor="match-gender">
                <select
                  id="match-gender"
                  className="ck-match-select"
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
                </select>
              </FormField>
            </div>
          ) : null}
        </div>

        <div className="ck-match-section">
          <OptionalDeviceCheck />
        </div>

        {flow.catalogsWarning ? (
          <div className="mt-4">
            <MatchNoticeBanner
              notice={{ tone: 'warning', message: flow.catalogsWarning }}
            />
          </div>
        ) : null}

        {flow.notice ? (
          <div className="mt-4">
            <MatchNoticeBanner notice={flow.notice} />
          </div>
        ) : null}

        <div className="ck-match-actions ck-match-actions--split">
          <Button variant="ghost" onClick={flow.goHome}>
            Về trang chủ
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            loading={isSubmitting}
            leadingIcon={<Icon name="search" size={18} />}
          >
            Bắt đầu tìm
          </Button>
        </div>
      </form>
    </Card>
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
    <Card className="ck-match-card ck-match-card--centered">
      <div
        className="ck-match-searching-banner"
        role="status"
        aria-live="polite"
      >
        <span className="ck-match-pulse" aria-hidden="true">
          <span />
        </span>
        <div>
          <h2 className="ck-match-section__title">
            Đang tìm bạn luyện nói (Tomodachi)…
          </h2>
          <p className="ck-match-section__note mt-1">
            Đã chờ: <strong>{formatElapsed(flow.elapsedSearchMs)}</strong> · Giữ
            nguyên bộ lọc, không tự nới điều kiện.
          </p>
        </div>
      </div>

      <div className="ck-match-searching-meta">
        <Badge tone="accent">Trình độ: {criteria.level}</Badge>
        <Badge tone="neutral">Thời lượng: {criteria.desiredMinutes} phút</Badge>
        <Badge tone="neutral">
          {criteria.allowAdjacent ? 'Cho phép chênh 1 cấp' : 'Chỉ cùng cấp'}
        </Badge>
        {activeFilters.length > 0 ? (
          activeFilters.map((label) => (
            <Badge key={label} tone="warning">
              {label}
            </Badge>
          ))
        ) : (
          <Badge tone="neutral">Bộ lọc tùy chọn: Không giới hạn</Badge>
        )}
      </div>

      {flow.longWaitVisible ? (
        <section className="ck-match-long-wait" aria-label="Gợi ý khi chờ lâu">
          <h3>Đã chờ hơn 2 phút chưa có đề nghị ghép</h3>
          <p>
            Bạn có thể tiếp tục giữ lượt tìm hiện tại (không tự nới bộ lọc), sửa
            tiêu chí để tìm mới, mời bạn bằng mã hoặc chuyển sang ôn tập.
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
        <div className="mt-4">
          <MatchNoticeBanner notice={flow.notice} />
        </div>
      ) : null}

      <div className="ck-match-actions ck-match-actions--end">
        <Button
          variant="secondary"
          loading={isCancelling}
          onClick={() => void flow.cancelSearch()}
        >
          Hủy tìm
        </Button>
      </div>
    </Card>
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
  const partnerMeta = [partnerLevel, partnerGoal, partnerLang]
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

  return (
    <Card className="ck-match-card ck-match-card--centered">
      <div className="ck-match-section__head mb-4">
        <h2 className="ck-match-section__title">
          Đã tìm thấy bạn luyện phù hợp
        </h2>
        <Badge tone="accent">Chờ xác nhận hai bên</Badge>
      </div>

      {/* Partner row: 48px avatar + allowed info only (never email) */}
      <div className="ck-match-proposal-partner">
        <Avatar name={partner.displayName} size={48} />
        <div className="ck-match-proposal-partner__info">
          <p className="ck-match-proposal-partner__name">
            {partner.displayName}
          </p>
          {partnerMeta ? (
            <p className="ck-match-proposal-partner__meta">{partnerMeta}</p>
          ) : null}
        </div>
      </div>

      {/* Dedicated 30s server countdown + suggested duration row */}
      <div className="ck-match-proposal-timer-row">
        <Countdown
          className="ck-match-proposal-countdown"
          expiresAt={proposal.expiresAt}
          serverTime={flow.serverTime}
          prefix="Còn"
          onExpire={flow.syncProposalOnExpire}
        />
        <div className="ck-match-proposal-duration">
          <strong>Thời lượng đề xuất: {proposal.suggestedMinutes} phút</strong>
          <small>Mức ngắn hơn giữa hai bạn (chỉ mang tính gợi ý)</small>
        </div>
      </div>

      {/* Common criteria — no fake match scores */}
      <div className="ck-match-proposal-common">
        <h3>Điểm chung</h3>
        {commonItems.length > 0 ? (
          <ul className="ck-match-common-list">
            {commonItems.map((item) => (
              <li key={item}>
                <Badge tone="neutral">{item}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ck-match-section__note">
            Thỏa mãn điều kiện trình độ và bộ lọc của hai bên.
          </p>
        )}
      </div>

      {proposal.acceptedByMe && !proposal.acceptedByPartner ? (
        <div
          className="ck-match-waiting-partner"
          role="status"
          aria-live="polite"
        >
          <Icon name="clock" size={20} />
          <span>Bạn đã đồng ý. Đang chờ bạn luyện</span>
        </div>
      ) : null}

      {flow.notice ? (
        <div className="mt-4">
          <MatchNoticeBanner notice={flow.notice} />
        </div>
      ) : null}

      {proposal.acceptedByMe ? (
        <div className="ck-match-actions ck-match-actions--end">
          <Button
            variant="secondary"
            loading={isCancelling}
            disabled={anyPending && !isCancelling}
            onClick={() => void flow.cancelActiveProposal()}
          >
            Hủy đề nghị
          </Button>
        </div>
      ) : (
        <div className="ck-match-actions ck-match-actions--proposal">
          <Button
            variant="secondary"
            loading={isRejecting}
            disabled={anyPending && !isRejecting}
            onClick={() => void flow.respondProposal('reject')}
          >
            Từ chối
          </Button>
          <Button
            variant="primary"
            loading={isAccepting}
            disabled={anyPending && !isAccepting}
            leadingIcon={<Icon name="check" size={18} />}
            onClick={() => void flow.respondProposal('accept')}
          >
            Đồng ý luyện cùng
          </Button>
        </div>
      )}
    </Card>
  );
}

/** @param {{ flow: ReturnType<typeof useMatchingFlow> }} props */
function EndedView({ flow }) {
  const copy = {
    cancelled: {
      title: 'Đã hủy lượt tìm bạn',
      description:
        'Giữ chỗ đã được giải phóng. Chiikaiwa sẽ không tự tìm lại hoặc đưa bạn vào cặp cũ.',
    },
    rejected: {
      title: 'Đề nghị ghép chưa được chấp nhận',
      description:
        'Cả hai đã được giải phóng. Bạn có thể bắt đầu lượt tìm mới khi sẵn sàng.',
    },
    expired: {
      title: 'Đề nghị ghép đã hết hạn',
      description:
        'Hết 30 giây xác nhận từ máy chủ. Chiikaiwa không tự tìm lại hoặc khôi phục cặp cũ.',
    },
    leaseExpired: {
      title: 'Lượt tìm đã hết hạn giữ chỗ',
      description:
        'Phiên tìm kiếm không còn hoạt động trên máy chủ. Chiikaiwa không tự tìm lại.',
    },
  }[flow.endedReason];

  return (
    <Card className="ck-match-card ck-match-card--centered">
      <div className="ck-match-ended">
        <span className="ck-match-ended__icon" aria-hidden="true">
          <Icon name="clock" size={26} />
        </span>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>

        {flow.notice ? <MatchNoticeBanner notice={flow.notice} /> : null}

        <div className="ck-match-actions ck-match-actions--center">
          <Button variant="primary" onClick={flow.returnToCriteria}>
            Tìm lại với tiêu chí mới
          </Button>
          <Button variant="ghost" onClick={flow.goHome}>
            Về trang chủ
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** @param {{ flow: ReturnType<typeof useMatchingFlow> }} props */
function BusyOtherView({ flow }) {
  return (
    <Card className="ck-match-card ck-match-card--centered">
      <div className="ck-match-ended">
        <span className="ck-match-ended__icon" aria-hidden="true">
          <Icon name="lock" size={24} />
        </span>
        <h2>Bạn đang ở một luồng luyện tập khác</h2>
        <p>
          Mỗi tài khoản chỉ tham gia một luồng chờ hoặc phòng tại một thời điểm.
          Hãy hoàn tất hoặc hủy phòng mời hiện tại trước khi tìm bạn tự động.
        </p>
        <div className="ck-match-actions ck-match-actions--center">
          <Link to="/invitation" className="ck-button ck-button--primary">
            Xem phòng mời
          </Link>
          <Button variant="ghost" onClick={flow.goHome}>
            Về trang chủ
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * SC-05: Auto-matching screen ("Tìm bạn Tomodachi").
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
      <header className="ck-match-header">
        <div>
          <p className="ck-match-eyebrow">Luyện hội thoại 1–1 (Kaiwa)</p>
          <h1 className="ck-match-title">Tìm bạn Tomodachi</h1>
          <p className="ck-match-subtitle">
            Tomodachi là bạn luyện nói cùng cấp độ hoặc chênh 1 cấp trong không
            gian luyện hội thoại (Kaiwa) 1–1.
          </p>
        </div>
      </header>

      {flow.phase === 'loading' ? (
        <Card className="ck-match-card ck-match-card--centered">
          <div role="status" aria-live="polite">
            <p className="m-0 text-muted">
              Đang kiểm tra trạng thái ghép bạn của bạn…
            </p>
          </div>
          {flow.notice ? (
            <div className="mt-4">
              <MatchNoticeBanner notice={flow.notice} />
            </div>
          ) : null}
        </Card>
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
