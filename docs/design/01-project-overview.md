# Chiikaiwa — Tổng quan dự án

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 27/10/2026 |
| Học phần | Công nghệ Web |
| Nhóm thực hiện | 5 thành viên |
| Thời gian triển khai dự kiến | 3–4 tuần |
| Ngân sách dịch vụ | 0 đồng, sử dụng trong hạn mức miễn phí |
| Tài liệu đặc tả | Đặc tả yêu cầu phần mềm (02-srs.md) |

## 1. Mục đích

Chiikaiwa là website giúp người học tìm bạn luyện hội thoại tiếng Nhật qua cuộc gọi 1–1. Hai người chọn bộ chủ đề, bốc thẻ tình huống, nhận vai và trao đổi để hoàn thành một mục tiêu giao tiếp. Từ vựng và cấu trúc gặp trong phiên được nối với flashcard, lịch ôn và quiz.

Tài liệu này xác định bài toán, mục tiêu, phạm vi MVP và ràng buộc dự án. SRS là nguồn đặc tả hành vi, quy tắc nghiệp vụ và tiêu chí nghiệm thu. Thiết kế giao diện, kiến trúc chi tiết, cơ sở dữ liệu, API và kế hoạch triển khai được xây dựng sau trên cùng phạm vi.

## 2. Bài toán và đối tượng sử dụng

### 2.1. Vấn đề cần giải quyết

| Mã | Vấn đề | Hướng giải quyết |
|---|---|---|
| P-01 | Khó tìm người đang sẵn sàng và có nhu cầu luyện nói tương thích. | Ghép tự động theo tiêu chí và bộ lọc; hỗ trợ phòng bằng mã mời. |
| P-02 | Có bạn luyện nhưng thiếu chủ đề, tình huống và mục tiêu để duy trì hội thoại. | Bộ thẻ có tình huống cụ thể, vai A/B và gợi ý diễn đạt. |
| P-03 | Kiến thức gặp trong cuộc gọi chưa được đưa vào quá trình ôn cá nhân. | Lưu kiến thức tại chỗ; học flashcard theo chủ đề hoặc danh sách đã lưu; kiểm tra bằng quiz. |

Đây là các giả thuyết về nhu cầu người học cần kiểm chứng khi dùng thử. Số phút gọi, lượt ôn và điểm quiz phản ánh hoạt động hoặc kiến thức được kiểm tra; không chứng minh năng lực nói hay hiệu quả học tập dài hạn.

### 2.2. Đối tượng và bên liên quan

| Đối tượng | Nhu cầu và trách nhiệm |
|---|---|
| Người học | Sinh viên và người học tiếng Nhật muốn thực hành hội thoại, lưu kiến thức và ôn tập. Đăng ký mở, không xác minh tư cách sinh viên. |
| Khách | Trải nghiệm qua mã mời của người có tài khoản, không cần đăng ký hoặc đăng nhập. |
| Quản trị viên | Quản lý tài khoản, biên soạn và xuất bản học liệu, xử lý báo cáo, xem thống kê tổng hợp. |
| Nhóm phát triển | Phân tích, thiết kế, xây dựng, kiểm thử, chuẩn bị học liệu và vận hành bản demo. |
| Giảng viên | Đánh giá việc vận dụng kiến thức học phần và sản phẩm được triển khai. |

## 3. Mục tiêu sản phẩm

| Mã | Mục tiêu | Bằng chứng hoàn thành MVP |
|---|---|---|
| OBJ-01 | Kết nối được hai người có nhu cầu luyện tập. | Hai tài khoản được ghép và cùng xác nhận; một người có tài khoản có thể mời khách vào phòng. |
| OBJ-02 | Tạo một phiên hội thoại có định hướng. | Hai máy đồng bộ cùng bộ, lá bài và tình huống; mỗi người nhận đúng vai, dùng được gọi/chat và gợi ý. |
| OBJ-03 | Nối trải nghiệm trong phiên với ôn tập cá nhân. | Lưu một mục kiến thức trong cuộc gọi, mở lại sau phiên và học bằng flashcard; tiến độ FSRS không bị tách theo lối vào. |
| OBJ-04 | Cung cấp học liệu và công cụ ôn độc lập. | Mở học liệu N5–N1 theo chủ đề, học flashcard toàn bộ hoặc phần đã lưu, làm quiz và xem kết quả. |
| OBJ-05 | Vận hành bản demo có kiểm soát quyền và lỗi. | Chạy hai phòng đồng thời; kiểm tra mất kết nối, thao tác đồng thời, dữ liệu riêng tư, chặn/báo cáo và giới hạn dịch vụ. |

## 4. Trải nghiệm cốt lõi

### 4.1. Người có tài khoản

1. Đăng nhập, hoàn thiện trình độ và các thông tin tùy chọn.
2. Chọn tìm bạn tự động hoặc tạo/nhập mã mời.
3. Xác nhận đối tác, vào phòng Kaiwa và trao đổi bằng gọi/chat.
4. Cùng xem danh sách bộ chủ đề, người giữ quyền điều khiển chọn bộ.
5. Cùng thấy bàn bài úp, người giữ quyền điều khiển bốc một lá; hệ thống phân vai A/B ngẫu nhiên.
6. Luyện hội thoại, mở gợi ý, lưu kiến thức và viết ghi chú riêng.
7. Kết thúc, xem tổng kết, học flashcard và làm quiz của bộ chủ đề.
8. Quay lại lịch sử, danh sách đã lưu hoặc kho học liệu để tiếp tục học.

Server random người điều khiển khi đủ hai thành viên kết nối. Chỉ người đang giữ quyền được chọn bộ và bốc thẻ; người còn lại có thể lấy quyền trực tiếp. Chuyển quyền không đổi bộ/lá hoặc đặt lại đồng hồ. Đổi vai, bỏ qua và hoàn thành vẫn cần đồng thuận.

### 4.2. Khách

Khách nhập mã, được người tạo phòng chấp nhận và trải nghiệm phiên luyện cùng người có tài khoản. Khách không tự tạo phòng hoặc tham gia ghép tự động. Không có hạn mức lượt thử hằng ngày hoặc giới hạn thời lượng gọi riêng cho khách; hạn mức dịch vụ vẫn áp dụng cho toàn hệ thống.

Khách được xem tổng kết và ôn thử trong 15 phút kể từ khi phiên kết thúc. Hết thời hạn, khách không thể truy cập lại dữ liệu cá nhân của lượt thử; dữ liệu học tập tạm được xóa. Người có tài khoản vẫn giữ lịch sử và dữ liệu của chính mình trong phiên đó. Đăng ký không tự chuyển dữ liệu thử sang tài khoản.

### 4.3. Ôn tập

Học liệu được dùng theo hai lối vào:

- **Học theo chủ đề:** xem toàn bộ từ vựng/cấu trúc, học flashcard và làm quiz của bộ chủ đề–cấp độ, kể cả chưa tham gia cuộc gọi.
- **Kiến thức đã lưu:** học flashcard từ những mục người học chủ động đánh dấu, có nguồn phiên/tình huống khi được lưu trong cuộc gọi.

Hai lối vào dùng chung tiến độ FSRS của cùng người học và cùng mục kiến thức nguồn. Lưu hoặc bỏ lưu là thay đổi danh sách cá nhân, không phải đánh giá khả năng nhớ. Quiz dùng ngân hàng câu hỏi của chủ đề và không tự cập nhật FSRS.

## 5. Phạm vi MVP

| Nhóm chức năng | Phạm vi |
|---|---|
| Tài khoản | Email/mật khẩu, đăng nhập/đăng xuất, đổi mật khẩu, đặt lại mật khẩu qua liên kết email; không xác minh email khi đăng ký. |
| Hồ sơ | Tên hiển thị, avatar mặc định, trình độ tự khai N5–N1; tiếng mẹ đẻ, mục tiêu, sở thích, quốc gia đang sinh sống, nhóm tuổi và giới tính là thông tin tùy chọn. |
| Ghép bạn | Tiêu chí trình độ và thời gian; ưu tiên mục tiêu, sở thích, tiếng mẹ đẻ. Bộ lọc quốc gia, nhóm tuổi, giới tính tùy chọn nhưng phải được tôn trọng khi bật. |
| Phòng mời | Mã dùng cho một phiên, hiệu lực 10 phút, tối đa hai người, có bước chấp nhận đối tác. |
| Phòng luyện | Gọi 1–1, bật/tắt camera/mic, chat trong phiên, một người chia sẻ màn hình tại một thời điểm; khôi phục trạng thái khi kết nối lại. |
| Thẻ tình huống | Chọn bộ trong 60 giây, bốc lá úp, phân vai ngẫu nhiên, gợi ý, đồng thuận đổi thẻ/đổi vai/chuyển thẻ; tránh lặp lá đã bốc. |
| Lưu và ghi chú | Lưu từ/cấu trúc để học flashcard ngay; một trang ghi chú riêng cho mỗi người trong mỗi phiên, sửa/xóa được sau phiên. |
| Flashcard | Học toàn bộ chủ đề hoặc mục đã lưu; tổ chức bộ cá nhân và tạo thẻ thủ công. Ba mức Again/Hard/Good, lịch ôn FSRS-6. |
| Quiz | Trắc nghiệm một đáp án và điền ngắn; tối đa năm câu/lượt theo ngân hàng chủ đề; chấm phía server, giải thích, làm lại và lưu kết quả. |
| Lịch sử | Phiên luyện, tình huống đã luyện/bỏ qua, kiến thức đã lưu, ghi chú, kết quả quiz và tự đánh giá tùy chọn. |
| Quản trị | Quản lý tài khoản; học liệu nháp/xuất bản/ẩn; xử lý báo cáo; thống kê sử dụng tổng hợp. |
| An toàn | Rời phòng, chặn, báo cáo; kiểm tra quyền phía server; không ghi âm/ghi hình toàn bộ cuộc gọi. |

### 5.1. Học liệu nghiệm thu

- Tối thiểu 25 tình huống: ít nhất 5 cho mỗi cấp N5, N4, N3, N2, N1.
- Mỗi tình huống có mục tiêu, hai vai, gợi ý từ vựng/cấu trúc và ít nhất 3 câu hỏi quiz tương ứng.
- Tổ chức thành các bộ theo chủ đề và cấp độ; bộ dùng để minh họa bốc bài có nhiều tình huống.
- Nhóm biên soạn và rà soát tiếng Nhật trước khi xuất bản. Học liệu mẫu không bao phủ toàn bộ chương trình hoặc đề thi.

### 5.2. Ngoài MVP

AI đánh giá bài nói; chấm phát âm hoặc toàn bộ cuộc hội thoại; gọi nhiều người; ghi âm/ghi hình cuộc gọi; lịch sử chat; tải file qua chat; video bài giảng; khóa học; diễn đàn; thanh toán; giao diện mobile cho điện thoại/máy tính bảng và ứng dụng di động; kết bạn và nhắn tin ngoài phiên; Google login; giao diện quản lý nhiều phiên bản học liệu; tự sinh flashcard/quiz từ ghi chú; tối ưu trọng số FSRS theo từng người; tự xóa tài khoản hoặc xóa toàn bộ lịch sử; email nhắc ôn.

## 6. Ngôn ngữ và thuật ngữ sản phẩm

Giao diện chủ yếu bằng tiếng Việt, học liệu gồm tiếng Nhật và giải thích tiếng Việt. Chiikaiwa dùng một số từ quen thuộc để tạo nhận diện, không thay toàn bộ nhãn chức năng bằng tiếng Nhật.

| Tên trên giao diện | Nghĩa trong tài liệu |
|---|---|
| Tomodachi — bạn luyện nói | Người luyện cùng trong một phiên; không phải vai trò tài khoản hoặc quan hệ kết bạn lâu dài. |
| Kaiwa — luyện hội thoại | Hoạt động luyện nói tiếng Nhật trong tương tác. |
| Phòng Kaiwa | Không gian gọi/chat và luyện thẻ của hai người. |
| Bộ chủ đề | Bộ thẻ tình huống thuộc một chủ đề và một cấp độ. |
| Thẻ tình huống | Bối cảnh, mục tiêu, hai vai và gợi ý cho một lượt luyện. |
| Flashcard | Thẻ hỏi/đáp dùng để nhớ lại kiến thức; khác thẻ tình huống. |

SRS quy định đầy đủ thuật ngữ, danh mục tiêu chí và quy tắc sử dụng.

## 7. Công nghệ và ràng buộc

| Thành phần | Định hướng đã xác định |
|---|---|
| Frontend | React, Router, Hooks/Context; giao diện web responsive cho laptop/desktop, thích ứng với kích thước cửa sổ trình duyệt. |
| Backend | Node.js/Express, REST API, xác thực JWT, validation và phân quyền. |
| Dữ liệu | MongoDB/Mongoose; lưu học liệu, phiên, kiến thức cá nhân, tiến độ và kết quả. |
| Media và chat | LiveKit Cloud và React SDK; không tự xây hoặc tự host hạ tầng WebRTC/STUN/TURN. |
| Đồng bộ nghiệp vụ | Backend là nguồn trạng thái; kênh dữ liệu LiveKit thông báo thay đổi, API phục hồi trạng thái. Ghép bạn có thể dùng polling; Socket.IO không bắt buộc. |
| Lịch ôn | FSRS-6 qua thư viện tương thích, ghim phiên bản; không viết lại thuật toán. |
| Email | Dịch vụ gửi thư phục hồi mật khẩu trong hạn mức miễn phí. |
| Triển khai | HTTPS, cấu hình môi trường, logs phù hợp; sử dụng dịch vụ miễn phí, không tự nâng gói. |

CSS/Tailwind, Fetch/Axios, runtime, phiên bản dependency, nhà cung cấp hosting/email và cơ chế lưu/gửi JWT được lựa chọn ở bước thiết kế. Docker, Nginx và CI là công cụ có thể áp dụng theo môi trường, không phải chức năng bắt buộc riêng của MVP.

Môi trường nghiệm thu là laptop/desktop chạy Windows, Chrome ổn định tại thời điểm kiểm thử, viewport từ 1366 × 768 CSS pixel; kiểm tra ở kích thước tối thiểu, các kích thước lớn hơn và khi thay đổi cửa sổ. Đây là phạm vi nghiệm thu giao diện, không phải độ phân giải vật lý bắt buộc của thiết bị. Hệ thống không cam kết phục vụ 24/7 hoặc gọi không giới hạn tài nguyên. Chi tiết ngưỡng và điều kiện đo nằm trong SRS.

## 8. Rủi ro và biện pháp xử lý

| Rủi ro | Cách giới hạn trong phạm vi |
|---|---|
| Thời gian ngắn, nhiều nhóm chức năng | Tích hợp sớm một luồng hoàn chỉnh; ưu tiên phòng mã mời trước ghép tự động; không mở rộng ngoài MVP. |
| Ít người tìm hoặc bộ lọc quá hẹp | Thông tin tùy chọn; hiển thị gợi ý sửa tiêu chí sau hai phút; luôn có mã mời và ôn độc lập. |
| Trùng thao tác hoặc mất sự kiện | Server kiểm tra trạng thái và quyền; mỗi chuyển trạng thái chỉ có một kết quả; vào lại lấy trạng thái từ API. |
| Mạng hoặc thiết bị không sẵn sàng | Có chat, trạng thái kết nối, quyền rời phòng và khoảng chờ phục hồi tối đa năm phút. |
| Hết hạn mức hoặc dịch vụ miễn phí khởi động chậm | Kiểm tra hạn mức trước demo; có chờ/lỗi/thử lại; không tự mua hoặc nâng gói. |
| Học liệu N2/N1 chưa chính xác | Rà soát trước xuất bản, giới hạn số tình huống mẫu, không tuyên bố đánh giá trình độ nói. |
| Dữ liệu cá nhân và nội dung vai bị lộ | Kiểm tra quyền phía server; chỉ gửi vai hiện tại của đúng người; tách dữ liệu riêng và dữ liệu chung. |
| Lịch ôn bị tách giữa các cách học | Một tiến độ cho một người và một mục kiến thức nguồn; cùng thuật toán và cấu hình tại backend. |

## 9. Điều kiện hoàn thành

MVP hoàn thành khi đáp ứng các yêu cầu và kịch bản nghiệm thu trong SRS, bao gồm luồng người có tài khoản và khách, hai phòng đồng thời, các ngoại lệ chính, dữ liệu riêng tư và học liệu tối thiểu. Bản demo phải chạy trên môi trường online và có báo cáo kết quả kiểm thử.

Phạm vi được quản lý bằng mã mục tiêu, yêu cầu, quy tắc và use case trong SRS. Thay đổi hành vi hoặc giới hạn của hệ thống phải cập nhật đồng thời các mục bị ảnh hưởng và tiêu chí nghiệm thu.
