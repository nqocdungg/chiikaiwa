# Documentation

## Thiết kế hệ thống

| Tài liệu                                                     | Nội dung                                          |
| ------------------------------------------------------------ | ------------------------------------------------- |
| [01 — Project overview](design/01-project-overview.md)       | Mục tiêu, phạm vi và ràng buộc sản phẩm           |
| [02 — SRS](design/02-srs.md)                                 | Yêu cầu, quy tắc nghiệp vụ và tiêu chí nghiệm thu |
| [03 — Product backlog](design/03-product-backlog.md)         | Hạng mục triển khai và truy vết yêu cầu           |
| [04 — UI/UX design](design/04-ui-ux-design.md)               | Luồng tương tác, màn hình và trạng thái giao diện |
| [05 — System architecture](design/05-system-architecture.md) | Stack, ranh giới module, tích hợp và deployment   |
| [06 — Database design](design/06-database-design.md)         | Schema, index, transaction và vòng đời dữ liệu    |
| [07 — API specification](design/07-api-specification.md)     | Endpoint, DTO, validation và mã lỗi               |

## Hướng dẫn development

- [Chạy local](development/local.md): frontend, API và database.
- [Contributing](../CONTRIBUTING.md): quy trình triển khai và điều kiện hoàn thành.
- [Scrum và quản lý công việc](development/scrum.md): sprint 2 tuần, Project Tracker, Task ID và Definition of Done.
- [Project Progress Handoff](PROGRESS-TRACKER.md): khi hoàn thành hoặc bàn giao task, cập nhật kết quả, file liên quan, kiểm chứng và việc tiếp theo theo mẫu trong file. Tiến độ hằng ngày vẫn cập nhật trên Project Tracker.
- [Git workflow](development/git-workflow.md): branch, commit, PR và merge.
- [Coding conventions](development/coding-conventions.md): tổ chức source và quy tắc triển khai.
- [Testing](development/testing.md): lựa chọn kiểm thử và cách chạy check.
- [OpenAPI và Swagger](api/README.md): xem tài liệu API, cập nhật endpoint/schema và hướng dẫn prompt cho AI.
- [UI hiện hành](development/ui.md): giao diện Chiikaiwa, phòng ba vùng, thẻ Nhật/Việt và bản Storybook static.
- [Migration guide](../server/persistence/migrations/README.md): tạo và vận hành migration.
- [Agent instructions](../AGENTS.md): chỉ dẫn thực thi cho agent.

## Chọn tài liệu theo công việc

| Công việc                    | Tài liệu cần đối chiếu                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Bắt đầu một chức năng        | SRS, backlog và kiến trúc; đọc thêm các phần bên dưới theo phạm vi                                                   |
| Nhận task, cập nhật tiến độ  | Scrum và Task Tracker trên Project Tracker; ghi kết quả bàn giao vào [Project Progress Handoff](PROGRESS-TRACKER.md) |
| Branch, commit, PR, release  | Git workflow và template PR                                                                                          |
| Giao diện                    | UI/UX và contract API liên quan                                                                                      |
| API, phân quyền              | SRS, API, kiến trúc và database liên quan                                                                            |
| Schema, index, migration     | Database, kiến trúc, API và migration guide                                                                          |
| Tích hợp dịch vụ, deployment | Kiến trúc, yêu cầu phi chức năng và cấu hình thực tế                                                                 |
| Sửa lỗi                      | Yêu cầu nguồn, code và test tái hiện lỗi                                                                             |
| Tài liệu, tooling            | Hướng dẫn development và manifest/config liên quan                                                                   |

## Quản lý tài liệu

SRS quy định hành vi sản phẩm; các tài liệu thiết kế cụ thể hóa từng khía cạnh; hướng dẫn development quy định cách triển khai. Manifest, lockfile và config xác định phiên bản/lệnh thực tế. Khi các nguồn mâu thuẫn, ghi rõ điểm khác biệt và làm rõ trước khi thay đổi phần phụ thuộc.

Mỗi quy tắc có một nơi quản lý chính; các file khác liên kết thay vì sao chép. Thay đổi tài liệu thiết kế cần được yêu cầu rõ trong task và review cùng các ảnh hưởng tới API, database, UI hoặc kiểm thử. Giữ định danh yêu cầu ổn định và kiểm tra liên kết sau khi di chuyển tài liệu.

Tài liệu hướng dẫn không tự cấp quyền chạy lệnh ghi dữ liệu, commit, push hoặc deploy. Nội dung được trích từ nguồn ngoài cần liên kết nguồn và nêu giới hạn phiên bản khi có liên quan.
