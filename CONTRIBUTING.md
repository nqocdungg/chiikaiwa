# Contributing

## Quy trình

1. Xác định task, phạm vi và tiêu chí hoàn thành; tham chiếu mã backlog/yêu cầu nếu có.
2. Đọc [tài liệu thiết kế liên quan](docs/README.md) và code hiện có. Làm rõ mâu thuẫn ảnh hưởng triển khai trước khi sửa phần phụ thuộc.
3. Tạo branch theo [Git workflow](docs/development/git-workflow.md). Kiểm tra trạng thái Git và giữ thay đổi của người khác.
4. Triển khai theo [coding conventions](docs/development/coding-conventions.md), kèm kiểm thử phù hợp theo [testing guide](docs/development/testing.md).
5. Tự review diff, chạy các check cần thiết, cập nhật tài liệu khi hành vi hoặc cách sử dụng thay đổi.
6. Mở pull request, ghi rõ thay đổi, lý do, cách kiểm chứng và phần chưa kiểm chứng. Có ít nhất một thành viên khác review trước khi merge.

## Điều kiện hoàn thành

- Đúng phạm vi và tiêu chí của task; không thêm chức năng hoặc thay stack ngoài yêu cầu.
- Xử lý trường hợp lỗi, quyền truy cập và dữ liệu liên quan; không chỉ kiểm tra luồng thành công.
- Các check liên quan và CI pass; không còn nhận xét review ảnh hưởng tính đúng chưa được giải quyết.
- Không chứa secret, dữ liệu cá nhân, code/debug output dư hoặc dependency chưa dùng.
- Hướng dẫn và contract liên quan phản ánh đúng thay đổi. Không sửa tài liệu thiết kế chỉ để hợp thức hóa implementation sai.

## Sử dụng agent

Giao task có mục tiêu, phạm vi và tiêu chí kiểm chứng. Agent tuân theo [AGENTS.md](AGENTS.md) và cùng quy trình review như các thay đổi khác. Người phụ trách phải hiểu diff và kiểm chứng kết quả trước khi đề nghị merge; không coi lời báo hoàn thành của agent là bằng chứng test đã pass.
