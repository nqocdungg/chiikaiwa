# Testing

## Các nhóm kiểm thử

| Nhóm        | Vị trí               | Phạm vi                                                               |
| ----------- | -------------------- | --------------------------------------------------------------------- |
| Unit/HTTP   | `tests/server/`      | Logic độc lập, validation, HTTP status và response contract           |
| Component   | `tests/client/`      | Hành vi giao diện qua thao tác và nội dung người dùng nhìn thấy       |
| Integration | `tests/integration/` | MongoDB thật: connection, index, transaction và các ràng buộc dữ liệu |

File test dùng hậu tố `.test.js` hoặc `.test.jsx`. Dùng Vitest; component tests chạy trong jsdom, HTTP tests dùng Supertest. `vitest.config.js` tại root quản lý các nhóm và môi trường chạy.

## Chạy kiểm tra

```sh
npm test
npm run test:integration
npm run check
```

`npm run check` gồm format check, lint, typecheck, unit/HTTP/component tests, integration tests, build sản phẩm và build Storybook. Chạy tại root repository với runtime theo README.

Integration tests tự khởi động replica set tạm, dùng database thử và dọn sau khi chạy; không đọc `.env`. Lần đầu cần tải binary MongoDB. Nếu sử dụng `mongod` đã cài, đặt `MONGOMS_SYSTEM_BINARY` trong environment của terminal. Không dùng MongoDB standalone để kết luận transaction hoạt động.

## Chọn kiểm tra theo thay đổi

| Thay đổi                 | Bằng chứng cần có                                                                 |
| ------------------------ | --------------------------------------------------------------------------------- |
| Chỉ tài liệu             | Format các file thay đổi, kiểm tra liên kết, tên lệnh và đường dẫn                |
| Logic/validation         | Input hợp lệ, không hợp lệ và các ranh giới có ý nghĩa                            |
| API/quyền                | Status/body theo contract, truy cập trái quyền, lỗi và xung đột liên quan         |
| Database/migration       | Dữ liệu thật, unique index, commit/rollback, chạy lại và tranh chấp nếu liên quan |
| Giao diện                | Hành vi người dùng, loading/empty/error, bàn phím và layout liên quan             |
| Tooling/build            | Các lệnh bị ảnh hưởng và khả năng cài/chạy tái lập khi có thay đổi dependency     |
| Dịch vụ ngoài/deployment | Kiểm tra trên môi trường thật và điều kiện nghiệm thu tương ứng trong thiết kế    |

Chạy kiểm tra mục tiêu khi phát triển, rồi `npm run check` trước PR có thay đổi code/tooling. CI chạy lại cùng bộ check. PR chỉ sửa tài liệu vẫn phải có kết quả kiểm tra tài liệu và chờ CI; không cần thêm test ứng dụng để kiểm tra một sửa đổi văn bản.

## Continuous integration

[Workflow CI](../../.github/workflows/ci.yml) chạy trên pull request, push vào `main`/`develop` và khi được kích hoạt thủ công. Job `check` dùng Node theo `.nvmrc`, cài npm theo `packageManager` trong `package.json`, chạy `npm ci` rồi `npm run check`. Giữ cùng bộ kiểm tra cho PR của thành viên và Dependabot.

Hai job bảo mật chạy độc lập với `check`:

- `Dependency audit`: cài dependency theo lockfile rồi chạy `npm audit --audit-level=high`, chặn advisory high/critical cho cả runtime và development tools. Lỗi truy cập registry cũng làm job thất bại; không tự dùng `audit fix` hoặc bỏ qua lỗi để làm xanh CI.
- `Secret scan`: Gitleaks quét lịch sử Git đã checkout với `--all` và che giá trị trong log. Binary được pin phiên bản và kiểm SHA-256 trước khi chạy. Secret thật cần được thu hồi/rotate, không chỉ xóa dòng ở commit mới. Không thêm allowlist rộng để bỏ qua phát hiện.

`.gitleaksignore` chỉ bỏ qua fingerprint đã xác minh: hai khóa JWT tổng hợp trong unit test và UUID `Idempotency-Key` trong ví dụ API. Ngoại lệ gắn commit/file/rule/dòng, không bỏ qua toàn bộ thư mục test hoặc tài liệu; phát hiện mới vẫn phải review riêng.

Actions được pin bằng commit SHA; khi cập nhật cần xác minh SHA từ repository chính thức. Khi nâng Gitleaks, cập nhật cả phiên bản và checksum của archive Linux x64. Dependabot tiếp tục theo dõi Actions; phiên bản Gitleaks được rà soát riêng. CI hiện chưa kiểm tra quy ước tên branch, commit hoặc tiêu đề PR; reviewer đối chiếu [Git workflow](git-workflow.md).

CI chỉ cần quyền đọc source, không cần secret, Atlas hoặc dịch vụ thật. Integration tests tự tải binary MongoDB và tạo replica set tạm trên runner; lỗi tải binary cần được phân biệt với lỗi test. Không bỏ integration tests hoặc cấp thêm quyền để làm PR của bot pass.

Khi thay đổi dependency hoặc workflow, kiểm tra cài mới bằng `npm ci` và toàn bộ `npm run check`; thay đổi bảo mật cần kiểm audit/secret scan tương ứng. Kết quả local không thay thế lần chạy Actions trên GitHub; trước merge cần `check`, `Dependency audit` và `Secret scan` thành công trên PR. Required checks phải được cấu hình riêng trong ruleset sau khi xác nhận tên job; sửa YAML không tự bật điều kiện chặn merge. CI không tự triển khai sản phẩm và không chứng minh các tích hợp trên Vercel hoặc dịch vụ ngoài đã được nghiệm thu.

## Nguyên tắc viết test

- Kiểm tra hành vi và bất biến, không sao chép implementation thành expected result.
- Ca sửa lỗi cần thất bại với hành vi cũ và thành công với bản sửa khi có thể tái hiện tự động.
- Mỗi test tự chuẩn bị dữ liệu cần dùng; không phụ thuộc thứ tự chạy hoặc dữ liệu development của thành viên.
- Mock ở ranh giới dịch vụ ngoài cho test độc lập; không dùng mock làm bằng chứng MongoDB, LiveKit hoặc email thật đã hoạt động.
- Dùng thời điểm cố định/điều khiển thời gian khi kiểm tra deadline, tránh sleep dài và assert theo tốc độ máy.
- Dọn connection, process và dữ liệu thử; không log secret hoặc ghi dữ liệu thử vào source.
- Không thêm test chỉ để tăng số lượng hoặc coverage. Không tự hạ assertion hay skip test để làm CI xanh.

## Báo cáo kết quả

Ghi kết quả vào `Evidence / PR` của Task Tracker và các ca liên quan trong `Test Cases` theo [quản lý công việc](scrum.md). Kèm Task ID, Test ID, build/commit, environment, ngày chạy, actual result và bằng chứng đủ để tái hiện. Chỉ ghi Passed khi đạt đầy đủ Expected Result; ca chưa chạy giữ Not Run. Lỗi có bước tái hiện và task sửa, sau đó retest bản sửa.

Ghi lệnh đã chạy, kết quả và giới hạn. Phân biệt lỗi implementation với việc chưa đủ môi trường kiểm thử; không ghi pass cho phần chưa chạy. Khi lỗi, giữ bằng chứng tái hiện và xử lý nguyên nhân trước khi chạy lại.

Unit/component tests hoặc build local không chứng minh các ca nghiệm thu toàn hệ thống đã đạt. Kiểm tra online, nhiều phòng và dịch vụ thật theo [SRS](../design/02-srs.md) và [kiểm chứng kiến trúc](../design/05-system-architecture.md).
