import { Link, NavLink, Outlet } from 'react-router';
import brand from '../../assets/brand/chii-logo.svg';
import { Avatar } from '../../components/ui/surfaces.jsx';
import { useAuth } from '../auth/use-auth.js';
import chevron from './assets/chevron.svg';
import './library.css';

export function LibraryLayout() {
  const { user, guest, kind } = useAuth();
  const guestView = kind === 'guest';

  return (
    <div className="ck-library" key={user?.id ?? guest?.sessionId ?? kind}>
      <header className="ck-library-header">
        <div className="ck-library-header__inner">
          <Link
            className="ck-library-brand"
            to={guestView ? '/invitation' : '/home'}
          >
            <img src={brand} alt="" width="42" height="46" />
            Chiikaiwa
          </Link>
          <nav className="ck-library-nav" aria-label="Điều hướng chính">
            {!guestView && <NavLink to="/home">Trang chủ</NavLink>}
            <NavLink to={guestView ? '/invitation' : '/match'}>
              Luyện nói
            </NavLink>
            <NavLink to="/topics">Kho chủ đề</NavLink>
            <NavLink to="/saved">Ôn cá nhân</NavLink>
            {!guestView && <NavLink to="/history">Lịch sử</NavLink>}
          </nav>
          {user && (
            <Link
              className="ck-library-account"
              to="/profile"
              aria-label={`Hồ sơ của ${user.displayName}`}
            >
              <Avatar name={user.displayName} size={32} />
              <span>{user.displayName}</span>
              <img src={chevron} alt="" width="14" height="14" />
            </Link>
          )}
        </div>
      </header>
      <div className="ck-library-content">
        <Outlet />
      </div>
    </div>
  );
}
