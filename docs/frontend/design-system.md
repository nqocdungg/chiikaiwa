# Quy chuẩn giao diện Chiikaiwa

Phiên bản 1.1, ngày 26/11/2026.

Frontend dùng React, Vite, React Router và Tailwind CSS với JavaScript. Tài liệu này hướng dẫn thiết kế màn hình, sử dụng component và kiểm tra giao diện.

## 1. Nguồn chuẩn và cách xử lý khác biệt

### 1.1. Tài liệu tham chiếu

| Nguồn                                                                                        | Nội dung                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [Design rules v1](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=12-44)        | Quy tắc desktop, component mẫu và biến thiết kế         |
| [Button primary mới](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=31-8172)   | FlowButton 48px, chữ 16/24, viền và bóng cứng           |
| [Button secondary mới](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=31-8179) | Nền kem, viền hồng nâu                                  |
| [Countdown mới](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=31-8195)        | Vòng phân đoạn, 88px, số Baloo 2                        |
| [Tìm được bạn](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=11-5275)         | Hộp thoại ghép bạn với hai nút hành động                |
| [Đăng nhập](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=32-8236)            | Auth hai cột, mascot trái, form phải                    |
| [Đăng ký](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=36-9559)              | Cùng layout Auth                                        |
| [Kaiwa Room main](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=4-2728)       | 1440×900, sidebar, ba bộ chủ đề                         |
| [Home](https://www.figma.com/design/HgGG2y2OwUBtgdWr3tT2jK/?node-id=1-2)                     | Bản mẫu cũ 1280×720; tham khảo nhận diện                |
| [SRS](../design/02-srs.md), [Kiến trúc](../design/05-system-architecture.md)                 | Quyền người dùng, luồng nghiệp vụ và kiến trúc ứng dụng |

### 1.2. Cách chọn mẫu

Khi bổ sung một màn hình, bắt đầu từ component đang dùng cho cùng thao tác. Nếu có thiết kế đã duyệt mới hơn, dùng thiết kế đó. Các mục ghi “đề xuất” cần được thử trên giao diện thật trước khi áp dụng chung. Quyền người dùng và thời hạn thao tác theo SRS và hợp đồng API.

### 1.3. Khác biệt giữa các mẫu

| Chủ đề         | Hiện trạng                                                   | Quy tắc áp dụng                                                                                        |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Button         | Rules cũ 44px, chữ 14/20; mẫu mới 48px, 16/24                | Dùng mẫu mới. Size 44 chỉ cho control gọn khi cần                                                      |
| Modal          | Rules cũ padding 32, min-height 400; mẫu gọn dùng padding 24 | Default padding 24, ôm nội dung; form lớn có variant 32; không ép min-height cho mọi popup             |
| Modal radius   | Component pilot 24, popup match mới 30                       | Giữ variant standard 24 và friendly 30; cùng Modal primitive                                           |
| Countdown      | Rules cũ số 32/40; mẫu mới số 39/40                          | Chuẩn hóa số 40/40 gần mẫu mới, cần kiểm tra 00–30                                                     |
| Font Auth/Room | Có chữ 7–13px và số lẻ do bản nhập từ Make                   | Dùng cỡ chữ ở mục 4                                                                                    |
| Frame          | Auth 1463px, Home 1280px, một số Room cũ 1201px              | Chuẩn desktop tham chiếu 1440×900; layout fluid, kiểm tra 1366×768                                     |
| Quyền chọn bộ  | Mockup có “Bạn điều khiển/Trao quyền”                        | SRS DEC-07 không phân người điều khiển. Cần đồng bộ thiết kế; chưa triển khai cơ chế trao quyền từ ảnh |
| Timer chọn bộ  | Mockup đồng thời có “0 giây” và “00:00”                      | Không giữ trạng thái hết hạn mà CTA vẫn khả dụng; thời hạn chọn bộ cần nguồn nghiệp vụ xác nhận        |
| Flashcard/Quiz | Đánh giá thẻ và chọn câu hỏi quiz                            | Theo SRS: Again/Hard/Good; quiz theo ngân hàng chủ đề, tối đa 5 câu, độc lập FSRS                      |
| “Bộ riêng”     | Thẻ cá nhân và bộ hội thoại                                  | SRS cho người học tạo thẻ hỏi/đáp riêng; học liệu hội thoại do Admin biên soạn                         |
| Phụ đề         | Có frame minh họa phụ đề Việt                                | Không tự suy ra đã có STT/dịch; chỉ nối khi phạm vi và dữ liệu được xác nhận                           |

## 2. Định hướng hình ảnh và nội dung

- Thân thiện, dễ thương, nền kem và pastel, đường nét tròn, điểm nhấn hồng nâu.
- Button có cảm giác bấm nhờ viền và bóng cứng. Card/panel giữ nhẹ để nội dung dễ đọc.
- Nội dung ngắn, hướng người dùng vào hành động; mỗi vùng có một tiêu đề, một mô tả ngắn khi cần và CTA rõ.
- Mỗi trang đều nên có mascot. Chọn vị trí theo nội dung: nhân vật có thể chào người học bên cạnh form, đứng trước công trình trên đảo hoặc xuất hiện như một sticker nhỏ ở góc trang. Với trang nhiều thông tin, dành chỗ cho mascot ở phần tiêu đề để người dùng vẫn đọc và thao tác dễ dàng.
- Không trang trí mọi tiêu đề bằng stroke/texture. Font heading và thứ tự fallback được mô tả ở §4.1.
- Icon pixel hoặc bóng bẩy chỉ là hướng đang cân nhắc. Chưa áp dụng toàn app; không trộn nhiều hệ icon trong cùng thanh công cụ.
- Tiếng Việt dùng cho điều hướng, thông báo; tiếng Nhật dành cho nội dung học và điểm nhấn phù hợp.

## 3. Color tokens

Giữ một nguồn token trong code. Tách màu primitive với vai trò semantic; component dùng semantic token. Không dùng tên màu làm trạng thái nghiệp vụ.

### 3.1. Màu trong thư viện Figma

| CSS token đề nghị      | Variable Figma | HEX     | Vai trò                             |
| ---------------------- | -------------- | ------- | ----------------------------------- |
| --color-surface        | color/surface  | #FFFCF8 | Card/modal, bề mặt kem              |
| --color-surface-raised | color/white    | #FFFFFF | Input/bề mặt trắng                  |
| --color-text           | color/text     | #433D3D | Chữ chính                           |
| --color-text-muted     | color/muted    | #766B70 | Chữ phụ                             |
| --color-accent         | color/accent   | #9B526E | Link/nhấn thương hiệu               |
| --color-brand-soft     | color/primary  | #F4CBDA | Hồng nền; không nhầm với button mới |
| --color-selected       | color/selected | #F8DFE8 | Chip/tab được chọn                  |
| --color-border         | color/border   | #E9D6DE | Viền bề mặt                         |
| --color-info-bg        | color/info     | #EEF7FA | Thông tin, thiết bị                 |
| --color-info-text      | color/infoText | #487588 | Chữ thông tin                       |

### 3.2. Màu của nút và đồng hồ đếm ngược

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

Nút có token màu nền riêng. Phần bắt sáng màu trắng nằm ở lớp trang trí phía trên.

### 3.3. Màu semantic đã triển khai

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

Trong CSS, phần nội dung ưu tiên Be Vietnam Pro, heading ưu tiên Baloo 2, cả hai đều dự phòng bằng Nunito rồi Segoe UI. Client tự host Nunito variable (400–900), nên trên máy thiếu hai font ưu tiên, chữ Việt dùng Nunito. Tiếng Nhật ưu tiên Noto Sans JP rồi các font Nhật của hệ điều hành. [Token typography](../../client/src/styles/tokens.css) · [Khai báo font](../../client/src/styles/globals.css) · [Font và giấy phép](../../client/src/assets/fonts/)
Chọn font theo ngôn ngữ, không để toàn bộ câu Nhật rơi vào fallback ngẫu nhiên. Có thể dùng lang="ja" và .text-ja. Không dùng font-size nhỏ để che lỗi layout.

### 4.2. Type scale dùng khi triển khai

| Token     | Size/line-height | Weight  | Sử dụng                 |
| --------- | ---------------- | ------- | ----------------------- |
| caption   | 12/20            | 400–600 | Metadata ngắn, badge    |
| label     | 14/20            | 600     | Nhãn trường             |
| small     | 14/24            | 400     | Mô tả phụ               |
| body      | 16/24            | 400     | Nội dung thường, input  |
| button    | 16/24            | 600     | CTA chuẩn mới           |
| japanese  | 20/32            | 400–700 | Câu Nhật/thẻ học        |
| section   | 24/32            | 800     | Heading section         |
| title     | 32/40            | 800     | Trang/form lớn          |
| hero      | 48/56            | 800     | Hero tham chiếu desktop |
| countdown | 40/40            | 800     | Số trong timer 88px     |

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

Giữ bán kính bo góc 14px của nút chuẩn.

Motion — baseline đề xuất: 120–180ms cho hover/pressed/focus, 180–240ms mở panel/modal. Chỉ animate opacity/transform nếu phù hợp; không gây layout nhảy. Respect prefers-reduced-motion; tắt animation trang trí và chuyển động countdown mượt khi người dùng giảm chuyển động.

## 6. Layout và responsive

### 6.1. Desktop

- Frame tham chiếu: 1440×900. SRS yêu cầu dùng được ở 1366×768; kiểm tra kích thước này trước.
- Header khu học tập bám đầu trang khi cuộn. Hàng điều hướng cao tối thiểu 80px, chia ba vùng trên desktop và đổi bố cục ở 1080px và 480px. Dùng [LearningHeader](../../client/src/components/layout/LearningHeader.jsx) và [CSS của header](../../client/src/components/layout/learning-header.css).
- Container chuẩn có token rộng tối đa 1280px và gutter desktop 32px. Home dùng container riêng. Landing, Home và Auth cùng dùng nền kem với các mảng sáng hồng, vàng kem và xanh nhạt. Trên Home, nhóm hành động luyện nói nằm cạnh cảnh minh họa, bên dưới có hai lối tắt Kho chủ đề và Ôn cá nhân. [Home](../../client/src/features/home/Home.jsx) · [Nền và bố cục dùng chung](../../client/src/components/ui/study-studio.css)
- Room: sidebar trái 192px; panel công cụ phải 320px khi mở, nội dung giữa co giãn. Không cộng tất cả chiều rộng thành một khung cố định gây tràn.
- Room dùng chiều cao viewport; vùng nội dung và panel cuộn riêng khi cần. Chat input và công cụ thiết yếu luôn tiếp cận được.
- Header Room cho truy cập trực tiếp Kiến thức/Ghi chú/Chat; không gom tất cả vào “Công cụ”.
- Mic/cam ở cạnh avatar/vùng người tham gia như lựa chọn đã thống nhất.
- Ba card bộ hội thoại chia đều khi đủ chỗ, gap 24px.

### 6.2. Auth

Đăng nhập và đăng ký cùng dùng AuthSplitLayout. Cột trái có tranh riêng cho từng màn và bong bóng chào Nhật–Việt. Cột phải có liên kết “Về trang chủ”, tiêu đề, form và CTA toàn chiều rộng. Desktop chia cột theo tỉ lệ 1.13:0.87, panel rộng tối đa 30rem và phần nội dung cuộn khi thiếu chiều cao. Từ 767px trở xuống, layout chuyển một cột và thu gọn tranh. [Layout chung](../../client/src/features/auth/AuthSplitLayout.jsx) · [CSS Auth](../../client/src/features/auth/auth-study.css)

### 6.3. Bố cục đề xuất cho điện thoại và máy tính bảng

| Vùng viewport | Hành vi                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| Dưới 768px    | Padding 16px; Auth một cột, thu gọn minh họa; card một cột; điều hướng thu gọn |
| 768–1199px    | Padding 24px; grid 1–2 cột; panel phụ mở dạng drawer khi không đủ chỗ          |
| Từ 1200px     | Padding 32px; desktop layout                                                   |

Room là màn ưu tiên laptop. Trên màn hẹp, sidebar người tham gia có thể thành dải gọn, công cụ mở drawer; cần review riêng trước khi cam kết mobile đầy đủ.
Modal width: min(kích thước variant, viewport − 32px), max-height: viewport − 32px mobile hoặc −64px desktop. Dùng 100dvh khi phù hợp; tránh nút bị bàn phím che.
Không scale toàn bộ UI, không dùng absolute cho các khối nội dung chính. Flex/grid có min-width:0 cho text, avatar/icon flex-shrink:0.

## 7. Component dùng chung

### 7.1. Button và IconButton

- Button có bốn biến thể: primary, secondary, ghost và danger.
- `appearance="sticker"` dành cho primary, secondary và danger. Dáng viên kẹo có viền trắng và bóng đáy, nhãn vẫn hiện khi loading.
- Size default 48px, padding ngang 24px (16px nếu footer hai nút cần gọn), gap 8px, radius 14, icon 20px.
- Ba size đã có trong Button là compact 44px, default 48px và hero 56px. Đây là kích thước cơ sở trước khi áp style riêng của màn.
- Đăng nhập và đăng ký dùng Button primary, `appearance="sticker"`, `fullWidth`. Sticker có bảng màu riêng theo variant, viền trắng, highlight và bóng đáy. [Đăng nhập](../../client/src/features/auth/LoginPage.jsx) · [Đăng ký](../../client/src/features/auth/RegisterPage.jsx) · [Style sticker](../../client/src/components/ui/sticker-controls.css)
- “Tìm bạn luyện nói” ở Home dùng Button primary cỡ hero với lớp `ck-home-action--main`. “Bắt đầu học” ở Kho chủ đề dùng cùng kiểu CTA này. Lấy mẫu tại [Home](../../client/src/features/home/Home.jsx) và [CSS dùng chung cho hai CTA](../../client/src/components/ui/study-studio.css).
- Các thuộc tính của [Button](../../client/src/components/ui/controls.jsx): variant, size, loading, disabled, leadingIcon, trailingIcon, fullWidth.
- States: default, hover, pressed, focus-visible, disabled, loading. Pressed dịch xuống 2px và giảm bóng, không làm vùng bấm/layout nhảy.
- Loading giữ chiều rộng, chặn submit lặp. Disabled không chỉ dựa vào opacity quá thấp; không phát handler.
- Dùng button type phù hợp; navigation dùng link. Nút chỉ icon có accessible name; icon trang trí ẩn khỏi screen reader.
- Close mẫu Figma 40×40; giữ icon nhỏ nhưng vùng tương tác tối thiểu 44×44 khi cần cho touch. Vị trí đóng không chiếm chỗ tiêu đề.

### 7.2. FormField, Input, PasswordInput, Select, Checkbox

- FormField hiển thị nhãn, hướng dẫn và lỗi. Input nhận dữ liệu người dùng nhập. Label luôn hiện, không dùng placeholder thay label.
- Default cao 48px, padding ngang 16px, font body 16/24, radius 12px.
- States: empty, filled, hover, focus, disabled, readonly, error, loading nếu có.
- Lỗi đặt ngay dưới trường, liên kết bằng aria-describedby; error có aria-invalid.
- Password toggle không submit form; autocomplete đúng ngữ cảnh email/current-password/new-password.
- Không hardcode luật mật khẩu từ placeholder/mockup; đồng bộ API/SRS được team chốt.
- Checkbox và selection chip dùng native semantics; không dùng div bấm mà thiếu bàn phím.
- Group chọn một giá trị dùng radio/radiogroup hoặc select; selected có nền + viền + dấu hiệu rõ.

### 7.3. Modal/Dialog

- Một primitive, variants compact 480px và form 680px.
- `appearance="sticker"` dùng thanh tiêu đề hồng phấn và thân kem. Truyền các nút sticker qua `footer` để dùng cùng kiểu hiển thị.
- Cấu trúc: overlay → dialog → header → body → footer. Body cuộn khi dài; header/footer vẫn dùng được.
- Không gắn min-height 400 cho mọi trạng thái; search có thể giữ vùng ổn định nếu cần, phải qua review.
- Popup match: người luyện ở một hàng, avatar 48px cố định; timer ở hàng riêng; điểm chung; footer hai nút gap 12px, secondary trái/primary phải.
- Form thường primary trước secondary theo pilot; không đảo thứ tự tùy hứng giữa các trạng thái cùng luồng.
- Trong hộp thoại tìm được bạn, dành đủ chiều rộng cho tên người luyện để tên dài xuống dòng theo từ.
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

#### Kho chủ đề

- Mỗi trang đảo hiển thị tối đa sáu bộ từ danh mục thực tế. Người học chọn công trình, lọc N5–N1 hoặc tìm theo từ khóa. Biển tên cùng kích thước, chữ co theo tên bộ. Bộ lọc và tìm kiếm mở rộng tại chỗ, bộ lọc thu gọn vẫn hiện lựa chọn. [Trang đảo](../../client/src/features/library/TopicsPage.jsx) · [Lọc và tìm kiếm](../../client/src/features/library/TopicCatalogControls.jsx)
- Panel hiển thị tên, cấp độ, mô tả, tranh và CTA “Bắt đầu học”, cùng ba lối Kiến thức, Flashcard và Quiz. CTA mở trang chi tiết của bộ đang chọn. [Panel và các lối học](../../client/src/features/library/TopicPresentation.jsx)
- Nền đảo, công trình, mascot và minh họa là các lớp riêng. Chủ đề mới dùng hình dự phòng khi chưa khớp một bộ tranh. Nước, thuyền và người câu chuyển động nhẹ khi chờ. Khi đổi trang, người câu kéo cá và nhịp chèo mạnh hơn. Dùng chế độ giảm chuyển động của cảnh khi người học bật reduced motion. [Ánh xạ tranh](../../client/src/features/library/topic-art.js) · [Cảnh ven đảo](../../client/src/features/library/IslandWaterfront.jsx) · [CSS chuyển động](../../client/src/features/library/island-waterfront.css)

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

Khách vào phòng bằng mã mời và có 15 phút ôn thử sau phiên. Mã mời có hiệu lực 10 phút. Thời gian kết nối lại tối đa là 5 phút. Giao diện hiển thị thời hạn theo expiresAt và trạng thái do backend trả về.

## 9. Nhãn, biểu tượng và hình ảnh

- CTA dùng động từ cụ thể: “Bắt đầu tìm”, “Hủy tìm”, “Luyện cùng”, “Vào phòng”, “Lưu thay đổi”.
- Mỗi bước hiển thị thông tin cần để ra quyết định. Hướng dẫn dài chuyển sang disclosure/help khi hợp lý.
- Không giấu thao tác chính vào menu sâu. Disabled action có lý do; trên touch không phụ thuộc tooltip hover.
- Icon chức năng: chọn một bộ SVG thống nhất, cùng stroke/bo nét, size 20/24. Icon pixel chưa là mặc định.
- Logo/mascot là asset độc lập; text thông thường, button, timer, badge, nền pastel đơn giản dựng bằng code.
- Không dùng emoji làm icon chức năng chuẩn vì hình hiển thị khác giữa hệ điều hành.
- Giữ đúng tỉ lệ ảnh. Dùng object-fit:contain cho mascot và object-fit:cover cho ảnh đại diện. Chuẩn bị ảnh thay thế khi tải lỗi.
- Để alt="" cho ảnh trang trí. Viết mô tả ngắn cho ảnh mang thông tin và giữ nhãn chữ trên nút.
- Thư mục asset và quy cách bổ sung ở mục 12.

## 10. Tổ chức mã frontend

CSS nền tảng nằm trong [styles](../../client/src/styles/), control dùng chung trong [components/ui](../../client/src/components/ui/), khung trang trong [components/layout](../../client/src/components/layout/). Các màn và style đặc thù nằm trong [features](../../client/src/features/). Tra [ComponentPreview](../../client/src/demo/ComponentPreview.jsx) để xem các component mẫu.

- tokens.css là nguồn giá trị thực thi; Tailwind/theme tham chiếu cùng token, không giữ hai bảng màu độc lập.
- Component dùng semantic variant thay vì mỗi trang truyền arbitrary class để đổi toàn bộ hình thức.
- Cho phép layout đặc thù theo feature; không tạo “universal card” với hàng chục boolean chỉ để gộp mọi màn.
- Tách API, state và logic gọi/ghép/FSRS khỏi component trình bày.
- Dùng mock đi qua adapter/API boundary tương tự dữ liệu thật. Không mock thành công cố định trong component dùng chung.
- Dữ liệu session/auth theo hợp đồng backend. Giữ thông tin bí mật ngoài bundle của client và tránh ghi nội dung riêng tư vào log.
- Trạng thái đổi bộ/vai/hoàn tất được server xác nhận; không suy ra quyền từ một nhãn trong Figma.
- Các controls phức tạp nên dùng primitive truy cập được sẵn có nếu repo đã dùng; tránh tự tạo hành vi dialog/select thiếu bàn phím.
- Dùng các script lint, build, typecheck và test trong package.json.
- Mỗi quyết định thiết kế mới ghi nguồn, ngày, trạng thái; thay token/component trước rồi cập nhật màn sử dụng.

Giá trị thực thi của màu semantic, font stack, spacing, radius, kích thước control và thời lượng motion nằm trong [tokens.css](../../client/src/styles/tokens.css). Style theo ngữ cảnh như sticker và cảnh học tập được định nghĩa ở component sử dụng chúng.

## 11. Kiểm tra và điều kiện hoàn thành

1. Có trang xem thử component với states, chữ Việt/Nhật và nhãn dài.
2. So sánh màn thật ở 1440×900 và 1366×768 với frame nguồn, không so ở canvas zoom nhỏ.
3. Kiểm tra 390px cho form/modal/trang thường; ghi rõ Room mobile còn giới hạn nếu chưa hoàn thiện.
4. Keyboard: tab order, focus-visible, modal trap/restore, Escape, password toggle và radio/tab.
5. Thử tên và email dài, ảnh bị thiếu, lỗi dưới trường nhập và trạng thái đang tải.
6. Test 30→0, refresh/tab ngủ, mất mạng/reconnect; CTA phản ánh trạng thái server.
7. Không có overflow ngang ngoài vùng chủ ý; không cắt dấu; không scale avatar thành oval.
8. Kiểm tra tương phản, zoom 200%, reduced motion và touch target.
9. Kiểm tra vị trí mascot trên cả màn rộng và màn hẹp. Mascot cần đủ chỗ để hiển thị mà vẫn giữ rõ tiêu đề, nội dung và nút thao tác.
10. Chạy kiểm tra repo phù hợp; test ưu tiên timer, hành động hủy, submit lặp, quyền và state transitions. Không viết test snapshot chỉ để khóa màu/padding đang đổi.

### Các điểm thiết kế cần đối chiếu khi cập nhật Figma

- Đồng bộ lại bảng rules cũ với Button 48 và timer mới.
- Review modal padding 24/32 và radius 24/30 trong một màn thật.
- Sửa Room về quyền chọn/bốc theo SRS hoặc team cập nhật SRS nếu đã đổi quyết định.
- Chốt nguồn và hành vi countdown chọn bộ.
- Chuẩn hóa chữ nhỏ trong Auth/Room; các frame Room cũ còn 1201px cần bố cục lại.
- Dựng mobile mẫu, hoàn thiện focus/loading/error states.
- Đối chiếu font thực tế (§4.1) và các asset hiện có (§12) khi cập nhật thư viện Figma.

## 12. Asset hiện có và quy cách bổ sung

| Thư mục                                     | Tài nguyên dùng trong frontend                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| [brand](../../client/src/assets/brand/)     | Logo `chii-logo.svg`.                                                           |
| [auth](../../client/src/assets/auth/)       | Hai cảnh riêng `login-scene.webp` và `register-scene.webp`.                     |
| [mascots](../../client/src/assets/mascots/) | Nhân vật và hình đại diện minh họa dùng trên các màn.                           |
| [library](../../client/src/assets/library/) | Các lớp của bản đồ đảo, công trình, mascot, tranh chủ đề và biểu tượng học tập. |
| [ui](../../client/src/assets/ui/)           | Họa tiết dùng chung, gồm `sticker-flowers.svg`.                                 |
| [fonts](../../client/src/assets/fonts/)     | Nunito variable và giấy phép OFL.                                               |

Icon thao tác có thể dựng bằng [Icon](../../client/src/components/ui/controls.jsx) hoặc [StudyIcon](../../client/src/components/ui/StudyIcon.jsx) theo component đang tái sử dụng. Các lối học trên đảo dùng biểu tượng minh họa cùng bộ với trang chi tiết.

### Quy cách bàn giao

- Giữ bản gốc chất lượng cao. Khi xuất cho web, nén ảnh và giữ nền trong suốt của mascot.
- SVG có viewBox, crop đúng bounds; logo outline chữ nếu cần tái hiện ổn định. Không outline text UI thông thường.
- Ảnh bìa cùng tỉ lệ, phong cách, vùng an toàn; không nhúng tên chủ đề vào ảnh.
- Ghi nguồn, tác giả/giấy phép hoặc điều kiện sử dụng, nơi dùng và alt text vào asset manifest.
- Font files và icon pack là tài nguyên riêng cần chốt nguồn, không phải hình phải tự vẽ.
- Nền blob, bong bóng thoại, viền/bóng button, spinner, countdown và initials avatar có thể dựng bằng CSS/SVG; không cần chuẩn bị ảnh.
