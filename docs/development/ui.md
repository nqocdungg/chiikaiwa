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
├── demo/               KaiwaDemo, kaiwa-fixtures và stories toàn luồng
├── styles/ui.css       Màu, font, style và responsive dùng chung
└── assets/             Minh họa, font và giấy phép
```

Component chỉ dùng trong phòng ở `features/kaiwa/components/`; component dùng giữa các chức năng ở `components/`. Story đặt cạnh component tương ứng. Không đưa trang chủ hoặc tổng kết vào thư mục phòng. Các đường dẫn bàn giao trước đây dưới `features/kaiwa/` được chuyển như cây trên: Home sang `features/home/`, SessionSummary sang `features/session-summary/`, Friends sang `components/`, component của phòng sang `features/kaiwa/components/`, fixtures và điều hướng mẫu sang `demo/`.

| Component          | Cách dùng                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `Button`           | Hành động có chữ; `variant`: `primary`, `secondary` (mặc định), `danger`. Nhận `onClick`, `disabled`, `children`. |
| `Icon`             | Icon trang trí từ `name`, tùy chọn `size`; tên truy cập đặt trên nút chứa.                                        |
| `IconButton`       | Truyền `name`, `label`, `onClick`; `pressed` cho bật/tắt, `disabled` khi chưa thể thao tác.                       |
| `Home`             | Trang chủ; `onStart` mở luồng luyện.                                                                              |
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

`demo/KaiwaDemo.jsx` điều hướng mẫu; `KaiwaRoom` điều phối trạng thái phiên; `demo/kaiwa-fixtures.js` chỉ chứa dữ liệu demo. Phòng hiện còn dùng fixture và state mô phỏng; đây chưa phải tích hợp nghiệp vụ. Khi tích hợp, lấy dữ liệu theo contract API, chỉ gửi vai được phép xem xuống client; không đưa toàn bộ fixture hai vai vào sản phẩm.

## Storybook

Chạy tại root repo với Node 24:

```sh
npm ci
npm run storybook
```

Mở http://127.0.0.1:6006. Nhóm **Chiikaiwa** có các màn và trạng thái; nhóm **Components** xem riêng component, thay props trong Controls. Props `initial*` khởi tạo lại demo khi đổi Controls. Thanh DEMO mô phỏng trạng thái và phản hồi đối tác.

Khi thêm component, viết story cạnh source, tái sử dụng component thật và minh họa các trạng thái cần review. Không sao chép giao diện vào story. Tạm thời ưu tiên xem trực tiếp, lint/typecheck và build; chưa viết test riêng cho demo UI.

```sh
npm run build-storybook
```

Output ở `storybook-static/`, upload cả thư mục lên static hosting hoặc Deploys của site Netlify. Không đưa output và cache vào source. Demo không cần backend hay `.env`.

## Kết nối MCP để code UI với AI

MCP là tùy chọn cho người phát triển. Repo hiện chưa cài addon MCP; bản static trên Netlify chỉ để xem UI, không có endpoint `/mcp`.

### Bật server local

Chạy tại root repo để cài và đăng ký addon:

```sh
npx storybook add @storybook/addon-mcp
```

Trong `.storybook/main.js`, giữ cấu hình hiện có, kiểm tra addon đã được thêm và bật manifest:

```js
addons: ['@storybook/addon-docs', '@storybook/addon-mcp'],
features: { componentsManifest: true },
```

Chạy `npm run storybook`, mở http://127.0.0.1:6006/mcp để xem công cụ được cung cấp. MCP chỉ hoạt động khi dev server đang chạy. Tính năng AI của Storybook đang ở preview. Xem [hướng dẫn Storybook MCP](https://storybook.js.org/docs/ai/mcp/overview).

### Kết nối công cụ AI

Với Codex CLI đã cài:

```sh
codex mcp add chiikaiwa-storybook --url http://127.0.0.1:6006/mcp
codex mcp list
```

Hoặc thêm vào cấu hình Codex, giữ nguyên các mục khác:

```toml
[mcp_servers.chiikaiwa-storybook]
url = "http://127.0.0.1:6006/mcp"
```

Cú pháp kết nối HTTP: [OpenAI Docs](https://developers.openai.com/learn/docs-mcp). Với công cụ AI khác, thêm server kiểu HTTP với cùng URL trong phần cấu hình MCP của công cụ đó. AI phải chạy trên máy có thể truy cập dev server local.

### Cách dùng trong nhóm

Prompt kiểm tra kết nối:

> Dùng MCP chiikaiwa-storybook liệt kê component, rồi đọc props và ví dụ của Button và RoleCard.

Prompt làm UI:

> Đọc docs/development/ui.md và component liên quan qua Storybook MCP. Sửa [yêu cầu cụ thể], dùng lại component hiện có, giữ font và màu đã chốt. Cập nhật story để team xem; chưa viết test UI, không chạy Git.

AI cần đối chiếu props trong source/stories, không tự đoán API component. Sau khi sửa, xem story liên quan và build Storybook. Nếu MCP không kết nối được, kiểm tra server/cổng và addon; vẫn có thể đọc source và dùng Storybook bình thường. Mỗi thành viên cấu hình client MCP trên máy mình; cấu hình addon và lockfile được chia sẻ trong repo khi team chọn bật MCP.

## Giới hạn demo

Chỉ bộ cà phê có ba tình huống tương tác. Chat, ghép bạn, mã mời, học liệu và thiết bị chưa kết nối dịch vụ. Ghi chú/kiến thức lưu trong bộ nhớ, reload sẽ mất. Hình minh họa là asset demo; cần xác nhận quyền sử dụng trước phát hành sản phẩm.

Yêu cầu sản phẩm đầy đủ: [UI/UX](../design/04-ui-ux-design.md), [SRS](../design/02-srs.md), [API](../design/07-api-specification.md).
