# Chạy ứng dụng local

Dùng Node 24, npm 11; chạy tại root repo:

```sh
npm ci
```

Sao chép `.env.example` thành `.env` (PowerShell: `Copy-Item .env.example .env`), rồi chạy MongoDB trong terminal riêng:

```sh
npm run db:dev
```

Database local ở `127.0.0.1:27018`, dữ liệu trong `.data/mongodb`. Lần đầu tải MongoDB; có thể cấu hình `MONGOMS_SYSTEM_BINARY` hoặc dùng Atlas qua `MONGODB_URI` và `MONGODB_DB_NAME`. Database cần replica set để hỗ trợ transaction.

Trong terminal khác:

```sh
npm run db:migrate
npm run dev
```

Frontend: http://127.0.0.1:5173. API mặc định: http://127.0.0.1:3000/api/v1. Vite proxy `/api` tới backend. Health check `/api/v1/health` trả 503 khi database không sẵn sàng. Khởi động lại server sau khi đổi `.env`; không commit file này.

| Lệnh                       | Mục đích                                 |
| -------------------------- | ---------------------------------------- |
| `npm run lint`             | Kiểm tra ESLint                          |
| `npm run typecheck`        | Kiểm tra kiểu JavaScript/JSDoc           |
| `npm run format:check`     | Kiểm tra định dạng                       |
| `npm test`                 | Unit, HTTP và component tests            |
| `npm run test:integration` | Integration với database tạm             |
| `npm run check`            | Các check, tests và build                |
| `npm run build`            | Build frontend và kiểm tra entry backend |
| `npm start`                | Chạy API                                 |
| `npm run db:status`        | Trạng thái migration                     |

Sản phẩm dùng cấu hình Vercel tại `vercel.json`, Node 24, biến môi trường server và `APP_ORIGIN` HTTPS. Preview dùng database riêng. Xem [kiến trúc](../design/05-system-architecture.md) và [migration guide](../../server/persistence/migrations/README.md) trước triển khai.
