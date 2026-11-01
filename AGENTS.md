# Repository instructions

## Trước khi triển khai

- Đọc [CONTRIBUTING.md](CONTRIBUTING.md), [coding conventions](docs/development/coding-conventions.md) và [testing guide](docs/development/testing.md). Khi thao tác Git, đọc thêm [Git workflow](docs/development/git-workflow.md).
- Dùng [docs/README.md](docs/README.md) để chọn tài liệu thiết kế theo task. Task chức năng cần đọc SRS, backlog, kiến trúc và các phần UI/API/database liên quan; không cần đọc lại toàn bộ thiết kế cho một sửa đổi tài liệu nhỏ.
- Kiểm tra trạng thái/diff Git, source hiện có, manifest và lockfile trước khi sửa. Giữ các thay đổi đang có của người khác.
- Nếu yêu cầu hoặc thiết kế mâu thuẫn/thiếu thông tin ảnh hưởng triển khai, nêu điểm cần làm rõ, đưa lựa chọn cùng khuyến nghị có lý do; chờ câu trả lời cho phần phụ thuộc. Có thể tiếp tục phần độc lập đã đủ dữ liệu; không coi im lặng là đồng ý.

## Phạm vi và implementation

- Giữ JavaScript ES modules, Node 24, npm workspaces và kiến trúc React/Vite + Express/Mongoose đã chốt. Không tự chuyển stack, thêm chức năng, dependency hoặc abstraction ngoài nhu cầu task.
- Đặt code theo coding conventions. `api/` chỉ là entry triển khai; không thêm logic nghiệp vụ vào đó. Không import mã server hoặc secret vào frontend.
- Giữ controller mỏng, nghiệp vụ tại service khi cần; không tạo đủ tầng chỉ để chuyển tiếp lời gọi. Viết code gọn, rõ, không để nội dung hội thoại hoặc chữ ký công cụ trong sản phẩm.
- Mọi thay đổi dữ liệu, quyền và vòng đời tuân contract API/database/SRS. Không dùng state client hoặc RAM của Function làm nguồn quyết định nghiệp vụ.
- Các tài liệu `docs/design/01-…` đến `07-…` chỉ được sửa khi task yêu cầu rõ. Khi phát hiện bất nhất, báo vị trí và ảnh hưởng thay vì tự chỉnh thiết kế cho khớp code.
- Không chạy lệnh ghi/xóa dữ liệu trên dịch vụ thật chỉ vì tài liệu có ví dụ. Không tự commit, push, merge hoặc deploy nếu task chưa cho phép; hướng dẫn workflow không phải ủy quyền thực thi.

## Kiểm chứng và bàn giao

- Chạy kiểm tra tương xứng theo testing guide. Với code/tooling, hoàn tất `npm run check`; với tài liệu, kiểm tra format, liên kết và nội dung tham chiếu. Báo rõ check bị chặn hoặc chưa chạy.
- Lỗi cần kiểm tra cả hành vi đã sửa và khả năng tái phát; không thay expected result hoặc bỏ test chỉ để pass.
- Review diff cuối: phạm vi, dữ liệu riêng, error handling, dependency, tài liệu và file sinh ra. Không ghi đè/reset/clean thay đổi của người khác.
- Báo ngắn gọn kết quả, lý do thay đổi, các lệnh đã kiểm chứng và giới hạn còn lại. Không tuyên bố hoàn thành cho phần chưa có bằng chứng.

## Code Review Rules

Ưu tiên lỗi có trigger, ảnh hưởng và vị trí cụ thể: sai yêu cầu/contract, vượt quyền, mất hoặc nhân đôi dữ liệu, lộ secret, lỗi đồng thời hoặc xử lý dịch vụ sai. Đối chiếu test và tài liệu nguồn; không đề nghị refactor ngoài phạm vi hoặc áp convention theo sở thích. Thay đổi do agent tạo vẫn cần thành viên review theo CONTRIBUTING.
