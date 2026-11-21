import { Link, useNavigate, useOutletContext } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import chiikawaPeek from '../../assets/mascots/chiikawa-peek.webp';
import hachiwareFace from './hachiware-face.webp';
import usagiFace from './usagi-face.webp';
import { HomeIcon } from './HomeIcon.jsx';
import { HomeMascot } from './HomeMascot.jsx';
import './home.css';

const activeFlows = {
  inSession: {
    description: 'Bạn đang có một phiên hội thoại đang hoạt động.',
    action: 'Vào lại phòng',
  },
  searching: {
    description: 'Bạn đang trong hàng đợi tìm bạn luyện Tomodachi.',
    action: 'Xem trạng thái',
    to: '/match',
  },
  proposed: {
    description: 'Đã tìm thấy bạn luyện phù hợp. Đang chờ xác nhận phiên.',
    action: 'Xem trạng thái',
    to: '/match',
  },
  inviting: {
    description: 'Bạn đang có yêu cầu phòng mời đang được xử lý.',
    action: 'Xem phòng mời',
    to: '/invitation',
  },
  requestingInvite: {
    description: 'Bạn đang có yêu cầu phòng mời đang được xử lý.',
    action: 'Xem phòng mời',
    to: '/invitation',
  },
};

export function Home() {
  const navigate = useNavigate();
  const {
    coordination,
    coordinationLoading,
    coordinationError,
    handleRetryCoordination,
    isStartDisabled,
  } =
    /** @type {ReturnType<typeof import('./use-home-coordination.js').useHomeCoordination>} */ (
      useOutletContext()
    );
  const activeFlow =
    activeFlows[/** @type {keyof typeof activeFlows} */ (coordination?.mode)];
  const resumePath =
    coordination?.mode === 'inSession' && coordination.resourceId
      ? '/room/' + encodeURIComponent(coordination.resourceId)
      : activeFlow && 'to' in activeFlow
        ? activeFlow.to
        : undefined;

  return (
    <div
      id="ck-home"
      className="ck-home-studio"
      onPointerDown={(event) => {
        if (
          event.pointerType !== 'touch' ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
          !(event.target instanceof Element)
        )
          return;
        event.target
          .closest('.ck-home-action:not(:disabled), .ck-home-shortcut')
          ?.setAttribute('data-home-touched', '');
      }}
      onAnimationEnd={(event) => {
        if (
          event.animationName === 'ck-home-bubbles-press' &&
          event.target instanceof Element
        ) {
          event.target.removeAttribute('data-home-touched');
        }
      }}
    >
      <h1 className="sr-only">Trang chính</h1>
      {coordinationError ? (
        <section className="ck-home-status ck-home-status--error" role="status">
          <div>
            <h2>Không thể kiểm tra trạng thái điều phối</h2>
            <p>
              Đã xảy ra lỗi khi đồng bộ trạng thái phòng luyện. Vui lòng thử lại
              trước khi bắt đầu.
            </p>
          </div>
          <Button variant="secondary" onClick={handleRetryCoordination}>
            Thử lại
          </Button>
        </section>
      ) : activeFlow ? (
        <section className="ck-home-status" role="status">
          <div>
            <h2>Luồng luyện tập đang diễn ra</h2>
            <p>{activeFlow.description}</p>
          </div>
          {resumePath && (
            <Link to={resumePath} className="ck-button ck-button--primary">
              {activeFlow.action} <HomeIcon name="arrow" />
            </Link>
          )}
        </section>
      ) : null}

      <section
        className="ck-home-feature"
        aria-labelledby="ck-home-feature-title"
      >
        <div className="ck-home-intro">
          <h2 id="ck-home-feature-title">
            <span className="ck-home-heading-accent">Hôm nay mình</span>
            <br /> nói gì nhỉ?
          </h2>
          <p>
            Gặp bạn luyện 1–1 và thử nói tiếng Nhật qua những tình huống đời
            thường.
          </p>
          <div className="ck-home-start">
            <Button
              variant="primary"
              size="hero"
              className="ck-home-action ck-home-action--main"
              leadingIcon={<HomeIcon name="chat" size={28} />}
              trailingIcon={<HomeIcon name="chevron" size={24} />}
              onClick={() => navigate('/match')}
              disabled={isStartDisabled}
            >
              Tìm bạn luyện nói
            </Button>
            <img
              className="ck-home-start-mascot"
              src={chiikawaPeek}
              alt=""
              width="60"
              height="60"
            />
            {coordinationLoading && (
              <p className="ck-home-loading" role="status">
                Đang kiểm tra trạng thái điều phối…
              </p>
            )}
          </div>
          <div
            className="ck-home-invite-group"
            role="group"
            aria-labelledby="ck-home-invite-label"
          >
            <p id="ck-home-invite-label">Luyện cùng bạn bè</p>
            <div className="ck-home-invites">
              <Button
                variant="secondary"
                size="compact"
                className="ck-home-action"
                leadingIcon={<HomeIcon name="invite" />}
                onClick={() => navigate('/invitation?mode=create')}
                disabled={isStartDisabled}
              >
                Tạo mã mời
              </Button>
              <Button
                variant="secondary"
                size="compact"
                className="ck-home-action"
                leadingIcon={<HomeIcon name="join" />}
                onClick={() => navigate('/invitation?mode=join')}
                disabled={isStartDisabled}
              >
                Nhập mã
              </Button>
            </div>
          </div>
        </div>
        <HomeMascot />
      </section>

      <nav className="ck-home-study" aria-label="Lối tắt học tập">
        <Link
          to="/topics"
          className="ck-home-shortcut"
          aria-labelledby="ck-home-topics-label"
          aria-describedby="ck-home-topics-description"
        >
          <span className="ck-home-shortcut-icon">
            <img src={hachiwareFace} alt="" width="52" height="52" />
          </span>
          <span>
            <strong id="ck-home-topics-label">Kho chủ đề</strong>
            <span
              id="ck-home-topics-description"
              className="ck-home-shortcut-description"
            >
              Chọn tình huống để luyện nói.
            </span>
          </span>
          <HomeIcon name="chevron" size={22} />
        </Link>
        <Link
          to="/saved"
          className="ck-home-shortcut"
          aria-labelledby="ck-home-saved-label"
          aria-describedby="ck-home-saved-description"
        >
          <span className="ck-home-shortcut-icon">
            <img src={usagiFace} alt="" width="52" height="52" />
          </span>
          <span>
            <strong id="ck-home-saved-label">Ôn cá nhân</strong>
            <span
              id="ck-home-saved-description"
              className="ck-home-shortcut-description"
            >
              Ôn lại các câu đã lưu.
            </span>
          </span>
          <HomeIcon name="chevron" size={22} />
        </Link>
      </nav>
    </div>
  );
}
