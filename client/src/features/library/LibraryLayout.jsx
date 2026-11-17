import { Outlet } from 'react-router';
import { useAuth } from '../auth/use-auth.js';
import './library.css';

export function LibraryLayout() {
  const { user, guest, kind } = useAuth();

  return (
    <div className="ck-library" key={user?.id ?? guest?.sessionId ?? kind}>
      <div className="ck-library-content">
        <Outlet />
      </div>
    </div>
  );
}
