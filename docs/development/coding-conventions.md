# Coding conventions

## Stack và cấu hình

Giữ JavaScript ES modules và stack trong [thiết kế kiến trúc](../design/05-system-architecture.md). Phiên bản dependency nằm trong manifest/lockfile; không nâng stack hoặc thêm thư viện chỉ để theo một boilerplate. Chỉ thêm dependency khi có nhu cầu cụ thể; đặt runtime dependency trong workspace sử dụng và tooling dùng chung tại root.

ESLint và Prettier là nguồn quy tắc tự động về lint/format. `jsconfig.json` cấu hình kiểm tra JavaScript/JSDoc; không thêm bước biên dịch TypeScript cho source ứng dụng. Import nội bộ ghi rõ `.js` hoặc `.jsx`.

## Tổ chức source

| Vị trí                           | Trách nhiệm                                     |
| -------------------------------- | ----------------------------------------------- |
| `client/src/features/<feature>/` | UI, hooks và API theo chức năng                 |
| `client/src/components/`         | Component dùng chung giữa các chức năng         |
| `server/modules/<module>/`       | Route, validation và xử lý nghiệp vụ của module |
| `server/config/`                 | Đọc và kiểm tra cấu hình                        |
| `server/middleware/`             | Xử lý HTTP dùng chung                           |
| `server/persistence/`            | Kết nối, index và migration                     |
| `server/integrations/`           | Adapter LiveKit, Brevo, FSRS khi triển khai     |
| `api/`                           | Entry Vercel; không đặt nghiệp vụ ở đây         |
| `scripts/`                       | Entry CLI cho development/vận hành              |
| `tests/`                         | Test theo nhóm client, server và integration    |

`server/app.js` tạo/export ứng dụng; `server/start.js` mở cổng local. Không mở cổng, chạy migration hoặc seed khi import app. Logic migration và CLI tuân theo [migration guide](../../server/persistence/migrations/README.md).

Code chỉ phục vụ một chức năng ở trong chức năng đó. Chỉ tách thành code dùng chung khi đã có nhu cầu sử dụng thực tế. Không tạo nhiều thư mục `common`, `shared`, `helpers`, `utils` với trách nhiệm trùng nhau. Xóa `.gitkeep` khi thư mục có source đầu tiên.

Mỗi module chỉ có các file cần dùng; không bắt buộc tạo đủ controller/service/repository cho thao tác đơn giản. Với nghiệp vụ phức tạp, controller xử lý HTTP, service áp dụng quy tắc và repository/model truy cập dữ liệu. Không dựng thêm lớp chỉ để chuyển tiếp lời gọi.

## Naming và chất lượng code

- Biến/hàm dùng camelCase; React component dùng PascalCase và tên file tương ứng; file JavaScript còn lại dùng kebab-case.
- Tên biểu đạt nghiệp vụ/trách nhiệm; tránh viết tắt khó hiểu và hậu tố không mang nghĩa.
- Viết component/hàm có trách nhiệm rõ; ưu tiên state cục bộ, chỉ chia sẻ state khi cần. Effect có cleanup tương ứng với tài nguyên đã tạo.
- JSDoc dùng khi cần khai báo contract kiểu. Comment giải thích lý do hoặc ràng buộc, không lặp lại điều code đã thể hiện.
- Không để code chết, debug output, placeholder, chữ ký công cụ hoặc nội dung hội thoại trong source bàn giao. Giữ ghi nhận tác giả và giấy phép bắt buộc.

## API, dữ liệu và tích hợp

Tuân theo [SRS](../design/02-srs.md), [database design](../design/06-database-design.md) và [API specification](../design/07-api-specification.md); không tạo contract khác vì thuận tiện cho một màn hình.

- Server kiểm tra đầu vào, danh tính, quyền sở hữu và trạng thái; không dựa vào việc client đã ẩn nút.
- Không truyền body/filter tùy ý từ client vào truy vấn database. Response chỉ chứa các trường được phép theo contract.
- Phân biệt lỗi validation, quyền, xung đột và dịch vụ; không báo thành công trước khi thao tác được xác nhận.
- Kiểm soát ghi đồng thời và retry theo version/idempotency đã thiết kế. Transaction giữ ngắn, thao tác database tuần tự; tác dụng bên ngoài chạy ngoài transaction.
- Frontend không import source server. Dùng Fetch theo kiến trúc; không thêm một HTTP client hoặc state library khác nếu chưa có nhu cầu được chấp nhận.
- Đưa bí mật vào environment server; không dùng tiền tố `VITE_` cho secret. Không log token, connection string, mật khẩu hoặc nội dung riêng.
- Development, test và preview dùng dữ liệu riêng. Không tự chạy migration hoặc thao tác phá hủy trên môi trường demo/production.

## Thay đổi và bàn giao

Giữ diff tập trung, không refactor phần không liên quan. Sửa lỗi kèm kiểm thử chứng minh hành vi bị lỗi khi phù hợp. Cập nhật tài liệu có liên quan; không sao chép toàn bộ thiết kế vào source hoặc README. Xem [testing guide](testing.md) trước khi báo hoàn thành.
