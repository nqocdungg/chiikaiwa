# Chiikaiwa

Website luyện hội thoại tiếng Nhật. Repository hiện gồm frontend shell, Express API và nền tảng development; các tính năng nghiệp vụ chưa được triển khai.

[Tài liệu dự án](docs/README.md) · [Hướng dẫn đóng góp](CONTRIBUTING.md)

## Tech stack

- JavaScript ES modules, Node.js 24.x, npm 11.21.1, npm workspaces.
- Frontend: React, Vite, React Router, Tailwind CSS.
- Backend: Express, Mongoose, MongoDB replica set.
- Tooling: ESLint, Prettier, JavaScript type checking, Vitest, Testing Library, Supertest.
- Deployment: Vercel, frontend và API cùng origin.

## Getting started

Cài Node.js 24.x, sau đó chạy các lệnh tại root repository:

```sh
npm install --global npm@11.21.1
npm ci
cp .env.example .env
```

Trên PowerShell, thay lệnh `cp` bằng `Copy-Item .env.example .env`.

Khởi động MongoDB local trong terminal riêng:

```sh
npm run db:dev
```

Database chạy tại `127.0.0.1:27018`, lưu dữ liệu trong `.data/mongodb`. Lần đầu cần tải MongoDB 8.2.7; có thể dùng binary đã cài bằng `MONGOMS_SYSTEM_BINARY` theo `.env.example`. Nếu dùng Atlas development, cấu hình `MONGODB_URI` và `MONGODB_DB_NAME` rồi bỏ qua lệnh này. Database phải hỗ trợ transaction.

Trong terminal thứ hai:

```sh
npm run db:migrate
npm run dev
```

- Frontend: [http://127.0.0.1:5173](http://127.0.0.1:5173).
- API: `http://127.0.0.1:3000/api/v1` mặc định.
- Health check: [GET /api/v1/health](http://127.0.0.1:5173/api/v1/health), trả 503 khi database không sẵn sàng.

Vite proxy `/api` tới backend theo `PORT` trong environment hoặc `.env`. Khởi động lại development server sau khi đổi cấu hình. Không commit `.env`.

## Commands

| Command                                    | Purpose                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `npm run dev`                              | Chạy frontend và API với hot reload/watch                          |
| `npm run lint`                             | Kiểm tra ESLint                                                    |
| `npm run format` / `npm run format:check`  | Format / kiểm tra định dạng                                        |
| `npm run typecheck`                        | Kiểm tra kiểu JavaScript/JSDoc, không sinh file                    |
| `npm test` / `npm run test:watch`          | Chạy / theo dõi unit, HTTP và component tests                      |
| `npm run test:integration`                 | Kiểm tra trên MongoDB replica set tạm                              |
| `npm run check`                            | Chạy format check, lint, typecheck, tests và build                 |
| `npm run build`                            | Build frontend vào `client/dist` và kiểm tra cú pháp entry backend |
| `npm start`                                | Chạy API không watch                                               |
| `npm run preview --workspace client`       | Xem frontend đã build; không chạy API                              |
| `npm run db:status` / `npm run db:migrate` | Xem / thực hiện migration                                          |

Integration tests tự tạo và dọn database tạm, không đọc `.env`. Nếu dùng binary MongoDB đã cài để chạy tests, đặt `MONGOMS_SYSTEM_BINARY` trong environment của terminal.

## Project structure

```text
chiikaiwa/
├── client/
│   ├── src/
│   │   ├── components/       Component dùng chung
│   │   ├── features/         Giao diện, hooks và API theo chức năng
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── jsconfig.json
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── config/               Environment validation
│   ├── integrations/         Adapter dịch vụ ngoài
│   ├── middleware/           HTTP middleware
│   ├── modules/              Nghiệp vụ theo module
│   ├── persistence/
│   │   ├── migrations/       Các migration được version hóa
│   │   ├── database.js
│   │   └── migrations.js
│   ├── app.js                Express app
│   ├── start.js              HTTP server cho local
│   ├── jsconfig.json
│   └── package.json
├── api/
│   └── index.js              Entry Vercel Function
├── scripts/                  Database CLI và local development
├── tests/
│   ├── client/               Component tests
│   ├── server/               Unit và HTTP tests
│   └── integration/          Database integration tests
├── .github/workflows/        CI
├── docs/                     Thiết kế và hướng dẫn development
├── AGENTS.md                 Chỉ dẫn agent
├── CONTRIBUTING.md           Quy trình đóng góp
├── package.json
├── package-lock.json
├── eslint.config.js
├── jsconfig.json
├── vitest.config.js
├── vercel.json
└── README.md
```

Code của từng chức năng đặt trong `client/src/features/<feature>/` và `server/modules/<module>/`. Chỉ đưa component dùng chung vào `client/src/components/`; tích hợp dịch vụ ngoài đặt trong `server/integrations/`. Các thư mục chưa có code dùng `.gitkeep` để được giữ trong Git; xóa file này khi thêm source đầu tiên.

Giữ nghiệp vụ trong service và xử lý HTTP trong controller. Không import mã server vào frontend. Dependency runtime đặt tại workspace sử dụng; tooling dùng chung đặt tại root. Ghim phiên bản dependency và cập nhật lockfile khi thay đổi.

## Database migrations

Application startup không tự tạo collection/index hoặc chạy migration. Thêm schema và index theo từng module qua migration trước khi mở API ghi dữ liệu. Hiện chưa có migration hoặc seed nghiệp vụ.

Xem [migration guide](server/persistence/migrations/README.md) để thêm migration, xử lý lock và kiểm tra checksum.

## Deployment

Vercel sử dụng root repository và cấu hình trong `vercel.json`. Chọn Node.js 24.x, cấu hình environment server và `APP_ORIGIN` HTTPS. Preview dùng database riêng. CI chạy `npm ci` và `npm run check`; không tự deploy.

Đối chiếu [tài liệu thiết kế](docs/README.md) khi triển khai nghiệp vụ. Quy trình làm việc, Git conventions và yêu cầu kiểm chứng được quản lý trong [CONTRIBUTING.md](CONTRIBUTING.md).
