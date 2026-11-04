import { Link, Route, Routes } from 'react-router';
import { AuthProvider } from './features/auth/AuthContext.jsx';
import {
  ProtectedRoute,
  PublicOnlyRoute,
  SessionMemberRoute,
} from './components/RouteGuards.jsx';

/**
 * Minimal route shell container for FE-001 routing hierarchy (SC-01–20).
 * Feature screens are mounted into these routes by their respective tasks.
 *
 * @param {{ screenId: string, title: string, description?: string, children?: import('react').ReactNode }} props
 */
function RouteShell({ screenId, title, description, children }) {
  return (
    <section data-screen-id={screenId}>
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
  return (
    <AuthProvider skipInitialCheck={skipInitialAuthCheck}>
      <div className="ck-app">
        <main className="mx-auto max-w-4xl px-6 py-12">
          <Routes>
            {/* SC-01: Public Landing */}
            <Route
              path="/"
              element={
                <RouteShell
                  screenId="SC-01"
                  title="Chiikaiwa"
                  description="Website luyện hội thoại tiếng Nhật 1-1 theo vai và thẻ tình huống."
                />
              }
            />

            {/* SC-02: Public Only Auth routes */}
            <Route element={<PublicOnlyRoute />}>
              <Route
                path="/login"
                element={<RouteShell screenId="SC-02" title="Đăng nhập" />}
              />
              <Route
                path="/register"
                element={<RouteShell screenId="SC-02" title="Đăng ký" />}
              />
              <Route
                path="/forgot-password"
                element={<RouteShell screenId="SC-02" title="Quên mật khẩu" />}
              />
              <Route
                path="/reset-password"
                element={
                  <RouteShell screenId="SC-02" title="Đặt lại mật khẩu" />
                }
              />
            </Route>

            {/* SC-03 - SC-05, SC-13, SC-16, SC-18: User-only routes (U) */}
            <Route element={<ProtectedRoute allowedRoles={['U']} />}>
              <Route
                path="/home"
                element={<RouteShell screenId="SC-03" title="Trang chính" />}
              />
              <Route
                path="/profile"
                element={<RouteShell screenId="SC-04" title="Hồ sơ cá nhân" />}
              />
              <Route
                path="/match"
                element={
                  <RouteShell screenId="SC-05" title="Tìm bạn Tomodachi" />
                }
              />
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

            {/* SC-06, SC-11, SC-12, SC-14, SC-15: Learner or Guest routes (U / G) */}
            <Route element={<ProtectedRoute allowedRoles={['U', 'G']} />}>
              <Route
                path="/invitation"
                element={<RouteShell screenId="SC-06" title="Phòng mời" />}
              />
              <Route
                path="/topics"
                element={<RouteShell screenId="SC-11" title="Kho chủ đề" />}
              />
              <Route
                path="/saved"
                element={
                  <RouteShell screenId="SC-12" title="Kiến thức đã lưu" />
                }
              />
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
                path="/room/:sessionId"
                element={
                  <RouteShell screenId="SC-07" title="Phòng hội thoại" />
                }
              />
              <Route
                path="/sessions/:sessionId/summary"
                element={<RouteShell screenId="SC-10" title="Tổng kết phiên" />}
              />
            </Route>

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
                <RouteShell screenId="SC-404" title="Không tìm thấy trang">
                  <Link className="mt-4 inline-block underline" to="/">
                    Về trang chủ
                  </Link>
                </RouteShell>
              }
            />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}
