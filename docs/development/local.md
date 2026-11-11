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

Swagger UI: http://127.0.0.1:3000/api/docs. OpenAPI YAML thô: http://127.0.0.1:3000/api/openapi.yaml. Xem [hướng dẫn OpenAPI](../api/README.md) trước khi thêm hoặc đổi endpoint.

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
| `npm run openapi:check`    | Kiểm tra contract OpenAPI và Swagger UI  |

Sản phẩm dùng cấu hình Vercel tại `vercel.json`, Node 24, biến môi trường server và `APP_ORIGIN` HTTPS. Preview dùng database riêng. Xem [kiến trúc](../design/05-system-architecture.md) và [migration guide](../../server/persistence/migrations/README.md) trước triển khai.

## Kiểm thử webhook LiveKit (BE-011)

Ba biến `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` trong `.env` chỉ dành cho server. Dùng project test riêng; signing key của webhook phải khớp key/secret backend. Không đưa credentials vào `VITE_*`, Git hoặc logs. Auth/health vẫn chạy khi chưa cấu hình LiveKit; webhook thiếu cấu hình trả 503.

Kiểm tra tự động không cần credentials thật hoặc `.env`; fixture ký payload bằng key giả, integration tests dùng MongoDB replica set tạm:

```sh
npx vitest run --project server tests/server/livekit-webhook.test.js tests/server/webhook-transport.test.js tests/server/openapi-contract.test.js
npx vitest run --project integration tests/integration/livekit-webhook.test.js
npm run check
```

### Điểm nối BE-012

`createApp({ onVerifiedPresence })` nối consumer vòng đời vào handler mặc định. Consumer nhận `{event, before, after, presenceChanged, reason, session, observedAt}` sau xác minh chữ ký. `before`/`after` là snapshot phiên trước/sau cập nhật presence; `session` là MongoDB transaction hiện hành. Consumer phải ghi nghiệp vụ bằng chính `session` đó, không mở transaction riêng hoặc gọi dịch vụ ngoài; driver có thể chạy lại callback khi tranh chấp. Ghi nhu cầu thu hồi media bền vững để BE-012 xử lý ngoài transaction.

- `presenceChanged: true`: presence đã thay đổi, version tăng một lần; consumer áp state machine lên snapshot `after` bằng điều kiện version.
- `presenceChanged: false`: không được dùng riêng tên sự kiện để công nhận kết nối. `reason` phân biệt `event.stale`, `connection.unchanged`, `connection.superseded`, `deadline.expired`, `session.ended`, `room.finished` hoặc `event.ignored`.
- `presence.reconciled` dùng Room Service xác minh khi SID/thời điểm mâu thuẫn; kết quả đọc bên ngoài transaction bị bỏ nếu version phiên đã đổi.
- Join vào phiên ended/hết hạn và `room_finished` vẫn chuyển tới consumer, để kiểm tra deadline/ghi nhu cầu cleanup; không tự bật lại presence.
- Receipt 7 ngày, presence và cập nhật consumer cùng commit hoặc rollback. Lỗi consumer trả 503, không giữ receipt để nuốt retry. Replay sau khi receipt bị dọn vẫn phải qua SID/thời điểm/trạng thái.

BE-012 chưa được nối trong entry mặc định. Khi nhận sự kiện participant của thành viên hoặc `room_finished` thuộc phiên đã biết mà thiếu consumer, API trả 503 và rollback. Không cấu hình webhook thật vào build này để nghiệm thu vòng đời cho tới khi tích hợp BE-012. Các sự kiện không tác động nghiệp vụ như `room_started` không công nhận presence; phòng không thuộc môi trường hoặc identity không thuộc phiên được bỏ qua và ghi receipt.

### Kiểm chứng dịch vụ thật sau tích hợp

Chạy backend local, tạo HTTPS tunnel tới `http://127.0.0.1:3000`, rồi đăng ký `https://<tunnel>/api/v1/webhooks/livekit` trong project LiveKit test. Có thể dùng [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) sau khi cài `cloudflared`:

```sh
cloudflared tunnel --url http://127.0.0.1:3000
```

Giữ app ở `http://127.0.0.1:5173` và `APP_ORIGIN` tương ứng; tunnel phục vụ webhook server-to-server, không cần cookie/CSRF. Không bật trang đăng nhập chặn đường webhook. URL tạm thay đổi khi tạo tunnel mới, cần cập nhật cấu hình LiveKit.

Sau khi BE-012 sẵn sàng, dùng hai tài khoản/phiên hợp lệ để kiểm join/leave/reconnect thật. Kiểm cả delivery trên dashboard và presence trong database test; test event từ dashboard không thay thế hai kết nối media. Ghi URL, build/commit, môi trường, thời điểm, actual và evidence; không lưu raw payload/token/secret. Xem [webhook LiveKit chính thức](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/) và [API contract](../api/README.md).
