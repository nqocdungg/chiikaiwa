import { Link } from 'react-router';
import chiiLogo from '../../assets/brand/chii-logo.svg';
import chiikawaPeek from '../../assets/mascots/chiikawa-peek.webp';
import hachiwareFace from '../../assets/mascots/hachiware-face.webp';
import usagiFace from '../../assets/mascots/usagi-face.webp';
import { chiikawa } from '../../assets/mascots/mascots.js';
import { Mascot } from '../../components/Mascot.jsx';
import { Icon } from '../../components/ui/controls.jsx';
import { StudyIcon } from '../../components/ui/StudyIcon.jsx';
import { StudyScene } from '../../components/ui/StudyScene.jsx';
import { useAuth } from '../auth/use-auth.js';
import '../../components/ui/study-studio.css';
import './landing.css';

export function Landing() {
  const { kind, user, role, isLoading } = useAuth();
  const isAuthenticated = kind === 'user' && Boolean(user);
  const isAdmin = role === 'admin';
  const ctaPath = isAdmin ? '/admin' : '/home';
  const ctaNavLabel = isAdmin ? 'Khu vực quản trị' : 'Trang chính';
  const ctaActionLabel = isAdmin ? 'Vào khu quản trị' : 'Vào trang chính';

  return (
    <div className="ck-landing">
      <header className="ck-landing__header">
        <Link
          className="ck-brand"
          to="/"
          aria-label="Chiikaiwa, trang giới thiệu"
        >
          <img src={chiiLogo} alt="" width="36" height="40" />
          <span className="ck-brand-text">Chiikaiwa</span>
          <Mascot
            className="ck-landing__brand-mascot"
            asset={chiikawa}
            alt=""
            width="34"
            height="34"
          />
        </Link>
        <nav className="ck-landing__nav" aria-label="Điều hướng chính">
          {isLoading ? null : isAuthenticated ? (
            <Link to={ctaPath}>{ctaNavLabel}</Link>
          ) : (
            <>
              <Link to="/login">Đăng nhập</Link>
              <Link className="ck-landing__nav-accent" to="/register">
                Đăng ký
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="ck-landing-main" className="ck-home-studio">
        <section className="ck-home-feature" aria-labelledby="landing-heading">
          <div className="ck-home-intro">
            <h1 id="landing-heading">
              Không gian luyện{' '}
              <span className="ck-home-heading-accent">nói</span>
              <br /> tiếng Nhật 1-1
            </h1>
            <p>
              Luyện hội thoại tiếng Nhật 1-1 cùng bạn học qua những tình huống
              đời thường.
            </p>
            <div className="ck-home-start">
              <Link
                className="ck-button ck-button--primary ck-home-action ck-home-action--main"
                to={isAuthenticated ? ctaPath : '/register'}
              >
                <span className="ck-button__content">
                  <StudyIcon name="chat" />
                  {isAuthenticated ? ctaActionLabel : 'Bắt đầu ngay'}
                  <StudyIcon name="chevron" size={24} />
                </span>
              </Link>
              <img
                className="ck-home-start-mascot"
                src={chiikawaPeek}
                alt=""
                width="60"
                height="60"
              />
            </div>
            <div className="ck-home-invite-group">
              <p>Đã có mã từ bạn bè?</p>
              <Link
                className="ck-button ck-button--secondary ck-home-action"
                to="/invitation?mode=join"
              >
                <span className="ck-button__content">
                  <StudyIcon name="join" />
                  Dùng mã mời
                </span>
              </Link>
            </div>
          </div>
          <StudyScene />
        </section>

        <section
          className="ck-home-study ck-landing__features"
          aria-label="Cách luyện tập"
        >
          <div className="ck-home-shortcut">
            <span className="ck-home-shortcut-icon">
              <img src={hachiwareFace} alt="" width="52" height="52" />
            </span>
            <span>
              <strong>Luyện theo tình huống</strong>
              <span className="ck-home-shortcut-description">
                Nhập vai và nói theo thẻ gợi ý.
              </span>
            </span>
          </div>
          <div className="ck-home-shortcut">
            <span className="ck-home-shortcut-icon">
              <img src={usagiFace} alt="" width="52" height="52" />
            </span>
            <span>
              <strong>Ôn lại sau buổi luyện</strong>
              <span className="ck-home-shortcut-description">
                Lưu mẫu câu và từ vựng cần nhớ.
              </span>
            </span>
          </div>
        </section>
        <p className="ck-landing__device-note">
          <Icon name="camera" size={16} /> Mic và camera là tùy chọn.
        </p>
      </main>
    </div>
  );
}
