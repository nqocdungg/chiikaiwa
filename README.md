# Chiikaiwa

Website luyện hội thoại tiếng Nhật. Repo gồm React/Vite frontend, Express/Mongoose API và bản UI tương tác trong Storybook. UI hiện dùng dữ liệu mẫu, chưa kết nối API/LiveKit.

## Xem và chia sẻ UI

Dùng Node.js 24 và npm 11, chạy tại root repo:

```sh
npm ci
npm run storybook
```

Mở http://127.0.0.1:6006. Xem màn hình trong **Chiikaiwa**, component riêng trong **Components**.

```sh
npm run build-storybook
```

Upload thư mục `storybook-static/` lên static hosting. Không cần backend hoặc `.env` để xem Storybook.

## Cùng phát triển

- [UI và component](docs/development/ui.md): bố cục, quy tắc thiết kế, props và Storybook.
- [Chạy ứng dụng](docs/development/local.md): frontend, API và database.
- [Tài liệu dự án](docs/README.md): yêu cầu và thiết kế hệ thống.
- [Đóng góp](CONTRIBUTING.md): quy trình review.

| Vị trí                      | Nội dung                                                |
| --------------------------- | ------------------------------------------------------- |
| `client/src/components/ui/` | Nút và icon dùng chung                                  |
| `client/src/features/`      | Trang chủ, phòng hội thoại và tổng kết theo chức năng   |
| `client/src/demo/`          | Dữ liệu mô phỏng, điều hướng demo và stories toàn luồng |
| `.storybook/`               | Cấu hình Storybook                                      |
| `server/`, `api/`           | Backend và entry triển khai                             |
| `docs/`, `tests/`           | Tài liệu và kiểm thử ứng dụng                           |

Không đưa `.env`, cache hoặc output build vào source. Giữ dependency trong workspace sử dụng và cập nhật lockfile khi thay đổi. UI demo tạm thời chưa có test riêng; trước PR chạy check theo [testing guide](docs/development/testing.md).
