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

`npm run check` gồm format check, lint, typecheck, unit/HTTP/component tests, integration tests và build. Chạy tại root repository với runtime theo README.

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

## Nguyên tắc viết test

- Kiểm tra hành vi và bất biến, không sao chép implementation thành expected result.
- Ca sửa lỗi cần thất bại với hành vi cũ và thành công với bản sửa khi có thể tái hiện tự động.
- Mỗi test tự chuẩn bị dữ liệu cần dùng; không phụ thuộc thứ tự chạy hoặc dữ liệu development của thành viên.
- Mock ở ranh giới dịch vụ ngoài cho test độc lập; không dùng mock làm bằng chứng MongoDB, LiveKit hoặc email thật đã hoạt động.
- Dùng thời điểm cố định/điều khiển thời gian khi kiểm tra deadline, tránh sleep dài và assert theo tốc độ máy.
- Dọn connection, process và dữ liệu thử; không log secret hoặc ghi dữ liệu thử vào source.
- Không thêm test chỉ để tăng số lượng hoặc coverage. Không tự hạ assertion hay skip test để làm CI xanh.

## Báo cáo kết quả

Ghi lệnh đã chạy, kết quả và giới hạn. Phân biệt lỗi implementation với việc chưa đủ môi trường kiểm thử; không ghi pass cho phần chưa chạy. Khi lỗi, giữ bằng chứng tái hiện và xử lý nguyên nhân trước khi chạy lại.

Unit/component tests hoặc build local không chứng minh các ca nghiệm thu toàn hệ thống đã đạt. Kiểm tra online, nhiều phòng và dịch vụ thật theo [SRS](../design/02-srs.md) và [kiểm chứng kiến trúc](../design/05-system-architecture.md).
