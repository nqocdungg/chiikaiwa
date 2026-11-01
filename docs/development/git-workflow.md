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
