# Frontend Chiikaiwa

Frontend dùng React, Vite, React Router và Tailwind CSS v4 trong npm workspace `client`.

## Design token và component

- `src/styles/tokens.css` là nguồn giá trị runtime cho màu semantic, font stack, type scale, spacing, radius, shadow, control và layer. Tailwind map về cùng token trong `src/styles.css`; không tạo bảng màu thứ hai.
- `src/styles/globals.css` chứa reset và hành vi toàn cục. `src/styles/foundation.css` chứa style của component nền. `src/styles/ui.css` giữ các style màn pilot hiện có và dùng alias từ token mới.
- Component dùng chung nằm trong `src/components/ui/`; layout dùng chung nằm trong `src/components/layout/`. Ưu tiên prop semantic như `variant`, `size`, `tone`, `error` thay vì truyền class để thay toàn bộ giao diện.
- `Dialog` quản lý focus, Escape, khóa cuộn body và trả focus khi đóng. Luồng có hậu quả phải xử lý hủy nghiệp vụ trong `onClose`, không chỉ ẩn giao diện.
- Font stack theo tài liệu là Be Vietnam Pro, Baloo 2 và Noto Sans JP. Repo chưa có file đã chốt nguồn cho ba font này; CSS dùng font cài cục bộ nếu có và rơi về Nunito/system. Không thêm font ngoài khi chưa chốt nguồn và giấy phép.

Nguồn thiết kế: [`docs/frontend/design-system.md`](../docs/frontend/design-system.md) và Figma node `12:44`. Khi rules cũ khác mẫu mới, Button dùng mẫu FlowButton 48px; modal mặc định padding 24px, variant form có thể dùng 32px theo màn được review.

## Cấu trúc chính

```text
src/
  assets/             logo, mascot và font có nguồn rõ ràng
  components/ui/      control và surface dùng chung
  components/layout/  layout trang và auth
  demo/               trang xem thử chỉ trong development
  features/           UI và logic theo chức năng
  styles/             token, global, foundation và style màn hiện có
```

## Trang xem thử

Chạy `npm run dev --workspace client`, rồi mở `http://127.0.0.1:5173/__dev/components`. Route này chỉ được đăng ký khi Vite chạy development và không nằm trong điều hướng sản phẩm.

## Kiểm tra

Từ thư mục gốc repository:

```sh
npm exec -- vitest run --project client
npm run build --workspace client
npm run check
```

Trước khi bàn giao UI, kiểm tra bằng bàn phím và ở 1440×900, 1366×768, 390px; kiểm tra thêm zoom 200% và `prefers-reduced-motion` khi thay đổi layout hoặc motion.
