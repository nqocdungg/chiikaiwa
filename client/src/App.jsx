/// <reference types="vite/client" />

import { lazy, Suspense, useEffect } from 'react';
import { SessionRoom } from './features/kaiwa/SessionRoom.jsx';
import { Link, Outlet, Route, Routes, useLocation } from 'react-router';
import { LearningLayout } from './components/layout/LearningLayout.jsx';
import { LibraryLayout } from './features/library/LibraryLayout.jsx';
import { SavedPage } from './features/library/SavedPage.jsx';
import { TopicDetailPage } from './features/library/TopicDetailPage.jsx';
import { TopicsPage } from './features/library/TopicsPage.jsx';
import {
  InvitationRoute,
  ProtectedRoute,
  PublicOnlyRoute,
  SessionMemberRoute,
} from './components/RouteGuards.jsx';
import { AuthProvider } from './features/auth/AuthContext.jsx';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage.jsx';
import { LoginPage } from './features/auth/LoginPage.jsx';
import { LogoutActionBar } from './features/auth/LogoutActionBar.jsx';
import { RegisterPage } from './features/auth/RegisterPage.jsx';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage.jsx';
import { useAuth } from './features/auth/use-auth.js';
import { Home } from './features/home/Home.jsx';
import { InvitationDialog } from './features/invitation/InvitationDialog.jsx';
import { activeLocationRef } from './features/home/navigation-tracker.js';
import { Landing } from './features/landing/Landing.jsx';
import { MatchPage } from './features/matching/MatchPage.jsx';
import { ProfilePage } from './features/profile/ProfilePage.jsx';

const ComponentPreview = import.meta.env.DEV
  ? lazy(() =>
      import('./demo/ComponentPreview.jsx').then((module) => ({
        default: module.ComponentPreview,
      })),
    )
  : null;

const RoomPreview = import.meta.env.DEV
  ? lazy(() =>
      import('./demo/RoomPreview.jsx').then((module) => ({
        default: module.RoomPreview,
      })),
    )
  : null;

const MatchPreview = import.meta.env.DEV
  ? lazy(() =>
      import('./demo/MatchPreview.jsx').then((module) => ({
        default: module.MatchPreview,
      })),
    )
  : null;

/**
 * Minimal route shell container for FE-001 routing hierarchy (SC-01–20).
 * Feature screens are mounted into these routes by their respective tasks.
 *
 * @param {{ screenId: string, title: string, description?: string, children?: import('react').ReactNode, showLogout?: boolean }} props
 */
function RouteShell({
  screenId,
  title,
  description,
  children,
  showLogout = false,
}) {
  const { role } = useAuth();
  return (
    <section
      data-screen-id={screenId}
      className="ck-route-shell mx-auto max-w-4xl px-6 py-12"
    >
      {(showLogout || role === 'admin') && <LogoutActionBar />}
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {description ? <p className="mt-2 text-muted">{description}</p> : null}
      {children}
    </section>
  );
}

/**
 * @param {{ skipInitialAuthCheck?: boolean }} [props]
 */
export function App({ skipInitialAuthCheck = false } = {}) {
  const location = useLocation();
  useEffect(() => {
    activeLocationRef.current = location;
  }, [location]);
  const { pathname } = location;

  const isRoom = /^\/room\//u.test(pathname);
  if (RoomPreview && pathname === '/__dev/room') {
    return (
      <Suspense fallback={null}>
        <RoomPreview />
      </Suspense>
    );
  }

  if (ComponentPreview && pathname === '/__dev/components') {
    return (
      <div className="ck-app">
        <Suspense fallback={null}>
          <ComponentPreview />
        </Suspense>
      </div>
    );
  }

  if (MatchPreview && pathname === '/__dev/match') {
    return (
      <div className="ck-app">
        <Suspense fallback={null}>
          <MatchPreview />
        </Suspense>
      </div>
    );
  }

  return (
    <AuthProvider skipInitialCheck={skipInitialAuthCheck}>
      <div className={`ck-app ${isRoom ? 'ck-app--room ck-room-view' : ''}`}>
        <Routes>
          {/* SC-01: Public Landing */}
          <Route path="/" element={<Landing />} />

          {/* SC-02: Public Only Auth routes */}
          <Route element={<PublicOnlyRoute />}>
            <Route
              element={
                <main className="ck-page-container py-10">
                  <Outlet />
                </main>
              }
            >
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            <Route
              element={
                <main className="w-full">
                  <Outlet />
                </main>
              }
            >
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>
          </Route>

          <Route element={<SessionMemberRoute />}>
            <Route
              path="/room/:sessionId"
              element={
                <div className="ck-room-route">
                  <SessionRoom />
                </div>
              }
            />
          </Route>

          <Route element={<LearningLayout />}>
            {/* SC-03: Learner Home */}
            <Route
              path="/home"
              element={
                <ProtectedRoute learnerOnly>
                  <Home />
                </ProtectedRoute>
              }
            />

            {/* SC-04, SC-05, SC-13, SC-16, SC-18: User-only routes (U) */}
            <Route element={<ProtectedRoute allowedRoles={['U']} />}>
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/match" element={<MatchPage />} />
              <Route
                path="/decks"
                element={<RouteShell screenId="SC-13" title="Bộ thẻ cá nhân" />}
              />
              <Route
                path="/history"
                element={
                  <RouteShell screenId="SC-16" title="Lịch sử luyện tập" />
                }
              />
              <Route
                path="/blocks"
                element={<RouteShell screenId="SC-18" title="Danh sách chặn" />}
              />
            </Route>

            {/* SC-06: Invitation room — accessible to anonymous visitors (for POST /guest-trials), learners (U), and guests (G) */}
            <Route element={<InvitationRoute />}>
              <Route path="/invitation" element={<InvitationDialog />} />
            </Route>

            {/* SC-11, SC-12, SC-14, SC-15: Learner or Guest routes (U / G) */}
            <Route element={<ProtectedRoute allowedRoles={['U', 'G']} />}>
              <Route element={<LibraryLayout />}>
                <Route path="/topics" element={<TopicsPage />} />
                <Route
                  path="/topics/:topicVersionId"
                  element={<TopicDetailPage />}
                />
                <Route path="/saved" element={<SavedPage />} />
              </Route>
              <Route
                path="/study"
                element={
                  <RouteShell screenId="SC-14" title="Ôn tập Flashcard" />
                }
              />
              <Route
                path="/quiz"
                element={<RouteShell screenId="SC-15" title="Luyện tập Quiz" />}
              />
            </Route>

            {/* SC-07, SC-08, SC-10: Session Member routes (M) — verified with backend */}
            <Route element={<SessionMemberRoute />}>
              <Route
                path="/sessions/:sessionId/summary"
                element={<RouteShell screenId="SC-10" title="Tổng kết phiên" />}
              />
            </Route>
          </Route>

          <Route
            element={
              <main className="ck-page-container py-10">
                <Outlet />
              </main>
            }
          >
            {/* SC-19: Admin area (A) */}
            <Route element={<ProtectedRoute allowedRoles={['A']} />}>
              <Route
                path="/admin/*"
                element={
                  <RouteShell screenId="SC-19" title="Khu vực quản trị" />
                }
              />
            </Route>

            {/* SC-20: Expired / Notice */}
            <Route
              path="/expired"
              element={
                <RouteShell
                  screenId="SC-20"
                  title="Phiên làm việc đã kết thúc"
                  description="Quyền truy cập của bạn đã hết hạn."
                  showLogout
                >
                  <Link className="mt-4 inline-block underline" to="/">
                    Về trang chủ
                  </Link>
                </RouteShell>
              }
            />

            {/* 404: Not Found */}
            <Route
              path="*"
              element={
                <RouteShell
                  screenId="SC-404"
                  title="Không tìm thấy trang"
                  showLogout
                >
                  <Link className="mt-4 inline-block underline" to="/">
                    Về trang chủ
                  </Link>
                </RouteShell>
              }
            />
          </Route>
        </Routes>
      </div>
    </AuthProvider>
  );
}
