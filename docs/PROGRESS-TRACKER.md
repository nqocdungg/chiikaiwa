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

- Ngày cập nhật: 2026-11-15
- Trạng thái: Đã hoàn thiện toàn diện vòng 3 theo review của Owner (A1–A5, B1–B3, C1, D1, E1); sẵn sàng cập nhật PR.
- PR: PR #33; branch `feature/FE-002-home-landing`, base `develop`.
- Đã làm: Bổ sung màn hình Landing công khai (`SC-01`) tại route `/` và Trang chính (`SC-03`) tại `/home`. Đồng bộ hoàn toàn với bản thiết kế Figma Make mới và Design System Foundation (`docs/frontend/design-system.md`): bọc `PageContainer`, nhúng logo vector `chii-logo.svg`, thanh điều hướng Floating Pill Bar 5 tab với mascot icon, Centered Hero với 2 linh vật Usagi & Hachiware (đã xử lý trong suốt 100%), nút chính FlowButton `Tìm bạn luyện nói →`, cặp nút `Tạo mã mời`/`Nhập mã` và 3 chip chủ đề nhanh. Nối dữ liệu người học thật qua `AuthContext` (`GET /auth/me`), gọi `GET /me/coordination` hiển thị banner điều phối chống tạo luồng kép (`FR-LRN-01`).
- Sửa theo Reviewer PR #33 (Ngọc Dung & Owner):
  - **A1–A5. Luồng đăng xuất lỗi hoàn thiện (Flash Message Pattern & Quản lý Focus)**: Đọc cờ lỗi vào state cục bộ `logoutNotice` rồi lập tức dọn sạch `history.state` qua `navigate({ pathname, search, hash }, { replace: true, state: null })`, giải quyết triệt để lỗi banner hiện lại khi người dùng Back/Forward đồng thời bảo toàn trọn vẹn query `search` và `hash` URL. Đổi tên nút hành động của banner thành `"Thử đăng xuất lại"` (Should fix) để phân biệt rõ ràng và triệt tiêu xung đột với nút `"Thử lại"` của banner điều phối khi cả hai cùng xuất hiện. Chống điều hướng cưỡng bức khi lỗi đến muộn: sử dụng `activeLocationRef` đồng bộ từ `App.jsx` để kiểm tra vị trí thực tế trước khi điều hướng; nếu người dùng đã rời khỏi Home (ví dụ bấm Back sang `/profile`) trong lúc API đang chờ thì bỏ qua điều hướng, giữ nguyên trang hiện tại của người dùng. Tối ưu test `AUTH_SUPERSEDED` với `waitFor` loading biến mất và `act` đảm bảo Home phục hồi render trước khi assert không có alert (khôi phục năng lực falsification 100%). Câu chữ thông báo trung tính chuẩn contract: _"Chưa đăng xuất được. Yêu cầu đăng xuất chưa hoàn tất. Hãy thử lại."_ (không khẳng định điều chưa biết khi gặp lỗi mạng/401). Bỏ `aria-live="polite"` mâu thuẫn trên `role="alert"`. Chuyển focus tự động vào nút "Thử đăng xuất lại" khi banner xuất hiện và trả focus về nút tài khoản khi bấm "Đóng" (WCAG 2.4.3 & 04 §8.3). Tách `await logout()` trong `try`, bỏ qua `AUTH_SUPERSEDED` (409) và đặt `navigate('/login')` ra ngoài `try`. Giữ cờ `logoutInFlight` làm lớp bảo vệ phụ chống click lặp.
  - **B1. Triệt để tuân thủ Label in Name (WCAG 2.5.3)**: Gỡ bỏ `aria-label` ở 3 chip chủ đề để tên truy cập kế thừa nguyên chữ hiển thị (`カフェで Ở quán cà phê`...); ẩn cụm bong bóng thoại mascot với `aria-hidden="true"` (trang trí trực quan). Tên nút tài khoản chứa toàn bộ nhãn hiển thị: bổ sung `level` vào `aria-label` khi có profile level (`Menu tài khoản: Minh Hoàng N3`) và loại bỏ khoảng trắng thừa khi không có level (`Menu tài khoản: Minh Hoàng`).
  - **B2. Rà soát biên dữ liệu `/me/coordination`**: Khai báo danh sách 6 mode hợp lệ theo contract API 07 §5; bắt buộc `resourceId` hợp lệ và encode an toàn qua `encodeURIComponent` khi `mode === 'inSession'`. Mọi phản hồi thiếu `mode`, mode lạ hoặc thiếu `resourceId` đều xử lý fail-closed thành `coordinationError = true` kèm nút "Thử lại".
  - **B3. Chuẩn hóa ARIA menu tài khoản**: Bỏ `aria-label` trên thẻ `<div>` dropdown; gán `aria-controls` động chỉ khi menu mở. Lối vào "Danh sách chặn (SC-18)" được xác nhận ngoài phạm vi FE-002 (dù route `/blocks` đã có sẵn tại `App.jsx:106`) và không tạo lối vào chưa hoàn chỉnh trong PR này.
  - **C1. Tách biệt CSS Hover & Focus theo Design System**: Tách riêng `:hover` (chỉ đổi màu nền/chữ) khỏi `:focus-visible` (viền 3px dùng token `--color-focus: #9b526e`, `outline-offset: -3px`), đảm bảo độ tương phản $\ge 3:1$ theo WCAG 1.4.11.
  - **D1, L2. Tối ưu trải nghiệm Landing**: Bỏ `aria-current` trên các liên kết điều hướng chưa active; placeholder nav tàng hình khi auth loading tránh giật layout; nút CTA Hero "Bắt đầu ngay" (`/register`) luôn là link sẵn sàng tương tác, không bị disabled khi đang xác thực cookie ngầm, tuân thủ đúng cam kết không ép đăng nhập ở landing. Kiểm thử tích hợp stack thật xác nhận khi auth check lỗi 500 landing vẫn fallback hiển thị giao diện khách an toàn.
  - **L4 & Responsive**: Chuẩn hóa CSS specificity cho thanh điều hướng và header; cấu hình Header cho phép wrap và thanh điều hướng 5 tab chuyển xuống dòng 2 căn giữa khi co màn hình ($\le 960px$ và $\le 650px$), hỗ trợ zoom 200%–400% theo WCAG 2.1 AA Reflow; gỡ bỏ nút nổi `?` thừa ngoài đặc tả.
  - **Hạn chế đã biết ngoài phạm vi FE-002**: `AuthContext.logout()` bật `isLoading = true` toàn cục khiến toàn bộ khu vực đăng nhập bị thay bằng màn hình loading thay vì chỉ khóa hành động đang submit (chưa đạt tiêu chuẩn Pending write theo 04 §6). Điểm này kế thừa từ thiết kế FE-001, ghi nhận để refactor trong task riêng của Auth.
- File liên quan: `client/src/features/landing/Landing.jsx`, `client/src/features/home/Home.jsx`, `client/src/components/layout/PageContainer.jsx`, `client/src/App.jsx`, `client/src/styles/ui.css`, `client/src/assets/mascots/hachiware.png`, `tests/client/landing.test.jsx`, `tests/client/home.test.jsx`, `tests/client/home-logout.test.jsx`, `docs/PROGRESS-TRACKER.md`.
- Kiểm chứng:
  - `npm run lint`: Pass 0 errors, 0 warnings.
  - `npm run format:check`: Pass 100% (All matched files use Prettier code style).
  - `npm run typecheck`: Pass 0 errors trên client, server và root jsconfig.
  - `tests/client` suite: 8/8 files passed, 77/77 tests passed (gồm 17/17 tests home, 8/8 tests home-logout stack thật, 7/7 tests landing, 13/13 tests routes, 13/13 api-client, 12/12 auth-context, 5/5 frontend-foundation, 2/2 app).
  - `npm run build`: Pass 100% (client Vite dist + syntax check server).
  - `npm run build-storybook`: Pass 100% (Storybook build completed successfully).
- Tiếp theo: Commit các thay đổi, merge `origin/develop` vào nhánh con và push cập nhật PR #33 để reviewer nghiệm thu.

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

### DATA-005 — Biên soạn dữ liệu seed tình huống và quiz N1

- Ngày cập nhật: 2026-11-12
- Trạng thái: Đã biên soạn và kiểm chứng schema bằng unit test; sẵn sàng trình duyệt và mở PR về `develop` để Minh Xuân review.
- PR: Chưa có; branch `feature/DATA-005-seed-n1-content`, chưa commit/push.
- Đã làm:
  - Biên soạn bộ dữ liệu học liệu seed N1 tại `server/persistence/seed/n1-content.js` đáp ứng nghiêm ngặt Database Design §7.1, §7.2 và checklist PB-31:
    - 01 Bộ chủ đề Deck N1: "Thương thảo & Quản trị Doanh nghiệp" (`business_negotiation_n1`), cấp độ `N1`.
    - 05 Thẻ tình huống N1 hoàn chỉnh: Đàm phán tăng giá/điều khoản hợp đồng; Xử lý sự cố gián đoạn dịch vụ/khiếu nại; Tranh biện định hướng chiến lược ban điều hành; Giải trình chậm tiến độ/thỏa thuận gia hạn; Tái cơ cấu thỏa thuận liên minh. Mỗi tình huống có đầy đủ `title`, `context`, `objective`, 2 vai độc lập `roleA` - `roleB`, gợi ý diễn đạt `hints`, liên kết `knowledgeVersionIds` và $\ge 3$ `questionVersionIds`.
    - 10 Mục kiến thức N1: Ngữ pháp N1 (`〜を余儀なくされる`, `〜極まりない`, `〜に至っては`, `〜を皮切りに`, `〜ならではの`) và từ vựng thương mại chuẩn mực (`折衝`, `不手際`, `見通し`, `前倒し`, `円満`), đầy đủ cách đọc `reading`, giải nghĩa `meaning` tiếng Việt và ví dụ song ngữ Nhật - Việt `examples`.
    - 15 Câu hỏi Quiz N1: Đúng 3 câu hỏi cho mỗi tình huống (kết hợp trắc nghiệm `multipleChoice` $\ge 2$ options và điền ngắn `shortAnswer`), có đáp án đúng, giải thích chi tiết `explanation` và liên kết đúng `knowledgeVersionIds`.
    - Chuẩn hóa toàn bộ ID theo định dạng 24 ký tự hex ObjectId và toàn vẹn tham chiếu chéo (không có reference mồ côi hoặc gãy).
  - Viết bộ unit test `tests/server/content-seed-n1.test.js` kiểm tra tự động `validateSeedDataset(n1Dataset)` từ `content-validator.js` đạt 0 lỗi.
- File liên quan:
  - `server/persistence/seed/n1-content.js`
  - `tests/server/content-seed-n1.test.js`
  - `docs/PROGRESS-TRACKER.md`
- Kiểm chứng:
  - `npx vitest run tests/server/content-seed-n1.test.js`: **6/6 tests passed**.
  - `npx eslint server/persistence/seed/n1-content.js tests/server/content-seed-n1.test.js`: Pass (0 errors, 0 warnings).
  - `npx prettier --check server/persistence/seed/n1-content.js tests/server/content-seed-n1.test.js`: Pass.
  - `npx tsc -p server/jsconfig.json`: Pass.
- Tiếp theo: Trình người dùng duyệt nội dung, push nhánh `feature/DATA-005-seed-n1-content` và mở PR về `develop` để reviewer Minh Xuân rà soát chéo.

### BE-012 — Vòng đời chuẩn bị, bắt đầu và kết thúc phòng

- Ngày cập nhật: 2026-11-12
- Trạng thái: Đã triển khai và kiểm chứng local; chờ tích hợp luồng cấp phòng thật, LiveKit Cloud, review nhóm và CI.
- PR: Chưa có; branch `feature/BE-012-session-lifecycle`, base `develop@c7508a5`; chưa commit/push.
- Đã làm: GET Session và leave API theo membership/CSRF/idempotency; nối consumer BE-011 mặc định. Start/controller/counter cùng transaction, GET không cộng clock vào DB. Disconnect chốt clock và giữ deadline, timeout dùng mốc nghiệp vụ, end giải phóng đúng actor resource và cố định hạn khách; lá current thành unfinished. Media cleanup sau commit có retry bền và attempt guard chống worker cũ ghi đè late join; coordination/tạo lời mời cũng xử lý timeout và thu hồi media.
- File liên quan: `server/modules/sessions/`, `server/integrations/livekit/room-service.js`, `server/app.js`, coordination/invitation services, fixture/test lifecycle và adapter/OpenAPI, `docs/api/openapi.yaml`, `docs/development/local.md`.
- Kiểm chứng: `npm run lint`, `npm run typecheck`, `npm test` (272 ca), `npm run test:integration` (138 ca), `npm run openapi:check` (6 ca), `npm run build`, `npm run build-storybook` pass. Node 24.19.0/npm 11.21.1, MongoDB 8.2.7 replica set tạm; adapter LiveKit dùng mock/credential giả, không dùng Atlas hoặc dịch vụ thật. Các ca mới kiểm join/leave cạnh tranh, rollback start/end, token ký cạnh tranh leave, deadline qua snapshot GET, đối soát disconnect chậm, room_finished, vai riêng, guest expiry và late join cạnh tranh cleanup. Review độc lập bằng agent không còn Must fix; chưa có human approval hoặc CI. Storybook vẫn cảnh báo chunk lớn, không chặn build.
- Giới hạn check: Không còn bị chặn bởi format local. Người thực hiện xác nhận `npm run check` pass toàn bộ ngày 2026-11-12 sau khi xóa `.vscode/settings.json`; log cung cấp ghi nhận 138 integration tests pass lúc 20:48:17 và cả hai build thành công. Chưa có kết quả CI hoặc kiểm chứng LiveKit Cloud thật.
- Tiếp theo: Nối dependency `assertPairCanEnterSession` và luồng guest-trial trước nghiệm thu đường mời/khách thật. Kiểm hai client, leave một phía, token cũ/vừa refresh/identity đã rời và retry thu hồi trên LiveKit Cloud test qua HTTPS. Tạo PR về develop, chạy CI và nhờ reviewer khác owner theo Tracker; chưa cập nhật Sheets/Done.
- Bàn giao reconnect: BE-012 chỉ cung cấp nền disconnect và deadline theo phạm vi đã chốt. Nhánh phục hồi phiên đã startedAt hiện trả 503 và rollback receipt/presence; task tiếp theo thay nhánh này bằng reconnecting→active và phục hồi đầy đủ. Consumer có observedAt để chốt mất kết nối, checkedAt để recheck deadline; giữ controller, thời gian còn lại và SID guards. Không nghiệm thu toàn bộ PB-11/AT-07 từ task này. Maintenance toàn cục/full guest cleanup vẫn thuộc task sau; cleanup pending cần request/webhook hoặc maintenance tiếp tục xử lý khi dịch vụ trở lại.

### BE-013 — Xuất bản revision và đọc học liệu theo quyền

- Ngày cập nhật: 2026-11-12
- Trạng thái: Đã triển khai và self-test; sẵn sàng mở PR về `develop` và nhờ Ngọc Dung review.
- PR: Chưa có; branch `feature/BE-013-content-publishing`, chưa commit/push.
- Đã làm:
  - Triển khai `POST /api/v1/admin/content/:id/publish` (TX-11, 06 §7.1, §7.2, 07 §10): kiểm tra CAS `expectedVersion`, xác thực đầy đủ (completeness) và references của bản nháp; tạo revision bất biến mới trong `content_versions`, dedup manifest các mảng ObjectIds (`scenarioVersionIds`, `knowledgeVersionIds`, `questionVersionIds`), cập nhật con trỏ `content_items` (`publishedVersionId`, `latestRevision`, `status: 'published'`, tăng `version`). Từ chối bản nháp thiếu references hoặc vi phạm ngưỡng nội dung tối thiểu (ít nhất 1 kịch bản cho deck, ít nhất 3 câu hỏi cho scenario) với mã `422 CONTENT_INCOMPLETE` và không tạo revision nửa chừng (AC 1).
  - Triển khai `POST /api/v1/admin/content/:id/hide`: CAS `expectedVersion`, chuyển trạng thái `status: 'hidden'`, bảo toàn `publishedVersionId` để các phiên/lịch sử/mục đã lưu cũ không bị gãy liên kết (AC 3).
  - Triển khai router đọc học liệu theo quyền `server/modules/content/content-learner-router.js` gắn tại `/api/v1` (07 §7):
    - `GET /topics` (Quyền Learner `U`): danh sách bộ chủ đề đã xuất bản `{id, versionId, title, level, description}` với phân trang keyset cursor.
    - `GET /topic-versions/:id` (Quyền `U/G`): metadata phiên bản bộ chủ đề, tính `knowledgeCount` và `questionCount`.
    - `GET /topic-versions/:id/knowledge` (Quyền `U/G`): danh sách Knowledge của đúng bản nguồn.
    - `GET /knowledge/:id` (Quyền `U/G`): chi tiết kiến thức; nếu có `versionId` thì trả đúng bản lịch sử, không có thì lấy bản xuất bản mới nhất.
  - Phân quyền & bảo mật projection (06 §12.1): tuyệt đối không trả `roleA`, `roleB` hoặc đáp án ngân hàng cho Learner/Guest (AC 2).
  - Cập nhật contract Swagger trong `docs/api/openapi.yaml` cho cả 6 REST endpoints mới, bổ sung components schemas và mã lỗi `422 CONTENT_INCOMPLETE`. Cập nhật `tests/server/openapi-contract.test.js`.
- File liên quan:
  - `server/modules/content/content-validator.js`
  - `server/modules/content/content-dto.js`
  - `server/modules/content/content-repository.js`
  - `server/modules/content/content-service.js`
  - `server/modules/content/content-admin-router.js`
  - `server/modules/content/content-learner-router.js`
  - `server/app.js`
  - `docs/api/openapi.yaml`
  - `tests/server/openapi-contract.test.js`
  - `tests/server/content-publishing.test.js`
  - `tests/integration/content-publishing.integration.test.js`
- Kiểm chứng:
  - `npm run openapi:check`: Pass 100% (5/5 tests).
  - `npm run format:check`: Pass.
  - `npm run lint`: Pass (0 warnings, 0 errors).
  - `npm run typecheck`: Pass sạch 100%.
  - `npm test`: **269/269 unit tests passed** (bao gồm 9 tests `content-publishing.test.js`).
  - `npm run test:integration`: **120/120 replica-set integration tests passed** (bao gồm 9 tests `content-publishing.integration.test.js`).
  - `npm run build`: Pass (client production bundle & node checks).
  - `npm run build-storybook`: Pass.
  - `npm run check`: **Passed toàn bộ 7/7 bước**.
- Tiếp theo: Push branch `feature/BE-013-content-publishing`, mở PR về `develop`, gán reviewer Ngọc Dung.

### BE-014 — Truy vấn và mở đáp án flashcard

- Ngày cập nhật: 2026-11-15
- Trạng thái: Đã tích hợp query/reveal trên nền BE-013. Chờ CI và review độc lập.
- PR: Chưa có. Nhánh `feature/BE-014-study-card-query-reveal` đã cập nhật theo `develop@cd99d6c`.
- Đã làm: Hai endpoint study cards kiểm tra scope `topic`, `saved` và `personalDeck`; học liệu chuẩn lấy revision xuất bản mới nhất trong phạm vi có quyền. Query trả mặt hỏi và tiến độ, giữ thẻ mới trong danh sách đến hạn. Reveal trả nghĩa tiếng Việt, cách đọc nếu có, ví dụ Nhật–Việt, preview FSRS-6 và vé ký chỉ dùng cho đúng owner. Hai thao tác giữ nguyên tiến độ, lượt ôn và thống kê.
- File liên quan: [Router](../server/modules/learning/study-card-router.js), [OpenAPI](api/openapi.yaml), [kiểm thử tích hợp](../tests/integration/study-cards.test.js).
- Sửa sau review: Phân trang theo ngày tạo mục kiến thức (`topic`), ngày lưu (`saved`) hoặc ngày thêm vào bộ (`personalDeck`), rồi theo ID bản ghi, đều giảm dần. Cursor dùng thứ tự cũ trả `400 INVALID_CURSOR`; gọi lại từ trang đầu. Migration giữ bộ tham số và hash FSRS-6 cố định trong file.
- Học liệu ẩn: Query và reveal dùng revision xuất bản mới nhất có nguồn hợp lệ với người học. Tiến độ giữ nguyên theo owner/cardKey. Vé ghi đúng revision đã mở. Khách vẫn giới hạn trong lượt thử.
- Kiểm chứng: `npm run check` đạt gồm 311 ca unit/HTTP/component, 169 ca integration (11 ca BE-014), build sản phẩm và Storybook. Các ca DB-T11, phân trang ba scope và quyền ôn revision ẩn chạy qua HTTP trên MongoDB 8.2.7 replica set tạm. Storybook có cảnh báo kích thước chunk.
- Triển khai: Chạy [migration đăng ký FSRS-6](../server/persistence/migrations/20261115000100-register-fsrs-six-config.js) trên database đích trước khi gọi reveal. Migration giữ nguyên cấu hình theo hash. Vé dùng khóa server hiện có với miền chữ ký riêng.
- Tiếp theo: BE-025 dùng `verifyReviewTicket`, kiểm tra lại quyền/scope hiện hành, revision và version trước khi ghi review. Nghiệm thu luồng cấp khách và chọn bộ với BE-015/BE-022, quản lý bộ cá nhân với BE-035. Kiểm thử HTTP hiện dùng bản ghi MongoDB được chuẩn bị sẵn cho các luồng đó.

### BE-015 — Danh tính khách qua mã mời

- Ngày cập nhật: 2026-11-16
- Trạng thái: Đã triển khai và self-test; chờ CI, review độc lập và nghiệm thu AT-03/AT-11. Chưa chuyển Done.
- PR: Chưa có; branch `feature/BE-015-add-guest-trial-identity`, base `develop@e08def0`, chưa commit/push.
- Đã làm:
  - Thêm `POST /api/v1/guest-trials` công khai có CSRF: từ chối `ck_session` bằng `409 IDENTITY_CONFLICT`; mã sai/hết hạn/đã dùng trả `409 INVITATION_UNAVAILABLE`; giới hạn 20 lượt/5 phút theo IP và 120 lượt ghi/phút theo actor/IP. Mã mời được trim/chuyển chữ hoa, body chỉ nhận `{code}`.
  - Cấp credential khách 32 byte base64url, chỉ lưu hash trong `guest_sessions`, đặt cookie `ck_guest` HttpOnly/SameSite=Lax/Path=/ (Secure theo cấu hình), không đặt Max-Age; deadline do server quyết định.
  - Tạo mới trong một transaction gồm `guest_sessions`, `actor_states` (`requestingInvite`) và `invite_requests`; retry cùng cookie/key/code trả request cũ, khác code trả `IDEMPOTENCY_CONFLICT`, key mới khi còn giữ lượt trả `ACTOR_BUSY`; cookie không tồn tại/đã thu hồi trả `SESSION_EXPIRED`, hết hạn trả `GUEST_EXPIRED`.
  - Siết `GET /auth/me` và mọi endpoint dùng danh tính khách: khách `waiting` chỉ còn quyền khi request còn pending và invitation còn open; `active`/`summary` phải có `practiceSessionId` và membership; `summary` phải còn `expiresAt`; `/auth/me` không gia hạn deadline. Media token kiểm tra đúng session, trạng thái và hạn của khách.
  - Reject/cancel request, cancel/expire invitation và accept thua cuộc đều chuyển guest `waiting` sang `expired` và giải phóng reservation trong cùng transaction. Accept chỉ thành công khi guest guard cập nhật đúng một bản ghi.
  - Cập nhật `docs/api/openapi.yaml` cho `/guest-trials` và `/auth/me`, thêm schema `GuestProjection`, `GuestTrial`, `AuthMe`; mở rộng test contract OpenAPI.
  - Sửa fixture guest `active` trong các integration test cũ để có membership `practice_sessions` tương ứng, không nới lỏng guard production.
- File liên quan: `server/modules/invitations/invitation-service.js`, `invitation-router.js`, `invitation-validation.js`, `server/modules/identity/identity-service.js`, `crypto.js`, `server/middleware/cookies.js`, `docs/api/openapi.yaml`, `tests/integration/guest-trials.integration.test.js`, `tests/server/guest-identity.test.js`, `tests/server/openapi-contract.test.js`.
- Kiểm chứng: `npm test` 439/439; `npm run test:integration` 230/230 (13 ca BE-015) trên MongoDB 8.2.7 replica set tạm; `npm run openapi:check` 11/11; `npm run typecheck`, ESLint/Prettier trên toàn bộ file thay đổi và `npm run build` pass. `npm run check` chưa pass trọn gói vì bước `format:check`/`lint` toàn repo quét thư mục `storybook-static/` chưa được ignore (artifact có sẵn ngoài phạm vi task); các bước còn lại đã chạy riêng và pass.
- Dependency: `assertPairCanEnterSession` của BE-008 đã được nối mặc định trong `server/app.js`; không còn blocker pair guard.
- Giới hạn: Chưa chạy CI, chưa nghiệm thu LiveKit/dịch vụ thật, chưa có reviewer khác owner; AT-03/AT-11 mới có bằng chứng local. Plan triển khai ghi response guest-trial không có `actorKey`, nhưng `07-api-specification.md` và OpenAPI `Partner` hiện yêu cầu `actorKey`; giữ DTO hiện có và chờ quyết định contract.
- Tiếp theo: Xử lý artifact `storybook-static/` ngoài diff, chạy CI, push/mở PR về `develop`, nhờ reviewer độc lập và chốt mâu thuẫn `actorKey` trước khi đóng task.

### DATA-002 — Script seed idempotent và fixtures kiểm thử

- Ngày cập nhật: 2026-11-15
- Trạng thái: Đã hoàn thiện, chờ mở PR
- PR: Chưa có (branch `feature/DATA-002-idempotent-seed-script`, base `develop`)
- Đã làm:
  - **Idempotent seed script cho content & account fixtures (DB-T18)**: Triển khai toàn diện `seedAll`, `seedContentDataset`, `seedTestAccountFixtures` đảm bảo nạp lần đầu khởi tạo đầy đủ, nạp lại không sinh bản ghi trùng, không ghi đè mật khẩu user và bảo toàn lịch sử revision (06 §13.1, PB-31).
  - **Bảo toàn bản nháp của Admin & Revision Guard**: Cập nhật `upsertContentItemAndVersion` để bảo toàn tuyệt đối `draftPayload` và `extraItemFields` (level, title của deck) khi Admin đang biên tập dở (06 §7.1). Toàn bộ dữ liệu nháp và thông tin khởi tạo chỉ gán qua `$setOnInsert`; nhánh update chỉ đồng bộ `status`, `latestRevision`, `publishedVersionId`. Nếu không có thay đổi con trỏ/trạng thái thì hoàn toàn không gọi `updateOne` (no-op, không cập nhật `updatedAt`).
  - **Tự phục hồi liên kết content_items thiếu khi version đã tồn tại (Partial-failure healing)**: Khi version đã tồn tại nhưng bản ghi cha `content_items` bị thiếu hoặc mất con trỏ, tự động khôi phục item với hành động `recovered` hoặc `pointer_synced`. Đồng thời trong `seedTestAccountFixtures`, tự động bù đắp `actor_states` độc lập nếu tài khoản đã tồn tại từ trước nhưng bị gián đoạn giữa chừng.
  - **Bảo vệ tính bất biến của revision & Race condition 11000**: Chủ động phát hiện xung đột `contentId + revision` khi đã tồn tại với `versionId` khác trong `content_versions`, ném thông báo nghiệp vụ rõ ràng tuân thủ 06 §13.1.5. Xử lý an toàn lỗi duplicate key (code 11000) tại `insertOne` của version và trong CAS retry loop của `content_items` khi chạy seed đồng thời.
  - **Fail-closed database protection**: Kết hợp whitelist regex segment dev/demo/test cùng blacklist `FORBIDDEN_DATABASE_SEGMENT_PATTERN = /(^|_)(prod|production|live)(_|$)/u` để fail-closed tuyệt đối, chặn mọi hành vi seed ngoài ý muốn lên môi trường production trừ khi có cờ `forceProduction: true`.
  - **Validation fail-fast liên dataset**: Kiểm tra tồn tại và validate schema toàn diện của toàn bộ dataset (`validateSeedDataset`) ở đầu `seedAll` trước khi thực hiện bất kỳ lệnh ghi nào vào cơ sở dữ liệu. Khi có dataset sai schema, `seedAll` trả về `success: false` (không throw) kèm danh sách lỗi có cấu trúc để CLI hiển thị rõ ràng.
  - **Ràng buộc mật khẩu tối thiểu 8 ký tự & Fail-fast**: Áp dụng hàm chuẩn hóa `normalizeSeedPassword` kiểm tra chuỗi và độ dài tối thiểu 8 ký tự cho cả `SEED_ADMIN_PASSWORD` và `SEED_USER_PASSWORD`, fail-fast ngay từ đầu trước khi ghi.
  - **CAS concurrency retry loop & Chuẩn hóa version: 0**: Triển khai Compare-and-Swap (CAS) tối đa 3 lần thử (`MAX_ITEM_SYNC_ATTEMPTS = 3`) với điều kiện lọc `{ _id, latestRevision, status, version }` kèm `$inc: { version: 1 }`. Xử lý chính xác trường hợp item cũ chưa có trường `version` bằng bộ lọc `{ $exists: false }`. Chuẩn hóa `version: 0` khi khởi tạo `content_items` khớp với convention Optimistic Concurrency Control toàn hệ thống.
  - **Bảo mật mật khẩu, loại bỏ plaintext & Cảnh báo đúng ngữ cảnh**: Xóa bỏ hoàn toàn hằng số `DETERMINISTIC_PASSWORD_HASH` và comment chứa plaintext mật khẩu. Admin bắt buộc cung cấp qua `SEED_ADMIN_PASSWORD`; User fixtures sử dụng `SEED_USER_PASSWORD` (nếu có) hoặc sinh mật khẩu ngẫu nhiên an toàn qua `randomBytes(32).toString('hex')`. Cảnh báo mật khẩu ngẫu nhiên chỉ in đúng 1 lần sau vòng lặp; cảnh báo thiếu Admin chỉ bật khi chạy `--content-only` hoặc gọi `seedContentDataset` trực tiếp mà DB chưa có Admin. Thông báo các tài khoản đã tồn tại được gom thành 1 dòng duy nhất sau vòng lặp.
  - **Chi tiết kết quả theo record & Bảng notable records**: Phân loại chính xác các hành động `inserted`, `recovered`, `pointer_synced`, `preserved`, `unchanged`. Bổ sung trường `versionInserted` để thống kê chính xác số version mới được chèn kể cả khi item được bảo toàn (preserved). Gom lỗi chi tiết theo từng record và hiển thị bảng tổng hợp notable records trong `scripts/seed.js` cả khi thành công lẫn khi gặp lỗi phân đoạn giữa chừng.
  - **Test suite hoàn thiện & Siết chặt assert tham chiếu**:
    - **38 ca unit tests** trong `tests/server/content-seed-idempotency.test.js` kiểm chứng toàn diện mọi nhánh bảo vệ, fail-fast schema, CAS retry, race condition 11000, cảnh báo ngữ cảnh, ràng buộc mật khẩu và partial-failure recovery.
    - **7 ca integration tests** trong `tests/integration/seed-idempotency.integration.test.js` trên MongoDB replica set: kịch bản DB-T18 nạp lặp lại (bao gồm assert `item.version === 0` ngay sau lần nạp 1), negative test quét toàn bộ tham chiếu gãy giữa Deck -> Scenario -> Question -> Knowledge bằng helper `findBrokenReferences`, kiểm tra đăng nhập bằng mật khẩu động và bảo toàn dữ liệu nháp/ẩn.
- File liên quan:
  - `server/persistence/seed/seed-content.js`
  - `server/persistence/seed/account-fixtures.js`
  - `scripts/seed.js`
  - `README.md`
  - `.env.example`
  - `tests/server/content-seed-idempotency.test.js`
  - `tests/integration/seed-idempotency.integration.test.js`
  - `docs/PROGRESS-TRACKER.md`
- Kiểm chứng:
  - `npm run format:check`: Pass (All matched files use Prettier code style).
  - `npm run lint`: Pass (0 errors, 0 warnings).
  - `npm run typecheck`: Pass (0 errors trên client, server và root jsconfig).
  - `npm test`: **349/349 unit tests passed** (bao gồm 38/38 unit tests của `tests/server/content-seed-idempotency.test.js`).
  - `npm run test:integration`: **176/176 integration tests passed** trên MongoDB replica set (bao gồm 7/7 integration tests của `tests/integration/seed-idempotency.integration.test.js`).
  - `npm run openapi:check`: Pass 7/7 tests.
  - `npm run build`: Pass (client vite production build & server app/index syntax check).
  - `npm run build-storybook`: Pass (Storybook static build completed).
  - `npm run check`: **Passed toàn diện cả 7/7 bước**.
- Tiếp theo: Trình người dùng review và mở PR về `develop` để reviewer Minh Xuân rà soát.

### BE-016 — API lưu kiến thức và nguồn

- Ngày cập nhật: 2026-11-15
- Trạng thái: Đã triển khai và kiểm thử local. Chờ CI, review và nghiệm thu luồng bốc lá thật.
- PR: Chưa có. Nhánh `feature/BE-016-saved-items-api` từ `develop@cd99d6c`.
- Đã làm: Thêm API danh sách, lưu, bỏ lưu và đọc nguồn. Kiểm tra owner và quan hệ deck/knowledge; nguồn phiên phải thuộc phiên người gọi tham gia và đúng lá đã bốc. Lưu nhiều nguồn giữ một mục; bỏ lưu theo version giữ nguồn lịch sử và tiến độ FSRS. Request ghi và receipt cùng transaction; retry kiểm lại quyền. Dữ liệu khách giới hạn ở lượt thử và kế thừa hạn xóa khi đã có deadline.
- File liên quan: [Router](../server/modules/learning/saved-item-router.js), [service](../server/modules/learning/saved-item-service.js), [OpenAPI](api/openapi.yaml), [kiểm thử HTTP](../tests/integration/saved-item-api.test.js).
- Sửa sau review: Danh sách và phản hồi lưu/retry của khách dùng revision mới nhất có nguồn đã lưu trong bộ của lượt thử, kể cả sau khi học liệu được xuất bản lại.
- Kiểm chứng: `npm run openapi:check` đạt 6/6. `npm run check` đạt 310 ca unit/HTTP/component, 165 ca integration và cả hai bản build. 7 ca HTTP BE-016 đạt khi chạy đảo thứ tự với seed 20261115 trên MongoDB 8.2.7 replica set tạm. DB-T08 giữ một mục với hai nguồn và giữ nguyên tiến độ khi bỏ rồi lưu lại. Ca xuất bản lại xác nhận revision ngoài lượt thử không xuất hiện trong danh sách hoặc phản hồi lưu/retry của khách. Storybook có cảnh báo kích thước chunk.
- Tiếp theo: QA-008 chạy lại DB-T08 với lá được bốc qua API thật. FE-007 nối danh sách và thao tác lưu/bỏ lưu; BE-021 dùng nguồn trong tổng kết. Schema, index và cấu hình môi trường dùng nền hiện có.

### BE-007 — Đổi mật khẩu và đặt lại mật khẩu qua Brevo

- Ngày cập nhật: 2026-11-15
- Trạng thái: Đã hoàn tất sửa review (phương án A dùng `@vercel/functions` `waitUntil`) và kiểm chứng local; chờ commit/push, review PR #40 và xác minh trên Vercel Preview.
- PR: [PR #40](https://github.com/nqocdungg/chiikaiwa/pull/40), nhánh `feature/BE-007-password-reset` (HEAD local `c874056`, ref `origin/feature/BE-007-password-reset` trước đó ở `30130cb`, chưa push bản sửa mới).
- Đã làm: Tách việc chờ Brevo khỏi phản hồi HTTP công khai của `POST /api/v1/auth/password-reset-requests` bằng `waitUntil` từ `@vercel/functions@3.11.3`: cả ba nhóm (`active`, không tồn tại, `locked`) đều nhận ngay HTTP `202` với payload trung tính (sau khi kiểm tra cấu hình Brevo chung đầu hàm để vẫn trả `503` nhất quán nếu thiếu cấu hình). Tác vụ hậu xử lý trong `waitUntil` bắt mọi lỗi để không phát sinh unhandled rejection, không log token/link/credentials, và kiểm tra lại nguyên tử `users.status === 'active'` cùng trạng thái token trong `withTransaction` trước khi vô hiệu các token cũ hơn (`issuedVersion`). Giới hạn `BREVO_TIMEOUT_MS` trong `500..20000` ms (mặc định `5000` ms) để vừa ngân sách `maxDuration: 30` trên Vercel.
- File liên quan: `server/package.json`, `package-lock.json`, `server/config/env.js`, `server/app.js`, `server/modules/identity/auth-router.js`, `server/modules/identity/identity-service.js`, `server/jsconfig.json`, `server/types/ws.d.ts`, `tests/server/env.test.js`, `tests/integration/password-reset.integration.test.js`, `docs/api/openapi.yaml`.
- Kiểm chứng: `npm run check` pass trên Node `v24.22.2` và `npm@11.21.1`: Prettier format check, ESLint 0 warnings, TypeScript typecheck 0 errors, `324/324` unit/HTTP/component tests (`tests/server/password-reset.test.js` 11/11, `tests/server/env.test.js` 11/11), `197/197` replica-set integration tests (`tests/integration/password-reset.integration.test.js` 21/21, gồm các ca deferred-promise `waitUntil` cho pending `202`, thành công/thất bại hậu phản hồi và race khóa tài khoản khi Brevo đang in-flight), build client và build Storybook pass. `npm run openapi:check` pass (`8/8`).
- Kịch bản xác minh Vercel Preview: (1) Thiết lập env Preview riêng (`APP_ORIGIN`, `MONGODB_URI`, `MONGODB_DB_NAME` đã có index, `JWT_SECRET`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_TIMEOUT_MS=5000`). (2) Gửi `POST /api/v1/auth/password-reset-requests` với tài khoản test thuộc 3 nhóm (`active`, không tồn tại, `locked`), đối chiếu cả 3 đều trả `202` cùng payload trung tính ngay lập tức và kiểm tra hộp thư test nhận đúng 1 email hợp lệ cho tài khoản `active`. (3) Kiểm tra Vercel Function logs không log token/link/credentials và không có unhandled rejection. (4) Hoàn tất đổi mật khẩu bằng token nhận được qua `POST /api/v1/auth/password-resets` (`204`), xác nhận token không dùng lại được (`400 RESET_TOKEN_INVALID`) và phiên cũ bị thu hồi.
- Lưu ý/blocker: `waitUntil` không phải durable queue và không tự động retry; nếu Vercel invocation bị ngắt bất thường trước khi tác vụ kết thúc, email có thể không được gửi và token vừa tạo chưa kịp gắn `invalidatedAt` sẽ tự hết hạn sau 15 phút. Bỏ chờ Brevo chỉ loại bỏ chênh lệch độ trễ do upstream Brevo, chưa loại bỏ mọi timing side-channel khác (ví dụ truy vấn/transaction DB cho tài khoản `active`).

### BE-008 — Guard an toàn dùng chung

- Ngày cập nhật: 2026-11-16
- Trạng thái: Đã triển khai và hoàn tất `npm run check` trên Node `v24.22.1` (`npm@11.21.1`); chờ LiveKit Cloud thật, CI và review của Yến Nhi.
- PR: [#45](https://github.com/nqocdungg/chiikaiwa/pull/45), branch `feature/BE-008-shared-safety-guard`; bản sửa review đang ở working tree, chưa commit/push.
- Đã làm:
  - Triển khai `assertPairCanEnterSession` tại `server/modules/safety/safety-service.js`: kiểm tra `actor_states` (bận/expectedStates), tự ghép (`IDENTITY_CONFLICT`), chặn hai chiều (`PAIR_BLOCKED`), tài khoản khóa (`ACCOUNT_LOCKED`), khách hết hạn/thu hồi (`GUEST_EXPIRED`), và ghi tăng `actor_states.version` theo thứ tự `actorKey` cố định để tham gia tranh chấp ghi.
  - Triển khai TX-05 `createPairBlock` và `lockUserAccount` tại `server/modules/safety/safety-service.js`: ghi `blocks` hoặc khóa `users` + tăng `authVersion` + thu hồi `auth_sessions`, đồng thời tranh chấp trên `actor_states`, hủy proposal/invite request/search liên quan (không hủy invitation hoặc request không liên quan khi block một cặp), kết thúc phiên đang hoạt động (`endReason: 'blocked'` / `'account_locked'`, `mediaCleanup.state: 'pending'`) và gọi `finishSessionEffects` sau commit.
  - Nối mặc định `assertPairCanEnterSession` vào `createApp` tại `server/app.js` và truyền `expectedStates` từ `server/modules/invitations/invitation-service.js` (giữ fail-closed 503 khi guard không được truyền).
  - Bổ sung `docs/api/openapi.yaml` (thêm response `403` `ACCOUNT_LOCKED`/`FORBIDDEN`/`CSRF_INVALID`, `410` `GUEST_EXPIRED` và mô tả `PAIR_BLOCKED` trong `409 Conflict` cho `POST /invitation-requests/{requestId}/responses`) và test contract tại `tests/server/openapi-contract.test.js`.
  - Bổ sung `tests/integration/safety-guard.integration.test.js` (8 ca): actor busy/self-pair/block/lock/guest expired, HTTP `POST /api/v1/invitation-requests/:id/responses` (`409 PAIR_BLOCKED`, `403 ACCOUNT_LOCKED`, `410 GUEST_EXPIRED`), DB-T04 (race `respondToInviteRequest` và `assertPairCanEnterSession` trực tiếp với `createPairBlock`/`lockUserAccount`), không hủy tài nguyên không liên quan, thu hồi `inviting`/`searching` + token cũ bị từ chối, retry cleanup LiveKit qua adapter mock + kiểm tra lại sau `sign()`, và rollback transaction.
- File liên quan: `server/modules/safety/safety-service.js`, `server/app.js`, `server/modules/invitations/invitation-router.js`, `server/modules/invitations/invitation-service.js`, `docs/api/openapi.yaml`, `tests/server/openapi-contract.test.js`, `tests/integration/safety-guard.integration.test.js`, `docs/PROGRESS-TRACKER.md`.
- Kiểm chứng: `corepack npm run check` **Pass 100%** trên Node `v24.22.1` + `npm@11.21.1`: `format:check`, `lint` (0 warnings), `typecheck` (0 errors), `npm test` (24 files, 311/311 server+client tests), `npm run test:integration` (16 files, 184/184 tests trên MongoDB 8.2.7 replica set tạm, gồm 8/8 ca BE-008 và 8/8 ca BE-009), `npm run build` và `npm run build-storybook` (cảnh báo chunk lớn, không chặn build). Adapter LiveKit dùng mock; chưa kiểm chứng LiveKit Cloud thật hoặc Atlas.
- Tiếp theo: Mở PR về `develop`, chạy CI trên Node 24 (`npm run check`, `dependency-audit`, `secret-scan`) và nhờ Yến Nhi review. BE-019 sẽ gắn các REST endpoints chặn/khóa tài khoản vào `createPairBlock`/`lockUserAccount` và bổ sung OpenAPI; BE-009/matching sẽ gọi `assertPairCanEnterSession` khi tạo phiên từ proposal.
- Lưu ý/blocker: Không sửa thiết kế 01–07, không tự cập nhật Sheets hay đánh dấu Done.

- Sửa review PR #45:
  - Nhập mã kiểm tra block hai chiều trước khi giữ chỗ hoặc mở lại request; ghi hai `actor_states` theo thứ tự cố định trong cùng transaction để tranh chấp với thao tác block.
  - Chấp nhận lấy giờ server mới trong mỗi lần execute của transaction; cùng mốc mới được dùng kiểm tra hạn invitation, request và guest. Tham số `now` tường minh vẫn phục vụ fixture thời gian cố định.
  - Bổ sung 4 ca hồi quy: gửi lại mã với key mới sau block ở cả hai chiều, block commit sau snapshot nhập mã, retry chấp nhận đúng hạn mã. Bốn ca đều fail với invitation service gốc tại `96bd9af`, pass với bản sửa; nhóm safety integration đạt 12/12 trên MongoDB replica set tạm.
  - Review độc lập bản sửa chưa phát hiện Must fix/Should fix; vẫn cần approval của reviewer PR. Không truy cập được Project Tracker/Task Handoff trên Google Sheets nên chưa xác minh lại phân công/AC trên bảng; không cập nhật bảng.
  - Kiểm chứng bản sửa trên Node `v24.19.0`, npm `11.21.1`: `npm run check` pass (350 unit/HTTP/component tests, 195 integration tests, build và Storybook); `npm run openapi:check` pass 8/8; `git diff --check` pass. Storybook còn cảnh báo chunk lớn và thời gian plugin, không chặn build. Chưa chạy CI hoặc LiveKit Cloud thật.

### FE-007 — Giao diện kho, nguồn và kiến thức đã lưu

- Ngày cập nhật: 2026-11-16
- Trạng thái: Đã triển khai SC-11/12; chờ kiểm chứng bản tích hợp và review.
- PR: Chưa có. Nhánh `feature/FE-007-learning-library` từ `develop@93f1593`.
- Đã làm: Nối danh sách theo trình độ/cursor, chi tiết học liệu đúng revision, danh sách đã lưu, lưu/bỏ lưu từng mục và hộp thoại nguồn có phân trang. Khách đọc bộ của lượt thử. Lối vào học chuyển phạm vi qua `/study?scope=topic&topicVersionId=…&mode=all`, `/study?scope=saved&mode=all` và `/quiz?deckVersionId=…`.
- File liên quan: `client/src/features/library/`, `client/src/App.jsx`, `tests/client/library.test.jsx`.
- Điều hướng: Header mở Kho chủ đề tại `/topics` và Ôn cá nhân tại `/saved`. Ôn cá nhân mở thẳng danh sách Kiến thức đã lưu. Khi danh sách rỗng, người học có thể quay lại Kho chủ đề.
- Tích hợp: Đồng bộ `develop@7250727`, giữ routing đăng nhập/đăng ký FE-009 cùng bàn giao backend và QA-006. Lỗi mạng/503 khi đọc thông tin nguồn có thông báo và nút thử lại; nguồn 403/404 vẫn hiện với thông báo không khả dụng.
- Kiểm chứng: `npm ci` và `npm run check` đạt format, lint, typecheck, 438 ca unit/HTTP/component, 217 ca integration trên MongoDB replica set tạm và build Vite. Chín ca FE-007 kiểm bộ lọc, khách, retry ghi, xung đột phiên bản, phân trang nguồn, thử lại lỗi mạng/503 và nguồn 403/404. Edge với dữ liệu thử đã đạt ở 1440×900, 1366×768, 390×844 và 683×384 trong lần triển khai trước; đã kiểm nút nguồn, Escape, trả focus và tràn ngang. Sau đồng bộ QA-006, kiểm lại format/lint/typecheck cho fixture và tài liệu mới.
- Tiếp theo: Nhờ Minh Xuân review, kiểm phần lưu của AT-08 trên bản tích hợp và nối các lối vào học với FE-017/FE-018. FE-017 chịu trách nhiệm nối chế độ đến hạn qua API study. API catalog hiện chỉ lọc theo trình độ; thao tác lưu cả bộ và CRUD bộ cá nhân thuộc phạm vi khác.

## Sprint 2

### QA-006 — Rà soát contract chọn bộ và manifest

- Ngày cập nhật: 2026-11-16
- Trạng thái: Còn dở (đã hoàn tất đối chiếu và fixtures; chờ quyết định contract Q1–Q4 và reviewer Yến Nhi duyệt, chưa ghi Done)
- PR: Chưa có; branch `test/QA-006-review-deck-selection-manifest`, base `origin/develop@93f1593` (tại worktree riêng `D:\cn web\worktree-qa006`, giữ nguyên repo `BE-008`).
- Đã làm:
  - Đối chiếu contract chọn bộ chủ đề & manifest giữa `02-srs.md` (`FR-CAR-01/02`, `BR-12`), `04-ui-ux-design.md` (`SC-08`, `UF-05`), `06-database-design.md` (`§6.1–6.2`, `§7.1–7.2`, `TX-07`, `§12.1`), `07-api-specification.md` (`§6`, `§7`, `§12`), `docs/api/openapi.yaml` và source trên `origin/develop`.
  - Lập biên bản đối chiếu chi tiết tại `docs/qa/QA-006-deck-selection-manifest-review.md`, phân loại rõ Q1 (`scenarioCount` — blocker sai khác SRS/UI vs API), Q2a (`level?` filter — đề xuất không blocker), Q2b (điều kiện trạng thái phiên cho `deck-options`), Q3 (khoảng trống mã lỗi `deck-selection` cho bộ `hidden`/`draft`/revision cũ/sai loại theo bảng lỗi hiện có) và Q4 (truy vết `toTopicSummaryDto` — rủi ro phòng thủ cần xác minh, chưa có đường lộ thực tế).
  - Chuẩn bị bộ fixtures kiểm thử tại `tests/fixtures/deck-selection-fixtures.js` cho các ca `published`, `hidden`, `draft`, `empty`, tách riêng `CONTRACT_DECK_OPTION_PROJECTIONS` (theo `07 §6` hiện hành) và `PROPOSED_DECK_OPTION_EXTENSIONS` (chờ chốt Q1).
- File liên quan: `docs/qa/QA-006-deck-selection-manifest-review.md`, `tests/fixtures/deck-selection-fixtures.js`, `docs/PROGRESS-TRACKER.md`.
- Kiểm chứng: `corepack npm ci` và `corepack npm run check` **Pass 100%** trên `Node v24.22.1` + `npm@11.21.1`: `format:check`, `lint` (0 warnings), `typecheck` (0 errors), `test` (25 files, 349/349), `test:integration` (16 files, 183/183 trên MongoDB replica set tạm), `build` và `build-storybook` (cảnh báo chunk > 500 kB, không chặn build). `git diff --check` không có lỗi whitespace; working tree còn 3 file QA-006 chưa commit.
- Tiếp theo: Nhờ reviewer Yến Nhi và nhóm chốt các câu hỏi Q1–Q4 (đặc biệt là bổ sung `scenarioCount` vào `07 §6` và `openapi.yaml`), duyệt `tests/fixtures/deck-selection-fixtures.js`, sau đó cập nhật `07-api-specification.md`/`openapi.yaml` theo phạm vi được thống nhất trước khi merge `BE-022`.
- Lưu ý/blocker: Chưa ghi `Done` vì contract `scenarioCount` trong `GET /sessions/:id/deck-options` còn thiếu ở `07 §6` & `openapi.yaml` và chưa có xác nhận của reviewer. Không tự sửa thiết kế 01–07 hoặc code chức năng.

## Sprint 3

Chưa có cập nhật.
