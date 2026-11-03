# Git workflow

## Branch

`main` là nhánh tích hợp. Mỗi task dùng một branch ngắn hạn, tạo từ `main` đã cập nhật:

```text
feat/invitation-room
fix/session-reconnect
docs/contribution-guide
chore/update-tooling
```

Tên branch dùng chữ thường và dấu gạch ngang. Một branch/PR tập trung vào một mục tiêu. Không đưa thay đổi không liên quan vào task đang làm.

## Commit

Dùng [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
type(scope): description
```

| Type       | Khi dùng                                |
| ---------- | --------------------------------------- |
| `feat`     | Thêm khả năng nghiệp vụ                 |
| `fix`      | Sửa lỗi hành vi                         |
| `docs`     | Chỉ thay đổi tài liệu                   |
| `refactor` | Đổi tổ chức implementation, giữ hành vi |
| `test`     | Thêm hoặc sửa kiểm thử                  |
| `style`    | Chỉ đổi format, không đổi logic         |
| `build`    | Dependency, package hoặc cấu hình build |
| `ci`       | Workflow CI                             |
| `chore`    | Bảo trì khác, gồm khởi tạo foundation   |

Scope tùy chọn; dùng tên phần bị thay đổi như `client`, `server`, `identity`, `sessions`, `database`. Description viết bằng tiếng Anh, ngắn gọn, dùng động từ và không kết thúc bằng dấu chấm. Đây là convention của team, không phải yêu cầu bổ sung của đặc tả Conventional Commits.

```text
feat(sessions): add invitation acceptance
fix(database): prevent duplicate review records
docs: add development guidelines
```

Đánh dấu breaking change bằng `!` hoặc footer `BREAKING CHANGE:` và giải thích ảnh hưởng cùng cách chuyển đổi. Commit body dùng khi cần mô tả lý do hoặc ràng buộc; không kể lịch sử trao đổi. Không ghi công cụ sinh code vào commit message.

Trước commit, xem cả diff và staged diff. Stage đúng file của task, không vô tình đưa `.env`, output build hoặc thay đổi của người khác vào commit. Không sửa lịch sử branch dùng chung hoặc force-push khi chưa thống nhất với người liên quan.

## Pull request và review

- Tiêu đề nêu rõ kết quả; dùng cùng cách đặt tên với commit.
- Mô tả mục tiêu, thay đổi chính, cách kiểm chứng và giới hạn; liên kết task/yêu cầu nếu có.
- Thay đổi UI kèm bằng chứng hiển thị; thay đổi contract/schema nêu ảnh hưởng tới client và dữ liệu hiện có.
- Reviewer ưu tiên tính đúng, phạm vi, quyền, xử lý lỗi, dữ liệu và khả năng bảo trì. Không yêu cầu đổi chỉ vì sở thích cá nhân.
- Tác giả xử lý các nhận xét ảnh hưởng tính đúng và chờ CI pass trước khi merge. CI chưa chạy không được ghi thành pass.

Ưu tiên squash merge cho một PR hoàn chỉnh, với commit message đại diện cho toàn bộ thay đổi. Xóa branch sau merge. Branch protection và quyền merge cần được thiết lập trên GitHub; tài liệu này không tự bật các cấu hình đó.

## Cập nhật dependency

[Dependabot](../../.github/dependabot.yml) kiểm tra npm workspaces và GitHub Actions hằng tuần vào thứ Hai, 09:00 giờ Việt Nam. Các workspace dùng chung lockfile tại root. Minor/patch npm được gom theo runtime và development; minor/patch Actions được gom riêng. Major updates tạo PR riêng. Giới hạn PR version updates đang mở là 3 cho npm và 2 cho Actions.

- Đọc release notes, kiểm tra tương thích runtime, peer dependencies và diff manifest/lockfile. Các package cần đồng bộ phiên bản như React/React DOM hoặc Storybook và addons phải được review cùng nhau, kể cả khi nằm ở các PR khác nhau.
- Giữ phiên bản chính xác trong manifest. Major update không tự cấp quyền đổi stack hoặc nâng Node ngoài nhánh đã thống nhất; `@types/node` phải phù hợp với runtime Node 24.
- PR dependency dùng cùng CI và yêu cầu ít nhất một thành viên review như PR khác. Không auto-merge; security updates được ưu tiên xử lý, kiểm tra ảnh hưởng và bản vá trước khi merge.
- Node, phiên bản npm trong `packageManager` và binary MongoDB ghim trong test/local scripts cần được rà soát riêng; không mặc định Dependabot quản lý các giá trị này.

## Thiết lập trên GitHub

Maintainer cần xác minh và bật dependency graph, Dependabot alerts và security updates trong repository settings. Các nhóm trong YAML chỉ áp dụng cho version updates; giữ security updates riêng ở giai đoạn đầu. Lịch hằng tuần và giới hạn PR version updates không trì hoãn hoặc giới hạn PR security updates theo cùng cách.

File Dependabot phải có trên default branch `main` để version updates hoạt động. Sau lần chạy đầu, kiểm tra bot nhận đủ manifest root, `client`, `server` và cập nhật lockfile chung; PR của bot phải chạy CI.

Thiết lập ruleset/branch protection cho `main`: yêu cầu PR, check `check` thành công, ít nhất một approval từ thành viên khác, giải quyết review conversations, chặn force-push và xóa branch. Chọn check từ lần chạy GitHub thực tế. Khả năng bảo vệ private repository phụ thuộc gói GitHub; nếu chưa hỗ trợ, team vẫn phải tuân quy trình review và CI trước merge. Không coi cấu hình trong repository là bằng chứng các settings này đã được bật.
