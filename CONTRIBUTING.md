# Contributing

## Quy trình

1. Nhận task trên [Project Tracker](https://docs.google.com/spreadsheets/d/1KHBM3jEzq8Xwzja7hEvauExb6wlh72pM9962bpQcgSk/edit), đọc Task Handoff, AC, dependencies và reviewer theo [Scrum và quản lý công việc](docs/development/scrum.md).
2. Đọc [thiết kế liên quan](docs/README.md) và source hiện có. Làm rõ thiếu sót/mâu thuẫn ảnh hưởng trực tiếp trước khi triển khai phần phụ thuộc.
3. Kiểm tra Git status/diff, giữ thay đổi của người khác; tạo nhánh task từ `develop` theo [Git workflow](docs/development/git-workflow.md).
4. Triển khai theo [coding conventions](docs/development/coding-conventions.md), tự review và kiểm chứng theo [testing guide](docs/development/testing.md). Cập nhật tài liệu khi hành vi/cách sử dụng thay đổi.
5. Mở PR theo template, ghi kết quả kiểm tra và giới hạn; xử lý review, chờ CI và ít nhất một người khác approve trước merge. Merge commit được dùng; squash là tùy chọn cho PR task.
6. Tích hợp, kiểm tra đầu ra và cập nhật evidence/review/actual/remaining trên bảng. Chỉ đánh dấu Done khi đạt [Definition of Done](docs/development/scrum.md#definition-of-done).

Release/hotfix và bước chuyển sang `develop` theo Git workflow. Không push trực tiếp vào nhánh được bảo vệ.

## Chất lượng bàn giao

- Đúng phạm vi và tiêu chí task; xử lý lỗi, quyền, dữ liệu và ranh giới liên quan.
- Không có secret, dữ liệu cá nhân, debug output dư hoặc dependency không sử dụng.
- Không gộp thay đổi không liên quan; code và tài liệu mô tả trạng thái hiện tại, không ghi lịch sử trao đổi.
- Giữ thông tin bản quyền/giấy phép bắt buộc. Tài liệu thiết kế 01–07 chỉ sửa khi task yêu cầu rõ.
- Người phụ trách hiểu diff và chịu trách nhiệm kiểm chứng; mọi thay đổi đều có review độc lập.
