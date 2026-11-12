# Project Progress Handoff

File này giúp agent hoặc thành viên tiếp theo nắm nhanh task đã làm và biết cần tiếp tục từ đâu.

- Mỗi task một mục, đặt ở sprint tương ứng. Cập nhật mục đó nếu có thay đổi; không tạo mục cho từng lần làm.
- Ghi thông tin ngắn gọn, đúng thực tế. Không ghi secret.
- Tiến độ và giờ làm đang chạy vẫn cập nhật trong [Project Tracker](https://docs.google.com/spreadsheets/d/1KHBM3jEzq8Xwzja7hEvauExb6wlh72pM9962bpQcgSk/edit).

## Mẫu cập nhật

```markdown
### <TASK-ID> — <Tên task>

- Ngày cập nhật: YYYY-MM-DD
- Trạng thái: <Đã xong / Còn dở / Bị chặn>
- PR: <link hoặc Chưa có>
- Đã làm: <kết quả chính>
- File liên quan: <đường dẫn>
- Kiểm chứng: <lệnh và kết quả, hoặc Chưa chạy>
- Tiếp theo: <việc cụ thể agent sau cần làm, hoặc Không có>
- Lưu ý/blocker: <điều cần biết, hoặc Không có>
```

## Sprint 1

### FE-002 — Tích hợp Home có sẵn và bổ sung landing

- Ngày cập nhật: 2026-11-12
- Trạng thái: Đã hoàn thành triển khai và kiểm chứng local; chờ review của Ngọc Dung.
- PR: Chưa có; branch `feature/FE-002-home-landing`, base `develop`.
- Đã làm: Bổ sung màn hình Landing công khai (`SC-01`) tại route `/` (giới thiệu luyện 1-1, thẻ tình huống, dàn nhân vật `Friends` alt rỗng, CTA Đăng nhập/Đăng ký/Mã mời, không ép đăng nhập, không số liệu giả). Tích hợp Trang chính (`SC-03`) tại `/home` với dữ liệu người học thật từ `AuthContext` (`GET /auth/me`), gọi `GET /me/coordination` hiển thị banner quay lại luồng đang chiếm chỗ (inSession, searching, proposed, inviting) chống tạo luồng thứ hai. Chuyển các nút góc học tập sang link React Router (`/topics`, `/saved`, `/history`), loại bỏ modal mockup và footer demo. Giữ prop `onStart` tùy chọn bảo đảm tương thích ngược với `KaiwaDemo.jsx` và Storybook.
- File liên quan: `client/src/features/landing/Landing.jsx`, `client/src/features/home/Home.jsx`, `client/src/App.jsx`, `tests/client/landing.test.jsx`, `tests/client/home.test.jsx`, `docs/PROGRESS-TRACKER.md`.
- Kiểm chứng: `npm run check` pass 100%: format check, ESLint 0 warnings, TypeScript 0 errors, 270 unit tests pass (gồm 3 tests landing và 7 tests home), 111 integration tests pass, build client Vite và Storybook pass thành công. `npm audit --audit-level=high` pass (0 high/critical).
- Tiếp theo: Mở PR về `develop`, theo dõi kết quả CI Actions và nhờ Ngọc Dung review theo phân công.
- Lưu ý/blocker: Không có.

### OPS-004 — Thiết lập CI cho pull request

- Ngày cập nhật: 2026-11-08
- Trạng thái: Đã cấu hình và kiểm chứng workflow local; chờ nghiệm thu pass/fail trên PR.
- PR: Chưa có; branch `chore/OPS-004-update-ci`, base `develop`.
- Đã làm: Rà soát `.github/workflows/ci.yml`; ghim Node.js theo `.nvmrc` (Node 24.x) và npm theo `packageManager` trong `package.json` (`npm@11.21.1`); cài đặt sạch bằng `npm ci`; cấu hình job `check` chạy `npm run check` trên `pull_request` và push `develop`/`main`. Hai job bảo mật `dependency-audit` (`npm audit --audit-level=high`) và `secret-scan` (Gitleaks `v8.30.1` SHA-256 pinned) chạy song song độc lập. Workflow không sử dụng secrets, không kết nối database ngoài và không tự deploy.
- File liên quan: `.github/workflows/ci.yml`, `docs/PROGRESS-TRACKER.md`.
- Kiểm chứng: `npm ci` và `npm run check` pass 100% cục bộ: Prettier format check, ESLint zero warnings, TypeScript typecheck 0 errors, 217 unit tests pass, 57 integration tests pass trên MongoDB Replica Set tạm, build website Vite và Storybook pass. Job `dependency-audit` pass với 0 cảnh báo mức high/critical. Job `secret-scan` được bảo vệ theo `.gitleaksignore`.
- Tiếp theo: Mở PR về `develop`, thực hiện kịch bản kiểm chứng: 1 check cố ý fail để chứng minh CI chặn lỗi, sau đó sửa lại để CI pass xanh toàn bộ; nhờ Minh Xuân review.
- Lưu ý/blocker: Không dùng secret hay database demo cho integration test. Giữ nguyên các ruleset và cấm skip bước trong `npm run check`.

### OPS-003 — Khởi tạo môi trường tích hợp HTTPS và cấu hình dịch vụ

- Ngày cập nhật: 2026-11-07
- Trạng thái: Đã triển khai transport, tài liệu và self-test local; chờ review và nghiệm thu online.
- PR: Chưa có; branch `chore/OPS-003-configure-https-integration`, base `develop@c650765`, không cấu hình upstream vào nhánh chung.
- Đã làm: Tuyến `POST /api/v1/webhooks/livekit` nhận Buffer raw trước JSON parser, giữ Authorization và không yêu cầu cookie/CSRF. Chỉ nhận `application/webhook+json`, giới hạn 1 MiB, từ chối nén. Chưa có handler thì trả 503, không báo xử lý thành công. Điểm nối `handleLivekitWebhook` dành cho BE-011; chưa xác minh chữ ký, dedup hoặc cập nhật presence.
- File liên quan: `server/app.js`, `server/middleware/error-handler.js`, `tests/server/webhook-transport.test.js`.
- Kiểm chứng: `npm ci` và `npm run check` pass: format/lint/typecheck, 195 unit/HTTP/component tests, 36 integration tests, build website và Storybook. Trong đó 8 ca HTTP OPS-003 kiểm hash raw bytes (whitespace/Unicode), Authorization, cookie HTTPS/CSRF, Content-Type, nén, kích thước, thiếu handler và lỗi async. Node 24.22.2/npm 11.21.1, MongoDB 8.2.7 replica set tạm; không dùng Atlas cho test local. Storybook còn cảnh báo chunk lớn, không chặn build. Liên kết local và `git diff --check` pass. Không thêm dependency hoặc sửa manifest/lockfile.
- Evidence online nền tảng: Vercel project `chiikaiwa` đã đặt Node 24.x; Production `main@0cb878e`, deployment `dpl_6FbdBRPxM3NLxUFH7hCCLVhSZabK`, [health](https://chiikaiwa.vercel.app/api/v1/health) trả `ok` sau redeploy. Đây là bản nền tảng trước OPS-003, chưa có auth/CSRF và transport mới; không dùng kết quả này để kết luận AV-01 đầy đủ.
- Tiếp theo: Tạo PR về `develop`, chạy CI và nhờ Minh Xuân review theo thống nhất. Sau khi có Preview env riêng, kiểm smoke AV-01, cookie/deep link, raw body qua proxy và kết nối instance mới; ghi URL/build và actual/evidence. Bàn giao cho BE-010/011, QA-003/005 kiểm media thật sau tích hợp.
- Lưu ý/blocker: Nhóm xác nhận chưa có database Preview đã migration và LiveKit test; hoàn tất local trước, online còn chờ. Biến hiện chỉ có ở Production, không sao chép credentials sang Preview. Quota/cộng tác Hobby và hạn mức từng dịch vụ cần xác nhận bằng dashboard trước nghiệm thu. Không sửa Sheets, thiết kế 01–07 hoặc deploy code mới trong lượt này.

#### Cấu hình và kiểm chứng tiếp theo

- Vercel: Root Directory `./`, preset Other, Node 24.x; giữ `vercel.json` với `npm ci`, `npm run build`, output `client/dist` và API trước SPA fallback. Dùng Preview của branch task hoặc `develop` để kiểm tích hợp; không merge vào `main` chỉ để test. Đọc [kiến trúc §11](design/05-system-architecture.md#11-triển-khai-và-vận-hành) cho quy tắc dịch vụ/hạn mức.
- Env: `APP_ORIGIN` khớp origin HTTPS đang kiểm; `JWT_SECRET` và `MONGODB_URI` là Secret riêng theo môi trường. `MONGODB_DB_NAME` trỏ database thử đã có migration/index; pool `5`, server selection timeout `5000`. Giữ issuer/audience `chiikaiwa`/`chiikaiwa-web`. Các biến cấu hình đã lưu dạng Secret vẫn hoạt động, không cần tạo lại. Không import `NODE_ENV=development`, `PORT`, `MONGOMS_SYSTEM_BINARY` từ local; kiểm runtime Production chạy `NODE_ENV=production`. Thay env cần deployment mới. Preview tách database, JWT secret và project/namespace LiveKit khỏi demo; không đưa secret vào `VITE_*` hoặc logs.
- Smoke AV-01 trên build mới: refresh `/login`, `/topics`; API sai trả JSON 404; asset thiếu trả 404 thay vì HTML; health trả `ok` ở lần đầu và lần sau trên deployment mới, ghi độ trễ riêng. Kiểm `/api/v1/auth/csrf` cấp token và cookie `HttpOnly; Secure; SameSite=Lax; Path=/`, không `Domain`; request ghi thiếu CSRF/sai Origin trả 403. Kiểm logs/bundle không lộ secret. Lưu URL, commit, environment, ngày/tester, actual và evidence; health không chứng minh transaction/unique của AV-02. Xem [testing guide](development/testing.md).
- BE-011 nối handler bằng `createApp({ handleLivekitWebhook })`, nhận Buffer nguyên byte và Authorization, xác minh chữ ký trước khi ghi dữ liệu. Thiếu handler trả 503; sai Content-Type/nén trả 415; quá lớn trả 413. BE-011 phụ trách chữ ký sai 401, dedup, presence và 204 sau xử lý hợp lệ. Test hash local chưa chứng minh raw body qua proxy Vercel; phần online cần request kiểm soát và đối chiếu checksum, không echo payload/credential hoặc mở endpoint debug công khai. Chưa cấu hình giao webhook thật trước khi handler sẵn sàng và xác nhận LiveKit truy cập được endpoint qua lớp bảo vệ deployment. [API §11](design/07-api-specification.md#11-webhook-thông-báo-và-vận-hành), [LiveKit webhook](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/) (đối chiếu 2026-11-07).

### OPS-002 — MongoDB indexes và transaction

- Ngày cập nhật: 2026-11-03
- Trạng thái: Đã hoàn thành
- PR: 49ebcbf4aec5fc10bf62c08dee1638352ff98c6a
- Đã làm: Cấu hình kết nối/reuse MongoDB, transaction helper và duplicate-key handling; thêm migration indexes chạy lặp an toàn; thêm kiểm tra index Atlas theo key/options. Atlas đã hiện migration record và các collections theo ảnh đã gửi.
- File liên quan: `server/persistence/database.js`, `server/persistence/migrations/`, `scripts/verify-atlas-transaction.js`, `server/persistence/index-definition.js`, `tests/integration/database.test.js`.
- Kiểm chứng: Người thực hiện đã báo integration tests pass và migration chạy được; `npm run typecheck` pass ngày 2026-11-03. Chưa có bằng chứng đã chạy `npm run check` hoặc `npm run db:verify-atlas-transaction` trên Atlas.
- Tiếp theo: Chạy `npm run check`; trên Atlas `chiikaiwa_dev`, xác nhận migration chạy hai lần và kiểm tra index; chạy `npm run db:verify-atlas-transaction`. Ghi kết quả/evidence và cập nhật trạng thái, review, PR trong Project Tracker.
- Lưu ý/blocker: Không sửa migration `20261103000100-add-design-indexes.js` đã áp dụng; migration checksum phải giữ nguyên. Branch hiện tại có commits `b0edaeb` và `652f4c5`.

### BE-004 — Models mục đã lưu và nguồn kiến thức

- Ngày cập nhật: 2026-11-05
- Trạng thái: Đã triển khai và self-test; chờ review của Hạnh Nhi.
- PR: Chưa xác minh URL; branch `feature/BE-004-saved-items-models`, base `develop` tại `fef323b`.
- Đã làm: Models và repository cho `saved_items`/`saved_sources`; unique owner–knowledge và nguồn theo revision/context. Ghi trong transaction, bỏ lưu bằng version/CAS, giữ ID/nguồn và không thay tiến độ FSRS. Từ chối reference tùy chọn bằng null; kiểm tra nguồn trước khi ghi item. Dùng lại migration/index hiện có.
- File liên quan: `server/modules/learning/saved-item-models.js`, `server/modules/learning/saved-item-repository.js`, `tests/server/saved-item-models.test.js`, `tests/integration/saved-items.test.js`.
- Kiểm chứng: Unit schema 15/15 pass; integration BE-004 11/11 pass khi shuffle seed 42 và 87. Đã sửa cleanup đủ bốn collection để test không phụ thuộc thứ tự. `npm run check` pass: format/lint/typecheck, 58 unit/HTTP/component tests, 17 integration tests, build sản phẩm và Storybook. Môi trường Node 24.22.2/npm 11.21.1, MongoDB 8.2.7 replica set tạm, không dùng Atlas. Storybook có cảnh báo chunk lớn, không chặn build. `git diff --check` pass.
- Truy vấn nguồn: Lấy knowledgeId từ item cùng owner rồi lọc source theo owner/knowledge/item. Với 100 item và 200 source của một owner, `explain` xét 2 source thay vì 200, cộng một lần đọc item; vẫn sort các nguồn của riêng knowledge đó. Không thêm index.
- Tiếp theo: Xác nhận URL PR/evidence, chạy CI trên PR và nhờ Hạnh Nhi review. OPS-002 đã có evidence và được bảng ghi nhận DoD; thiếu actual/remaining không chặn nghiệm thu.
- Lưu ý tích hợp: Service xác thực owner, kiểm tra quyền revision/nguồn phiên, guest guard và receipt trong cùng transaction. `listSavedSources` trả Promise danh sách; API cần áp phân trang/projection theo contract. Chưa nghiệm thu HTTP hoặc Atlas cho chức năng đã lưu.

### BE-006 — Kiểm chứng và ghim FSRS-6

- Ngày cập nhật: 2026-11-06
- Trạng thái: Đã triển khai và self-test; chờ review.
- PR: Chưa có; branch `feature/BE-006-verify-fsrs-six`, base `develop` tại `b96d828`.
- Đã làm: Ghim `ts-fsrs@6.0.0`, chọn rõ FSRS-6 và 21 weights của SRS. Khóa retention 0,90, learning 1m/10m, relearning 10m, tắt fuzz, giới hạn 36.500 ngày và ngày lịch UTC. Cấu hình bất biến có hash; từ chối config/tiến độ không khớp. Preview và review dùng chung luồng tính thuần, trả trạng thái/log draft và không sửa input hay ghi database.
- File liên quan: `server/integrations/fsrs.js`, `server/integrations/fsrs-config.js`, `tests/server/fsrs.test.js`, `tests/fixtures/fsrs-reference.json`, `scripts/generate-fsrs-fixtures.py`, manifest/lockfile và thiết kế 02/05/06.
- Kiểm chứng: `npm ci` và `npm run check` pass: format/lint/typecheck, 187 unit/HTTP/component tests, 31 integration tests, build sản phẩm và Storybook. 60 test FSRS pass cả khi shuffle seed 20261106, gồm 27 kết quả tham chiếu từ công thức độc lập cho chín tình huống và 11 ca thiếu từng trường tiến độ đang ôn bắt buộc, kiểm tra cả preview/review; fixture tái tạo được và các liên kết local hợp lệ. Node 24.22.2/npm 11.21.1, MongoDB 8.2.7 replica set tạm, không dùng Atlas. Storybook có cảnh báo chunk lớn/timing, không chặn build. `git diff --check` pass; chưa có kết quả CI.
- Tiếp theo: Mở PR về `develop`, chạy CI, fixture cùng adapter. Chỉ đánh dấu Done sau khi đạt DoD của nhóm.
- Lưu ý tích hợp: BE-014/BE-025 cùng dependencies lưu `scheduler_configs`, gắn owner/card/revision/version vào log, kiểm tra ticket/quyền và commit progress/log/statistics với CAS/receipt. Chưa nghiệm thu retry chỉ ghi một lần hoặc toàn bộ AV-06. Quyết định cấu hình tại [SRS §6.2](design/02-srs.md#62-đầu-vào-đầu-ra-và-quy-tắc-tính), adapter tại [kiến trúc §9.2](design/05-system-architecture.md#92-fsrs), cấu hình lưu trữ tại [database §8.4](design/06-database-design.md#84-review_logs-và-scheduler_configs).

#### Bàn giao adapter và fixture BE-006

Gọi `previewCard(progress, now, schedulerConfig)` hoặc `reviewCard(progress, now, rating, schedulerConfig)` từ `server/integrations/fsrs.js`; config export từ `fsrs-config.js` cùng thư mục. `now` lấy ở server; `null` biểu thị chưa có tiến độ. Tiến độ có sẵn dùng contract database §8.3, timestamps là `Date`, trường tùy chọn vắng mặt thay vì `null`. Adapter ánh xạ `state` sang enum thư viện và `learningSteps` sang `learningStep`; từ chối config khác, tiến độ mang config ID khác hoặc thời điểm trước lần ôn trước.

Preview trả ba kết quả qua cùng luồng review. Review trả `{ progress, log }`; log gồm rating, `reviewedAt`, before/after state và config ID. Các snapshot độc lập; cả hai hàm không sửa input hoặc ghi database. Log đầu ra là bản nháp: service phải bổ sung danh tính, revision, version và thông tin chống lặp trước khi ghi transaction. Khi commit lấy lại giờ server và tính lại, không dùng lịch preview cũ.

Fixture có 27 kết quả cho chín tình huống, được tạo từ công thức FSRS-6 độc lập và bảng bước học theo policy đã khóa. Script Python chỉ dùng standard library, không import adapter/ts-fsrs. D/S tham chiếu không làm tròn trung gian; sai số cho phép là `1e-7 × max(1, |tham chiếu|)` để bao phủ sai số làm tròn native. State, thời điểm, counters, elapsed/scheduled days và config ID phải khớp chính xác. Đây là kiểm chứng công thức cùng bảng policy, không phải đối chiếu hai thư viện có policy tương đương.

Tái tạo bằng `python scripts/generate-fsrs-fixtures.py`, rồi `npx prettier --write tests/fixtures/fsrs-reference.json`; chạy `npx vitest run --project server tests/server/fsrs.test.js`. Test/CI thông thường chỉ đọc JSON, không cần Python. Thay fixture phải review config, input và công thức; không sinh lại expected để bỏ qua sai khác chưa giải thích. Nguồn công thức và ngày đối chiếu được ghi trong fixture; policy nguồn được kiểm tra từ npm package `ts-fsrs@6.0.0`.

### BE-010 — Cấp token LiveKit cho đúng thành viên

- Ngày cập nhật: 2026-11-06
- Trạng thái: Đã triển khai và self-test; chờ tích hợp BE-009, LiveKit thật và review.
- PR: Chưa có; branch `feature/BE-010-livekit-media-token`, chưa commit/push.
- Đã làm: API cấp token đúng room/identity, kiểm tra quyền và deadline trước/sau ký; auth/CSRF/rate limit, receipt không lưu token; gom lỗi lặp trong module Sessions.
- File liên quan: `server/modules/sessions/`, `server/integrations/livekit/media-token.js`, `server/config/env.js`, `server/app.js`, manifest/lockfile và hai file test media-token.
- Kiểm chứng: `npm run check` pass: 135 unit/HTTP/component tests, 45 integration tests và hai build; `git diff --check` pass. Review độc lập không còn Must fix. Tests dùng DB tạm/credential giả, chưa thử Atlas hoặc LiveKit thật.
- Tiếp theo: Review/CI; tích hợp phiên BE-009 và kiểm tra hai thành viên kết nối LiveKit. OPS-003 cấu hình ba env LiveKit; BE-011 xử lý webhook, BE-012 quản lý vòng đời/thu hồi.
- Lưu ý: Token tối đa 10 phút, giới hạn theo deadline quyền; kiểm tra lại không thay thế thu hồi media. Receipt hiện theo API 07 §2.2; việc miễn media-token cần nhóm chốt contract trước khi bỏ.

### BE-011 — Xử lý webhook LiveKit và xác nhận hiện diện

- Ngày cập nhật: 2026-11-11
- Trạng thái: Đã triển khai và kiểm thử local; chờ tích hợp consumer vòng đời BE-012, LiveKit thật, review nhóm và CI.
- PR: Chưa có; branch `feature/BE-011-livekit-webhook`, chưa commit/push.
- Đã làm: Nối handler mặc định cho `POST /api/v1/webhooks/livekit`; xác minh raw body/Authorization bằng SDK trước ghi DB. Dedup eventId 7 ngày bằng index đã migration; receipt/presence/consumer cùng transaction. Kiểm tra roomName/thành viên/SID/thời điểm/trạng thái, không tin connected từ client; SID đóng không mở lại sau khi receipt bị dọn. Đối soát participant active khi SID mâu thuẫn, không gọi mạng trong transaction và kiểm lại version sau đối soát. Không tự triển khai state machine bắt đầu/kết thúc.
- File liên quan: `server/integrations/livekit/{webhook,room-service}.js`, `server/modules/sessions/livekit-webhook-{handler,service}.js`, `server/app.js`, chú thích `server/config/env.js`, `.env.example`, `docs/api/openapi.yaml`, `docs/development/local.md`, fixture/test webhook và test OpenAPI/transport.
- Kiểm chứng: Lint, typecheck, `npm test` (260 ca) và `npm run test:integration` (111 ca trên MongoDB 8.2.7 replica set tạm) pass; `npm run openapi:check` pass 5 ca; `npm run build` và `npm run build-storybook` pass. Node 24.19.0/npm 11.21.1; Storybook còn cảnh báo chunk lớn, không chặn build. Nhóm mục tiêu webhook/transport/OpenAPI pass 43 ca, gồm 20 integration tests kiểm receipt tối thiểu, rollback/retry, hai join đồng thời, SID cũ/cùng giây, thiếu webhook join, race lúc đối soát và terminal/deadline. Fixture consumer mô phỏng bắt đầu một lần để kiểm tra ranh giới transaction, chưa chứng minh BE-012 thật. Format các file task, liên kết tài liệu local và `git diff --check` pass. Review độc lập bằng agent không còn Must fix; chưa có human approval hoặc CI.
- Giới hạn check: `npm run check` đã chạy nhưng dừng tại format check của `.vscode/settings.json` chưa track có sẵn trước task. Giữ nguyên file này; chạy riêng các gate còn lại, không bỏ test hoặc sửa expected để pass.
- Điểm nối BE-012: `createApp({ onVerifiedPresence })`; callback nhận `{event,before,after,presenceChanged,reason,session,observedAt}`, ghi nghiệp vụ bằng cùng Mongo session/version và không gọi dịch vụ ngoài. `presenceChanged=false` không công nhận kết nối; join vào ended/hết hạn và `room_finished` vẫn chuyển callback để xử lý deadline/cleanup. Consumer có thể bị driver chạy lại, nên tác dụng ngoài transaction phải lưu trạng thái bền cho BE-012 xử lý tiếp.
- Tiếp theo: Nối consumer BE-012 và nghiệm thu state machine bắt đầu đúng một lần/thu hồi media thật. Cấu hình project LiveKit test, ba env và webhook qua HTTPS tunnel/Preview theo hướng dẫn local; kiểm media hai tài khoản, ghi build/environment/actual/evidence. Mở PR về `develop`, chạy CI và nhờ reviewer khác owner kiểm AC; chưa cập nhật Sheets hoặc đánh dấu Done.
- Lưu ý: Khi thiếu consumer, sự kiện participant của thành viên/room_finished thuộc phiên đã biết trả 503 và rollback cả receipt/presence để không nuốt sự kiện. Entry mặc định hiện chưa nối BE-012; không cấu hình webhook thật vào build này để nghiệm thu vòng đời. Không thử credentials thật, Atlas/Vercel hoặc deploy trong task này; không sửa thiết kế 01–07, migration/index hay dependency.

## Sprint 2

Chưa có cập nhật.

## Sprint 3

Chưa có cập nhật.
