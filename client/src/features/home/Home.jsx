import { Link, useNavigate, useOutletContext } from 'react-router';
import { Button, Icon } from '../../components/ui/controls.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { hachiware, usagi } from '../../assets/mascots/mascots.js';
import { Mascot } from '../../components/Mascot.jsx';

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
  const isBusy = Boolean(coordination && coordination.mode !== 'idle');
  const handleStart = () => navigate('/match');

  return (
    <div id="ck-home" className="ck-home">
      {/* Thông báo lỗi khi không thể tải trạng thái điều phối */}
      {coordinationError && (
        <section
          className="mb-6 max-w-3xl mx-auto w-full"
          role="status"
          aria-live="polite"
        >
          <Card className="ck-home-preview">
            <div className="flex-1">
              <h2 className="text-base font-semibold text-ink">
                Không thể kiểm tra trạng thái điều phối
              </h2>
              <p className="text-sm text-muted mt-1">
                Đã xảy ra lỗi khi đồng bộ trạng thái phòng luyện. Vui lòng thử
                lại trước khi bắt đầu.
              </p>
            </div>
            <div>
              <Button variant="secondary" onClick={handleRetryCoordination}>
                Thử lại
              </Button>
            </div>
          </Card>
        </section>
      )}

      {/* Banner điều phối khi có luồng đang chiếm chỗ (SC-03 contract: không tạo luồng thứ hai) */}
      {isBusy && coordination && (
        <section
          className="mb-6 max-w-3xl mx-auto w-full"
          role="status"
          aria-live="polite"
        >
          <Card className="ck-home-preview">
            <div className="flex-1">
              <h2 className="text-base font-semibold text-ink">
                Luồng luyện tập đang diễn ra
              </h2>
              <p className="text-sm text-muted mt-1">
                {coordination.mode === 'inSession' &&
                  'Bạn đang có một phiên hội thoại đang hoạt động.'}
                {coordination.mode === 'searching' &&
                  'Bạn đang trong hàng đợi tìm bạn luyện Tomodachi.'}
                {coordination.mode === 'proposed' &&
                  'Đã tìm thấy bạn luyện phù hợp. Đang chờ xác nhận phiên.'}
                {(coordination.mode === 'inviting' ||
                  coordination.mode === 'requestingInvite') &&
                  'Bạn đang có yêu cầu phòng mời đang được xử lý.'}
              </p>
            </div>
            <div>
              {coordination.mode === 'inSession' && coordination.resourceId && (
                <Link
                  to={`/room/${encodeURIComponent(coordination.resourceId)}`}
                  className="ck-button ck-button--primary"
                >
                  Vào lại phòng <Icon name="arrow" />
                </Link>
              )}
              {(coordination.mode === 'searching' ||
                coordination.mode === 'proposed') && (
                <Link to="/match" className="ck-button ck-button--primary">
                  Xem trạng thái <Icon name="arrow" />
                </Link>
              )}
              {(coordination.mode === 'inviting' ||
                coordination.mode === 'requestingInvite') && (
                <Link to="/invitation" className="ck-button ck-button--primary">
                  Xem phòng mời <Icon name="arrow" />
                </Link>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* Centered Hero Section (Bản thiết kế mới Figma Make) */}
      <div className="ck-home-hero">
        {/* Linh vật thỏ Usagi bên trái */}
        <div className="ck-hero-mascot ck-hero-mascot--left">
          <div className="ck-speech-bubble ck-speech-bubble--left">
            <span lang="ja" aria-hidden="true">
              いっしょに？
            </span>
          </div>
          <Mascot
            asset={usagi}
            alt=""
            className="ck-mascot-img"
            width="215"
            height="260"
            decoding="async"
          />
        </div>

        {/* Cụm nội dung & Hành động trung tâm */}
        <div className="ck-hero-center">
          <h1 className="sr-only">Trang chính</h1>
          <h2 className="ck-hero-title">Hôm nay mình nói gì nhỉ?</h2>
          <p className="ck-hero-subtitle">
            Một cuộc trò chuyện nhỏ, thêm chút tự tin.
          </p>

          {/* Nút chính lớn: Tìm bạn luyện nói */}
          <div className="ck-hero-primary-action">
            <Button
              variant="primary"
              size="hero"
              className="ck-hero-btn-start"
              onClick={handleStart}
              disabled={isStartDisabled}
              leadingIcon={<Icon name="search" size={20} />}
              trailingIcon={<Icon name="arrow" size={20} />}
            >
              Tìm bạn luyện nói
            </Button>
            {coordinationLoading && (
              <p className="mt-2 text-sm text-muted" role="status">
                Đang kiểm tra trạng thái điều phối…
              </p>
            )}
          </div>

          {/* Hàng nút phụ: Tạo mã mời / Nhập mã (Tuân thủ trạng thái điều phối) */}
          <div className="ck-hero-secondary-actions">
            <button
              type="button"
              className="ck-button ck-button--secondary ck-hero-btn-pill"
              onClick={() => navigate('/invitation?mode=create')}
              disabled={isStartDisabled}
            >
              <Icon name="note" size={16} />
              <span>Tạo mã mời</span>
            </button>
            <button
              type="button"
              className="ck-button ck-button--secondary ck-hero-btn-pill"
              onClick={() => navigate('/invitation?mode=join')}
              disabled={isStartDisabled}
            >
              <Icon name="cards" size={16} />
              <span>Nhập mã</span>
            </button>
          </div>

          {/* 3 Chip chủ đề nhanh */}
          <div className="ck-hero-topics">
            <Link to="/topics" className="ck-topic-chip ck-topic-chip--pink">
              <span className="ck-topic-chip-ja" lang="ja">
                カフェで
              </span>
              <span className="ck-topic-chip-vi">Ở quán cà phê</span>
            </Link>
            <Link to="/topics" className="ck-topic-chip ck-topic-chip--blue">
              <span className="ck-topic-chip-ja" lang="ja">
                道を聞く
              </span>
              <span className="ck-topic-chip-vi">Hỏi đường</span>
            </Link>
            <Link to="/topics" className="ck-topic-chip ck-topic-chip--yellow">
              <span className="ck-topic-chip-ja" lang="ja">
                アルバイト
              </span>
              <span className="ck-topic-chip-vi">Việc làm thêm</span>
            </Link>
          </div>
        </div>

        {/* Linh vật mèo Hachiware bên phải */}
        <div className="ck-hero-mascot ck-hero-mascot--right">
          <div className="ck-speech-bubble ck-speech-bubble--right">
            <span lang="ja" aria-hidden="true">
              話そう！
            </span>
          </div>
          <Mascot
            asset={hachiware}
            alt=""
            className="ck-mascot-img"
            width="215"
            height="240"
            decoding="async"
          />
        </div>
      </div>

      <footer className="ck-home-footer" role="contentinfo">
        <span>ちいさな会話 · chiikaiwa</span>
        <span>Không gian luyện tập hội thoại 1-1</span>
      </footer>
    </div>
  );
}
