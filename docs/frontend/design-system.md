# Chiikaiwa — Design System & Frontend UI Rules

- Phiên bản: 1.0 — baseline triển khai FE, ngày 14/11/2026.
- Trạng thái: kết hợp thiết kế đã quan sát, lựa chọn trong trao đổi và đề xuất triển khai; không phải toàn bộ hệ thống đã được duyệt.
- Công nghệ theo tài liệu kiến trúc hiện có: React + Vite + React Router + Tailwind CSS, JavaScript.
- Phạm vi: foundations, UI component, layout, trạng thái, tương tác, asset và kiểm tra giao diện. Logic nghiệp vụ theo SRS/API; tài liệu này không tự tạo chức năng mới.

## 1. Nguồn chuẩn và cách xử lý khác biệt

### 1.1. Nguồn đã kiểm tra

| Nguồn                                                                                        | Nội dung                                              |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [Design rules v1](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=12-44)        | Quy tắc desktop, component pilot, variables           |
| [Button primary mới](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=31-8172)   | FlowButton 48px, chữ 16/24, viền và bóng cứng         |
| [Button secondary mới](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=31-8179) | Nền kem, viền hồng nâu                                |
| [Countdown mới](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=31-8195)        | Vòng phân đoạn, 88px, số Baloo 2                      |
| [Tìm được bạn](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=11-5275)         | Popup gọn, không có mascot bên trong, hai CTA         |
| [Đăng nhập](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=32-8236)            | Auth hai cột, mascot trái, form phải                  |
| [Đăng ký](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=36-9559)              | Cùng layout Auth                                      |
| [Kaiwa Room main](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=4-2728)       | 1440×900, sidebar, ba bộ chủ đề                       |
| [Home](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=1-2)                     | Bản mẫu cũ 1280×720; tham khảo nhận diện              |
| BTL/02-srs.md, BTL/05-system-architecture.md                                                 | SRS và kiến trúc v1.0 ngày 27/10/2026 trong workspace |

Toàn bộ file hiện dùng một page “Prototype”; các nhóm màn là SECTION, chưa phải các page riêng. Summary & History, Library & Review, Admin và Shared States chưa có màn bên trong ở thời điểm kiểm tra. Chưa thấy bản mobile trong các nhóm đã kiểm tra.

### 1.2. Quy ước trạng thái quyết định

- **Figma:** giá trị đã đọc trực tiếp; có thể thuộc mẫu cũ, không tự đồng nghĩa đã chốt.
- **Chốt trao đổi:** lựa chọn người dùng đã xác nhận; ưu tiên hơn mẫu cũ về hình thức.
- **Baseline đề xuất:** quy tắc bổ sung để FE bắt đầu; cần kiểm tra trên app thật trước khi coi là chốt.
- **Cần đồng bộ:** thiết kế và yêu cầu đang khác nhau; không tự biến mockup thành logic nghiệp vụ.

Về hành vi/quyền: dùng SRS/API đã được team xác nhận. Về hình thức: lựa chọn mới đã xác nhận → component mới được chỉ định ở trên → rules v1 → baseline đề xuất. Nếu team đã có SRS mới hơn bản local, cập nhật nguồn trước khi code nghiệp vụ.

### 1.3. Những chênh lệch phải biết

| Chủ đề         | Hiện trạng                                                             | Baseline FE                                                                                            |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Button         | Rules cũ 44px, chữ 14/20; mẫu mới 48px, 16/24                          | Dùng mẫu mới. Size 44 chỉ cho control gọn khi cần                                                      |
| Modal          | Rules cũ padding 32, min-height 400; trao đổi mới muốn gọn, padding 24 | Default padding 24, ôm nội dung; form lớn có variant 32; không ép min-height cho mọi popup             |
| Modal radius   | Component pilot 24, popup match mới 30                                 | Giữ variant standard 24 và friendly 30; cùng Modal primitive                                           |
| Countdown      | Rules cũ số 32/40; mẫu mới số 39/40                                    | Chuẩn hóa số 40/40 gần mẫu mới, cần kiểm tra 00–30                                                     |
| Font Auth/Room | Có chữ 7–13px và số lẻ do bản nhập từ Make                             | Không sao chép máy móc; dùng type scale mục 4                                                          |
| Frame          | Auth 1463px, Home 1280px, một số Room cũ 1201px                        | Chuẩn desktop tham chiếu 1440×900; layout fluid, kiểm tra 1366×768                                     |
| Quyền chọn bộ  | Mockup có “Bạn điều khiển/Trao quyền”                                  | SRS DEC-07 không phân người điều khiển. Cần đồng bộ thiết kế; chưa triển khai cơ chế trao quyền từ ảnh |
| Timer chọn bộ  | Mockup đồng thời có “0 giây” và “00:00”                                | Không giữ trạng thái hết hạn mà CTA vẫn khả dụng; thời hạn chọn bộ cần nguồn nghiệp vụ xác nhận        |
| Flashcard/Quiz | Prompt trước từng đề xuất 2 mức nhớ và quiz từ đã lưu                  | Theo SRS: Again/Hard/Good; quiz theo ngân hàng chủ đề, tối đa 5 câu, độc lập FSRS                      |
| “Bộ riêng”     | Prompt trước có thể bị hiểu là tự soạn bộ hội thoại                    | SRS cho người học tạo thẻ hỏi/đáp riêng; học liệu hội thoại do Admin biên soạn                         |
| Phụ đề         | Có frame minh họa phụ đề Việt                                          | Không tự suy ra đã có STT/dịch; chỉ nối khi phạm vi và dữ liệu được xác nhận                           |

## 2. Định hướng hình ảnh và nội dung

- Thân thiện, dễ thương, nền kem và pastel, đường nét tròn, điểm nhấn hồng nâu.
- Button có cảm giác bấm nhờ viền và bóng cứng. Card/panel giữ nhẹ để nội dung dễ đọc.
- Nội dung ngắn, hướng người dùng vào hành động; mỗi vùng có một tiêu đề, một mô tả ngắn khi cần và CTA rõ.
- Mascot ưu tiên Home/Auth. Popup thao tác không cần mascot lớn; popup match giữ phiên bản đã bỏ mascot.
- Không trang trí mọi tiêu đề bằng stroke/texture. Baloo 2 hiện là font heading; font mới chưa chốt.
- Icon pixel hoặc bóng bẩy chỉ là hướng đang cân nhắc. Chưa áp dụng toàn app; không trộn nhiều hệ icon trong cùng thanh công cụ.
- Tiếng Việt dùng cho điều hướng, thông báo; tiếng Nhật dành cho nội dung học và điểm nhấn phù hợp.

## 3. Color tokens

Giữ một nguồn token trong code. Tách màu primitive với vai trò semantic; component dùng semantic token. Không dùng tên màu làm trạng thái nghiệp vụ.

### 3.1. Variables đang có trong Figma

Các mã HEX dưới đây được chuyển từ giá trị RGB của variables, không lấy bằng mắt.

| CSS token đề nghị  | Variable Figma | HEX     | Vai trò                             |
| ------------------ | -------------- | ------- | ----------------------------------- |
| --color-surface    | color/surface  | #FFFCF8 | Card/modal, bề mặt kem              |
| --color-white      | color/white    | #FFFFFF | Input/bề mặt trắng                  |
| --color-text       | color/text     | #433D3D | Chữ chính                           |
| --color-text-muted | color/muted    | #766B70 | Chữ phụ                             |
| --color-accent     | color/accent   | #9B526E | Link/nhấn thương hiệu               |
| --color-brand-soft | color/primary  | #F4CBDA | Hồng nền; không nhầm với button mới |
| --color-selected   | color/selected | #F8DFE8 | Chip/tab được chọn                  |
| --color-border     | color/border   | #E9D6DE | Viền bề mặt                         |
| --color-info-bg    | color/info     | #EEF7FA | Thông tin, thiết bị                 |
| --color-info-text  | color/infoText | #487588 | Chữ thông tin                       |

### 3.2. Màu đọc từ button/countdown mới

| Token                     | HEX     | Nguồn                |
| ------------------------- | ------- | -------------------- |
| --button-primary-bg       | #EFADC3 | FlowButton primary   |
| --button-primary-border   | #B8748D | FlowButton primary   |
| --button-primary-shadow   | #A9677E | FlowButton primary   |
| --button-primary-text     | #49383E | FlowButton primary   |
| --button-secondary-bg     | #FFFAF4 | FlowButton secondary |
| --button-secondary-border | #C98CA1 | FlowButton secondary |
| --button-secondary-shadow | #B3748A | FlowButton secondary |
| --button-secondary-text   | #59444B | FlowButton secondary |
| --button-ghost-text       | #846D75 | FlowButton ghost     |
| --countdown-bg            | #FFF4E8 | SegmentedCountdown   |
| --countdown-border        | #C9829A | SegmentedCountdown   |
| --countdown-text          | #A04F6D | SegmentedCountdown   |
| --countdown-shadow        | #BD7D92 | SegmentedCountdown   |

Highlight/gradient trắng của button là lớp trang trí riêng; màu nền vẫn có token độc lập. Không cần cố mô phỏng toàn bộ điểm gradient sinh ra từ Make.

### 3.3. Màu bổ sung — baseline đề xuất

| Token                                | Giá trị            | Vai trò                                           |
| ------------------------------------ | ------------------ | ------------------------------------------------- |
| --color-background                   | #FFFCF8            | Nền app; Auth có thể dùng surface hồng nhạt riêng |
| --color-danger / --color-danger-bg   | #A8324A / #FFF0F3  | Lỗi, hành động phá hủy                            |
| --color-success / --color-success-bg | #2F6B4F / #EDF7F0  | Lưu thành công, hoàn tất                          |
| --color-warning / --color-warning-bg | #795600 / #FFF6D9  | Hết hạn sớm, cảnh báo                             |
| --color-focus                        | #9B526E            | Vòng focus                                        |
| --color-overlay                      | rgba(67,61,61,.28) | Nền sau modal                                     |

Màu trạng thái chưa có hệ chuẩn đầy đủ trong Figma. Kiểm tra tương phản trên đúng cặp foreground/background; không coi mọi tổ hợp pastel là đạt. Mục tiêu: chữ thường 4.5:1, chữ lớn 3:1; chỉ báo và control thiết yếu 3:1. Viền trang trí nhạt không thay cho tín hiệu focus/selected rõ.

## 4. Typography

### 4.1. Font family

| Vai trò                    | Font           | Weight                                              |
| -------------------------- | -------------- | --------------------------------------------------- |
| Giao diện và nội dung Việt | Be Vietnam Pro | 400, 600, 700                                       |
| Heading/nhận diện          | Baloo 2        | 800; Room có 700 nhưng chuẩn hóa heading mới về 800 |
| Nội dung Nhật              | Noto Sans JP   | 400, 500, 700                                       |
| Countdown nổi bật          | Baloo 2        | 800                                                 |

Nunito, Coiny và các font khác đã bàn chỉ là phương án thử; chưa thay font mặc định.
Chọn font theo ngôn ngữ, không để toàn bộ câu Nhật rơi vào fallback ngẫu nhiên. Có thể dùng lang="ja" và .text-ja. Không dùng font-size nhỏ để che lỗi layout.

### 4.2. Type scale dùng khi triển khai

| Token     | Size/line-height | Weight  | Sử dụng                |
| --------- | ---------------- | ------- | ---------------------- |
| caption   | 12/20            | 400–600 | Metadata ngắn, badge   |
| label     | 14/20            | 600     | Nhãn trường            |
| small     | 14/24            | 400     | Mô tả phụ              |
| body      | 16/24            | 400     | Nội dung thường, input |
| button    | 16/24            | 600     | CTA chuẩn mới          |
| japanese  | 20/32            | 400–700 | Câu Nhật/thẻ học       |
| section   | 24/32            | 800     | Heading section        |
| title     | 32/40            | 800     | Trang/form lớn         |
| hero      | 48/56            | 800     | Home/Auth desktop      |
| countdown | 40/40            | 800     | Số trong timer 88px    |

Scale chủ yếu từ rules v1; button/countdown cập nhật theo mẫu mới. Compact popup có thể dùng title 24/32 như baseline gọn, không ép 32/40 nếu tiêu đề quá dài. Mobile hero 32/40, title 28/36 là đề xuất responsive.
Dùng rem cho chữ, hỗ trợ zoom; không cắt dấu Việt hoặc kana. Không thiết lập fixed height cho đoạn nhiều dòng. Counter dùng tabular-nums khi font hỗ trợ và giữ khung số cố định.

## 5. Spacing, shape, elevation và motion

| Nhóm                     | Giá trị                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| Spacing                  | 4, 8, 12, 16, 24, 32, 48, 64px                                           |
| Label → input            | 8px                                                                      |
| Giữa field               | 24px; Auth gọn có thể 20px bằng token riêng                              |
| Giữa đoạn/vùng liên quan | 16px                                                                     |
| Card/panel padding       | 24px                                                                     |
| Modal padding            | 24px default; 32px form lớn                                              |
| Icon → chữ               | 8px                                                                      |
| Radius                   | input 12; button mới 14; card 16; modal 24/friendly 30; avatar/chip pill |
| Border                   | 1px bề mặt; button mới chuẩn hóa 2px từ 1.77778px trong Figma            |
| Button shadow            | 0 3px 0 màu shadow tương ứng                                             |
| Modal shadow             | 0 16px 48px rgba(105,71,86,.16), từ component pilot                      |
| Countdown shadow         | 3px 4px 0 #BD7D92, từ mẫu mới                                            |

Không làm tròn mọi số đo: radius 14 của button là lựa chọn có chủ ý. Số lẻ do import có thể chuẩn hóa nếu không làm sai bố cục.

Motion — baseline đề xuất: 120–180ms cho hover/pressed/focus, 180–240ms mở panel/modal. Chỉ animate opacity/transform nếu phù hợp; không gây layout nhảy. Respect prefers-reduced-motion; tắt animation trang trí và chuyển động countdown mượt khi người dùng giảm chuyển động.

## 6. Layout và responsive

### 6.1. Desktop

- Frame tham chiếu: 1440×900. SRS yêu cầu dùng được ở 1366×768; kiểm tra kích thước này trước.
- Header: 80px. Trang thường max-width 1280px, căn giữa, padding ngang tối thiểu 32px.
- Room: sidebar trái 192px; panel công cụ phải 320px khi mở, nội dung giữa co giãn. Không cộng tất cả chiều rộng thành một khung cố định gây tràn.
- Room dùng chiều cao viewport; vùng nội dung và panel cuộn riêng khi cần. Chat input và công cụ thiết yếu luôn tiếp cận được.
- Header Room cho truy cập trực tiếp Kiến thức/Ghi chú/Chat; không gom tất cả vào “Công cụ”.
- Mic/cam ở cạnh avatar/vùng người tham gia như lựa chọn đã thống nhất.
- Ba card bộ hội thoại chia đều khi đủ chỗ, gap 24px.

### 6.2. Auth

Hai cột minh họa/form, giữ tỉ lệ gần mẫu (khoảng 55/45), form max-width khoảng 400px. Không dùng width 1463px từ frame làm CSS cố định. Logo và “Về trang chủ” nhất quán giữa hai màn. Chiều cao theo nội dung; đăng ký được cuộn khi màn thấp. Minh họa không đè vào form.

### 6.3. Mobile/tablet — baseline đề xuất, chưa phải bản Figma đã duyệt

| Vùng viewport | Hành vi                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| Dưới 768px    | Padding 16px; Auth một cột, thu gọn minh họa; card một cột; điều hướng thu gọn |
| 768–1199px    | Padding 24px; grid 1–2 cột; panel phụ mở dạng drawer khi không đủ chỗ          |
| Từ 1200px     | Padding 32px; desktop layout                                                   |

Room là màn ưu tiên laptop. Trên màn hẹp, sidebar người tham gia có thể thành dải gọn, công cụ mở drawer; cần review riêng trước khi cam kết mobile đầy đủ.
Modal width: min(kích thước variant, viewport − 32px), max-height: viewport − 32px mobile hoặc −64px desktop. Dùng 100dvh khi phù hợp; tránh nút bị bàn phím che.
Không scale toàn bộ UI, không dùng absolute cho các khối nội dung chính. Flex/grid có min-width:0 cho text, avatar/icon flex-shrink:0.

## 7. Hợp đồng component dùng chung

### 7.1. Button và IconButton

- Button variants: primary, secondary, ghost, danger. Primary/secondary theo mẫu mới; danger là baseline bổ sung.
- Size default 48px, padding ngang 24px (16px nếu footer hai nút cần gọn), gap 8px, radius 14, icon 20px.
- Size compact 44px; hero 56px là đề xuất, chỉ dùng khi layout cần.
- Không dùng mỗi màn một loại button. API gợi ý: variant, size, loading, disabled, leadingIcon, trailingIcon, fullWidth.
- States: default, hover, pressed, focus-visible, disabled, loading. Pressed dịch xuống 2px và giảm bóng, không làm vùng bấm/layout nhảy.
- Loading giữ chiều rộng, chặn submit lặp. Disabled không chỉ dựa vào opacity quá thấp; không phát handler.
- Dùng button type phù hợp; navigation dùng link. Nút chỉ icon có accessible name; icon trang trí ẩn khỏi screen reader.
- Close mẫu Figma 40×40; giữ icon nhỏ nhưng vùng tương tác tối thiểu 44×44 khi cần cho touch. Vị trí đóng không chiếm chỗ tiêu đề.

### 7.2. FormField, Input, PasswordInput, Select, Checkbox

- FormField sở hữu label, helper và error; Input sở hữu control. Label luôn hiện, không dùng placeholder thay label.
- Default cao 48px, padding ngang 16px, font body 16/24, radius 12px.
- States: empty, filled, hover, focus, disabled, readonly, error, loading nếu có.
- Lỗi đặt ngay dưới trường, liên kết bằng aria-describedby; error có aria-invalid.
- Password toggle không submit form; autocomplete đúng ngữ cảnh email/current-password/new-password.
- Không hardcode luật mật khẩu từ placeholder/mockup; đồng bộ API/SRS được team chốt.
- Checkbox và selection chip dùng native semantics; không dùng div bấm mà thiếu bàn phím.
- Group chọn một giá trị dùng radio/radiogroup hoặc select; selected có nền + viền + dấu hiệu rõ.

### 7.3. Modal/Dialog

- Một primitive, variants compact 480px và form 680px.
- Cấu trúc: overlay → dialog → header → body → footer. Body cuộn khi dài; header/footer vẫn dùng được.
- Không gắn min-height 400 cho mọi trạng thái; search có thể giữ vùng ổn định nếu cần, phải qua review.
- Popup match: người luyện ở một hàng, avatar 48px cố định; timer ở hàng riêng; điểm chung; footer hai nút gap 12px, secondary trái/primary phải.
- Form thường primary trước secondary theo pilot; không đảo thứ tự tùy hứng giữa các trạng thái cùng luồng.
- Popup match không có mascot lớn. Không ép tên dài thành một chữ/ký tự mỗi dòng.
- Focus vào dialog khi mở, trap focus, trả focus khi đóng; có title và mô tả phù hợp.
- Escape/bấm overlay đóng cho dialog thông thường. Luồng đang tìm/chờ/đang ghi có hậu quả: đóng phải gọi hành động hủy hợp lệ hoặc xác nhận, không chỉ ẩn UI để lại tác vụ chạy.
- Modal lồng nhau hạn chế; chỉ dùng alert dialog khi có hậu quả cần xác nhận.

### 7.4. Card, Tabs, Badge, Avatar

| Component           | Quy tắc                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Card                | Padding 24, radius 16, viền nhẹ; click card có focus/hover/selected; không lồng button trong button    |
| ConversationSetCard | Thumbnail, cấp độ, tên Nhật/Việt, số tình huống; nội dung dài không phá chiều cao và CTA               |
| Tabs                | Phân biệt active; semantics và phím điều hướng phù hợp; không dùng tab để thay route khác bản chất     |
| Badge               | Trình độ/trạng thái; caption 12/20; trạng thái có nhãn, không chỉ một chấm màu                         |
| Avatar              | 32/40/48/64px theo ngữ cảnh; popup match 48, Room pilot 40; aspect-ratio 1; initials fallback          |
| ParticipantCard     | Avatar/video, tên, kết nối, mic/cam; tách local control khỏi trạng thái remote; tên dài có cách xem đủ |
| Panel/Drawer        | Header, close, body cuộn; chat, ghi chú, kiến thức tái sử dụng khung                                   |

### 7.5. Countdown

- Component React + SVG/CSS; không xuất timer thành ảnh. Mẫu mới 88×88, phân đoạn bo đầu, nền kem, số Baloo 2.
- Props gợi ý: expiresAt, totalSeconds, serverTimeOffset, size, onExpire; callbacks hết hạn chỉ phát một lần cho cùng kỳ.
- Tính còn lại từ mốc thời gian thay vì giảm biến mỗi giây: clamp(ceil((expiresAt − serverNow)/1000), 0, totalSeconds).
- Frontend hiển thị; backend xác nhận hết hạn/quyền. Thời hạn không kéo dài do refresh hoặc tab ngủ.
- Tách timer thời lượng phiên, countdown xác nhận ghép và countdown chọn bộ; không dùng chung biến.
- 30→0 và 9→8 không lệch tâm/giật width. Hiển thị “giây”; không chỉ dùng màu làm dấu hết hạn.
- Không đọc aria-live mỗi giây; thông báo khi sắp hết/hết giờ, giữ mô tả truy cập được.
- Đếm ngược chọn bộ chỉ nối khi có quy tắc nghiệp vụ xác nhận. SRS đã có xác nhận ghép 30 giây.

### 7.6. Feedback và component theo domain

- Toast: thành công, lỗi, thông tin; không dùng toast làm nơi duy nhất báo lỗi field.
- InlineAlert: mất mạng, reconnect, quyền thiết bị, hết hạn; có hướng xử lý rõ.
- Spinner/Skeleton: thể hiện đang tải; không để spinner vô hạn khi có lỗi.
- EmptyState phân biệt chưa có dữ liệu, không có kết quả và không có quyền.
- Flashcard: mặt hỏi/đáp + rating Again/Hard/Good theo SRS; rating gửi backend, chờ xác nhận lịch.
- Quiz: lựa chọn/đã trả lời/kết quả, tối đa 5 câu theo ngân hàng chủ đề; không tự cập nhật FSRS.
- DataTable/Pagination/ContentStatusBadge dành Admin; nháp/xuất bản/ẩn và xác nhận hành động theo yêu cầu.
- Chưa có màn Figma của các component domain sau phòng; đây là hợp đồng khởi đầu, cần review màn mẫu.

## 8. Trạng thái sản phẩm cần thể hiện

| Luồng        | Trạng thái tối thiểu                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Auth         | Initial, validation error, submitting, sai thông tin, tài khoản khóa, expired reset link, success |
| Ghép tự động | Tiêu chí, searching, có ứng viên, đã xác nhận/chờ bên kia, từ chối/hết hạn, lỗi, ready            |
| Mã mời       | Tạo mã, copy thành công, chờ xin vào, chấp nhận/từ chối, mã sai/hết hạn/đủ người                  |
| Thiết bị     | Off, on, requesting permission, denied, not found, lỗi thiết bị                                   |
| Room         | Connecting, connected, reconnecting, kết thúc, một người rời, lỗi/hết quyền                       |
| Nội dung     | Loading, empty, selected, pending mutation, conflict stale state, retry                           |
| Lưu/ghi chú  | Chưa lưu, đang lưu, đã lưu, lỗi lưu; không báo thành công trước phản hồi                          |
| Guest        | Nhãn khách, quyền hạn tương ứng, thời gian truy cập sau phiên, đã hết hạn                         |
| Review       | Không có mục, đến hạn, câu hỏi/đáp án, đang gửi đánh giá, lỗi, hoàn tất                           |
| Admin        | Loading, lọc rỗng, lỗi validation, nháp/xuất bản/ẩn, hết quyền                                    |

Theo SRS local: khách chỉ vào bằng mã, ôn thử trong 15 phút sau phiên; mã mời 10 phút; reconnect tối đa 5 phút. UI nhận expiresAt và trạng thái từ backend, không tạo quyền riêng bằng local timer. Kiểm tra lại nếu yêu cầu được cập nhật.

## 9. Quy tắc copy, icon và asset

- CTA dùng động từ cụ thể: “Bắt đầu tìm”, “Hủy tìm”, “Luyện cùng”, “Vào phòng”, “Lưu thay đổi”.
- Mỗi bước hiển thị thông tin cần để ra quyết định. Hướng dẫn dài chuyển sang disclosure/help khi hợp lý.
- Không giấu thao tác chính vào menu sâu. Disabled action có lý do; trên touch không phụ thuộc tooltip hover.
- Icon chức năng: chọn một bộ SVG thống nhất, cùng stroke/bo nét, size 20/24. Icon pixel chưa là mặc định.
- Logo/mascot là asset độc lập; text thông thường, button, timer, badge, nền pastel đơn giản dựng bằng code.
- Không dùng emoji làm icon chức năng chuẩn vì hình hiển thị khác giữa hệ điều hành.
- Giữ aspect ratio; mascot object-fit:contain, ảnh đại diện object-fit:cover. Fallback khi ảnh lỗi.
- Image trang trí alt=""; image mang thông tin có alt ngắn; ảnh không thay nhãn nút.
- Bảng chuẩn bị asset chi tiết ở mục 12.

## 10. Tổ chức và luật FE

Đây là gợi ý cấu trúc; đối chiếu repo thật trước khi tạo thư mục. Tài liệu kiến trúc local không đồng nghĩa đã kiểm tra package.json hoặc code FE hiện tại.

```text
src/
  styles/tokens.css
  styles/globals.css
  components/ui/
  components/layout/
  features/auth/
  features/matching/
  features/room/
  features/library/
  features/review/
  features/admin/
  lib/api/
  assets/
```

- tokens.css là nguồn giá trị thực thi; Tailwind/theme tham chiếu cùng token, không giữ hai bảng màu độc lập.
- Component dùng semantic variant thay vì mỗi trang truyền arbitrary class để đổi toàn bộ hình thức.
- Cho phép layout đặc thù theo feature; không tạo “universal card” với hàng chục boolean chỉ để gộp mọi màn.
- Tách API, state và logic gọi/ghép/FSRS khỏi component trình bày.
- Dùng mock đi qua adapter/API boundary tương tự dữ liệu thật. Không mock thành công cố định trong component dùng chung.
- Dữ liệu session/auth theo hợp đồng backend. Không nhét secret vào bundle hoặc log nội dung riêng.
- Trạng thái đổi bộ/vai/hoàn tất được server xác nhận; không suy ra quyền từ một nhãn trong Figma.
- Các controls phức tạp nên dùng primitive truy cập được sẵn có nếu repo đã dùng; tránh tự tạo hành vi dialog/select thiếu bàn phím.
- Lệnh lint/build/typecheck/test lấy từ package.json thực tế, không ghi lệnh giả.
- Mỗi quyết định thiết kế mới ghi nguồn, ngày, trạng thái; thay token/component trước rồi cập nhật màn sử dụng.

### Ví dụ token khởi đầu

Đây là ví dụ minh họa để chuyển vào code khi khởi tạo, chưa phải file CSS đã tích hợp:

```css
:root {
  --color-background: #fffcf8;
  --color-surface: #fffcf8;
  --color-text: #433d3d;
  --color-text-muted: #766b70;
  --color-border: #e9d6de;
  --color-accent: #9b526e;
  --button-primary-bg: #efadc3;
  --button-primary-border: #b8748d;
  --button-primary-shadow: #a9677e;
  --button-primary-text: #49383e;
  --font-body: 'Be Vietnam Pro', sans-serif;
  --font-heading: 'Baloo 2', sans-serif;
  --font-japanese: 'Noto Sans JP', sans-serif;
  --control-height: 3rem;
  --radius-button: 0.875rem;
  --radius-card: 1rem;
  --radius-dialog: 1.5rem;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
}
```

## 11. Kiểm tra và điều kiện hoàn thành

1. Có trang xem thử component với states, chữ Việt/Japan và nhãn dài; Storybook chưa bắt buộc.
2. So sánh màn thật ở 1440×900 và 1366×768 với frame nguồn, không so ở canvas zoom nhỏ.
3. Kiểm tra 390px cho form/modal/trang thường; ghi rõ Room mobile còn giới hạn nếu chưa hoàn thiện.
4. Keyboard: tab order, focus-visible, modal trap/restore, Escape, password toggle và radio/tab.
5. Test nội dung dài, email dài, tên người dùng dài, ảnh thiếu, error dưới field, loading.
6. Test 30→0, refresh/tab ngủ, mất mạng/reconnect; CTA phản ánh trạng thái server.
7. Không có overflow ngang ngoài vùng chủ ý; không cắt dấu; không scale avatar thành oval.
8. Kiểm tra tương phản, zoom 200%, reduced motion và touch target.
9. Chạy kiểm tra repo phù hợp; test ưu tiên timer, hành động hủy, submit lặp, quyền và state transitions. Không viết test snapshot chỉ để khóa màu/padding đang đổi.
10. Không coi Summary/Library/Admin là đã khớp Figma khi những section đó chưa có nội dung.

### Thứ tự khởi tạo FE

P0: token/font → Button/IconButton → FormField/Input → Modal → AuthLayout/AppShell → trang xem thử → màn Đăng nhập.
P1: lựa chọn/Card/Avatar/Tabs → Countdown/ParticipantCard → Enter Kaiwa/Room.
P2: Review/Admin/Shared States khi có màn và hợp đồng dữ liệu.

### Các việc còn mở trước khi chốt v1.1

- Đồng bộ lại bảng rules cũ với Button 48 và timer mới.
- Review modal padding 24/32 và radius 24/30 trong một màn thật.
- Sửa Room về quyền chọn/bốc theo SRS hoặc team cập nhật SRS nếu đã đổi quyết định.
- Chốt nguồn và hành vi countdown chọn bộ.
- Chuẩn hóa chữ nhỏ trong Auth/Room; các frame Room cũ còn 1201px cần bố cục lại.
- Dựng mobile mẫu, hoàn thiện focus/loading/error states.
- Chốt bộ icon, asset nguồn và font files; chưa chọn hướng pixel cho toàn app.
- Sửa các prompt cũ về bộ riêng/flashcard/quiz/Admin cho khớp SRS trước khi nhờ gen tiếp.

## 12. Asset checklist — hình ảnh cần chuẩn bị riêng

Không yêu cầu vẽ mới tất cả: asset đã có trong Figma có thể xuất lại nếu có file gốc/chất lượng phù hợp. Tên file dưới đây là đề nghị, chưa phải file đã xuất.

| Ưu tiên  | Asset                        | Số lượng tối thiểu | Dạng bàn giao                                                      | Nơi dùng / tình trạng                                                           |
| -------- | ---------------------------- | -----------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| P0       | Logo biểu tượng “ち”         |                  1 | SVG; có bản vuông                                                  | Logo đã có hình trong file; cần bản sạch                                        |
| P0       | Wordmark Chiikaiwa           |                  1 | SVG outline hoặc biểu tượng SVG + chữ live                         | Header/Auth; đồng bộ một phiên bản                                              |
| P0       | Mascot thỏ và mèo            |                  2 | PNG/WebP nền trong, chiều cao khoảng 800–1200px nếu nguồn cho phép | Home/Auth; Figma có ảnh thỏ/mèo, cần kiểm tra file gốc; không phóng lớn ảnh nhỏ |
| P0       | Avatar mặc định              |                0–1 | SVG/PNG hoặc initials dựng code                                    | Chưa bắt buộc minh họa; initials đủ cho FE ban đầu                              |
| P1       | Ảnh bìa chủ đề               |      3 cho mẫu đầu | SVG hoặc WebP, khoảng 800×400, tỉ lệ 2:1                           | Cà phê, đời sống đại học, việc làm thêm; hiện Room dùng một hình bộ thẻ lặp lại |
| P1       | Favicon                      |       1 bộ từ logo | SVG/ICO + PNG nếu cần                                              | Tab trình duyệt; không cần thiết kế lại                                         |
| P2       | Minh họa rỗng/lỗi/thành công |                0–3 | SVG hoặc WebP trong suốt                                           | Một nhóm nhỏ tái dùng; không cần mỗi lỗi một mascot                             |
| P2       | Ảnh chia sẻ social           |                  1 | PNG/WebP 1200×630                                                  | Nếu triển khai cần link preview                                                 |
| Tùy chọn | Bộ icon pixel/trang trí      |  Một bộ thống nhất | SVG hoặc pixel PNG tại kích thước nguyên                           | Chỉ làm sau khi chốt hướng; chưa thay toàn bộ icon chức năng                    |
| Tùy chọn | Mascot biểu cảm/animation    |                  0 | SVG/WebP hoặc animation tối ưu                                     | Không chặn nhánh FE base                                                        |

### Quy cách bàn giao

- Tên gợi ý: logo-mark.svg, logo-wordmark.svg, mascot-rabbit.webp, mascot-cat.webp, topic-cafe.webp, topic-campus.webp, topic-part-time.webp.
- Giữ một master chất lượng cao; bản dùng web tối ưu dung lượng, không thêm nền trắng vào mascot.
- SVG có viewBox, crop đúng bounds; logo outline chữ nếu cần tái hiện ổn định. Không outline text UI thông thường.
- Ảnh bìa cùng tỉ lệ, phong cách, vùng an toàn; không nhúng tên chủ đề vào ảnh.
- Ghi nguồn, tác giả/giấy phép hoặc điều kiện sử dụng, nơi dùng và alt text vào asset manifest.
- Font files và icon pack là tài nguyên riêng cần chốt nguồn, không phải hình phải tự vẽ.
- Nền blob, bong bóng thoại, viền/bóng button, spinner, countdown và initials avatar có thể dựng bằng CSS/SVG; không cần chuẩn bị ảnh.
- Chưa tải hoặc xuất bất kỳ asset nào trong lượt viết tài liệu này.
