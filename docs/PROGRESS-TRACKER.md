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

### FE-004 — Giao diện gọi, thiết bị và chat

- Sync 2026-11-18: fast-forward develop `ca322c7`; preserve pre-merge changes in stash. Keep upstream Auth/Home/Library/Invitation layouts; mount SessionRoom outside LearningLayout. Reuse Dialog.headingAdornment; remove FE-004 font assets and @font-face, retain foundation font stacks and Nunito fallback. Existing backend/test/OpenAPI changes preserved.
- Validation 2026-11-18: format/lint/typecheck and production build pass; 484 unit/HTTP/component tests pass with maxWorkers=2; invitation integration 8/8 pass using MongoDB 8.2.7 system binary. Full npm run check did not pass as one run hit 7 Vitest worker-start timeouts; full integration rerun stopped after prolonged execution without a final result. git diff --check clean; independent merge/font review has no remaining Must fix/Should fix. No commit or push.

- Ngày cập nhật: 2026-11-16
- Trạng thái: Đã triển khai frontend và kiểm chứng local; chưa đủ điều kiện Done do thiếu nghiệm thu LiveKit hai máy, visual QA, human review/CI và dependency reconnect.
- PR: Chưa có; branch `feature/FE-004-call-devices-chat` đã rebase theo yêu cầu lên `origin/develop@e08def0`, gồm BE-008/PR #45. Changes FE-004 vẫn chưa commit/push; stash `FE-004 before rebase onto develop BE-008 2026-11-16` và các stash trước đó được giữ làm dự phòng.
- Đã làm: Route `/room/:sessionId` gắn `SessionRoom` sau guard FE-001. Tái sử dụng `KaiwaRoom`, `ParticipantVideo`, controls và `LeaveDialog`. Nối GET Session, POST media-token và leave qua API client hiện có; polling 2 giây không chồng request, backoff lỗi 2/4/8/16 giây; notice version mới chỉ kích hoạt GET. Kết nối LiveKit thật, mic/camera mặc định tắt và chỉ xin quyền khi bật; phân biệt thiết bị thiếu/từ chối/bận, xử lý autoplay. Chỉ Session thực mở SC-08; leave/unmount/ended/đổi danh tính dọn SDK và chat, chặn token/kết nối đến muộn.
- Chat: Reliable data channel đúng session/topic/member, validate plain text UTF-8 và giới hạn packet kỹ thuật 15.000 bytes; React render text, không MongoDB/localStorage. Badge tin mới, giữ draft/pending send qua chuyển panel, thêm tin local sau publish thành công; bộ nhớ giữ tối đa 200 tin, không hứa khôi phục lịch sử.
- Figma: Truy cập MCP thành công sau lần đầu thiếu quyền; session `47caab1c-35ba-44a9-b96b-ff375b85e658`. Đã đọc đủ tám nhóm Design Rules v1 (`12:460`) qua node con và context/ảnh dialog thiết bị `30:7829`, phòng `4:2728`, chat `32:8397`. Dùng skill Figma design-to-code; chưa xác nhận pixel match bằng trình duyệt.
- Nguồn UI hiện hành: `client/README-FE.md`, `docs/frontend/design-system.md` và Figma MCP session `97a83a67-bb0f-4ba5-8b9a-a4f89bc694b3`. Đọc context/ảnh phòng `4:2728`, sidebar `32:8442`, chat `4:3279`, thiết bị `30:7829` và card `4:2855`. Áp foundation mới khi khác rules cũ: Button FlowButton 48px, compact 44px, Dialog padding 24 và friendly radius 30, type scale dễ đọc; không sao chép chữ 7–13px của frame import.
- Quyết định theo tài liệu: Tái sử dụng `KaiwaRoom`, `ParticipantVideo`, `Button`/`IconButton`, `LeaveDialog`; giữ ba vùng và nút rời ngoài vùng cuộn. Session API quyết định bắt đầu/kết thúc/quyền; SDK không tự chuyển phiên active. Mic/cam tùy chọn, lỗi thiết bị không khóa chat/rời. Chat plain text qua LiveKit data channel, không MongoDB/localStorage hoặc cam kết khôi phục lịch sử. Chọn/bốc thẻ giữ phạm vi FE-019.
- Quyết định thực thi: Reuse foundation font stacks/fallback and existing SVG controls. Sau đồng bộ foundation mới, dùng token font chung, Button FlowButton 48px/radius token và icon compact 44px; không ghi đè palette foundation. Mic/camera bật sau khi kết nối transport, không tự xin quyền khi mount; leave retry giữ idempotency key. Tách fixture runtime khỏi phòng và summary bằng props từ `KaiwaDemo`; production chỉ nhận dữ liệu/myRole từ API. Chọn/bốc thẻ giữ FE-019; không mở rộng nghiệp vụ note/gợi ý/chia sẻ/tổng kết hoặc sửa backend reconnect. Chưa cập nhật Project Tracker; URL Sheets không đọc được bằng công cụ web nên reviewer/trạng thái dependencies trên bảng chưa xác minh.
- Đồng bộ develop: Bảo toàn thay đổi bằng stash include-untracked, fast-forward feature branch rồi apply stash. Resolve conflict App bằng cách giữ cả ComponentPreview dev và route SessionRoom; LeaveDialog dùng Dialog foundation mới, giữ partnerName và pending/loading. Không sửa nhánh develop hoặc push/merge FE-004 vào nhánh chung.
- Bố cục: Header 80 với logo/trạng thái/thời lượng, công cụ Kiến thức/Ghi chú/Chat và nút rời; mic/camera cạnh local participant, sidebar 192 dùng Avatar/ParticipantVideo gọn, panel phải 320, chat log cuộn riêng và ô nhập ở cuối. Tái sử dụng Button, Dialog, Card, Badge, Avatar; một modal tại một thời điểm, cleanup trả lại body scroll. Trạng thái người luyện xét SDK reconnect kể cả participant cache; tiêu đề/timer chọn bộ xét Session DTO. Palette từ tokens; thêm một token sidebar lấy từ Figma.
- Local preview: Vite `/__dev/room`, các query state preparing/chat/long-chat/reconnecting/device-error/denied và clean=1. Dùng cùng component phòng, fixture chỉ dành development và không xin quyền thiết bị; production loại preview khỏi bundle. Ba bộ mẫu chỉ để đối chiếu thiết kế, không giả lập chọn/bốc cho API thật. Không tiếp tục cập nhật Storybook; đã gỡ story FE-004 mới. Không tạo tài liệu FE-004 riêng; `docs/development/ui.md` giữ nguyên base. Cách chạy nằm trong README client.
- File liên quan: `client/src/features/kaiwa/`, `client/src/components/ui/`, `client/src/App.jsx`, `client/src/demo/RoomPreview.jsx`, `client/src/demo/KaiwaDemo.jsx`, `client/src/features/session-summary/SessionSummary.jsx`, `client/src/styles/{ui,tokens}.css`, fonts/OFL, README client, manifest/lockfile và tests client.
- Kiểm chứng: `npm ci` pass trên Node 24.19.0/npm 11.21.1. Sau đồng bộ base và UI, `npm run check` pass: format/lint/typecheck, 335 unit/HTTP/component tests, 158 integration tests, build app và build Storybook vốn nằm trong lệnh check chung. Nhóm mục tiêu media/room/routes/foundation pass 43 tests, có ca modal/scroll cleanup, SDK reconnect với cached participant, heading theo DTO và preview không gọi API/SDK. Review độc lập không còn Must fix/Should fix trong source đã kiểm; chưa có human approval hoặc CI. `npm audit --audit-level=high` pass, còn 6 moderate ở tooling hiện có; không auto-fix. Build có cảnh báo chunk lớn. Vite preview và module trả HTTP 200; browser automation bị chặn khi không xác định được URL Edge, nên chưa xác nhận pixel match hoặc media hai máy/dịch vụ thật. Bản build production đã kiểm không chứa fixture vai hoặc preview dev.
- Tiếp theo: Visual QA route Vite local ở 1440×900, 1366×768, 390px/zoom 200%; browser automation hiện không khả dụng nên chưa xác nhận pixel match. Test LiveKit hai máy với hai danh tính/Session hợp lệ: cùng project test, server env đúng, webhook HTTPS nhận được event; kiểm mic/cam, chat, rời và hai phòng không lẫn dữ liệu. Preview Vercel cần deployment chứa FE-004, APP_ORIGIN đúng URL, database/env và webhook truy cập được; merge develop không tự bảo đảm domain production cập nhật. Giải quyết dependency phục hồi BE-012, xác minh Task Handoff/reviewer và review nhóm/CI trước Done.
- Lưu ý/blocker: Source BE-010/011/012 và FE-001 hiện có trên base không đồng nghĩa dependencies đã Done. Bản sửa reconnect BE-012 được bổ sung ngay trên nhánh FE-004; vẫn cần nghiệm thu hai browser/LiveKit Cloud, review nhóm và CI trước Done. Không tự sửa thiết kế 01–07, commit, push, merge hoặc deploy.
- Rà soát readiness backend sau rebase: BE-008 đã nối `assertPairCanEnterSession` mặc định trong `createApp()`. Test tích hợp dùng API client/session API thật của FE-004 gọi Express để tạo/chấp nhận lời mời, đọc Session và xác minh chữ ký token đúng room/actor của cả hai thành viên; người thứ ba bị từ chối. Sau block, kiểm lời gọi thu hồi hai participant, Session ended, token mới trả `SESSION_ENDED` và leave vẫn hợp lệ. Nhóm safety đạt 13/13 trên replica set tạm; adapter LiveKit bên ngoài được mock, chưa xác nhận media Cloud thật. Summary và screen-share claim/release chưa có handler trong router hiện tại.
- Kiểm lại backend trước nghiệm thu: 38/38 server tests của media-token/webhook/session-clock/invitations và 73/73 integration tests của media-token/webhook/session-lifecycle/invitations pass. Integration dùng MongoDB replica set tạm, SDK/service LiveKit được mock; chưa chứng minh transport LiveKit Cloud/webhook deployed. Chat theo AC dùng data channel, grant `canPublishData` đã có trong BE-010; không có REST/persistence chat riêng. Phiên chưa chọn bộ chỉ có 60 giây hoạt động sau khi bắt đầu; cần phân biệt selection timeout với lỗi media khi test thủ công.
- Phạm vi tài liệu: Chỉ cập nhật file progress này; README client và `docs/development/ui.md` đã hoàn nguyên về base, không có tài liệu FE-004 riêng. Hướng dẫn test được báo trực tiếp khi bàn giao.
- Kiểm kết nối dịch vụ: `RoomServiceClient.listRooms()` thành công với cấu hình `.env` hiện hành, chỉ đọc và không in secret/danh sách phòng. Kết quả xác nhận truy cập API LiveKit, chưa thay thế kiểm media/data/webhook thật bằng hai browser. Rebase giữ auth FE-009 và Home mới; bỏ demo Storybook đã được upstream xóa, giữ preview Vite dev. Review độc lập phần resolve không còn Must fix/Should fix.
- Kiểm chứng sau rebase `e08def0`: `npm ci` và `npm run check` pass trên Node 24.19.0/npm 11.21.1 (format, lint, typecheck, 454 unit/HTTP/component tests, 218 integration tests, build). `git diff --check` pass. `npm audit --audit-level=high` pass, còn 3 moderate trong chuỗi ESLint/minimatch; không tự nâng dependency ngoài task. Build còn cảnh báo chunk lớn. Không tạo tài liệu/collection LiveKit riêng; hướng dẫn Postman trao đổi trong chat.

- Pre-push validation: format/lint/typecheck and build pass. Full check stopped at FE-003 profile VERSION_CONFLICT assertion (483/484 pass); isolated rerun of profile, room, media and routes passes 57/57 with maxWorkers=2. Full integration not revalidated; real two-browser LiveKit/visual QA and CI remain pending. Shared Button supports icon-only content and native tooltip from aria-label. Backend/OpenAPI/integration changes excluded from FE-004 commit.

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

- Ngày cập nhật: 2026-11-16
- Trạng thái: Đã triển khai và kiểm chứng local; chờ tích hợp luồng cấp phòng thật, LiveKit Cloud, review nhóm và CI.
- PR: Chưa có; branch `feature/BE-012-session-lifecycle`, base `develop@c7508a5`; chưa commit/push.
- Đã làm: GET Session và leave API theo membership/CSRF/idempotency; nối consumer BE-011 mặc định. Start/controller/counter cùng transaction, GET không cộng clock vào DB. Disconnect chốt clock và giữ deadline, timeout dùng mốc nghiệp vụ, end giải phóng đúng actor resource và cố định hạn khách; lá current thành unfinished. Media cleanup sau commit có retry bền và attempt guard chống worker cũ ghi đè late join; coordination/tạo lời mời cũng xử lý timeout và thu hồi media.
- File liên quan: `server/modules/sessions/`, `server/integrations/livekit/room-service.js`, `server/app.js`, coordination/invitation services, fixture/test lifecycle và adapter/OpenAPI, `docs/api/openapi.yaml`, `docs/development/local.md`.
- Kiểm chứng: `npm run lint`, `npm run typecheck`, `npm test` (272 ca), `npm run test:integration` (138 ca), `npm run openapi:check` (6 ca), `npm run build`, `npm run build-storybook` pass. Node 24.19.0/npm 11.21.1, MongoDB 8.2.7 replica set tạm; adapter LiveKit dùng mock/credential giả, không dùng Atlas hoặc dịch vụ thật. Các ca mới kiểm join/leave cạnh tranh, rollback start/end, token ký cạnh tranh leave, deadline qua snapshot GET, đối soát disconnect chậm, room_finished, vai riêng, guest expiry và late join cạnh tranh cleanup. Review độc lập bằng agent không còn Must fix; chưa có human approval hoặc CI. Storybook vẫn cảnh báo chunk lớn, không chặn build.
- Giới hạn check: Không còn bị chặn bởi format local. Người thực hiện xác nhận `npm run check` pass toàn bộ ngày 2026-11-12 sau khi xóa `.vscode/settings.json`; log cung cấp ghi nhận 138 integration tests pass lúc 20:48:17 và cả hai build thành công. Chưa có kết quả CI hoặc kiểm chứng LiveKit Cloud thật.
- Tiếp theo: Nối dependency `assertPairCanEnterSession` và luồng guest-trial trước nghiệm thu đường mời/khách thật. Kiểm hai client, leave một phía, token cũ/vừa refresh/identity đã rời và retry thu hồi trên LiveKit Cloud test qua HTTPS. Tạo PR về develop, chạy CI và nhờ reviewer khác owner theo Tracker; chưa cập nhật Sheets/Done.
- Bổ sung reconnect BE-012 trên nhánh `feature/FE-004-call-devices-chat`: task có yêu cầu phục hồi trạng thái/thời hạn/thời lượng, nên phần reconnect thuộc BE-012. Thay nhánh 503 bằng `reconnecting → active` sau khi đủ hai hiện diện hợp lệ, còn hạn và kiểm lại block/lock/guest cùng actor guards. Giữ `startedAt`, controller, bộ/thẻ/vai, thời lượng đã chốt và thời gian chọn bộ còn lại; chỉ mở khoảng hoạt động mới, không random lại hoặc tăng `startedSessions`. Disconnect vẫn hủy pending action. Dùng `observedAt` chốt mất kết nối, `checkedAt` kiểm lại deadline; giữ SID guards và transaction receipt/presence. Chưa nghiệm thu toàn bộ PB-11/AT-07 bằng LiveKit Cloud thật. Maintenance toàn cục/full guest cleanup vẫn thuộc task sau; cleanup pending cần request/webhook hoặc maintenance tiếp tục xử lý khi dịch vụ trở lại.
- Kiểm chứng reconnect bổ sung (2026-11-16): regression phục hồi hợp lệ fail với nhánh 503 cũ; regression partial reconnect đối soát qua deadline fail trước khi sửa cách chọn mốc kiểm tra. Sau sửa, lifecycle integration pass 42/42, gồm clocks/controller/statistics, bộ/thẻ/vai, hai người reconnect riêng rẽ/đồng thời, duplicate/SID cũ, deadline -1/0/+1 ms và đối soát qua hạn, block/lock/guest, rollback/retry, race block/lock/leave; webhook có chữ ký trả 204 và GET trả active. `npm run check` pass (454 unit/HTTP/component tests, 233 integration tests, build); `npm run openapi:check` pass 10/10; `git diff --check` pass. Node 24.19.0/npm 11.21.1, MongoDB replica set tạm, adapter LiveKit mock. Review độc lập đã xử lý phát hiện deadline partial reconnect, không còn Must fix/Should fix; chưa human approval/CI hoặc kiểm reconnect hai browser trên Cloud. Chưa commit/push; dự kiến chung PR FE-004/BE-012 theo yêu cầu người dùng.

- Pre-push BE-012 validation: lifecycle/safety integration 55/55 and OpenAPI contract 11/11 pass on MongoDB 8.2.7 replica set; git diff --check clean; independent review has no Must fix/Should fix. Publish as a separate BE-012 commit on feature/FE-004-call-devices-chat for one combined PR. Real LiveKit reconnect and CI remain unverified; latest full check had the FE-003 assertion failure recorded above.

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

### BE-018 — API tạo lượt, chấm và truy vấn kết quả quiz

- Ngày cập nhật: 2026-11-16
- Trạng thái: Đã hoàn thiện toàn diện (B1–B11, C1–C6, Comments 1–5 của Reviewer Ngọc Dung), self-test đạt 100%; sẵn sàng mở PR về `develop` để reviewer rà soát và merge.
- PR: Chưa có. Nhánh `feature/BE-018-quiz-attempts-and-results` từ `develop@d04579c`.
- Đã làm:
  - **Tạo lượt quiz và snapshot câu hỏi (`POST /api/v1/quizzes`, `GET /api/v1/quizzes/:id`)**:
    - Bắt buộc `Idempotency-Key` (Must fix 1, 07 §2.2): thiếu hoặc sai format trả 422 `VALIDATION_FAILED`. `runIdempotentOperation` ghi receipt nguyên tử vào `operation_receipts`. Cùng key khác payload trả 409 `IDEMPOTENCY_CONFLICT`. Hai request đồng thời cùng key và payload trả 201 với cùng ID và chỉ tạo một receipt. Replay sau khi nộp vẫn trả `QuizPublic` với trạng thái và version hiện tại.
    - Trả header `Location: /api/v1/quizzes/{id}` cho mã 201 (Must fix 1).
    - Trả DTO `QuizPublic` chuẩn (Must fix 2, 07 §3): bổ sung `version: 0`, loại bỏ `createdAt` khỏi response data.
    - Lấy tối đa 5 câu hỏi không trùng lặp từ manifest của `deckVersionId` (nếu ngân hàng rỗng hoặc phiên có deck rỗng trả 409 `QUIZ_UNAVAILABLE`).
    - Lọc nghiêm ngặt câu hỏi có thể chấm được (`isGradableQuestion` - B4): loại bỏ câu thiếu prompt/explanation, MC có ít hơn 2 options, options trùng ID, `correctOptionId` không thuộc options hoặc text rỗng; SA có `acceptedAnswers` rỗng hoặc chứa chuỗi rỗng/chưa trim.
    - Sắp xếp tất định theo thứ tự manifest (`orderedDocs` - C1) trước khi lọc và khử trùng theo `contentId`, đảm bảo luôn ưu tiên phiên bản đứng trước trong manifest khi có nhiều version của cùng một câu hỏi.
    - Đóng băng toàn bộ snapshot câu hỏi/đáp án/giải thích/kiến thức liên quan trong collection `quiz_attempts` ở server, ngăn chặn việc sửa ngân hàng làm đổi đề thi.
    - Không nhận owner từ body (dùng identity đăng nhập của Learner hoặc Guest).
    - Kiểm tra quyền truy cập deck cha qua `assertDeckVersionSourceAccess` (B7, C2, C6): deck đang ẩn (`status === 'hidden'`) mà người học không có phiên hay nguồn hợp lệ thì trả 404 `RESOURCE_NOT_FOUND` (chỉ chuyển đổi lỗi `FORBIDDEN` thành 404 để giấu sự tồn tại, giữ nguyên các lỗi 403 khác như `ACCOUNT_LOCKED` - C2). Khi người học có `sourceSessionId` hợp lệ tham gia thì vẫn được tạo lượt quiz bình thường (C6).
    - Kiểm tra phiên thực hành liên kết (`sourceSessionId`): nếu phiên không khớp `deckVersionId` thì từ chối bằng 422 `VALIDATION_FAILED` (C3).
    - Kiểm tra quyền khách và CAS version trong transaction (Must fix 3, B6, 06 §11.2): tách `guestAccess` sang shared module `server/modules/learning/guest-write-guard.js`. Kiểm tra trạng thái `active`/`summary`, tính hạn chính xác `min(endedAt + 15m, expiresAt)`. Khách hết hạn trả 410 `GUEST_EXPIRED`, khách chỉ được tạo quiz trên deck của lượt thử (sai deck trả 404 `RESOURCE_NOT_FOUND`), gán TTL `purgeAt` chuẩn xác theo hạn khách, CAS tăng `guest_sessions.version` trong transaction để phát hiện bị thu hồi đồng thời.
    - Trả projection `QuizPublic` cho các attempt `inProgress`, giấu kín toàn bộ đáp án đúng, danh sách lựa chọn đúng và giải thích trước khi nộp.
  - **Chấm điểm server-side và ghi kết quả nguyên tử (`POST /api/v1/quizzes/:id/submission`)**:
    - Bắt buộc `Idempotency-Key` (Must fix 1, 07 §2.2): thiếu key trả 422 `VALIDATION_FAILED`.
    - Validate nghiêm ngặt `expectedVersion` (B1): kiểm tra `typeof === 'number'`, số nguyên an toàn không âm; từ chối ép kiểu với `null`, `""`, `"0"`, `true`, `-1`, `1.5` bằng 422 `VALIDATION_FAILED`.
    - Optimistic Concurrency Control (OCC): khi lệch `expectedVersion` trả 409 `VERSION_CONFLICT` kèm `details: { currentVersion }` để client đồng bộ lại.
    - Validate giới hạn đầu vào (B8): `answers` tối đa 5 phần tử, `text` tối đa 500 ký tự (đo chính xác theo Unicode code points qua `[...item.text].length`), `optionId` tối đa 64 ký tự (trả 422 nếu vượt quá).
    - Validate đáp án đối chiếu với snapshot của attempt (B2): từ chối câu hỏi lạ, câu hỏi trùng lặp hoặc sai loại đáp án (MC gửi kèm `text`, SA gửi kèm `optionId`, MC `optionId` lạ) bằng 422 `VALIDATION_FAILED` với danh sách `error.details.fields`. Cho phép bỏ trống câu trả lời (không gửi `optionId` lẫn `text` hoặc bỏ qua khỏi mảng) và tính 0 điểm.
    - Chấm điểm phía server (BR-22): câu bỏ trống tính 0 điểm; câu `shortAnswer` chỉ trim khoảng trắng đầu/cuối rồi so khớp chính xác (case-sensitive) với danh sách `acceptedAnswers` đã đóng băng.
    - Áp dụng CAS với `expectedVersion` chống ghi đè đồng thời. Transaction nguyên tử kiểm tra `guestAccess` (tăng `guest_sessions.version`), cập nhật kết quả quiz và tăng counter `statistics.submittedQuizCount` (TX-10, 06 §8.5).
    - Idempotency và replay (B3): Nộp lặp lại với cùng payload trả kết quả đã lưu mà không chấm lại hay tăng counter. Hash payload gồm `expectedVersion` và câu trả lời đã chuẩn hóa. Cùng `Idempotency-Key` nhưng khác payload trả 409 `IDEMPOTENCY_CONFLICT`. Khác key và khác payload trả 409 `QUIZ_ALREADY_SUBMITTED`. `hashAnswers` phân biệt trường vắng với trường chỉ chứa chuỗi rỗng hoặc khoảng trắng.
    - Trả DTO `QuizResult` chuẩn (Must fix 2, 07 §3): `questions` giữ nguyên cấu trúc sạch giống `QuizPublic`; `answers` chứa danh sách đáp án người học đã nộp; `results` chứa kết quả chấm (`isCorrect`, `points`, `explanation`, `knowledgeVersionIds`; `correctOptionId` chỉ trả cho MC, `acceptedAnswers` chỉ trả cho SA); trả `version` (bỏ `createdAt`). Khớp hoàn toàn giữa response submission và `GET /quizzes/:id`.
    - Đảm bảo quiz độc lập: không thay đổi tiến độ FSRS (`card_progress`) hay danh sách mục đã lưu (`saved_items`).
  - **Lịch sử và truy vấn kết quả (`GET /api/v1/me/quizzes`, `GET /api/v1/quizzes/:id`)**:
    - `GET /quizzes/:id` truy vấn theo `_id` và `ownerKey` (B5): tài nguyên của người khác trả 404 `RESOURCE_NOT_FOUND` (loại bỏ hoàn toàn mã 403 để không rò rỉ sự tồn tại của ID). ID sai định dạng ObjectId trả 400 `MALFORMED_REQUEST`. Trả projection theo trạng thái: `QuizPublic` khi `inProgress`, `QuizResult` khi `submitted`.
    - `GET /me/quizzes` hỗ trợ phân trang cursor keyset kèm context bảo vệ (Must fix 4): nhúng context `[ownerKey, sourceSessionId ?? null, 'createdAt:desc,_id:desc']` vào cursor. Giải mã lệch context hoặc chuỗi rác ném 400 `INVALID_CURSOR`.
    - Giới hạn limit tối đa 50 (Should fix 5, 07 §1): `MAX_QUIZ_LIST_LIMIT = 50`. `limit > 50` hoặc `limit < 1` trả 422 `VALIDATION_FAILED` (`INVALID_FIELD`). Chặn query parameters lạ ngoài contract bằng 422 `VALIDATION_FAILED` (`UNRECOGNIZED_FIELD`). `sourceSessionId` sai format trả 400 `MALFORMED_REQUEST`.
    - Schema subdocument `options` trong snapshot thiết lập `_id: false` (B11) ngăn sinh `_id` rác.
    - Cập nhật OpenAPI specification `docs/api/openapi.yaml` (Must fix 1, 2, Should fix 5, C4, D1): bổ sung `Idempotency-Key` bắt buộc cho 2 route POST, header `Location` cho 201, `limit` tối đa 50, chuẩn hóa schema `QuizPublic` (thêm `version`, bỏ `createdAt`), `QuizResult` (thêm `version`, `answers`, `results`, bỏ `createdAt`), `QuizResultItem`.
    - Đối chiếu index và TTL (C5): collection `quiz_attempts` đã được định nghĩa đầy đủ 3 index trong migration `20261103000100-add-design-indexes.js` (`owner_createdAt_id`, `owner_sourceSession`, `purgeAt_ttl`).
    - Thẩm tra và ghi chú: Bằng chứng sắp xếp tất định C1 nằm ở ca thứ 2 (`[qValidV2, qValidV1]`); C2 (`ACCOUNT_LOCKED` giữ nguyên 403) được thẩm tra qua đọc code.
  - Sửa sau review (Ngọc Dung & reviewer comments):
    - Đọc dữ liệu trong transaction snapshot (06 §11.1): truyền `{ session }` vào `findContentVersionById`, `findContentVersionsByIds` và `assertDeckVersionSourceAccess`.
    - Không tăng version 2 lần ở `createQuiz`: lưu kết quả `guestAccess` từ `authorize` qua biến closure `guestGuard` và tái sử dụng trong `execute`.
    - Replay nộp bài không ghi: đọc `attempt` trước, nếu đã `submitted` thì gọi `guestAccess(..., write = false)` (vẫn chặn 410 nếu hết hạn nhưng không tăng version).
    - Thống nhất kiểm tra khách cho các route đọc `getQuiz` và `listQuizzes` qua `guestAccess(..., write = false)`.
    - Loại bỏ trạng thái chết `'summary'` khỏi điều kiện kiểm tra phiên nguồn (`sessionDoc.status !== 'ended'`).
    - Bổ sung kiểm thử: thu hồi quyền khách giữa chừng lúc tạo lượt (410, 0 attempt, 0 receipt); thu hồi khách giữa chừng lúc submit (410, attempt inProgress, giữ nguyên version và submittedQuizCount); kiểm tra DB chỉ có 1 attempt và 1 receipt khi tạo quiz đồng thời; từ chối 422 khi `sourceSessionId` active; từ chối 410 khi replay sau khi khách hết hạn; làm lại quiz (retake - FR-QIZ-05, AT-10, BE-030) tạo attempt mới độc lập, giữ nguyên kết quả cũ và không đổi FSRS/saved_items.
- File liên quan:
  - `server/modules/quiz/quiz-model.js`
  - `server/modules/quiz/quiz-repository.js`
  - `server/modules/quiz/quiz-service.js`
  - `server/modules/quiz/quiz-router.js`
  - `server/modules/learning/guest-write-guard.js`
  - `server/modules/learning/saved-item-service.js`
  - `docs/api/openapi.yaml`
  - `tests/server/quiz-service.test.js`
  - `tests/integration/quiz-api.integration.test.js`
  - `tests/server/openapi-contract.test.js`
  - `docs/PROGRESS-TRACKER.md`
- Kiểm chứng:
  - `npm run format:check`: Pass 100% (All matched files use Prettier code style).
  - `npm run lint`: Pass 100% (0 errors, 0 warnings).
  - `npm run typecheck`: Pass 100% (0 errors trên client, server và root jsconfig).
  - `npm test`: **450/450 tests pass** trên 32 test suites (bao gồm 20/20 quiz-service unit tests).
  - `npm run openapi:check`: **11/11 tests pass** (kiểm chứng tag `Quizzes`, security, schemas `QuizPublic`, `QuizResult`, `QuizResultItem`, headers).
  - `tests/integration/quiz-api.integration.test.js`: **42/42 tests pass** trên môi trường MongoDB 8.2.7 replica set tạm (`MongoMemoryReplSet`); chưa chạy trên cụm MongoDB/Atlas thật.
  - `npm run test:integration`: **260/260 integration tests pass** trên replica set tạm.
  - `npm run build`: Pass 100% (client vite production build & server app/index syntax check).
- Giới hạn và ghi chú PR:
  - Chưa kiểm chứng integration test trên MongoDB/Atlas thật do phụ thuộc môi trường chạy replica set.
  - Test thu hồi khách mới chứng minh việc service đọc lại trạng thái khách trong transaction snapshot trước khi ghi; chưa mô phỏng ca thu hồi chen ngang giữa lúc đọc và ghi trong `guestAccess` (phần này được bảo vệ bởi điều kiện CAS `updateOne({ _id, version })`).
  - Quyết định nghiệp vụ: chỉ phiên thực hành đã kết thúc (`ended`) mới được dùng làm `sourceSessionId`; không trả `createdAt` trong body data theo đúng DTO spec.
- Tiếp theo: Trình người dùng cho phép commit và push branch `feature/BE-018-quiz-attempts-and-results`, mở PR về `develop` để reviewer Ngọc Dung rà soát.

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

### FE-008 — Giao diện mã mời và khách

- Ngày cập nhật: 2026-11-17
- Trạng thái: Đã triển khai và tự kiểm chứng; chờ review độc lập và kiểm tra trực quan trên trình duyệt.
- PR: Chưa có. Nhánh `feature/FE-008-invitation-guest-ui` từ `develop@be51432`.
- Đã làm: Dùng một `InvitationDialog` với các view state nhập mã, host chờ, host duyệt request, requester chờ và kết thúc. Learner dùng `POST /invitation-requests`, khách dùng `POST /guest-trials`; host tạo/sao chép/hủy mã, accept/reject theo version hiện hành. UI phục hồi luồng qua `/me/coordination`, poll trạng thái không chồng request và chỉ vào `/room/:sessionId` sau xác nhận server.
- An toàn dữ liệu: Mã theo contract 10 ký tự; hạn hiển thị từ `expiresAt` và `meta.serverTime`. Retry mutation giữ nguyên Idempotency-Key khi kết quả chưa chắc chắn, thao tác mới tạo key mới. Xử lý mã hết hạn/sai, `IDENTITY_CONFLICT`, version conflict, request bị từ chối/hủy và lỗi mạng mà không tự tạo lượt mới.
- Component dùng chung: Mở rộng `Dialog`, `Input` và `Icon`; thêm `Countdown` dùng chung. CSS dialog cũ bị trùng đã được gỡ. Hình mascot chờ được lấy từ node Figma `108:1877`; cấu trúc dialog đối chiếu các node `108:1641`, `108:1901`, `108:2265`, `108:2093`, còn dữ liệu và luật nghiệp vụ theo contract dự án.
- File liên quan: `client/src/features/invitation/`, `client/src/components/ui/`, `client/src/App.jsx`, `client/src/features/home/Home.jsx`, `client/src/features/landing/Landing.jsx`, `tests/client/invitation.test.jsx`, `tests/client/routes.test.jsx`.
- Kiểm chứng: `npm run check` đạt format, lint, typecheck, 456 ca unit/HTTP/component, 230 ca integration trên MongoDB replica set tạm và build Vite. Chín ca FE-008 kiểm learner/guest dùng chung form, tạo mã host, khởi tạo lại đúng khi StrictMode hủy request coordination đầu tiên, giữ đúng create view khi khôi phục coordination lỗi, accept rồi mới điều hướng, retry cùng Idempotency-Key, hủy theo version không tạo mã mới và `IDENTITY_CONFLICT`. `git diff --check` đạt. Chưa chạy kiểm tra trực quan runtime ở các viewport; cần reviewer kiểm tra thêm trước Done.
- Tiếp theo: Review độc lập theo CONTRIBUTING, kiểm trực quan dialog ở desktop/mobile và xác nhận dependency tích hợp BE-009/BE-015 trước khi ghi Done.

## Sprint 2

### DATA-003 — Biên soạn dữ liệu seed tình huống và quiz N3

- Ngày cập nhật: 2026-11-21
- Trạng thái: Đã sửa theo review PR #51
- PR: #51
- Đã làm:
  - Biên soạn bộ dữ liệu seed N3 nháp tại `server/persistence/seed/n3-content.js` theo Database Design §7.1–§7.2 và checklist PB-31 (giữ tách biệt khỏi luồng seed mặc định `seed-content.js` để chờ review):
    - 01 bộ chủ đề Deck N3: `Giao tiếp Đời sống & Công sở Trung cấp` (`topicKey: daily_work_and_life_n3`, `level: N3`).
    - 05 tình huống N3: nhờ đồng nghiệp kiểm tra tài liệu trước giờ họp; gọi điện xin đổi lịch hẹn khám nha khoa; liên hệ cửa hàng xử lý sản phẩm giao bị hỏng; thảo luận lịch trình và góp ý kế hoạch dã ngoại cuối tuần; nhắn tin/gọi điện xin nghỉ ốm và bàn giao việc trong ngày. Mỗi tình huống có `context`, `objective`, `roleA`/`roleB` phân biệt, `hints`, `knowledgeVersionIds` và 3 `questionVersionIds`.
    - 10 mục kiến thức N3: 05 ngữ pháp (`〜ようにしている`, `〜てしまう`, `〜てある`, `〜ことにする`, `〜場合`) và 05 từ vựng (`確認`, `都合`, `交換`, `予定`, `連絡`) kèm `reading`, `meaning` tiếng Việt và `examples` song ngữ Nhật–Việt.
    - 15 câu hỏi quiz N3 (3 câu/tình huống; kết hợp `multipleChoice` và `shortAnswer`), có đáp án đúng, giải thích tiếng Việt và `knowledgeVersionIds`.
  - Bổ sung `tests/server/content-seed-n3.test.js` (7 ca) kiểm tra `validateSeedDataset`, ngưỡng PB-31, `reading` bắt buộc, phân biệt `roleA`/`roleB`, không có bản ghi mồ côi khỏi manifest/tình huống, không trùng nội dung lựa chọn/đáp án, phân bố vị trí đáp án đúng và không trùng ID/`topicKey` với `sampleDataset` và `n1Dataset`.
- File liên quan: `server/persistence/seed/n3-content.js`, `tests/server/content-seed-n3.test.js`, `docs/PROGRESS-TRACKER.md`.
- Kiểm chứng: Trên Node `v24.22.2` + `npm@11.21.1` (sau `npm ci`): `prettier --check` trên 3 file thay đổi pass; `eslint --max-warnings=0` trên 2 file JS thay đổi pass; `npm run typecheck` pass (0 lỗi); `npm test` pass 32 files / 436 tests (gồm 7/7 ca `tests/server/content-seed-n3.test.js`); `npm run test:integration` pass 18 files / 217 tests trên MongoDB replica set tạm; `npm run build` pass. Lưu ý: `npm run format:check` và `npm run lint` toàn repo hiện bị chặn tại local do thư mục untracked `storybook-static/` còn sót từ trước khi `develop` gỡ Storybook (không tự xóa file untracked). Chưa review chéo lại tiếng Nhật; kiểm tra tự động (bao gồm test so chuỗi không trùng) không thay thế xác nhận tính duy nhất về ngữ nghĩa theo PB-31 AC3.
- Lưu ý/blocker: Task Handoff DATA-003 có mục `Deliverables` ghi `Nội dung N3/N2 để review` không thống nhất với tên task/Objective/AC N3 (N2 thuộc DATA-008); chỉ biên soạn phần N3 theo đúng phạm vi DATA-003. Không tự commit/push, sửa Tracker online hay đánh dấu Done.

### BE-022 — Chọn bộ, bốc lá, gợi ý và đồng thuận trong phiên

- Ngày cập nhật: 2026-11-22
- Trạng thái: Đã triển khai và kiểm chứng backend local. Chờ review nhóm và nghiệm thu tích hợp.
- Nhánh: `feature/BE-022-session-card-flow`. Reviewer theo Task Tracker: Minh Xuân.
- Đã làm: Bảy API cho thành viên phiên. Danh sách bộ xuất bản có số tình huống theo revision. Chọn bộ trong 60 giây hoạt động và cố định revision, xáo slot trên server. Lấy quyền, chọn bộ, bốc lá và đồng thuận dùng chung version phiên và ghi receipt cùng transaction. Bốc lá chỉ trả vai của người gọi. Gợi ý theo revision của lá đã bốc, kèm trạng thái lưu của người gọi. Đồng thuận hỗ trợ đổi vai, bỏ qua hoặc hoàn thành; người điều khiển chủ động bốc lá tiếp.
- Contract: `deck-options` trả `409 SESSION_ENDED` cho thành viên khi phiên đã kết thúc. Nếu request phát hiện phiên đã quá hạn, server ghi nhận kết thúc tại đúng deadline trước khi trả lỗi. `deck-selection` trả `404 RESOURCE_NOT_FOUND` khi revision không còn được chọn mới. API specification §6 và OpenAPI mô tả `scenarioCount` và các phản hồi này.
- File liên quan: [Service](../server/modules/sessions/session-card-service.js), [router](../server/modules/sessions/sessions-router.js), [OpenAPI](api/openapi.yaml), [kiểm thử tích hợp](../tests/integration/session-cards-api.test.js).
- Kiểm chứng: `npm run openapi:check` đạt 13/13 ca. Suite BE-022 đạt 13/13, gồm claim cạnh tranh chọn bộ, chọn ngay trước và tại mốc 60 giây, kết thúc phiên quá hạn qua `deck-options`, lỗi revision không còn chọn được, và replay khi khách mất quyền mà controller/version không đổi. `npm run check` đạt format, lint, typecheck, 515 ca server/client, 302 ca integration và build. Kiểm thử dùng MongoDB 8.2.7 replica set tạm và mock LiveKit.
- Tiếp theo: Review nhóm, nghiệm thu QA-006 và chạy AT-06/AT-07 trên hai client sau khi tích hợp FE-019 và phần phục hồi/tổng kết liên quan.

### QA-006 — Rà soát contract chọn bộ và manifest

- Ngày cập nhật: 2026-11-22
- Trạng thái: Còn dở (PR #52 đã merge tài liệu đối chiếu và fixtures; chưa tìm thấy quyết định chính thức cho Q1, Q2b, Q3 nên chưa ghi Done)
- PR:
  - PR #52 (`test(sessions): review deck selection contract and manifest [QA-006]`) đã **MERGED** vào `develop` tại commit `7250727` (`7250727c2859e5f5feddbabbcc5e66b5a406bd15`) ngày `2026-11-16`; có `APPROVED` hợp lệ từ tài khoản GitHub `nt-thuyr` (body trống, chưa suy diễn là quyết định cho từng Q1/Q2b/Q3).
  - Cập nhật bằng chứng rà soát tiếp trên nhánh `docs/QA-006-update-review-evidence` từ `origin/develop@5d89d8c`.
- Đã làm:
  - Đối chiếu contract chọn bộ chủ đề & manifest giữa `02-srs.md` (`FR-CAR-01/02`, `BR-12`), `04-ui-ux-design.md` (`SC-08`, `UF-05`), `06-database-design.md` (`§6.1–6.2`, `§7.1–7.2`, `TX-07`, `§12.1`), `07-api-specification.md` (`§6`, `§7`, `§12`), `docs/api/openapi.yaml` và source trên `origin/develop@5d89d8c`.
  - Xác minh đầu ra đã merge ở PR #52 (`docs/qa/QA-006-deck-selection-manifest-review.md`, `tests/fixtures/deck-selection-fixtures.js`) và phân biệt rõ phần đã merge trên `origin/develop@5d89d8c` (FE-004 `DeckPicker.jsx` đã hiển thị `{deck.count} tình huống`; chưa có các endpoint `deck-options`/`deck-selection`/`control/claim` trên `develop`; `toTopicSummaryDto` vẫn còn fallback `draftPayload`) với phần chỉ có trên nhánh chưa merge `origin/feature/BE-022-session-card-flow@a173c8e` (PR #59 `OPEN`, 0 review).
  - Xác nhận fixtures `published`, `hidden`, `draft`, `empty` tại `tests/fixtures/deck-selection-fixtures.js` vẫn bám đúng contract hiện hành trên `origin/develop` (`CONTRACT_DECK_OPTION_PROJECTIONS` giữ 5 trường theo `07 §6`, tách riêng `PROPOSED_DECK_OPTION_EXTENSIONS` chờ chốt Q1).
  - Giữ rõ phân loại: Q1, Q2b, Q3 chưa có quyết định chính thức; Q2a là đề xuất tùy chọn; Q4 là rủi ro phòng thủ chưa chứng minh được đường lộ trong vận hành bình thường.
- File liên quan: `docs/qa/QA-006-deck-selection-manifest-review.md`, `tests/fixtures/deck-selection-fixtures.js`, `docs/PROGRESS-TRACKER.md`.
- Kiểm chứng:
  - PR #52 đã chạy `corepack npm ci` và `corepack npm run check` pass (349 unit/HTTP/component tests, 183 integration tests trên MongoDB replica set tạm, build và Storybook).
  - Đợt cập nhật tài liệu này chỉ sửa Markdown: kiểm tra format (`prettier --check`), liên kết tương đối và `git diff --check` trên nhánh `docs/QA-006-update-review-evidence`. Không sửa `docs/design/01–07`, `openapi.yaml`, fixture hoặc code chức năng.
- Tiếp theo: Xin nhóm và reviewer chốt chính thức Q1 (`scenarioCount`), Q2b (trạng thái phiên đọc `deck-options`) và Q3 (mã lỗi chọn bộ ẩn/nháp/revision cũ/sai loại) làm cơ sở review PR #59 (BE-022) và đồng bộ `07-api-specification.md`/`openapi.yaml` trước khi đóng QA-006.
- Lưu ý/blocker: Chưa ghi `Done` vì Q1, Q2b, Q3 chưa có quyết định chính thức được ghi nhận. Approval body trống của `nt-thuyr` trên PR #52 là bằng chứng review hợp lệ cho PR nhưng không thay thế quyết định contract từng câu hỏi. Không tự sửa thiết kế 01–07 hoặc biến đề xuất thành contract đã chấp thuận.

### BE-021 — API ghi chú, tự đánh giá, tổng kết và lịch sử

- Ngày cập nhật: 2026-11-23
- Trạng thái: Đã triển khai; chưa chạy kiểm chứng theo yêu cầu của người thực hiện, chưa ghi Done.
- PR: Chưa có; branch `feature/BE-021-session-personal-models`, base hiện tại `develop@9b2a674`.
- Đã làm:
  - Thêm API owner-scoped `GET /sessions/:id/personal`, `PUT/DELETE /sessions/:id/note` và `PUT /sessions/:id/self-assessment`; noteVersion và version tự đánh giá dùng CAS độc lập, mutation có Idempotency-Key, xóa note giữ self-assessment.
  - Thêm `GET /sessions/:id/summary` chỉ cho phiên đã bắt đầu và kết thúc; tổng kết ghép lá đã bốc với note, nguồn đã lưu và quiz của đúng người gọi, không đưa dữ liệu riêng của đối tác vào projection.
  - Thêm `GET /me/sessions` cho tài khoản, phân trang cursor theo `startedAt/_id`, loại phòng chưa bắt đầu và dùng Partner projection an toàn (đối tác guest hiển thị “Khách”).
  - Giữ hạn dữ liệu guest 15 phút và cập nhật guest write guard trong cùng transaction; giới hạn note/comment theo Unicode code point.
  - Cập nhật OpenAPI, contract test và integration test cho owner isolation, stale version, replay, xóa note, summary privacy và history.
- File liên quan: `server/modules/sessions/session-learning-service.js`, `session-learning-router.js`, `session-projection.js`, `server/modules/learning/session-personal-model.js`, `server/app.js`, `docs/api/openapi.yaml`, `tests/integration/session-learning-api.test.js`, `tests/server/openapi-contract.test.js`.
- Kiểm chứng: Chưa chạy test theo yêu cầu; chỉ đã chạy Prettier trên các file JavaScript thay đổi và `git diff --check` không báo whitespace error tại thời điểm review.
- Tiếp theo: Người thực hiện chạy suite BE-021, OpenAPI check và `npm run check`; xử lý kết quả trước khi commit/push và mở PR về `develop`.

### BE-026 — API xử lý báo cáo và quản trị tài khoản

- Ngày cập nhật: 2026-11-19
- Trạng thái: Đã hoàn thiện toàn diện, giải quyết đầy đủ review M1–M4, S1–S5, N1–N4; self-test đạt 100%; sẵn sàng mở PR về `develop` để reviewer Ngọc Dung rà soát.
- PR: Chưa có. Nhánh `feature/BE-026-admin-reports-and-accounts` từ `develop`.
- Đã làm:
  - **Validation & DTOs an toàn (`server/modules/safety/admin-validation.js`, `server/modules/safety/admin-service.js`)**:
    - Chuẩn hóa phân trang phân định cursor base64url JSON với context chặt chẽ; `limit` trong khoảng [1, 50] (mặc định 20).
    - Thống nhất xử lý `cursor`: bắt lỗi 400 `INVALID_CURSOR` khi cursor rỗng `""`, không phải chuỗi hoặc dài quá 512 ký tự theo `07 §12`. Hàm `encodeAdminCursor` nghiêm ngặt kiểm tra `createdAt` kiểu Date (ném 500 `INTERNAL_ERROR` nếu thiếu/sai kiểu); khởi tạo query lọc `{ createdAt: { $type: 'date' } }` loại bỏ an toàn các bản ghi hỏng mà không làm cụt chuỗi phân trang (R2).
    - Lọc trạng thái `users` (`active`, `locked`) và `reports` (`new`, `inProgress`, `resolved`, `rejected`); từ chối giá trị lạ bằng 422 `VALIDATION_FAILED`.
    - Body validation với `additionalProperties: false`, bắt buộc `expectedVersion >= 0` (hỗ trợ version khởi tạo 0 của user/report mới), `resolution` tối đa 2000 ký tự (giới hạn riêng của BE-026, không rỗng khi có mặt, từ chối `null`).
    - DTO Whitelist chuẩn theo `07 §10`: `AdminUser` DTO gồm `{ id, email, displayName, status, version }`; `Report` DTO gồm `{ id, reporterKey, reportedKey, sessionId, reason, description?, status, resolution?, handledBy?, handledAt?, version, createdAt }`. Bảo vệ tuyệt đối bí mật tài khoản và dữ liệu học tập riêng tư (`BR-29`, `DB-T16`, `AT-12`).
  - **Quản trị trạng thái người dùng & Khóa phiên TX-05 (`PATCH /api/v1/admin/users/:id/status`, `GET /api/v1/admin/users`)**:
    - Ngăn chặn Admin tự khóa chính mình và cấm khóa tài khoản có `role: 'admin'` qua API (403 `FORBIDDEN`, bảo vệ khỏi write-skew deadlock mất toàn bộ admin theo M4).
    - Idempotency-Key bắt buộc qua `runIdempotentOperation`. Cùng key nhưng payload khác bị từ chối `409 IDEMPOTENCY_CONFLICT`; key mới với `expectedVersion` cũ bị từ chối `409 VERSION_CONFLICT`.
    - Optimistic Concurrency Control (CAS) qua `expectedVersion`: sai version trả về 409 `VERSION_CONFLICT`.
    - Trạng thái không đổi (no-op) với đúng `expectedVersion` trả về 200 `{ id, status, version }` mà không tăng version.
    - Chấp nhận COLLSCAN khi list/filter `users` ở quy mô MVP theo `06 §10.1` (Danh sách index) và `06 §11.2` (TX-05), không thêm migration hay index mới ngoài thiết kế (S2).
    - Tích hợp `lockUserAccountWithinSession`: chuyển `status: 'locked'`, tăng `version`, tăng `authVersion`, thu hồi toàn bộ `auth_sessions`, giải phóng `actor_states` (inviting, searching, busy), kết thúc `practice_sessions` đang hoạt động (`endReason: 'account_locked'`), kích hoạt hiệu ứng dọn phòng LiveKit sau commit; nếu hiệu ứng thất bại, log warning `ACCOUNT_LOCK_EFFECTS_FAILED` để vận hành điều tra (S3).
    - Mở khóa tài khoản: chuyển `status: 'active'`, tăng `version`, bảo toàn `authVersion` để người dùng không bị hủy phiên sau mở khóa.
  - **Xử lý báo cáo vi phạm (`GET /api/v1/admin/reports`, `GET /api/v1/admin/reports/:id`, `PATCH /api/v1/admin/reports/:id`)**:
    - Truy vấn danh sách và chi tiết báo cáo độc lập hoàn toàn với `blocks` hay trạng thái tài khoản người dùng (`PB-28 AC3`).
    - Cập nhật trạng thái và kết quả giải quyết báo cáo có kiểm soát version CAS và Idempotency-Key.
    - Chuẩn hóa trạng thái xử lý: khi `status === 'new'`, tự động gỡ `handledBy` và `handledAt` bằng `$unset`; `resolution` chỉ được cập nhật khi request gửi giá trị hợp lệ và được giữ nguyên nếu request bỏ trường này. Khi chuyển sang `inProgress`, `resolved`, `rejected`, cập nhật `handledBy` (ObjectId Admin) và `handledAt` (thời điểm cập nhật). Cho phép mở lại báo cáo để tái điều tra theo nhu cầu vận hành.
  - **Bảo mật và Phân quyền (`server/modules/safety/admin-router.js`, `server/app.js`)**:
    - Áp dụng guard `requireAuth(['A'])` cho toàn bộ các route admin; learner ('L') và guest ('G') bị chặn 403 `FORBIDDEN`, chưa đăng nhập trả về 401 `AUTH_REQUIRED`.
    - CSRF guard bắt buộc cho tất cả mutation requests (PATCH).
    - Rate limit 120 req/phút theo `actorKey` của Admin (`enforceWriteRateLimit`).
    - Header `Cache-Control: no-store` và bọc dữ liệu chuẩn trong envelope `{ data, meta }`.
  - **Đặc tả OpenAPI (`docs/api/openapi.yaml`, `tests/server/openapi-contract.test.js`)**:
    - Khai báo tag `Admin Operations`, 4 đường dẫn RESTful, và 9 schemas chuẩn OpenAPI 3.1.0 khớp chính xác với `07 §10` và DTO thật (M2).
    - Bổ sung test tự động đối chiếu các khóa của `toAdminUserDto` và `toReportDto` với schema OpenAPI.
- File liên quan:
  - `server/modules/safety/admin-validation.js`
  - `server/modules/safety/admin-service.js`
  - `server/modules/safety/admin-router.js`
  - `server/modules/safety/safety-service.js`
  - `server/app.js`
  - `docs/api/openapi.yaml`
  - `tests/server/admin-validation.test.js`
  - `tests/server/admin-http.test.js`
  - `tests/integration/admin-users.integration.test.js`
  - `tests/integration/admin-reports.integration.test.js`
  - `tests/server/openapi-contract.test.js`
- Kiểm chứng:
  - `npm run format:check`: PASS (All matched files use Prettier code style).
  - `npm run lint`: PASS (0 errors, 0 warnings trên toàn bộ workspace).
  - `npm run typecheck`: PASS (0 errors trên client, server và root jsconfigs).
  - `npm run openapi:check`: PASS (14/14 tests pass).
  - `npm test`: PASS (40/40 test files, 563/563 tests pass; gồm `tests/server/admin-validation.test.js` 26/26 tests, `tests/server/admin-http.test.js` 21/21 tests, `tests/server/openapi-contract.test.js` 14/14 tests).
  - `npm run test:integration`: PASS (22/22 test files, 328/328 tests pass); trong đó:
    - `tests/integration/admin-users.integration.test.js`: 25/25 tests pass (IU-01..IU-07, IL-01..IL-24, DB-T04, TX-05, M4 admin lock protection, S3 post-commit effect log, S5 cursor error, R2 invalid date skip).
    - `tests/integration/admin-reports.integration.test.js`: 14/14 tests pass (IR-01..IR-19, IP-01..IP-04, DB-T16 privacy; IR-17 giữ resolution khi mở lại report và IR-19 xác nhận resolution hợp lệ được chấp nhận khi status là new).
  - `npm run build`: PASS (Vite client production build thành công, node check `server/app.js` và `api/index.js` hợp lệ).
- Tiếp theo: Trình người dùng cho phép commit và push branch `feature/BE-026-admin-reports-and-accounts`, mở PR về `develop` để reviewer Ngọc Dung rà soát.
- Lưu ý/blocker: Giữ nguyên thiết kế DB và OpenAPI contract đã chốt, không tự ý commit/push khi chưa có lệnh từ người dùng.

### BE-025 — Ghi nhận lượt ôn FSRS

- Ngày cập nhật: 2026-11-23
- Trạng thái: In Progress. Đã triển khai hai endpoint, chờ PR và review của Minh Xuân.
- Nhánh: `feature/BE-025-record-fsrs-reviews` từ `develop`.
- Đã làm: `POST /study/reviews` kiểm tra vé, quyền và version hiện hành, dùng FSRS-6 đã ghim, cập nhật tiến độ, log và `reviewCount` cùng transaction. Review log giữ revision đã mở và kết quả để trả lại khi retry. `GET /me/reviews` lọc theo chủ sở hữu và `cardKey`, phân trang theo thời điểm review và ID.
- Kiểm chứng: `npm run check` đạt format, lint, typecheck, 570 ca server/client, 345 ca integration và build trên Node 24.22.3, npm 11.21.1, MongoDB 8.2.7 local. `npm run openapi:check` và suite flashcard đều đạt 15/15. Các ca bao phủ tiến độ dùng chung topic/saved, revision đã xem, replay sau khi vé hết hạn, stale version, rollback DB-T10, preview không ghi DB-T11, hết hạn khách và thẻ thủ công đang xóa.
- Tiếp theo: Chạy CI trên PR và nghiệm thu AT-09 qua FE-017. Kiểm thử đầy đủ luồng bộ cá nhân sau khi tích hợp BE-035 trong Sprint 3.

## Sprint 3

### BE-034 — Thống kê hoạt động tích lũy

- Ngày cập nhật: 2026-11-24
- Trạng thái: Còn dở — endpoint và các bộ đếm TX-01/TX-06/TX-09/TX-10 đã triển khai; chưa đủ điều kiện Done.
- PR: Chưa có; nhánh `feature/BE-034-lifetime-statistics` từ `develop@9b2a674`.
- Đã làm: Thêm `GET /api/v1/admin/statistics`, chỉ cho Admin và trả đúng bốn bộ đếm; thiếu document hoặc trường bộ đếm không hợp lệ trả `503 SERVICE_UNAVAILABLE`, không tạo số 0 giả. Tăng bộ đếm bằng `$inc` và `$max updatedAt` nguyên tử trong cùng transaction nghiệp vụ, chỉ khi bộ đếm hiện tại hợp lệ; không tạo document và không điền hay tính toán bộ đếm khác. Bộ đếm hiện tại thiếu, âm, thập phân hoặc sai kiểu, hoặc document `lifetime` chưa tồn tại: rollback toàn bộ giao dịch nghiệp vụ (06 §11.2 fail-closed) và log tên bộ đếm cùng lý do (không ghi giá trị). Các bộ đếm khác không bị đọc hay sửa. Baseline do migration `20261124000100-ensure-lifetime-statistics` tạo cho DB rỗng; dừng với lỗi khi DB đã có dữ liệu mà thiếu baseline; tài liệu runbook trong `server/persistence/migrations/README.md` hướng dẫn chi tiết quy trình chèn baseline thủ công trước migration từ snapshot/nguồn tin cậy (không đếm lại từ collection đã bị xóa log khách/thẻ). TX-09 (`study-review-service.js`) dùng `incrementReviewCount`. TX-06 (`session-lifecycle-service.js`) tăng `startedSessions` sau CAS thành công. Bổ sung các bài test mức đăng ký (bộ đếm khác thiếu/sai kiểu thì thành công; `registeredAccounts` không hợp lệ hoặc document thiếu thì rollback user và actor_states), test log chi tiết, test migration fail-fast và retry sau khi chèn baseline.
- File liên quan:
  - `server/modules/statistics/admin-statistics-router.js`
  - `server/modules/statistics/statistics-repository.js`
  - `server/modules/statistics/statistics-service.js`
  - `server/modules/learning/study-review-service.js`
  - `server/modules/identity/identity-service.js`
  - `server/modules/sessions/session-lifecycle-service.js`
  - `server/modules/quiz/quiz-repository.js`
  - `server/modules/quiz/quiz-service.js`
  - `server/persistence/migrations/20261124000100-ensure-lifetime-statistics.js`
  - `server/persistence/migrations/README.md`
  - `server/persistence/seed/seed-content.js`
  - `server/app.js`
  - `docs/api/openapi.yaml`
  - `tests/server/admin-http.test.js`
  - `tests/server/openapi-contract.test.js`
  - `tests/integration/admin-statistics.integration.test.js`
  - `tests/integration/auth.integration.test.js`
  - `tests/integration/guest-trials.integration.test.js`
  - `tests/integration/password-reset.integration.test.js`
  - `tests/integration/profile-catalogs.integration.test.js`
  - `tests/integration/quiz-api.integration.test.js`
  - `tests/integration/session-lifecycle.integration.test.js`
  - `tests/server/content-seed-idempotency.test.js`
  - `docs/PROGRESS-TRACKER.md`
- Kiểm chứng: `npm run check` PASS: format, lint, typecheck, 43 file unit/HTTP/component (593 tests), 26 file integration (388 tests) và production build. `npm run openapi:check` PASS (17/17). `git diff --check` PASS. Build có cảnh báo chunk Vite lớn hơn 500 kB.
- Tiếp theo: Kiểm chứng OPS-005 restore lifetime từ cùng snapshot và bảo toàn bộ đếm sau cleanup; nhận review của Ngọc Dung rồi mở PR về `develop`.
- Lưu ý/blocker: DB production hiện có dữ liệu cần tạo baseline thủ công trước khi chạy migration sau khi đối chiếu số liệu (migration chỉ tạo cho DB rỗng và fail-fast nếu DB đã có dữ liệu mà thiếu baseline); OPS-005 chưa có. Không sửa thiết kế 01–07; chưa commit/push hoặc đánh dấu Done.

### BE-039 — Sửa rò thông tin nháp trong danh mục học liệu learner

- Ngày cập nhật: 2026-11-23
- Trạng thái: Còn dở — đã triển khai và kiểm chứng local; chờ tạo PR, CI và reviewer duyệt.
- PR: Chưa có. Branch `fix/BE-039-published-content-metadata`; commit [`a0f485cbfd403f6d0391f1b2b1d0feeb2631da6c`](https://github.com/nqocdungg/chiikaiwa/commit/a0f485cbfd403f6d0391f1b2b1d0feeb2631da6c).
- Truy vết contract: BE-003/[PR #23](https://github.com/nqocdungg/chiikaiwa/pull/23), BE-013/[PR #34](https://github.com/nqocdungg/chiikaiwa/pull/34), `06 §7`, `07 §7, §10`.
- Đã làm: Learner catalog và session `deck-options` lấy title, level, description, versionId từ revision theo `publishedVersionId`; filter level theo published payload; loại draft/hidden và revision thiếu, dangling hoặc sai content/kind, không fallback sang draft. Admin tiếp tục đọc/sửa draft. Regression xác nhận publish lỗi giữ revision đang phục vụ, publish thành công chuyển metadata/filter cùng revision, revision cũ bất biến.
- File liên quan: `server/modules/content/content-repository.js`, `server/modules/content/content-service.js`, `server/modules/content/content-dto.js`, `server/modules/sessions/session-card-service.js`, `tests/server/content-publishing.test.js`, `tests/integration/content-publishing.integration.test.js`, `docs/PROGRESS-TRACKER.md`.
- Kiểm chứng:
  - Trước fix: `npm exec vitest -- run --project integration tests/integration/content-publishing.integration.test.js -t "keeps learner list and level filter on the published revision"` — thất bại như dự kiến, 1 failed/13 skipped; `topicN3` không được tìm thấy sau khi sửa draft.
  - Sau fix: `npm exec vitest -- run --project integration tests/integration/content-publishing.integration.test.js` — 15/15 pass; `npm exec vitest -- run --project integration tests/integration/session-cards-api.test.js` — 13/13 pass; `npm exec vitest -- run --project server tests/server/content-publishing.test.js` — 18/18 pass.
  - `npm run check` trên source commit `a0f485c`: pass format, lint, typecheck, 40 test files/571 server-client tests, 23 integration files/343 tests và production build. Build có cảnh báo chunk JavaScript lớn hơn 500 kB nhưng hoàn tất thành công.
  - `git diff --check`: pass, gồm cả cập nhật tracker này.
- Tiếp theo: Tạo PR vào `develop`, kiểm tra CI và chờ reviewer Ngọc Dung review; chỉ cập nhật Done khi đủ điều kiện DoD.
- Lưu ý/blocker: PR/CI và review độc lập chưa có. Không thêm migration/index hoặc backfill. Index hiện hành của `content_items` là `{kind: 1, status: 1, level: 1, _id: 1}` (`06 §10.1`), không có `createdAt` để hỗ trợ đầy đủ cursor/sort; vì vậy không khẳng định truy vấn có cursor index. Hiệu năng chưa được đo bằng `explain`; nếu cần, đánh giá riêng theo quy mô dữ liệu.

### BE-038 — Hoàn thiện giới hạn request xuyên các API

- Ngày cập nhật: 2026-11-25
- Trạng thái: Sẵn sàng merge / Chờ kiểm chứng Vercel sau deploy (chưa Done).
- PR: [PR #64](https://github.com/nqocdungg/chiikaiwa/pull/64), nhánh `feature/BE-038-request-rate-limits`, base `develop`.
- Đã làm:
  - Chuẩn hóa giới hạn tốc độ tập trung tại `server/middleware/rate-limit.js` với `rate_limits` TTL (`purgeAt`) và tăng bộ đếm nguyên tử: giới hạn đăng nhập (`10/15p` theo IP và emailKey hash), quên mật khẩu (`20/15p` theo IP và `3/15p` theo emailKey hash không lộ tồn tại tài khoản), tra cứu mã mời/dùng thử khách dùng chung (`20/5p` theo IP trên `/guest-trials` và `/invitation-requests`, không tính đúp `write-actor` cho khách), và giới hạn ghi nghiệp vụ (`120/phút` theo actor) trên các router invitation và admin content, loại trừ endpoint đọc/polling.
  - Cập nhật `docs/api/openapi.yaml` khai báo `429 RateLimited` cho `DELETE /invitations/{invitationId}`, `DELETE /invitation-requests/{requestId}`, `POST /invitation-requests/{requestId}/responses`, `POST /admin/content/{id}/publish` và `POST /admin/content/{id}/hide`; bỏ alias `INVITATION_CODE_LOOKUP_*` dư thừa trong `invitation-service.js`.
  - Cập nhật `getClientIp`: trên Vercel (`VERCEL` được bật), đọc hop hợp lệ đầu tiên từ `x-vercel-forwarded-for` (validate bằng `isIP`) và rơi về `socketIp` nếu thiếu hoặc không hợp lệ; ngoài Vercel, kiểm tra ranh giới `TRUSTED_PROXY_IPS`, ghi `console.warn` không lộ giá trị thô nếu cấu hình sai định dạng và fallback về `socketIp`. Bổ sung `normalizeRateLimitIp` gom nhóm địa chỉ IPv6 theo tiền tố `/64` chuẩn hóa trước khi hash bucket (giữ nguyên IPv4 và các dạng IPv4-mapped IPv6) cho `login-ip`, `password-reset-ip`, `invitation-code-ip` và `write-actor` dạng `ip:...`. Tài liệu hóa `TRUSTED_PROXY_IPS` và hành vi Vercel tại `.env.example` và `README.md`.
  - Bổ sung unit test cho `getClientIp` (bao gồm `VERCEL`, chuỗi phân tách dấu phẩy, fallback và cảnh báo `TRUSTED_PROXY_IPS`) và `normalizeRateLimitIp` (gom nhóm IPv6 `/64`, giữ nguyên IPv4), validation `env.js`, contract OpenAPI và integration test cố định `Date` kiểm runtime `429` + `Retry-After` cho cả 3 mutation của invitation và chống xoay host IPv6 trong cùng `/64`.
- File liên quan: `server/middleware/rate-limit.js`, `server/config/env.js`, `server/modules/content/content-admin-router.js`, `server/modules/invitations/invitation-router.js`, `server/modules/invitations/invitation-service.js`, `docs/api/openapi.yaml`, `.env.example`, `README.md`, `docs/qa/BE-038-review-validation.md`, `docs/PROGRESS-TRACKER.md`, `tests/server/auth.test.js`, `tests/server/env.test.js`, `tests/server/openapi-contract.test.js`, `tests/integration/rate-limit.integration.test.js`.
- Kiểm chứng: `npm run check` **PASS 100%** trên Node `v24.22.2` / `npm@11.21.1` (Prettier `format:check`, ESLint 0 warnings, TypeScript `typecheck` 0 errors, `44` file / `607` unit-HTTP-component tests, `26` file / `366` integration tests trên MongoDB 8.2.7 replica set tạm, Vite build và `node --check`); `git diff --check` đạt.
- Tiếp theo / Lưu ý:
  - Phụ thuộc kiểm chứng hạ tầng cho Question trên PR #64 (`IP trên Vercel Preview — Not Run`, xem `docs/qa/BE-038-review-validation.md`): sau khi deploy Preview, cần gửi request từ hai mạng/IP độc lập để xác nhận hai mạng không bị gộp chung bucket và header giả mạo không tự chọn bucket. Trạng thái Preview Ready và unit test pass không thay thế bài kiểm tra thực tế này.
  - Phụ thuộc BE-028 cho tiêu chí heartbeat (`Heartbeat — Not Run`): nhánh hiện chưa có endpoint matching heartbeat; khi BE-028 tích hợp, cần kiểm chứng heartbeat không tăng quota ghi và vẫn hoạt động khi quota ghi đã đầy. Không sửa thiết kế `01–07` và chưa đánh dấu Done trên Project Tracker.
