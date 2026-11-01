# Chiikaiwa — Product Backlog

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 27/10/2026 |
| Phạm vi | MVP, nhóm 5 thành viên, thời gian dự kiến 3–4 tuần |
| Cơ sở yêu cầu | Tổng quan dự án 1.0 và SRS 1.0 |
| Số hạng mục | 34 |

## 1. Mục đích và cách sử dụng

Backlog phân rã phạm vi MVP thành các hạng mục có thể giao thực hiện, kiểm tra và nghiệm thu. Mỗi hạng mục có kết quả cần đạt, mức ưu tiên, phụ thuộc và mã yêu cầu SRS. SRS quy định hành vi chi tiết; tiêu chí trong backlog tập trung vào kết quả của hạng mục và không thay thế tiêu chí nghiệm thu của yêu cầu nguồn.

Một user story bao gồm phần giao diện, xử lý phía server, lưu dữ liệu và kiểm thử cần thiết để người dùng thực hiện được hành vi tương ứng. Các hạng mục kỹ thuật, học liệu và kiểm thử được ghi riêng khi phục vụ nhiều chức năng.

Mã PB ổn định khi sắp xếp lại backlog. Mức ưu tiên dưới đây là thứ tự thực hiện đề xuất, không phải phân loại chức năng được phép bỏ khỏi MVP. Tất cả hạng mục đều nằm trong phạm vi bàn giao. Nếu cần giảm phạm vi, nhóm phải cập nhật SRS và backlog trước khi thực hiện.

## 2. Quy ước quản lý

### 2.1. Mức ưu tiên

| Mức | Ý nghĩa | Cách áp dụng |
|---|---|---|
| P0 | Hình thành luồng cốt lõi, giảm rủi ro kỹ thuật hoặc bảo đảm điều kiện nghiệm thu. | Khởi động sớm khi đủ đầu vào; kiểm thử chất lượng được thực hiện xuyên suốt. |
| P1 | Hoàn thiện các luồng sử dụng còn lại trong MVP. | Triển khai sau hoặc song song khi nền tảng phụ thuộc đã sẵn sàng. |
| P2 | Hoàn thiện chức năng tổng hợp sau khi có dữ liệu từ các luồng chính. | Vẫn phải hoàn tất trước nghiệm thu MVP. |

Phụ thuộc được ưu tiên hơn nhãn P0/P1/P2. PB-34 là bước nghiệm thu cuối nên chỉ hoàn tất sau toàn bộ hạng mục còn lại. Mã PB không biểu thị thứ tự thời gian tuyệt đối.

### 2.2. Trạng thái và phân công

Backlog này xác định công việc cần làm, không ghi nhận tiến độ triển khai hiện tại. Khi đưa vào bảng công việc, nhóm cập nhật người phụ trách, ước lượng và trạng thái theo bằng chứng thực tế.

| Trạng thái | Điều kiện |
|---|---|
| Chờ thực hiện | Chưa bắt đầu; có thể còn phụ thuộc chưa đáp ứng. |
| Đang thực hiện | Có người phụ trách và đang triển khai. |
| Chờ kiểm tra | Đã tích hợp phần thực hiện, có dữ liệu và hướng dẫn kiểm tra. |
| Hoàn thành | Đạt tiêu chí của hạng mục và điều kiện hoàn thành chung. |

Hạng mục bị vướng cần ghi rõ nguyên nhân và đầu vào cần bổ sung. Ước lượng, phân công cho năm thành viên và mốc sprint được lập trong kế hoạch triển khai dựa trên năng lực thực tế; backlog không quy đổi sẵn số hạng mục thành số ngày làm việc.

### 2.3. Phụ thuộc

Cột phụ thuộc nêu đầu vào chính để tích hợp và nghiệm thu; các phần độc lập có thể được làm song song theo giao tiếp đã thống nhất. Những kiểm tra xuyên suốt ở PB-32 và PB-33 được thực hiện theo từng chức năng sẵn sàng, sau đó chạy lại ở mức tích hợp. Chúng không thay thế kiểm thử trong từng user story.

Kiểm soát tài khoản khóa, chặn, quyền sở hữu và giữ chỗ là điều kiện chung của các luồng liên quan. Hạng mục mã mời hoặc ghép tự động chỉ được nghiệm thu khi đã tích hợp các kiểm soát này, dù giao diện quản trị hoặc danh sách chặn được hoàn thiện riêng.

## 3. Các epic

| Mã | Epic | Giá trị chính | Hạng mục |
|---|---|---|---|
| E-01 | Nền tảng và tài khoản | Truy cập an toàn và có môi trường triển khai. | PB-01 đến PB-04 |
| E-02 | Kho học liệu | Cung cấp nội dung có cấu trúc, đủ cấp độ và giữ được lịch sử. | PB-05 đến PB-07, PB-31 |
| E-03 | Phòng Kaiwa | Kết nối hai người và quản lý vòng đời phiên. | PB-08 đến PB-11 |
| E-04 | Luyện tình huống | Chọn chủ đề, bốc thẻ, phân vai và phối hợp thao tác. | PB-12 đến PB-14 |
| E-05 | Lưu và xem lại | Giữ kiến thức, ghi chú và kết quả phiên. | PB-15 đến PB-17 |
| E-06 | Flashcard | Ôn theo nhu cầu với tiến độ FSRS dùng chung. | PB-18 đến PB-20 |
| E-07 | Quiz | Kiểm tra kiến thức chủ đề và xem lại lỗi sai. | PB-21, PB-22 |
| E-08 | Trải nghiệm khách | Dùng thử qua mã mời và quản lý dữ liệu tạm. | PB-23, PB-24 |
| E-09 | Ghép tự động | Tìm và xác nhận bạn luyện theo tiêu chí. | PB-25, PB-26 |
| E-10 | An toàn và quản trị | Chặn, xử lý báo cáo, quản lý tài khoản và thống kê. | PB-27 đến PB-30 |
| E-11 | Chất lượng và bàn giao | Kiểm tra toàn hệ thống, vận hành và nghiệm thu. | PB-32 đến PB-34 |

## 4. Danh sách backlog

| Mã | Hạng mục | Epic | Loại | Ưu tiên | Phụ thuộc chính |
|---|---|---|---|---|---|
| PB-01 | Nền tảng triển khai và cấu hình dịch vụ | E-01 | Kỹ thuật | P0 | — |
| PB-02 | Đăng ký, đăng nhập, đăng xuất và phân quyền | E-01 | User story | P0 | PB-01 |
| PB-03 | Cập nhật hồ sơ học tập | E-01 | User story | P0 | PB-02 |
| PB-04 | Đổi và đặt lại mật khẩu | E-01 | User story | P1 | PB-02 |
| PB-05 | Biên soạn học liệu | E-02 | User story | P0 | PB-02 |
| PB-06 | Xuất bản, ẩn và bảo toàn học liệu | E-02 | User story | P0 | PB-05 |
| PB-07 | Xem kho học liệu theo chủ đề | E-02 | User story | P0 | PB-06 |
| PB-08 | Tạo và tham gia phòng bằng mã mời | E-03 | User story | P0 | PB-02 |
| PB-09 | Vào phòng gọi và điều khiển thiết bị | E-03 | User story | P0 | PB-08 |
| PB-10 | Chat và chia sẻ màn hình trong phiên | E-03 | User story | P0 | PB-09 |
| PB-11 | Kết thúc, kết nối lại và tính thời lượng | E-03 | User story | P0 | PB-09 |
| PB-12 | Cùng chọn bộ chủ đề | E-04 | User story | P0 | PB-06, PB-09 |
| PB-13 | Bốc thẻ tình huống và nhận vai | E-04 | User story | P0 | PB-12 |
| PB-14 | Gợi ý, đồng thuận và kết quả từng thẻ | E-04 | User story | P0 | PB-13 |
| PB-15 | Lưu kiến thức để ôn cá nhân | E-05 | User story | P0 | PB-07 |
| PB-16 | Ghi chú riêng theo phiên | E-05 | User story | P0 | PB-09 |
| PB-17 | Tổng kết, lịch sử và tự đánh giá | E-05 | User story | P0 | PB-11, PB-14, PB-15, PB-16 |
| PB-18 | Học flashcard và xem thẻ đến hạn | E-06 | User story | P0 | PB-07, PB-15, PB-19 |
| PB-19 | Lịch ôn FSRS và tiến độ dùng chung | E-06 | Kỹ thuật | P0 | PB-02, PB-07 |
| PB-20 | Bộ flashcard cá nhân và thẻ thủ công | E-06 | User story | P1 | PB-18 |
| PB-21 | Tạo và trả lời quiz theo chủ đề | E-07 | User story | P0 | PB-07 |
| PB-22 | Chấm quiz, xem kết quả và làm lại | E-07 | User story | P0 | PB-21 |
| PB-23 | Khách tham gia và trải nghiệm phiên | E-08 | User story | P1 | PB-08, PB-14, PB-15, PB-16 |
| PB-24 | Ôn thử và hết hạn dữ liệu khách | E-08 | User story | P1 | PB-17, PB-18, PB-22, PB-23 |
| PB-25 | Thiết lập tiêu chí và xếp ứng viên | E-09 | User story | P1 | PB-03, PB-08 |
| PB-26 | Xác nhận ghép và xử lý chờ lâu | E-09 | User story | P1 | PB-09, PB-25 |
| PB-27 | Chặn và quản lý danh sách chặn | E-10 | User story | P0 | PB-11 |
| PB-28 | Gửi và xử lý báo cáo | E-10 | User story | P1 | PB-09, PB-02 |
| PB-29 | Khóa và mở khóa tài khoản | E-10 | User story | P0 | PB-02 |
| PB-30 | Thống kê hoạt động | E-10 | User story | P2 | PB-11, PB-19, PB-22 |
| PB-31 | Chuẩn bị và rà soát học liệu nghiệm thu | E-02 | Học liệu | P0 | PB-05, PB-06 |
| PB-32 | Kiểm tra quyền, dữ liệu và xử lý lỗi xuyên suốt | E-11 | Kiểm thử | P0 | Các hạng mục chức năng được kiểm tra |
| PB-33 | Kiểm tra giao diện và hiệu năng bản online | E-11 | Kiểm thử | P0 | Các hạng mục chức năng được kiểm tra, PB-31 |
| PB-34 | Sao lưu, khôi phục và nghiệm thu MVP | E-11 | Kỹ thuật và nghiệm thu | P0 | PB-01 đến PB-33 |

## 5. Chi tiết hạng mục

### PB-01 — Nền tảng triển khai và cấu hình dịch vụ

Nhóm phát triển có môi trường tích hợp online để kiểm tra luồng thực tế ngay từ đầu.

**Truy vết:** NFR-07, NFR-09, NFR-12.

**Tiêu chí chấp nhận:**

1. Frontend, backend và cơ sở dữ liệu kết nối được trên môi trường HTTPS; cấu hình chạy lại được theo hướng dẫn của nhóm.
2. Ghim runtime và dependency tương thích; kiểm tra hạn mức hosting, MongoDB, LiveKit và email, giữ ngân sách dịch vụ bằng 0.
3. Bí mật không nằm trong frontend hoặc logs; lỗi dịch vụ có phản hồi; không tự chuyển sang gói trả phí.

### PB-02 — Đăng ký, đăng nhập, đăng xuất và phân quyền

Là người học, tôi muốn truy cập bằng tài khoản riêng để sử dụng và bảo vệ dữ liệu học tập.

**Truy vết:** FR-ACC-01, FR-ACC-02, FR-ACC-06; NFR-06, NFR-07, NFR-08.

**Tiêu chí chấp nhận:**

1. Đăng ký bằng email/mật khẩu, không xác minh email; từ chối dữ liệu thiếu, sai định dạng hoặc email trùng; không cho tự cấp quyền Admin.
2. Tài khoản hoạt động đăng nhập được; sai mật khẩu hoặc tài khoản khóa bị từ chối; phiên đã đăng xuất không tiếp tục được dùng.
3. Server kiểm tra quyền trên tài nguyên và chức năng quản trị; chỉ công khai thông tin đối tác được phép, không lộ email.

### PB-03 — Cập nhật hồ sơ học tập

Là người học, tôi muốn khai báo trình độ và thông tin cá nhân để tìm bạn phù hợp.

**Truy vết:** FR-ACC-05.

**Tiêu chí chấp nhận:**

1. Lưu và mở lại đúng tên hiển thị, trình độ N5–N1 và các trường tùy chọn theo SRS mục 2.4.
2. Cho bỏ trống tiếng mẹ đẻ, mục tiêu, sở thích, quốc gia, nhóm tuổi và giới tính; không chấp nhận cấp độ ngoài danh mục hoặc quá ba sở thích.
3. Dùng avatar mặc định; không có tải ảnh đại diện hoặc suy đoán giá trị trường còn trống.

### PB-04 — Đổi và đặt lại mật khẩu

Là người học, tôi muốn đổi mật khẩu hoặc đặt lại mật khẩu qua liên kết email để tiếp tục truy cập tài khoản.

**Truy vết:** FR-ACC-03, FR-ACC-04.

**Tiêu chí chấp nhận:**

1. Đổi mật khẩu yêu cầu chứng minh quyền với tài khoản; mật khẩu mới đăng nhập được, mật khẩu cũ không còn dùng để đăng nhập.
2. Liên kết đặt lại mật khẩu có thời hạn, dùng một lần; sai, hết hạn hoặc đã dùng đều bị từ chối; phản hồi yêu cầu không tiết lộ email có tồn tại.
3. Lỗi gửi email không làm thay đổi mật khẩu và được thông báo; sửa ID không đổi được mật khẩu người khác.

### PB-05 — Biên soạn học liệu

Là quản trị viên, tôi muốn biên soạn bộ chủ đề, tình huống và kiến thức để cung cấp nội dung luyện tập.

**Truy vết:** FR-ADM-02.

**Tiêu chí chấp nhận:**

1. Tạo/sửa bản nháp của bộ chủ đề–cấp độ, tình huống, hai vai, mục tiêu, gợi ý và kiến thức liên quan.
2. Kiến thức có nghĩa và ví dụ; câu quiz có loại câu, đáp án chấp nhận và giải thích; kiểm tra liên kết giữa nội dung.
3. Người học và khách không thực hiện được thao tác biên soạn dù gọi trực tiếp API.

### PB-06 — Xuất bản, ẩn và bảo toàn học liệu

Là quản trị viên, tôi muốn kiểm soát học liệu được sử dụng mà vẫn giữ đúng nội dung đã học trước đó.

**Truy vết:** FR-ADM-03, FR-ADM-04; BR-24.

**Tiêu chí chấp nhận:**

1. Chỉ xuất bản bộ có ít nhất một tình huống hoàn chỉnh; mỗi tình huống có ít nhất ba câu quiz; thiếu dữ liệu phải báo rõ.
2. Học liệu nháp/ẩn không được chọn mới; sửa/ẩn không làm thay đổi nội dung tương ứng trong phiên đang chạy, mục đã lưu hoặc lượt quiz đã tạo.
3. Kiểm tra bảo toàn nội dung với dữ liệu tích hợp thật trước khi nghiệm thu; không yêu cầu giao diện quản lý nhiều phiên bản.

### PB-07 — Xem kho học liệu theo chủ đề

Là người học, tôi muốn xem toàn bộ kiến thức của chủ đề để học độc lập hoặc ôn lại sau cuộc gọi.

**Truy vết:** FR-LRN-01.

**Tiêu chí chấp nhận:**

1. Mở bộ đã xuất bản theo chủ đề và cấp độ, xem từ/cấu trúc, cách đọc nếu áp dụng, nghĩa và ví dụ mà không cần có phiên luyện trước.
2. Khi mở từ lịch sử, hiển thị đúng bộ đã luyện và bản nội dung tương ứng.
3. Học liệu nháp/ẩn không xuất hiện để chọn mới; trạng thái không có dữ liệu hoặc tải lỗi được thể hiện rõ.

### PB-08 — Tạo và tham gia phòng bằng mã mời

Là người học, tôi muốn mời một bạn vào phòng để chủ động luyện cùng nhau.

**Truy vết:** FR-INV-01, FR-INV-02, FR-INV-03; BR-04, BR-07, BR-08.

**Tiêu chí chấp nhận:**

1. Người đang rảnh tạo được mã dùng cho một phiên, hiệu lực 10 phút; có thể hủy phòng chờ và vô hiệu mã.
2. Người nhập mã phải được người tạo chấp nhận trước khi có quyền gọi; yêu cầu đồng thời không tạo thành viên thứ ba.
3. Từ chối mã sai/hết hạn/đã dùng, tài khoản khóa, cặp bị chặn hoặc người đang chiếm luồng khác; cho phép khác cấp; không áp bộ lọc tự động.

### PB-09 — Vào phòng gọi và điều khiển thiết bị

Là thành viên được chấp nhận, tôi muốn vào phòng Kaiwa và điều khiển camera/mic để luyện hội thoại.

**Truy vết:** FR-SES-01, FR-SES-02; BR-09, BR-30.

**Tiêu chí chấp nhận:**

1. Chỉ hai thành viên hợp lệ nhận quyền vào đúng phòng LiveKit; biết ID phòng không đủ để nhận token.
2. Từ chối camera/mic vẫn vào được và có đường rời phòng; trạng thái bật/tắt phản ánh đúng thiết bị.
3. Phiên chỉ bắt đầu khi cả hai kết nối; lỗi cấp quyền hoặc kết nối có thông báo và cách thoát.

### PB-10 — Chat và chia sẻ màn hình trong phiên

Là thành viên phòng, tôi muốn dùng chat và chia sẻ màn hình để hỗ trợ hội thoại.

**Truy vết:** FR-SES-03, FR-SES-04; BR-30.

**Tiêu chí chấp nhận:**

1. Tin nhắn văn bản chỉ đến đúng phòng, không thực thi nội dung nhập và không lưu vào MongoDB hoặc lịch sử học tập.
2. Tối đa một người chia sẻ màn hình tại một thời điểm; người thứ hai được thông báo; dừng chia sẻ trả về bố cục gọi.
3. Từ chối quyền chia sẻ không ảnh hưởng thẻ/chat; vào lại không mặc định khôi phục tin nhắn trước đó.

### PB-11 — Kết thúc, kết nối lại và tính thời lượng

Là thành viên phòng, tôi muốn phục hồi phiên khi mất mạng hoặc kết thúc rõ ràng khi rời phòng.

**Truy vết:** FR-SES-05, FR-SES-06, FR-SES-07, FR-SES-08; BR-09, BR-10, BR-11, BR-30.

**Tiêu chí chấp nhận:**

1. Rời chủ động kết thúc cho cả hai, giải phóng chỗ và mở tổng kết; hết thời lượng mong muốn không tự ngắt cuộc gọi.
2. Mất kết nối chờ tối đa 5 phút; người còn lại được rời trước; quá hạn hoặc phiên đã kết thúc không khôi phục.
3. Khôi phục từ backend đúng bộ/lá/vai; dừng thao tác chung và đồng hồ chọn bộ khi chờ, không đặt lại 60 giây; chỉ cộng thời gian cả hai kết nối, không đếm trùng.

### PB-12 — Cùng chọn bộ chủ đề

Là thành viên phòng, tôi muốn cùng bạn thống nhất một bộ chủ đề trước khi luyện.

**Truy vết:** FR-CAR-01, FR-CAR-02; BR-12.

**Tiêu chí chấp nhận:**

1. Hai máy hiển thị cùng danh sách bộ đã xuất bản với chủ đề, cấp độ N5–N1 và số tình huống.
2. Server random người điều khiển khi bắt đầu phiên; chỉ người giữ quyền chọn bộ. Người kia lấy quyền trực tiếp, không cần duyệt; cả hai thấy người điều khiển hiện tại; không thêm xác nhận sau chọn.
3. Lấy quyền cạnh tranh chọn bộ chỉ ghi thao tác đúng quyền/version; chuyển quyền không đặt lại đồng hồ; hết 60 giây hoạt động chưa chọn kết thúc phiên với đúng lý do; kiểm tra kết hợp mất mạng theo PB-11.

### PB-13 — Bốc thẻ tình huống và nhận vai

Là thành viên phòng, tôi muốn bốc một lá từ bàn bài chung và nhận vai riêng để bắt đầu hội thoại.

**Truy vết:** FR-CAR-03, FR-CAR-04; BR-13, BR-14.

**Tiêu chí chấp nhận:**

1. Giữ một bộ trong phiên; server xáo và giữ ánh xạ lá úp, không gửi sẵn nội dung chưa bốc cho client.
2. Người điều khiển hiện tại bốc; chuyển quyền dùng cùng version với thao tác bốc, không đặt lại thời gian hoặc đổi lá; bấm lá nào chọn đúng ánh xạ lá đó; bấm đồng thời hoặc gửi lại chỉ tạo một tình huống.
3. Cả hai thấy cùng bối cảnh/mục tiêu; random vai A/B và chỉ gửi vai hiện tại cho đúng người; không bốc lại lá đã dùng.

### PB-14 — Gợi ý, đồng thuận và kết quả từng thẻ

Là thành viên phòng, tôi muốn dùng gợi ý và cùng bạn quyết định đổi vai hoặc chuyển tình huống.

**Truy vết:** FR-CAR-05, FR-CAR-06, FR-CAR-07; BR-15, BR-16.

**Tiêu chí chấp nhận:**

1. Mỗi người tự mở gợi ý; thao tác của một người không ép người kia mở; từng từ/cấu trúc có thể lưu riêng qua PB-15.
2. Đổi vai, đổi thẻ, chuyển tiếp cần đối tác đồng ý; chỉ một đề nghị hiện hành, từ chối giữ nguyên; yêu cầu lặp/cũ không áp sang lá mới.
3. Chuyển tiếp ghi hoàn thành, đổi thẻ ghi bỏ qua, đổi vai không tiêu thụ lá; lá dở dang không tự hoàn thành; hết bài vẫn gọi/chat được nhưng không bốc lặp hoặc tự đổi bộ.

Gợi ý dùng cùng nguồn kiến thức của tình huống nhưng hiển thị trong vùng phụ riêng trên mỗi giao diện phòng. Mỗi người tự mở/đóng, cuộn và xem từ vựng/ngữ pháp; lưu kiến thức và ghi chú chỉ tác động dữ liệu của mình. Các thao tác này không yêu cầu quyền điều khiển và không chuyển màn hình đối tác.

### PB-15 — Lưu kiến thức để ôn cá nhân

Là người học, tôi muốn lưu từng từ hoặc cấu trúc để học lại đúng phần cần nhớ.

**Truy vết:** FR-LRN-02, FR-LRN-03; BR-17.

**Tiêu chí chấp nhận:**

1. Cùng mục nguồn chỉ có một mục trong danh sách cá nhân; lưu ở nhiều phiên/tình huống giữ được các nguồn tương ứng.
2. Lưu ngoài cuộc gọi không tạo nguồn phiên giả; lưu xong có thể học flashcard ngay qua PB-18, không cần thêm vào bộ lần nữa.
3. Bỏ lưu không xóa học liệu hoặc đặt lại tiến độ; lưu/bỏ lưu không sinh lượt đánh giá FSRS và không tác động người khác.

### PB-16 — Ghi chú riêng theo phiên

Là người học, tôi muốn ghi chú trong phiên và sửa lại sau đó để lưu điều cần nhớ.

**Truy vết:** FR-LRN-04; BR-18, BR-29.

**Tiêu chí chấp nhận:**

1. Mỗi người có một ghi chú riêng cho một phiên; tự lưu với trạng thái đang lưu/đã lưu/lỗi.
2. Tải lại giữ dữ liệu đã xác nhận; lỗi lưu không báo thành công; người sở hữu sửa/xóa được sau phiên.
3. Đối tác và Admin không đọc được ghi chú; không tách ghi chú theo lá, dùng chat thay ghi chú hoặc tự sinh flashcard/quiz.

### PB-17 — Tổng kết, lịch sử và tự đánh giá

Là người học, tôi muốn xem lại phiên và tự đánh giá để tiếp tục ôn tập.

**Truy vết:** FR-LRN-05, FR-LRN-06, FR-LRN-07; BR-09, BR-27.

**Tiêu chí chấp nhận:**

1. Tổng kết có bộ/tình huống, trạng thái, thời lượng, lý do kết thúc, kiến thức đã lưu và ghi chú của đúng người đang xem.
2. Sau đăng xuất/đăng nhập vẫn có lịch sử kể cả phiên gián đoạn hoặc có khách; phòng chờ chưa bắt đầu không được tính thành phiên; mở được học liệu/ôn tập liên quan.
3. Tự đánh giá mức tự tin 1–5 và nhận xét ngắn là tùy chọn, riêng tư, sửa được; không đổi cấp độ hoặc điểm quiz.

### PB-18 — Học flashcard và xem thẻ đến hạn

Là người học, tôi muốn học toàn bộ chủ đề hoặc phần đã lưu và biết thẻ nào cần ôn.

**Truy vết:** FR-FLC-01, FR-FLC-04, FR-FLC-07; BR-20.

**Tiêu chí chấp nhận:**

1. Chủ đề có 20 mục, đã lưu 5 mục thì hai lối vào cung cấp đúng 20 và 5 mục; học toàn bộ không tự lưu phần còn lại.
2. Mở mặt đáp trước khi đánh giá; có Again/Hard/Good với giải thích và thời điểm ôn dự kiến; chỉ xem đáp án không đổi lịch.
3. Thẻ mới học được ngay; thẻ đến hạn/quá hạn xác định theo thời gian server và vẫn thấy khi quay lại; xem được toàn bộ học liệu ngoài danh sách đến hạn.

### PB-19 — Lịch ôn FSRS và tiến độ dùng chung

Người học có lịch ôn nhất quán khi học cùng một kiến thức ở nhiều nơi.

**Truy vết:** FR-FLC-05, FR-FLC-06, FR-FLC-08; BR-19, BR-20; NFR-05.

**Tiêu chí chấp nhận:**

1. Tính ở backend theo toàn bộ SRS mục 6: FSRS-6, trọng số mặc định, retention 0,90, Again/Hard/Good = 1/2/3, learning 1m/10m, relearning 10m, không fuzz.
2. Một người và một mục nguồn dùng chung tiến độ; client không tự đặt ngày đến hạn; preview không ghi dữ liệu; bỏ lưu/lưu lại không tạo tiến độ mới.
3. Ghim cấu hình và kiểm thử bằng kết quả tham chiếu độc lập; thao tác gửi lại chỉ ghi một review log, hai tab dùng trạng thái cũ không ghi đè tiến độ.

### PB-20 — Bộ flashcard cá nhân và thẻ thủ công

Là người học, tôi muốn sắp xếp bộ thẻ riêng và bổ sung câu hỏi của mình.

**Truy vết:** FR-FLC-02, FR-FLC-03; BR-19.

**Tiêu chí chấp nhận:**

1. Tạo/đổi tên/xóa bộ, thêm/bỏ thẻ nguồn; không trùng một mục trong cùng bộ; nhiều bộ vẫn dùng chung tiến độ nguồn.
2. Tạo/sửa/xóa thẻ hỏi–đáp thủ công, học bằng giao diện flashcard; có định danh và tiến độ riêng, không giả làm kiến thức chuẩn hoặc câu quiz.
3. Xóa bộ không xóa học liệu hoặc tiến độ dùng ở nơi khác; dữ liệu cá nhân chỉ chủ sở hữu truy cập được, Admin không đọc thẻ thủ công.

### PB-21 — Tạo và trả lời quiz theo chủ đề

Là người học, tôi muốn làm quiz theo chủ đề để kiểm tra kiến thức dù chưa gọi hoặc lưu thẻ.

**Truy vết:** FR-QIZ-01, FR-QIZ-02; BR-21, BR-23.

**Tiêu chí chấp nhận:**

1. Lấy tối đa 5 câu không trùng trong ngân hàng bộ chủ đề–cấp độ; có ít hơn lấy tất cả; rỗng thì không tạo lượt hoặc điểm giả.
2. Có trắc nghiệm một đáp án và điền ngắn; không dùng danh sách đã lưu để lọc ngân hàng.
3. Giữ bản câu hỏi/đáp án của lượt lúc tạo; dữ liệu trước nộp không chứa đáp án chuẩn hoặc giải thích; từ chối đầu vào sai loại.

### PB-22 — Chấm quiz, xem kết quả và làm lại

Là người học, tôi muốn xem lỗi sai, học lại kiến thức liên quan và làm một lượt quiz mới.

**Truy vết:** FR-QIZ-03, FR-QIZ-04, FR-QIZ-05, FR-QIZ-06; BR-22, BR-23.

**Tiêu chí chấp nhận:**

1. Server chấm đúng 1 điểm, sai/trống 0; điền ngắn trim đầu/cuối rồi so khớp chính xác với đáp án chấp nhận, không tự đổi chữ hoặc dấu.
2. Sau nộp hiển thị số đúng/tổng câu, đáp án, giải thích, kiến thức liên quan và trạng thái đã lưu; nộp lại không nhân đôi kết quả.
3. Làm lại tạo lượt riêng và giữ kết quả cũ; quiz từ tổng kết có nguồn phiên, quiz độc lập không cần; không tự đổi FSRS, cấp độ hoặc danh sách đã lưu.

### PB-23 — Khách tham gia và trải nghiệm phiên

Là khách, tôi muốn nhập mã để dùng thử phiên luyện mà không cần đăng ký.

**Truy vết:** FR-GST-01, FR-GST-02; BR-25.

**Tiêu chí chấp nhận:**

1. Được người có tài khoản chấp nhận mới nhận quyền tạm của đúng lượt; không tạo phòng, tìm tự động hoặc truy cập lượt khác.
2. Dùng được gọi/chat, chọn/bốc thẻ, nhận đúng vai, mở gợi ý, lưu tạm và ghi chú riêng.
3. Không áp giới hạn lượt/ngày hoặc thời lượng gọi riêng; vẫn kiểm tra thành viên, trạng thái, chặn và hạn mức dịch vụ.

### PB-24 — Ôn thử và hết hạn dữ liệu khách

Là khách, tôi muốn xem tổng kết và ôn thử sau phiên trong thời gian được cung cấp.

**Truy vết:** FR-GST-03, FR-GST-04; BR-26, BR-27.

**Tiêu chí chấp nhận:**

1. Cho xem tổng kết, flashcard và quiz đến thời điểm kết thúc phiên cộng 15 phút; tải lại không gia hạn.
2. Tại/sau hạn API từ chối ngay, giao diện thông báo và dữ liệu học tạm được dọn; không phụ thuộc tác vụ xóa đã chạy hay chưa để hết quyền.
3. Người có tài khoản vẫn giữ lịch sử của mình với nhãn đối tác Khách; đăng ký mới không chuyển dữ liệu thử; báo cáo và thông tin vận hành tối thiểu tách khỏi dữ liệu học tạm.

### PB-25 — Thiết lập tiêu chí và xếp ứng viên

Là người học, tôi muốn tìm bạn theo trình độ, thời lượng và sở thích phù hợp.

**Truy vết:** FR-MAT-01, FR-MAT-02; BR-01, BR-02, BR-03, BR-04.

**Tiêu chí chấp nhận:**

1. Bắt buộc trình độ và thời lượng 10/20/30 phút; bộ lọc quốc gia, nhóm tuổi, giới tính tùy chọn nhưng phải thỏa hai chiều; hồ sơ thiếu không thỏa bộ lọc cụ thể.
2. Cùng cấp được xét; chênh một cấp chỉ khi cả hai bật; không tự nới lọc; xếp đúng thứ tự ưu tiên của BR-03 với dữ liệu thử phân biệt từng tiêu chí.
3. Chỉ xét người đang tìm, hoạt động, không bận hoặc bị chặn; nhiều tab và thao tác đồng thời không giữ một người cho hai cặp/phòng.

### PB-26 — Xác nhận ghép và xử lý chờ lâu

Là người học, tôi muốn quyết định có vào cặp được gợi ý hay điều chỉnh cách tìm.

**Truy vết:** FR-MAT-03, FR-MAT-04, FR-MAT-05; BR-05, BR-06, BR-10.

**Tiêu chí chấp nhận:**

1. Hiển thị thông tin đối tác được phép, điểm chung, thời lượng đề xuất là mức ngắn hơn; cả hai đồng ý trong 30 giây mới vào một phòng.
2. Hủy/từ chối/hết hạn giải phóng cả hai và không tự tìm lại; xác nhận muộn không khôi phục cặp cũ.
3. Sau 2 phút chưa có đề nghị, cho chờ/sửa tiêu chí/mời bằng mã/ôn tập; sửa hủy lượt cũ và tìm mới, chuyển cách khác dừng tìm, tiếp tục chờ không nới lọc.

### PB-27 — Chặn và quản lý danh sách chặn

Là người học, tôi muốn chặn một đối tác để tránh tiếp tục gặp lại trong hệ thống.

**Truy vết:** FR-SAF-01, FR-SAF-02; BR-28.

**Tiêu chí chấp nhận:**

1. Chặn trong phiên kết thúc phiên; cả ghép tự động và mã mời đều loại cặp nếu ít nhất một bên còn chặn.
2. Xem/gỡ được bản chặn của mình; gỡ một phía không vượt bản chặn phía kia; người khác không sửa được danh sách.
3. Kiểm tra ở server, kể cả khi gọi trực tiếp API; chặn khách theo định danh tạm và giới hạn trong SRS mục 2.3.

### PB-28 — Gửi và xử lý báo cáo

Là thành viên phòng, tôi muốn báo cáo vấn đề để quản trị viên xem xét và ghi nhận cách xử lý.

**Truy vết:** FR-SAF-03, FR-ADM-05; BR-29.

**Tiêu chí chấp nhận:**

1. Chỉ báo cáo đối tác/phiên đã tham gia bằng lý do và mô tả; kiểm tra người gửi, không có tệp đính kèm hoặc bản ghi cuộc gọi.
2. Admin xử lý với trạng thái mới, đang xử lý, đã xử lý hoặc bác bỏ; ghi kết quả; người học không sửa kết quả quản trị.
3. Báo cáo độc lập với chặn, không tự được coi là bằng chứng đúng và không mở quyền đọc ghi chú, thẻ cá nhân hoặc theo dõi cuộc gọi.

### PB-29 — Khóa và mở khóa tài khoản

Là quản trị viên, tôi muốn quản lý trạng thái tài khoản để kiểm soát quyền sử dụng hệ thống.

**Truy vết:** FR-ADM-01.

**Tiêu chí chấp nhận:**

1. Admin xem danh sách và khóa/mở khóa tài khoản; người học/khách không thực hiện được qua UI hoặc API.
2. Tài khoản khóa không đăng nhập, ghép hoặc nhận quyền phòng mới; yêu cầu nghiệp vụ tiếp theo với token cũ cũng bị từ chối.
3. Kiểm tra cùng luồng mã mời và ghép tự động trước khi nghiệm thu; không chỉ cập nhật nhãn khóa trên giao diện.

### PB-30 — Thống kê hoạt động

Là quản trị viên, tôi muốn xem số liệu sử dụng để theo dõi hoạt động của bản triển khai.

**Truy vết:** FR-ADM-06.

**Tiêu chí chấp nhận:**

1. Đếm tài khoản, phiên đã bắt đầu, lượt đánh giá flashcard và lượt quiz đã nộp từ dữ liệu lưu thực tế.
2. Không tính phòng chờ, preview FSRS hoặc request lặp thành hoạt động mới; số liệu kiểm tra được bằng tập dữ liệu biết trước.
3. Chỉ Admin xem thống kê quản trị; không hiển thị ghi chú hoặc nội dung riêng của người học.

### PB-31 — Chuẩn bị và rà soát học liệu nghiệm thu

Người học có nội dung mẫu đủ năm cấp độ để thử luồng luyện và ôn.

**Truy vết:** SRS mục 5.9, mục 11.2 (AT-13); DEC-11.

**Tiêu chí chấp nhận:**

1. Có tối thiểu 25 tình huống, ít nhất 5 cho mỗi cấp N5–N1; mỗi tình huống có mục tiêu, hai vai, gợi ý từ/cấu trúc và ít nhất 3 câu quiz.
2. Học liệu được tổ chức theo chủ đề–cấp độ; bộ dùng minh họa bốc bài có nhiều tình huống.
3. Rà soát tiếng Nhật, nghĩa, ví dụ, đáp án và liên kết trước khi xuất bản; không dùng nội dung chưa kiểm tra làm bằng chứng nghiệm thu.

### PB-32 — Kiểm tra quyền, dữ liệu và xử lý lỗi xuyên suốt

Người dùng không bị lộ hoặc mất dữ liệu khi có lỗi, thao tác đồng thời hoặc truy cập trái quyền.

**Truy vết:** NFR-05, NFR-06, NFR-07, NFR-08, NFR-09, NFR-11; BR-29, BR-30.

**Tiêu chí chấp nhận:**

1. Thử sửa ID, vai trò, token hết hạn/token của tài khoản khóa và truy cập chéo phòng; từ chối mọi thao tác trái quyền, kể cả Admin đọc dữ liệu riêng.
2. Kiểm tra lặp và mất phản hồi ở chọn/bốc/lưu/đánh giá/nộp quiz, đầu vào sai kiểu hoặc chứa markup; không nhân đôi, thực thi script hoặc báo lưu thành công sai.
3. Mô phỏng lỗi API/LiveKit/email và hết hạn mức; quyền khách hết đúng hạn; không lưu media, lịch sử chat hoặc bí mật trong logs.

### PB-33 — Kiểm tra giao diện và hiệu năng bản online

Nhóm có bằng chứng hệ thống dùng được trên laptop/desktop và đáp ứng tải demo.

**Truy vết:** NFR-01, NFR-02, NFR-03, NFR-04, NFR-10.

**Tiêu chí chấp nhận:**

1. Kiểm tra laptop/desktop chạy Windows/Chrome, viewport từ 1366 × 768 CSS pixel, các kích thước lớn hơn và khi thay đổi cửa sổ; bố cục responsive, không tràn ngang toàn trang hoặc che nội dung thiết yếu; kiểm tra phóng to chữ và nội dung dài; các thao tác thiết yếu dùng được; tiếng Việt và trạng thái chờ/lưu/lỗi nhất quán.
2. Chạy 2 phòng, 4 người trong 20 phút, không lẫn dữ liệu; kiểm tra cuộc gọi qua ít nhất hai mạng khác nhau.
3. Trong điều kiện SRS mục 11.1: ít nhất 19/20 thao tác dữ liệu hoàn tất trong 3 giây, mỗi lần trong tối thiểu 20 thay đổi chung đến máy còn lại trong 3 giây; ghi riêng cold start và kết quả đo.

### PB-34 — Sao lưu, khôi phục và nghiệm thu MVP

Nhóm có bản triển khai tái lập được và đủ bằng chứng để bàn giao.

**Truy vết:** NFR-12; SRS mục 11.3.

**Tiêu chí chấp nhận:**

1. Thành viên khác chạy được theo cấu hình; có phiên bản dependency và FSRS, logs chẩn đoán không chứa dữ liệu riêng/bí mật.
2. Sao lưu và khôi phục trên bản sao dữ liệu thử; kiểm tra phiên, ghi chú, tiến độ và kết quả quiz sau phục hồi.
3. Hoàn tất AT-01 đến AT-14 cùng tiêu chí của từng yêu cầu; báo cáo điều kiện, kết quả và lỗi còn lại; chỉ nghiệm thu khi đạt điều kiện SRS mục 11.3.

## 6. Truy vết và kiểm thử tích hợp

### 6.1. Yêu cầu chức năng

Bảng dưới đây chỉ rõ hạng mục chịu trách nhiệm chính cho từng yêu cầu. Các quy tắc nghiệp vụ và yêu cầu phi chức năng đi kèm vẫn áp dụng khi nghiệm thu. Một yêu cầu có thể được kiểm tra lại trong nhiều kịch bản tích hợp.

| Yêu cầu SRS | Hạng mục chính |
|---|---|
| FR-ACC-01, FR-ACC-02, FR-ACC-06 | PB-02 |
| FR-ACC-05 | PB-03 |
| FR-ACC-03, FR-ACC-04 | PB-04 |
| FR-ADM-02 | PB-05 |
| FR-ADM-03, FR-ADM-04 | PB-06 |
| FR-LRN-01 | PB-07 |
| FR-INV-01, FR-INV-02, FR-INV-03 | PB-08 |
| FR-SES-01, FR-SES-02 | PB-09 |
| FR-SES-03, FR-SES-04 | PB-10 |
| FR-SES-05, FR-SES-06, FR-SES-07, FR-SES-08 | PB-11 |
| FR-CAR-01, FR-CAR-02 | PB-12 |
| FR-CAR-03, FR-CAR-04 | PB-13 |
| FR-CAR-05, FR-CAR-06, FR-CAR-07 | PB-14 |
| FR-LRN-02, FR-LRN-03 | PB-15 |
| FR-LRN-04 | PB-16 |
| FR-LRN-05, FR-LRN-06, FR-LRN-07 | PB-17 |
| FR-FLC-01, FR-FLC-04, FR-FLC-07 | PB-18 |
| FR-FLC-05, FR-FLC-06, FR-FLC-08 | PB-19 |
| FR-FLC-02, FR-FLC-03 | PB-20 |
| FR-QIZ-01, FR-QIZ-02 | PB-21 |
| FR-QIZ-03, FR-QIZ-04, FR-QIZ-05, FR-QIZ-06 | PB-22 |
| FR-GST-01, FR-GST-02 | PB-23 |
| FR-GST-03, FR-GST-04 | PB-24 |
| FR-MAT-01, FR-MAT-02 | PB-25 |
| FR-MAT-03, FR-MAT-04, FR-MAT-05 | PB-26 |
| FR-SAF-01, FR-SAF-02 | PB-27 |
| FR-SAF-03, FR-ADM-05 | PB-28 |
| FR-ADM-01 | PB-29 |
| FR-ADM-06 | PB-30 |

### 6.2. Yêu cầu phi chức năng

| Yêu cầu SRS | Thực hiện và kiểm chứng |
|---|---|
| NFR-01, NFR-10 | Áp dụng cho mọi giao diện; PB-33 kiểm tra tổng thể. |
| NFR-02, NFR-03, NFR-04 | Các luồng phòng và dữ liệu đáp ứng ngưỡng; PB-33 đo trên bản online. |
| NFR-05 | Từng thao tác lưu/thay đổi phải chống mất hoặc nhân đôi; PB-19 kiểm tra tiến độ, PB-32 kiểm tra xuyên suốt. |
| NFR-06, NFR-07, NFR-08 | PB-01, PB-02 tạo nền tảng; mọi chức năng kiểm tra quyền và đầu vào; PB-32 kiểm tra truy cập trái phép. |
| NFR-09 | Từng chức năng có trạng thái lỗi và hướng xử lý; PB-01, PB-32 kiểm tra lỗi dịch vụ. |
| NFR-11 | PB-16, PB-20, PB-24, PB-28 bảo vệ dữ liệu riêng; PB-32 kiểm tra quyền và lưu giữ. |
| NFR-12 | PB-01 tạo cấu hình tái lập; PB-34 kiểm tra vận hành, sao lưu và khôi phục. |

### 6.3. Kịch bản nghiệm thu

| Kịch bản SRS | Hạng mục liên quan chính |
|---|---|
| AT-01 | PB-02, PB-03, PB-04 |
| AT-02 | PB-25, PB-26, PB-27, PB-29 |
| AT-03 | PB-08, PB-09, PB-23, PB-27, PB-29 |
| AT-04 | PB-08, PB-25, PB-26 |
| AT-05 | PB-09, PB-10 |
| AT-06 | PB-12, PB-13, PB-14 |
| AT-07 | PB-11, PB-12, PB-13, PB-14 |
| AT-08 | PB-14, PB-15, PB-16, PB-17, PB-18 |
| AT-09 | PB-18, PB-19, PB-20 |
| AT-10 | PB-21, PB-22 |
| AT-11 | PB-17, PB-23, PB-24 |
| AT-12 | PB-02, PB-16, PB-20, PB-27, PB-28, PB-29, PB-32 |
| AT-13 | PB-05, PB-06, PB-30, PB-31 |
| AT-14 | PB-01, PB-09, PB-10, PB-11, PB-32, PB-33 |

PB-34 tổng hợp kết quả của toàn bộ kịch bản. AT là kiểm thử tích hợp, không thay thế các ca kiểm tra riêng của từng FR, BR và NFR.

## 7. Điều kiện bắt đầu và hoàn thành

### 7.1. Trước khi bắt đầu hạng mục

- Xác định được kết quả người dùng, yêu cầu nguồn và dữ liệu kiểm thử.
- Thống nhất giao tiếp giữa các phần liên quan; biết phụ thuộc nào đã sẵn sàng, phần nào đang dùng dữ liệu giả để phát triển.
- Có người phụ trách và người kiểm tra; các lựa chọn thiết kế ảnh hưởng trực tiếp đã được giải quyết.
- Nếu phát hiện thiếu hoặc mâu thuẫn nghiệp vụ, làm rõ và cập nhật SRS trước khi triển khai phần phụ thuộc.

### 7.2. Điều kiện hoàn thành chung

1. Đạt toàn bộ tiêu chí của hạng mục và yêu cầu SRS liên quan, bao gồm quyền truy cập, trạng thái lỗi và ngoại lệ.
2. Các phần giao diện, backend và dữ liệu cần thiết đã tích hợp; kết quả nghiệm thu không chỉ dựa trên giao diện hoặc dữ liệu giả.
3. Có kết quả kiểm thử phù hợp: ca bình thường, đầu vào không hợp lệ, quyền, giới hạn thời gian hoặc thao tác đồng thời nếu hạng mục có liên quan.
4. Được thành viên khác kiểm tra; lỗi ảnh hưởng tiêu chí chấp nhận đã được xử lý.
5. Chạy được trên môi trường tích hợp, cấu hình và hướng dẫn sử dụng cần thiết đã cập nhật; không chứa bí mật hoặc dữ liệu cá nhân trong logs.
6. Ghi bằng chứng kiểm tra và cập nhật trạng thái trên bảng công việc. Việc hoàn thành một hạng mục không thay thế nghiệm thu toàn MVP.

Với hạng mục học liệu, bằng chứng là nội dung đã rà soát và xuất bản đúng điều kiện. Với kiểm thử hoặc vận hành, bằng chứng là kết quả đo, biên bản kiểm tra hoặc kết quả khôi phục; không yêu cầu tạo thêm chức năng sản phẩm để đánh dấu hoàn thành.

## 8. Quản lý thay đổi

Khi thay đổi yêu cầu, cập nhật SRS trước hoặc cùng lúc với backlog; kiểm tra lại hạng mục phụ thuộc và kịch bản nghiệm thu bị ảnh hưởng. Giữ mã PB khi chỉ sửa nội dung hoặc ưu tiên. Nếu tách hạng mục, mỗi phần phải có kết quả và tiêu chí kiểm tra rõ ràng, đồng thời duy trì truy vết về yêu cầu nguồn.

Không đưa các chức năng ngoài MVP vào danh sách đang cam kết triển khai. Ngân sách, số người và thời gian dự kiến là ràng buộc lập kế hoạch; việc có đủ hạng mục trong backlog chưa chứng minh nhóm đủ năng lực hoàn thành trong thời gian đó. Kế hoạch triển khai cần dựa trên ước lượng và phân công thực tế.
