import { Link, Route, Routes } from 'react-router';

export function App() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <Routes>
        <Route
          path="/"
          element={<h1 className="text-3xl font-semibold">Chiikaiwa</h1>}
        />
        <Route
          path="*"
          element={
            <>
              <h1 className="text-2xl font-semibold">Không tìm thấy trang</h1>
              <Link className="mt-4 inline-block underline" to="/">
                Về trang chủ
              </Link>
            </>
          }
        />
      </Routes>
    </main>
  );
}
