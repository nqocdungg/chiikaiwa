# UI Chiikaiwa

## Các màn hình

- **Trang chính:** lời mời luyện, tìm bạn, mã mời và góc học cá nhân. Hai cột ngang trên desktop, căn giữa theo chiều cao; footer ở cuối màn. Cửa sổ rộng tối đa 650px chuyển một cột.
- **Phòng hội thoại:** hai người luyện bên trái, thẻ tình huống ở giữa, gợi ý/ghi chú/chat bên phải và có thể ẩn. Danh sách và nội dung dài cuộn trong từng vùng; desktop không cuộn toàn trang. Cửa sổ hẹp mở công cụ thay vùng thẻ.
- **Thẻ vai:** tiếng Nhật, gồm tên vai, bối cảnh, tình huống, mục đích; có nút xem tiếng Việt. Vai riêng chỉ người được giao thấy. Đổi vai, bỏ qua và hoàn thành cần hai người đồng ý.
- **Tổng kết:** tình huống đã luyện, kiến thức đã lưu, ghi chú và hình minh họa trong khung hồng.

## Quy tắc thiết kế

- Dùng Nunito tự host, fallback tiếng Nhật; giữ giấy phép trong `client/src/assets/fonts/`.
- Dùng biến màu trong `client/src/styles/ui.css`: nền kem, chữ nâu, nút chính màu mận, vùng minh họa hồng và điểm nhấn xanh dịu. Không tạo bảng màu riêng ở từng màn.
- Nội dung ngắn, mỗi vùng có một mục đích. Giữ chữ Nhật dễ đọc, không thu nhỏ để ép nội dung vừa khung.
- Icon SVG cùng nét. Nút icon phải có tên truy cập và tooltip; nút bật/tắt có `aria-pressed`. Hành động quan trọng vẫn có nhãn chữ.
- Giữ focus bàn phím, trạng thái disabled/error/empty và reduced motion. Dialog trả focus về nơi mở; Escape hủy.
- Sao ở góc từng mục kiến thức để lưu/bỏ lưu. Minh họa dùng ở trang chủ và tổng kết, avatar chữ cái dùng cho người luyện.

## Component và cách dùng

Source chia theo chức năng:

```text
client/src/
├── components/         Friends và ui/controls dùng chung
├── features/
│   ├── home/           Home.jsx
│   ├── kaiwa/          KaiwaRoom.jsx và components/ của phòng
│   └── session-summary/ SessionSummary.jsx
├── demo/               ComponentPreview và fixture của phòng hội thoại
├── styles/ui.css       Màu, font, style và responsive dùng chung
└── assets/             Minh họa, font và giấy phép
```

Component chỉ dùng trong phòng ở `features/kaiwa/components/`; component dùng giữa các chức năng ở `components/`. Không đưa trang chủ hoặc tổng kết vào thư mục phòng.

| Component          | Cách dùng                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `Button`           | Hành động có chữ; `variant`: `primary`, `secondary` (mặc định), `danger`. Nhận `onClick`, `disabled`, `children`. |
| `Icon`             | Icon trang trí từ `name`, tùy chọn `size`; tên truy cập đặt trên nút chứa.                                        |
| `IconButton`       | Truyền `name`, `label`, `onClick`; `pressed` cho bật/tắt, `disabled` khi chưa thể thao tác.                       |
| `Home`             | Trang chủ và điểm vào luồng luyện.                                                                                |
| `ParticipantVideo` | Khung người luyện; nhận `name`, `self`, `camera`, `paused`. Hiện chỉ mô phỏng thiết bị.                           |
| `RoleCard`         | Thẻ Nhật/Việt; dữ liệu `scenario`, `roleIndex`, `translated`, `onTranslate`, `longContent`.                       |
| `KnowledgeItem`    | Một mục gợi ý; `item`, `saved`, `onToggle`; state do màn cha giữ.                                                 |
| `LeaveDialog`      | Xác nhận kết thúc; `onCancel`, `onConfirm`; tự quản lý focus.                                                     |
| `SessionSummary`   | Kết quả phiên qua props; không tự gọi API.                                                                        |
| `DeckPicker`       | Danh sách chủ đề; nhận `decks`, `disabled`, `onSelect`.                                                           |
| `CardTable`        | Bàn thẻ úp; nhận `count`, `used`, `disabled`, `onDraw`.                                                           |
| `ConsentBanner`    | Đề nghị đồng thuận; `consent`, `scenarioTitle`, `onRespond`, `onCancel`.                                          |
| `PrivateTools`     | Panel riêng; nhận dữ liệu/callback cho gợi ý, ghi chú và đóng panel. State do phòng giữ.                          |
| `Friends`          | Hình minh họa trang trí, alt rỗng.                                                                                |

```jsx
import { Button, Icon } from '../../components/ui/controls.jsx';

<Button variant="primary" onClick={onStart}>
  Tìm bạn luyện <Icon name="arrow" />
</Button>;
```

Dùng lại component hiện có trước khi tạo mới. Component nhận dữ liệu/callback qua props; màn cha quản lý trạng thái dùng chung. Không chép markup hoặc CSS của nút sang từng màn. Style giữ tiền tố `ck-` và nằm trong `client/src/styles/ui.css`; khi gắn vào ứng dụng thật cần import stylesheet này một lần.

`KaiwaRoom` điều phối trạng thái phiên; `demo/kaiwa-fixtures.js` chỉ chứa dữ liệu demo. Phòng hiện còn dùng fixture và state mô phỏng; đây chưa phải tích hợp nghiệp vụ. Khi tích hợp, lấy dữ liệu theo contract API, chỉ gửi vai được phép xem xuống client; không đưa toàn bộ fixture hai vai vào sản phẩm.

## Thiết kế và xem thử

Đối chiếu giao diện với thiết kế Figma của nhóm và [Design System](../frontend/design-system.md). Chạy `npm run dev --workspace client`, rồi mở `http://127.0.0.1:5173/__dev/components` để xem các trạng thái của component nền. Kiểm tra màn hình qua route thực tế và làm theo [testing guide](testing.md) khi thay đổi hành vi.

## Giới hạn demo

Chỉ bộ cà phê có ba tình huống tương tác. Chat, ghép bạn, mã mời, học liệu và thiết bị chưa kết nối dịch vụ. Ghi chú/kiến thức lưu trong bộ nhớ, reload sẽ mất. Hình minh họa là asset demo; cần xác nhận quyền sử dụng trước phát hành sản phẩm.

Yêu cầu sản phẩm đầy đủ: [UI/UX](../design/04-ui-ux-design.md), [SRS](../design/02-srs.md), [API](../design/07-api-specification.md).
