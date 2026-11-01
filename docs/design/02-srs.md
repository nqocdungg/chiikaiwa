# Chiikaiwa — Đặc tả yêu cầu phần mềm

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 27/10/2026 |
| Phạm vi | MVP cho nhóm 5 người, triển khai trong 3–4 tuần |
| Tài liệu liên quan | Tổng quan dự án (01-project-overview.md) |

**Mục lục:** [Quy ước](#1-mục-đích-và-quy-ước) · [Tổng quan](#2-tổng-quan-hệ-thống) · [Quy tắc nghiệp vụ](#3-quy-tắc-nghiệp-vụ) · [Trạng thái](#4-mô-hình-trạng-thái-nghiệp-vụ) · [Chức năng](#5-yêu-cầu-chức-năng) · [FSRS](#6-đặc-tả-lịch-ôn) · [Use cases](#7-use-cases) · [Giao tiếp và dữ liệu](#8-yêu-cầu-giao-tiếp-và-dữ-liệu) · [Phi chức năng](#9-yêu-cầu-phi-chức-năng) · [Truy vết](#10-truy-vết-yêu-cầu) · [Nghiệm thu](#11-kế-hoạch-nghiệm-thu-yêu-cầu) · [Ràng buộc](#12-ràng-buộc-và-quyết-định-kỹ-thuật-tiếp-theo) · [Tham khảo](#13-tài-liệu-tham-khảo).

## 1. Mục đích và quy ước

### 1.1. Mục đích

SRS xác định hành vi, quy tắc, dữ liệu, ràng buộc và điều kiện nghiệm thu của Chiikaiwa. Tài liệu là cơ sở cho thiết kế, triển khai và kiểm thử; không thay thế thiết kế giao diện, schema cơ sở dữ liệu, hợp đồng API hoặc kế hoạch triển khai.

Tài liệu tham khảo cách tổ chức và chất lượng yêu cầu theo ISO/IEC/IEEE 29148:2018 ở mức phù hợp với đồ án. Đây không phải tuyên bố chứng nhận tuân thủ toàn bộ tiêu chuẩn.

### 1.2. Định danh và cách đọc

| Tiền tố | Ý nghĩa |
|---|---|
| OBJ | Mục tiêu sản phẩm, định nghĩa trong tài liệu tổng quan. |
| DEC | Quyết định về phạm vi sản phẩm. |
| BR | Quy tắc nghiệp vụ dùng chung. |
| FR | Yêu cầu chức năng. |
| NFR | Yêu cầu phi chức năng. |
| UC | Use case. |
| AT | Kịch bản nghiệm thu xuyên suốt. |

Các FR, BR và NFR trong tài liệu đều thuộc MVP, trừ mục ghi rõ ngoài phạm vi. “Tùy chọn” mô tả lựa chọn của người dùng; chức năng cung cấp lựa chọn đó vẫn phải được triển khai. Cột “Tiêu chí nghiệm thu” là acceptance criteria của yêu cầu cùng hàng; khi lập test case, tham chiếu trực tiếp mã yêu cầu đó.

Yêu cầu dùng “phải” để xác định nghĩa vụ của hệ thống. Ví dụ minh họa không tạo thêm danh mục hoặc chức năng. Khi cập nhật yêu cầu, giữ mã ổn định và cập nhật các liên kết BR, UC, AT tương ứng.

### 1.3. Phạm vi sản phẩm

Bảng dưới đây tổng hợp các quyết định phạm vi làm cơ sở truy vết yêu cầu.

| Mã | Nội dung quyết định |
|---|---|
| DEC-01 | Tên Chiikaiwa; nền tảng web cho laptop/desktop, nhóm 5 người, 3–4 tuần, ngân sách miễn phí. |
| DEC-02 | Đăng ký mở; email/mật khẩu không xác minh email; đặt lại mật khẩu qua liên kết email; hồ sơ N5–N1 và thông tin tùy chọn. |
| DEC-03 | Khách chỉ vào bằng mã mời; không giới hạn lượt hoặc thời lượng riêng; ôn thử 15 phút sau phiên, không có lịch sử cá nhân lâu dài. |
| DEC-04 | Ghép theo trình độ/thời gian và ưu tiên mềm; bộ lọc quốc gia đang sinh sống, nhóm tuổi, giới tính tùy chọn; kiểm tra hai chiều. |
| DEC-05 | Tách phòng mã mời và hàng chờ; xác nhận ghép 30 giây, gợi ý sau 2 phút, mã mời 10 phút. |
| DEC-06 | Gọi/chat qua LiveKit; không bắt buộc camera/mic; rời chủ động kết thúc phiên; chờ kết nối lại tối đa 5 phút. |
| DEC-07 | Cùng xem trạng thái phòng; random người điều khiển ban đầu, lấy quyền trực tiếp; chỉ người giữ quyền chọn/bốc. Không bắt buộc luân phiên. |
| DEC-08 | Lưu từ/cấu trúc để học ngay; một trang ghi chú riêng theo phiên; lịch sử và tự đánh giá tùy chọn. |
| DEC-09 | Học toàn bộ chủ đề hoặc phần đã lưu; FSRS-6, Again/Hard/Good; dùng chung tiến độ theo mục kiến thức nguồn. |
| DEC-10 | Quiz theo ngân hàng chủ đề, tối đa 5 câu; không phụ thuộc danh sách đã lưu và không tự cập nhật FSRS. |
| DEC-11 | Admin, chặn/báo cáo, học liệu có nháp/xuất bản/ẩn; giữ nội dung đã được sử dụng; tối thiểu 25 tình huống N5–N1. |
| DEC-12 | Nghiệm thu 2 phòng/4 người/20 phút; kiểm soát quyền, lỗi, đồng bộ và hạn mức dịch vụ. |

## 2. Tổng quan hệ thống

### 2.1. Ranh giới và tác nhân

Chiikaiwa quản lý tài khoản, ghép bạn, phòng mời, nội dung tình huống, trạng thái luyện, dữ liệu cá nhân và ôn tập. LiveKit Cloud cung cấp media, chat và truyền thông báo trong phòng; backend Chiikaiwa quyết định quyền và trạng thái nghiệp vụ. Dịch vụ email chỉ phục vụ đặt lại mật khẩu trong phạm vi MVP.

| Tác nhân | Quyền và giới hạn |
|---|---|
| Người học | Có tài khoản đang hoạt động; sử dụng đầy đủ chức năng học và quản lý dữ liệu của mình. |
| Khách | Có định danh tạm của lượt thử; chỉ tham gia phòng mời được chấp nhận và dữ liệu thử của chính lượt đó. |
| Quản trị viên | Được cấp tài khoản quản trị; quản lý tài khoản, học liệu, báo cáo và thống kê tổng hợp. Không mặc định là thành viên cuộc gọi. |
| LiveKit Cloud | Dịch vụ ngoài hỗ trợ kết nối; không quyết định bộ thẻ, vai, kết quả quiz hoặc lịch ôn. |
| Dịch vụ email | Chuyển thư đặt lại mật khẩu; không xác thực người dùng thay backend. |

### 2.2. Thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| Tomodachi / bạn luyện | Người cùng tham gia phiên luyện; không phải vai trò tài khoản hoặc quan hệ kết bạn lâu dài. |
| Kaiwa | Hoạt động luyện hội thoại tiếng Nhật. |
| Phòng chờ bằng mã | Nơi người tạo chờ đối tác được chấp nhận; chưa phải một phiên đã bắt đầu. |
| Đề nghị ghép | Cặp ứng viên được giữ chỗ tạm trong khi chờ xác nhận. |
| Phòng Kaiwa | Không gian gọi/chat và luyện tình huống của đúng hai thành viên. |
| Phiên luyện tập | Hoạt động bắt đầu khi cả hai thành viên kết nối vào phòng; có trạng thái và thời điểm kết thúc. |
| Chủ đề | Lĩnh vực nội dung, chẳng hạn ăn uống; khác mục tiêu học và sở thích cá nhân. |
| Bộ chủ đề / bộ thẻ | Nhóm thẻ tình huống thuộc một chủ đề và một cấp độ N5–N1. |
| Thẻ tình huống | Bối cảnh chung, mục tiêu, vai A/B, gợi ý và thời lượng tham khảo. |
| Mục kiến thức nguồn | Một từ vựng hoặc cấu trúc chuẩn có định danh, cách đọc nếu áp dụng, nghĩa và ví dụ. |
| Kiến thức đã lưu | Danh sách mục kiến thức được người học chủ động đánh dấu. |
| Flashcard | Cặp mặt hỏi/đáp để nhớ lại kiến thức; không phải lá tình huống được bốc trong cuộc gọi. |
| Tiến độ FSRS | Trạng thái ghi nhớ, thời điểm đến hạn và lịch sử đánh giá của một người đối với một thẻ học. |
| Bộ lọc cứng | Điều kiện phải đáp ứng nếu người dùng đã bật. |
| Ưu tiên mềm | Tiêu chí xếp ứng viên; không khớp không tự loại người đủ điều kiện. |
| Thao tác hợp lệ đầu tiên | Thao tác đầu tiên được server chấp nhận trên trạng thái hiện hành; không dựa vào đồng hồ máy người dùng. |

### 2.3. Ma trận quyền

| Chức năng | Khách | Người học | Quản trị viên |
|---|---|---|---|
| Tạo phòng, tìm tự động | Không | Có | Không phải quyền mặc định của vai trò quản trị |
| Nhập mã và tham gia phòng | Có, cần được chấp nhận | Có, cần được chấp nhận | Không được tự vào để giám sát |
| Gọi/chat, chọn/bốc, gợi ý | Trong phòng được cấp quyền | Trong phòng được cấp quyền | Không có quyền quan sát cuộc gọi |
| Lưu, ghi chú, ôn tập | Tạm trong lượt thử | Dữ liệu của mình | Không đọc dữ liệu riêng của người học |
| Lịch sử cá nhân | Không có lịch sử lâu dài | Của mình | Chỉ thống kê tổng hợp, không thay quyền sở hữu |
| Chặn/báo cáo | Đối tác trong lượt thử; định danh tạm | Đối tác; quản lý danh sách chặn của mình | Xử lý báo cáo, khóa/mở khóa tài khoản |
| Soạn/xuất bản/ẩn học liệu | Không | Không | Có |

Khả năng chặn đối tác ẩn danh chỉ gắn với định danh khách đã biết. Hệ thống không cam kết nhận diện cùng một người khách khi họ bắt đầu một lượt thử mới bằng định danh khác.

### 2.4. Danh mục giao diện

| Trường | Giá trị và cách dùng |
|---|---|
| Trình độ tiếng Nhật | N5, N4, N3, N2, N1; bắt buộc trước khi tìm tự động. |
| Thời gian muốn luyện | 10, 20, 30 phút; chọn khi tìm tự động. |
| Chấp nhận chênh một cấp | Tắt mặc định. |
| Mục tiêu học | Tùy chọn một mục: giao tiếp hằng ngày; du lịch; học tập và công việc; củng cố kiến thức phục vụ kỳ thi; giao lưu văn hóa. |
| Sở thích | Tùy chọn tối đa ba mục: âm nhạc; phim và anime; ẩm thực; du lịch; sách; trò chơi; thể thao; công nghệ. |
| Tiếng mẹ đẻ | Tùy chọn; giá trị có tên tiếng Việt, dùng cùng danh mục giữa hồ sơ và so sánh. |
| Quốc gia | Quốc gia đang sinh sống, không suy ra quốc tịch hoặc tiếng mẹ đẻ; tùy chọn trong hồ sơ. |
| Nhóm tuổi | Dưới 18; 18–22; 23–30; trên 30; tự khai, tùy chọn, không thu ngày sinh để tính tuổi. |
| Giới tính | Nam; nữ; khác; có thể không cung cấp. |
| Bộ lọc bạn luyện | Chọn quốc gia, nhóm tuổi, giới tính mong muốn; mỗi trường mặc định không giới hạn. |

Trường không cung cấp không được thay bằng giá trị suy đoán. Các thông tin dùng để ghép được hiển thị cho đối tác ở bước xác nhận khi đã được cung cấp; email không thuộc thông tin đối tác được xem. Giao diện dùng nhãn tiếng Việt trong bảng; Tomodachi/Kaiwa có giải thích khi xuất hiện lần đầu. Again/Hard/Good giữ nguyên tiếng Anh.

## 3. Quy tắc nghiệp vụ

### 3.1. Ghép bạn và vào phòng

| Mã | Quy tắc |
|---|---|
| BR-01 | Trình độ do người học tự khai, không suy ra từ quiz hoặc phút gọi. Hai người cùng cấp đủ điều kiện cấp độ. Khác cấp chỉ được ghép nếu cả hai bật chênh một cấp và liền kề trong thứ tự N5–N4–N3–N2–N1. |
| BR-02 | Bộ lọc cứng phải thỏa hai chiều. Trường hồ sơ bị bỏ trống không thỏa bộ lọc đang yêu cầu giá trị cụ thể. Không bật bộ lọc thì bỏ qua điều kiện đó. Chỉ người dùng được nới hoặc bỏ bộ lọc của mình. |
| BR-03 | Ứng viên phải đang tìm, tài khoản hoạt động, chưa được giữ cho cặp/phòng khác và không có chặn giữa hai bên. Xếp theo thứ tự: cùng cấp; chênh lệch thời lượng nhỏ hơn; cùng mục tiêu; số sở thích chung nhiều hơn; cùng tiếng mẹ đẻ; thời điểm bắt đầu chờ sớm hơn. Chỉ so khớp tùy chọn khi cả hai có dữ liệu. Nếu mọi tiêu chí bằng nhau, các ứng viên đó được xem là tương đương. |
| BR-04 | Mỗi tài khoản hoặc định danh khách chỉ tham gia một luồng chờ/phòng tại một thời điểm: hàng chờ, đề nghị ghép, phòng mời hoặc phiên luyện. Giữ chỗ phải được kiểm tra trên server, kể cả khi dùng nhiều tab hoặc nhận nhiều yêu cầu đồng thời; không suy đoán cùng một người thật giữa các định danh khách khác nhau. |
| BR-05 | Đề nghị ghép có hiệu lực 30 giây từ lúc server tạo. Chỉ sau khi cả hai chấp nhận mới tạo phòng luyện. Từ chối, hủy hoặc hết hạn giải phóng cả hai; không tự tìm lại hoặc tự đưa vào cuộc gọi. |
| BR-06 | Sau 2 phút chưa có đề nghị ghép, hiển thị tiếp tục chờ, sửa tiêu chí, mời bằng mã và ôn tập. Sửa tiêu chí hủy yêu cầu cũ và bắt đầu lượt tìm mới. Chuyển sang mã mời/ôn tập hủy tìm; tiếp tục chờ giữ lượt hiện tại. |
| BR-07 | Mã mời có hiệu lực 10 phút từ lúc tạo và chỉ dùng cho một phiên. Người tạo phải chấp nhận người xin vào; mã không tự cấp quyền gọi. Không được nhận người thứ ba. Hủy phòng hoặc mã hết hạn khi chưa được sử dụng làm mất quyền xin vào; mã đã dùng không cho người mới thay thế thành viên. |
| BR-08 | Phòng mời cho phép khác cấp và không áp bộ lọc tìm tự động; vẫn kiểm tra trạng thái tài khoản, chặn và giới hạn một phòng. Người tạo muốn chuyển sang tìm tự động phải đóng phòng chờ và vô hiệu mã cũ trước. |

### 3.2. Phiên luyện và thao tác chung

| Mã | Quy tắc |
|---|---|
| BR-09 | Phiên bắt đầu khi cả hai thành viên kết nối vào phòng; bắt đầu ghi lịch sử và bộ đếm chọn chủ đề. Phòng chờ hoặc đề nghị ghép chưa thành phiên không được tính là phiên đã luyện. |
| BR-10 | Thời lượng ghép đề xuất là mức ngắn hơn trong hai lựa chọn, hiển thị trước khi chấp nhận. Đây là gợi ý; hết thời lượng không tự kết thúc, tắt mic hoặc cắt cuộc gọi. Thời lượng hoạt động chỉ cộng khoảng cả hai cùng kết nối, không suy đoán số phút thực sự nói. |
| BR-11 | Một người chủ động rời làm kết thúc phiên cho cả hai. Mất kết nối được phục hồi trong tối đa 5 phút từ khi server xác định mất kết nối, nếu phiên chưa kết thúc; người còn lại được rời trước. Trong khoảng chờ, tạm dừng bốc/chuyển/đổi vai và thời gian còn lại của bước chọn bộ. Vào lại không đặt lại 60 giây chọn bộ từ đầu. |
| BR-12 | Cả hai xem danh sách bộ đã xuất bản và có 60 giây hoạt động để thống nhất. Khi đủ hai kết nối, server random người điều khiển; chỉ người này được chọn bộ, không cần xác nhận điện tử bổ sung. Người còn lại có thể lấy quyền trực tiếp, không cần duyệt; chuyển quyền giữ nguyên thời gian còn lại. Hết hạn chưa chọn thì kết thúc phiên chuẩn bị và ghi lý do trong lịch sử. |
| BR-13 | Sau khi chọn, dùng một bộ trong suốt phiên. Các lá còn lại được xáo, giữ ánh xạ ở server và hiển thị úp trên hai máy. Chỉ người điều khiển hiện tại được bốc. Lấy quyền và bốc dùng cùng version phiên; server chỉ chấp nhận thao tác còn đúng quyền/trạng thái khi ghi. Không bắt buộc luân phiên. Mất kết nối tạm dừng cả chọn/bốc/lấy quyền; phục hồi giữ người điều khiển đã ghi nhận. |
| BR-14 | Một lần bốc chỉ tạo một tình huống hiện tại. Mỗi thẻ trong bộ được bốc tối đa một lần/phiên, kể cả thẻ bỏ qua. Hệ thống random vai A/B; chỉ trả nội dung vai hiện tại cho đúng thành viên. Nội dung lá chưa bốc không được gửi kèm dữ liệu bàn bài. |
| BR-15 | Đổi thẻ, đổi vai hoặc chuyển sang tình huống tiếp theo cần yêu cầu của một người và đồng ý của người còn lại. Một thời điểm chỉ xử lý một yêu cầu đồng thuận cho lá hiện tại; gửi một yêu cầu khác không tự thay cho đồng ý. Từ chối giữ nguyên thẻ/vai. Chuyển tiếp có đồng thuận ghi nhận hoàn thành; đổi thẻ ghi nhận bỏ qua. Đổi vai giữ nguyên tình huống và không tiêu thụ thêm lá. Khi hết lá, không bốc lại; hai người có thể tiếp tục trao đổi hoặc kết thúc. |
| BR-16 | Mỗi thay đổi trạng thái chung chỉ được ghi nhận một lần. Yêu cầu lặp hoặc đến muộn không được áp sang thẻ/bước mới. Mất kết nối làm thao tác cần đủ hai người chưa hoàn tất không có hiệu lực; khi vào lại phải tải trạng thái và xác nhận lại nếu cần. |

### 3.3. Học liệu và dữ liệu cá nhân

| Mã | Quy tắc |
|---|---|
| BR-17 | Lưu để ôn áp dụng cho từng từ/cấu trúc. Cùng mục kiến thức chỉ xuất hiện một lần trong danh sách cá nhân; có thể truy nguồn nhiều phiên/tình huống. Lưu làm mục đó có thể học ngay bằng flashcard, không bắt buộc thêm lại vào bộ. Bỏ lưu không xóa lịch sử hoặc tiến độ học đã có. |
| BR-18 | Mỗi người có một ghi chú riêng cho mỗi phiên, tự lưu và sửa/xóa được sau phiên. Không tự tách theo thẻ, không phân tích thành kiến thức hoặc tự sinh quiz. Chat không thay thế ghi chú. |
| BR-19 | Học theo chủ đề và học phần đã lưu dùng chung mục kiến thức nguồn. Một người có một tiến độ FSRS cho một mục nguồn, dù xuất hiện ở nhiều bộ hoặc nhiều phiên. Thẻ thủ công có tiến độ riêng theo thẻ của chủ sở hữu. |
| BR-20 | Chỉ đánh giá flashcard mới cập nhật FSRS. Xem đáp án, lưu/bỏ lưu, thêm vào bộ hoặc làm quiz không được tạo một lượt đánh giá giả. Học toàn bộ chủ đề không tự đánh dấu toàn bộ kiến thức vào danh sách đã lưu. |
| BR-21 | Một lượt quiz lấy tối đa 5 câu không trùng từ ngân hàng của bộ chủ đề–cấp độ; có ít hơn thì lấy toàn bộ số câu có sẵn. Danh sách đã lưu không giới hạn hoặc thay đổi phạm vi ngân hàng. Không có câu phù hợp thì thông báo chưa có quiz, không tạo lượt rỗng hoặc điểm giả. |
| BR-22 | Mỗi câu đúng được 1 điểm, sai hoặc để trống được 0. Trắc nghiệm có một đáp án đúng. Điền ngắn bỏ khoảng trắng đầu/cuối rồi so khớp chính xác với một đáp án được Admin chấp nhận; không tự đổi chữ, dấu câu, kana/kanji hoặc dùng AI. Điểm là số đúng/tổng số câu; không quy thành cấp độ kaiwa. |
| BR-23 | Chỉ chấm một lần cho một lượt nộp. Đáp án đúng và giải thích được công bố sau khi nộp; câu hỏi/đáp án của lượt đã tạo không thay đổi theo lần sửa ngân hàng sau đó. Làm lại tạo lượt mới, giữ kết quả cũ. |
| BR-24 | Học liệu có trạng thái nháp, đã xuất bản, đã ẩn. Người học chỉ chọn mới học liệu đã xuất bản. Nội dung được dùng trong phiên, mục đã lưu hoặc lượt quiz phải giữ được bản đã sử dụng khi Admin sửa/ẩn; không làm đổi kết quả hoặc nguồn lịch sử. Không xây giao diện quản lý nhiều phiên bản trong MVP. |

### 3.4. Khách, kiểm soát và bảo vệ dữ liệu

| Mã | Quy tắc |
|---|---|
| BR-25 | Khách chỉ vào phòng qua mã và được người có tài khoản chấp nhận; không tạo phòng, tìm tự động hoặc có lịch sử lâu dài. Không áp giới hạn lượt/ngày hay giới hạn gọi riêng, nhưng vẫn chịu giới hạn phòng, trạng thái và hạn mức dịch vụ. |
| BR-26 | Khách được lưu tạm, ghi chú và ôn thử học liệu của phiên. Quyền truy cập cá nhân tạm hết tại thời điểm kết thúc phiên cộng 15 phút, không được gia hạn bằng tải lại trang. Dữ liệu học tập tạm phải được xóa sau hạn; API phải từ chối ngay khi hết quyền, kể cả tác vụ dọn dữ liệu chưa chạy xong. |
| BR-27 | Hết hạn khách không xóa lịch sử, ghi chú, kiến thức hoặc kết quả của người có tài khoản. Lịch sử người học chỉ hiển thị đối tác là Khách. Đăng ký không tự chuyển dữ liệu thử; dữ liệu báo cáo và thông tin vận hành tối thiểu không phải lịch sử học tập của khách. |
| BR-28 | Chặn có hiệu lực hai chiều đối với việc ghép/nhập mã, dù chỉ một bên tạo chặn. Chặn trong phiên kết thúc phiên. Bỏ chặn chỉ gỡ bản chặn của người thực hiện; nếu bên còn lại vẫn chặn thì hai người vẫn không ghép được. Báo cáo và chặn là hai thao tác riêng. |
| BR-29 | Admin không mặc định được vào/nghe/xem cuộc gọi, đọc ghi chú cá nhân hoặc nội dung flashcard thủ công. Báo cáo không cấp quyền truy cập toàn bộ dữ liệu riêng của người gửi; không có bản ghi cuộc gọi để kiểm chứng báo cáo. |
| BR-30 | Danh tính, thành viên, thời hạn và quyền thay đổi trạng thái được xác định tại server. Dữ liệu do client hoặc kênh thông báo gửi không tự trở thành quyết định nghiệp vụ. Không ghi âm/ghi hình toàn bộ cuộc gọi hoặc lưu lịch sử chat trong MongoDB. |

## 4. Mô hình trạng thái nghiệp vụ

### 4.1. Tìm bạn và phòng chờ

| Trạng thái | Sự kiện | Kết quả |
|---|---|---|
| Rảnh | Tìm tự động | Đang tìm; giữ một yêu cầu tìm hiện hành. |
| Đang tìm | Có cặp đủ điều kiện | Chờ xác nhận, giữ chỗ hai người trong 30 giây. |
| Chờ xác nhận | Cả hai đồng ý | Cấp quyền vào một phòng hai người; không tạo hai phòng cho cùng cặp. |
| Đang tìm / chờ xác nhận | Hủy, từ chối hoặc hết hạn | Hủy yêu cầu liên quan, giải phóng chỗ và thông báo. |
| Rảnh | Tạo phòng mời | Chờ mã mời trong tối đa 10 phút. |
| Chờ mã mời | Có người xin vào và được chấp nhận | Cấp quyền cho đúng hai người, đóng khả năng nhận người mới. |
| Chờ mã mời | Hủy hoặc hết hạn chưa sử dụng | Vô hiệu mã, giải phóng người tạo. |

Lỗi khởi tạo hoặc không thể kết nối phòng phải có đường hủy và giải phóng giữ chỗ. Mất liên lạc với thành viên trong quá trình vào phòng được xử lý theo giới hạn phục hồi BR-11; không để trạng thái chiếm phòng vô thời hạn. Chưa có đủ hai kết nối thì chưa ghi một phiên đã bắt đầu.

### 4.2. Phiên và tình huống

| Trạng thái | Sự kiện | Kết quả |
|---|---|---|
| Chọn bộ | Một lựa chọn hợp lệ được nhận | Khóa bộ, tạo bàn bài úp, sang chờ bốc. |
| Chọn bộ | Đủ 60 giây hoạt động chưa chọn | Kết thúc với lý do chưa chọn được bộ. |
| Chờ bốc | Một lần bốc hợp lệ | Ghi lá hiện tại, phân vai, hiển thị tình huống. |
| Có tình huống | Đồng thuận đổi vai | Đổi A/B, giữ lá và trạng thái hoàn thành. |
| Có tình huống | Đồng thuận bỏ qua | Đánh dấu bỏ qua; sang chờ bốc nếu còn lá. |
| Có tình huống | Đồng thuận hoàn thành/chuyển tiếp | Đánh dấu hoàn thành; sang chờ bốc nếu còn lá. |
| Hết lá | Hai người tiếp tục trao đổi | Giữ cuộc gọi/chat và dữ liệu; không sinh thêm lá. |
| Bất kỳ trạng thái đang hoạt động | Một người mất kết nối | Giữ trạng thái trước đó, tạm dừng thao tác chung và chờ phục hồi. |
| Chờ phục hồi | Đủ hai người quay lại trước hạn | Khôi phục trạng thái và phần thời gian còn lại. |
| Chờ phục hồi | Hết 5 phút | Kết thúc với lý do gián đoạn. |
| Bất kỳ trạng thái chưa kết thúc | Rời chủ động hoặc chặn | Kết thúc cho cả hai, thu hồi quyền tiếp tục thao tác phòng. |
| Đã kết thúc | Yêu cầu vào lại hoặc thay đổi thẻ | Từ chối phục hồi cuộc gọi; chỉ cho truy cập tổng kết theo quyền. |

Lá đã bốc nhưng chưa được xác nhận hoàn thành khi phiên kết thúc được ghi là chưa hoàn thành, không tự tính hoàn thành. Việc đổi vai không làm người dùng quên nội dung vai họ từng thấy; giới hạn bảo mật là chỉ gửi vai hiện tại, không tuyên bố giữ bí mật hồi tố sau đổi vai.

## 5. Yêu cầu chức năng

Chức năng Quên mật khẩu chỉ đặt lại mật khẩu qua email đăng ký; không khôi phục tài khoản đã xóa, mở khóa tài khoản hoặc lấy lại tài khoản khi mất quyền truy cập email.

### 5.1. Tài khoản và hồ sơ

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-ACC-01 | Hệ thống phải cho đăng ký bằng email và mật khẩu, tạo tài khoản người học, không yêu cầu xác minh email. | Email đúng định dạng, chưa dùng và mật khẩu hợp lệ tạo được một tài khoản; email trùng/đầu vào thiếu bị từ chối; client không thể tự đăng ký quyền Admin. |
| FR-ACC-02 | Hệ thống phải cho đăng nhập và đăng xuất với kiểm tra trạng thái tài khoản. | Thông tin đúng của tài khoản hoạt động truy cập được dữ liệu của mình; sai mật khẩu hoặc tài khoản khóa không đăng nhập được; phiên xác thực đã đăng xuất không tiếp tục được dùng như còn hiệu lực. |
| FR-ACC-03 | Hệ thống phải cho người học đổi mật khẩu sau khi chứng minh quyền với tài khoản hiện tại. | Đổi thành công thì mật khẩu mới đăng nhập được, mật khẩu cũ không còn dùng để đăng nhập; người khác không thể đổi bằng cách sửa ID tài khoản. |
| FR-ACC-04 | Hệ thống phải cung cấp đặt lại mật khẩu qua email bằng liên kết đặt lại mật khẩu có thời hạn và dùng một lần. | Người dùng nhận liên kết đặt lại mật khẩu qua email đăng ký, hiệu lực 15 phút và dùng một lần; tự nhập mật khẩu mới trên website, không nhận mật khẩu qua email; đăng nhập lại sau khi hoàn tất; liên kết hợp lệ đổi được mật khẩu; sai/hết hạn/đã dùng bị từ chối; lỗi gửi thư được thông báo mà không đổi mật khẩu; phản hồi yêu cầu không tiết lộ email có tồn tại. |
| FR-ACC-05 | Hệ thống phải cho xem/sửa hồ sơ theo mục 2.4, dùng avatar mặc định. | Lưu và mở lại giữ đúng giá trị; chặn cấp độ ngoài danh mục và quá ba sở thích; cho bỏ trống các trường tùy chọn; không có chức năng tải avatar trong MVP. |
| FR-ACC-06 | Hệ thống phải chỉ công khai thông tin đối tác được phép và bảo vệ chức năng quản trị. | Màn hình xác nhận/phòng không lộ email; người học/khách gọi trực tiếp chức năng quản trị bị từ chối dù sửa giao diện hoặc request. |

### 5.2. Ghép tự động

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-MAT-01 | Hệ thống phải cho người học thiết lập tiêu chí và các bộ lọc trước khi tìm. | Bắt buộc trình độ/thời lượng; các trường còn lại bỏ trống vẫn tìm được; hiển thị rõ điều kiện đang giới hạn và thông tin chỉ dùng ưu tiên. |
| FR-MAT-02 | Hệ thống phải tìm ứng viên theo BR-01 đến BR-04. | Bộ dữ liệu thử phân biệt được cùng cấp/chênh cấp, thiếu hồ sơ, lọc một chiều, chặn và ưu tiên mềm; không ghép người ngoài điều kiện cứng; một người không nhận hai cặp đồng thời. |
| FR-MAT-03 | Hệ thống phải hiển thị đề nghị ghép, thông tin đối tác, điểm chung và thời lượng đề xuất để cả hai chấp nhận. | Có bộ đếm 30 giây; một người đồng ý chưa vào cuộc gọi; đủ hai đồng ý chỉ tạo một phòng; từ chối/hết hạn không tự tìm lại. |
| FR-MAT-04 | Hệ thống phải cho hủy tìm hoặc hủy đề nghị đang chờ mà không để lại giữ chỗ. | Sau hủy, người đó không bị đưa vào cặp cũ; người còn lại được thông báo và có thể tìm lại. Yêu cầu xác nhận đến muộn không khôi phục cặp đã hủy. |
| FR-MAT-05 | Hệ thống phải cung cấp lựa chọn sau 2 phút theo BR-06. | Tiếp tục chờ không tự nới lọc; sửa tiêu chí thay yêu cầu cũ; chuyển sang mã mời hoặc ôn tập dừng tìm và không nhận cặp cũ sau đó. |

### 5.3. Phòng mời và khách

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-INV-01 | Hệ thống phải cho người học tạo phòng chờ và nhận mã mời. | Người đang rảnh tạo được một mã có thời hạn; khách hoặc người đang chiếm luồng khác không tạo thêm được; người tạo có thể hủy phòng. |
| FR-INV-02 | Hệ thống phải cho nhập mã và yêu cầu người tạo chấp nhận trước khi cấp quyền vào phòng. | Mã hợp lệ cho tài khoản/khách xin vào; người tạo thấy tên/nhãn khách; chưa chấp nhận không có quyền gọi; nhiều người xin cùng lúc không làm phòng vượt hai thành viên. |
| FR-INV-03 | Hệ thống phải kiểm tra mã, thành viên và điều kiện vào phòng theo BR-07, BR-08. | Mã sai, hết hạn, bị hủy, phòng đủ người, tài khoản bị khóa hoặc cặp bị chặn đều bị từ chối; hai cấp độ khác nhau vẫn vào được phòng mời hợp lệ. |
| FR-GST-01 | Hệ thống phải cấp quyền tạm cho khách trong đúng lượt thử được chấp nhận. | Không cần tài khoản; không gọi được chức năng tạo phòng/tìm tự động; định danh tạm của phòng này không truy cập phòng khác. |
| FR-GST-02 | Hệ thống phải cho khách dùng gọi/chat, thẻ, gợi ý, lưu tạm và ghi chú trong phiên. | Khách nhận đúng vai, sử dụng được các thao tác phòng và dữ liệu riêng; người học không thấy ghi chú hoặc kết quả ôn của khách. |
| FR-GST-03 | Hệ thống phải cho khách dùng tổng kết, flashcard và quiz của lượt thử trong 15 phút sau khi phiên kết thúc. | Trước hạn dùng được; tại/sau hạn API từ chối và giao diện thông báo; tải lại không kéo dài hạn; dữ liệu tạm được dọn nhưng lịch sử của người có tài khoản vẫn còn. |
| FR-GST-04 | Hệ thống phải tách dữ liệu khách khỏi tài khoản được đăng ký sau đó. | Đăng ký từ màn hình kết thúc không tự thêm ghi chú, thẻ đã lưu, lịch sử hoặc tiến độ thử vào tài khoản mới. |

### 5.4. Cuộc gọi và phiên

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-SES-01 | Hệ thống phải kết nối đúng hai thành viên đã được cấp quyền vào một phòng LiveKit. | Hai thành viên vào được; người thứ ba hoặc người biết ID nhưng không là thành viên không nhận token phòng; lỗi cấp token/kết nối có thông báo và đường thoát. |
| FR-SES-02 | Hệ thống phải cho bật/tắt camera và microphone, không dùng việc cấp quyền thiết bị làm điều kiện bắt buộc để vào phòng. | Từ chối quyền camera/mic vẫn vào được, chat được và rời được; trạng thái thiết bị hiển thị đúng; không tự tuyên bố người dùng đã bật mic. |
| FR-SES-03 | Hệ thống phải cung cấp chat văn bản cho hai thành viên trong phiên. | Tin nhắn hiển thị cho đúng phòng; nội dung được xử lý an toàn; không lưu vào lịch sử học tập hoặc MongoDB. Vào lại không được hứa phục hồi tin trước đó. |
| FR-SES-04 | Hệ thống phải cho chia sẻ màn hình với tối đa một người chia sẻ tại một thời điểm. | Người thứ hai được báo đang có chia sẻ; dừng chia sẻ trả về bố cục gọi; từ chối quyền chia sẻ không làm mất khả năng dùng thẻ hoặc chat. |
| FR-SES-05 | Hệ thống phải xử lý rời phòng và kết thúc phiên theo BR-11. | Một người rời thì cả hai thấy kết thúc, không tiếp tục bốc/chuyển thẻ; có tổng kết dữ liệu đã lưu và giải phóng chỗ cho phiên mới. |
| FR-SES-06 | Hệ thống phải cho phục hồi phiên trong khoảng chờ 5 phút theo BR-11. | Mất mạng hiển thị đang chờ; không tiếp tục thao tác chung; vào lại đúng người trước hạn giữ bộ/lá/vai và dữ liệu đã xác nhận; quá hạn hoặc đối tác đã rời không khôi phục phiên. |
| FR-SES-07 | Hệ thống phải lấy lại trạng thái có thẩm quyền từ backend khi vào lại hoặc phát hiện trạng thái không khớp. | Bỏ lỡ sự kiện LiveKit không tạo hai thẻ khác nhau lâu dài; tải lại trả đúng thẻ/vai hiện tại; thông báo giả từ client không tự thay đổi kết quả server. |
| FR-SES-08 | Hệ thống phải hiển thị thời lượng và ghi nhận thời gian hoạt động theo BR-10. | Hết 10/20/30 phút không tự ngắt; khoảng mất kết nối không cộng vào thời lượng hoạt động; tổng thời gian không âm hoặc nhân đôi sau kết nối lại. |

### 5.5. Bộ chủ đề và thẻ tình huống

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-CAR-01 | Hệ thống phải cho cả hai xem cùng danh sách bộ đã xuất bản, nhận biết chủ đề, cấp độ và số tình huống. | Danh sách hỗ trợ N5–N1; bộ nháp/ẩn không xuất hiện để chọn mới; dữ liệu chung giống nhau trên hai máy. |
| FR-CAR-02 | Hệ thống phải cấp, chuyển quyền điều khiển và cho người giữ quyền chọn bộ theo BR-12. | Random quyền một lần khi phiên bắt đầu; người còn lại lấy quyền trực tiếp; người không giữ quyền không chọn được kể cả gọi API; chuyển quyền không reset thời gian; một chọn hợp lệ khóa cùng bộ trên hai máy; hết 60 giây chưa chọn kết thúc với đúng lý do. |
| FR-CAR-03 | Hệ thống phải hiển thị bàn bài úp và ghi một lần bốc hợp lệ theo BR-13, BR-14. | Chỉ người giữ quyền được bốc; yêu cầu từ người vừa mất quyền bị từ chối; bấm lá nào chọn ánh xạ của lá đó; không nhận sẵn nội dung lá úp; đồng thời bấm hai lá chỉ tạo một kết quả; retry không tiêu thụ lá tiếp theo. |
| FR-CAR-04 | Hệ thống phải hiển thị tình huống chung và vai riêng đúng người. | Hai bên thấy cùng tình huống/mục tiêu; mỗi thành viên chỉ nhận vai đang được giao, kể cả sau đổi vai; đoán ID vai hoặc sửa request không lấy được vai còn lại. |
| FR-CAR-05 | Hệ thống phải cho từng người tự mở gợi ý và lưu riêng từng mục kiến thức. | Người này mở gợi ý không ép người kia mở; từ/cấu trúc có dữ liệu đủ để học lại; lưu một mục không lưu toàn bộ thẻ. |
| FR-CAR-06 | Hệ thống phải thực hiện đổi thẻ, đổi vai và chuyển tiếp theo BR-15, BR-16. | Một đề nghị chưa làm đổi trạng thái; đối tác từ chối giữ nguyên; đồng ý chỉ áp dụng một lần; yêu cầu cũ không áp sang lá mới; đổi vai không tính là bốc thêm. |
| FR-CAR-07 | Hệ thống phải quản lý kết quả từng lá và trạng thái hết bài. | Lá hoàn thành/bỏ qua không quay lại bàn; lá dở dang được ghi chưa hoàn thành; hết bài vẫn gọi/chat được nhưng không tạo lá trùng hoặc tự đổi bộ. |

Gợi ý dùng cùng nguồn kiến thức của tình huống nhưng hiển thị trong vùng phụ riêng trên mỗi giao diện phòng. Mỗi người tự mở/đóng, cuộn và xem từ vựng/ngữ pháp; lưu kiến thức và ghi chú chỉ tác động dữ liệu của mình. Các thao tác này không yêu cầu quyền điều khiển và không chuyển màn hình đối tác.

### 5.6. Lưu kiến thức, ghi chú và lịch sử

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-LRN-01 | Hệ thống phải cho người học xem đầy đủ học liệu của bộ chủ đề đã xuất bản mà không cần tham gia cuộc gọi trước. | Có thể mở từ vựng/cấu trúc, cách đọc nếu áp dụng, nghĩa và ví dụ; mở từ lịch sử dẫn đến bộ đã luyện, kể cả khi cần dùng bản nội dung đã lưu. |
| FR-LRN-02 | Hệ thống phải lưu mục kiến thức và nguồn theo BR-17. | Lưu cùng mục ở hai tình huống vẫn có một mục cá nhân, truy được hai nguồn; lưu xong học được ngay; không có lượt FSRS chỉ vì bấm lưu. |
| FR-LRN-03 | Hệ thống phải cho xem danh sách đã lưu và bỏ lưu từng mục. | Bỏ lưu loại mục khỏi danh sách này, không xóa khỏi kho chủ đề hoặc đặt lại tiến độ; không thay đổi danh sách của người khác. |
| FR-LRN-04 | Hệ thống phải cung cấp ghi chú tự lưu, riêng theo người và phiên, được sửa/xóa sau phiên. | Thấy trạng thái đang lưu/đã lưu/lỗi; tải lại giữ bản đã được server xác nhận; lỗi lưu phải được thông báo chính xác; xóa của mình không xóa của đối tác. |
| FR-LRN-05 | Hệ thống phải tạo tổng kết phiên với các mục riêng biệt. | Hiển thị bộ/tình huống, trạng thái luyện, thời lượng, kiến thức đã lưu và ghi chú của người đang xem; không trộn chat vào ghi chú hoặc lộ ghi chú đối tác. |
| FR-LRN-06 | Hệ thống phải cho người học xem lại lịch sử và mở học liệu/ôn tập liên quan. | Sau đăng xuất/đăng nhập vẫn có lịch sử, kể cả phiên gián đoạn hoặc có khách; biết lý do kết thúc; không tính phòng chờ chưa bắt đầu là phiên luyện. |
| FR-LRN-07 | Hệ thống phải cho tự đánh giá cuối phiên bằng mức tự tin 1–5 và nhận xét ngắn, không bắt buộc. | Có thể bỏ qua; chỉ người sở hữu xem/sửa dữ liệu của mình; đánh giá không đổi cấp độ hoặc điểm quiz. |

### 5.7. Flashcard và FSRS

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-FLC-01 | Hệ thống phải cho học flashcard theo toàn bộ bộ chủ đề hoặc theo danh sách đã lưu. | Một bộ có 20 mục và người học lưu 5 mục thì hai lối vào tương ứng cung cấp 20 và 5 mục; học toàn bộ không tự lưu 15 mục còn lại. |
| FR-FLC-02 | Hệ thống phải cho tạo, đổi tên, xóa bộ cá nhân và thêm/bỏ thẻ trong bộ. | Không thêm trùng cùng mục nguồn trong một bộ; một mục có thể thuộc nhiều bộ nhưng giữ chung tiến độ; xóa bộ không xóa học liệu nguồn hoặc tiến độ đang dùng ở lối vào khác. |
| FR-FLC-03 | Hệ thống phải cho người học tạo, sửa và xóa thẻ thủ công với mặt hỏi/đáp. | Thẻ chỉ thuộc chủ sở hữu, học được bằng cùng giao diện; không tự gán ID kiến thức chuẩn, nguồn tình huống hoặc sinh câu quiz; không ảnh hưởng thẻ của người khác. |
| FR-FLC-04 | Hệ thống phải hiển thị mặt hỏi, cho mở mặt đáp và chọn Again, Hard hoặc Good. | Chưa mở đáp án không ghi đánh giá; mở đáp án nhưng không đánh giá không đổi lịch; mỗi nút có giải thích và thời điểm ôn dự kiến phù hợp trạng thái thẻ. |
| FR-FLC-05 | Hệ thống phải tính và lưu kết quả FSRS tại backend theo mục 6. | Cùng đầu vào, mô hình, trọng số, cấu hình và thời điểm cho cùng kết quả; chỉ chấp nhận rating 1/2/3; không nhận ngày đến hạn do client tự đặt. |
| FR-FLC-06 | Hệ thống phải giữ một tiến độ cho mỗi người và mục nguồn theo BR-19. | Đánh giá một mục từ bộ chủ đề rồi mở từ phần đã lưu hoặc bộ cá nhân trả cùng lịch mới; lưu lại mục cũ không khởi tạo thẻ mới. |
| FR-FLC-07 | Hệ thống phải cung cấp danh sách thẻ đến hạn và lưu lịch sử đánh giá. | Thẻ mới có thể học ngay; thẻ có thời điểm đến hạn không lớn hơn thời điểm server được nhận diện là đến hạn; bỏ lỡ lịch vẫn thấy quá hạn khi quay lại; có thể xem toàn bộ học liệu ngoài danh sách đến hạn. |
| FR-FLC-08 | Hệ thống phải tránh ghi hai lượt ôn cho cùng một thao tác đánh giá. | Bấm đôi/gửi lại cùng thao tác chỉ có một review log và một cập nhật; hai tab dùng trạng thái cũ không làm mất hoặc nhân đôi tiến độ; tab lỗi phải lấy trạng thái mới trước khi đánh giá tiếp. |

### 5.8. Quiz

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-QIZ-01 | Hệ thống phải tạo quiz cho bộ chủ đề–cấp độ theo BR-21. | Bộ có trên 5 câu tạo lượt 5 câu không trùng; bộ có 3 câu tạo lượt 3 câu; bộ rỗng không tạo bài; không cần đã gọi hoặc đã lưu kiến thức mới làm được. |
| FR-QIZ-02 | Hệ thống phải cho trả lời câu trắc nghiệm một đáp án và điền ngắn. | Chọn/nhập được đáp án cho từng câu; đầu vào không đúng loại bị từ chối; dữ liệu gửi trước nộp không chứa đáp án chuẩn hoặc giải thích. |
| FR-QIZ-03 | Hệ thống phải chấm phía server theo BR-22, BR-23. | Điểm đúng với bộ đáp án cố định, kể cả câu bỏ trống; trim đầu/cuối điền ngắn được áp dụng, khác chữ/dấu không nằm trong đáp án chấp nhận bị tính sai; sửa điểm từ client không có hiệu lực. |
| FR-QIZ-04 | Hệ thống phải hiển thị kết quả, đáp án và giải thích sau nộp. | Có số đúng/tổng câu và kết quả từng câu; biết câu liên quan đến kiến thức nào, mở được học liệu tương ứng và nhận biết mục đã lưu; không báo đạt cấp độ kaiwa. |
| FR-QIZ-05 | Hệ thống phải lưu kết quả và cho làm lại bằng lượt mới. | Tải lại kết quả giữ nguyên; gửi nộp lặp không thêm bản kết quả; lần làm lại có định danh riêng, giữ lần trước; quiz mở từ tổng kết liên kết được phiên nguồn, quiz độc lập không cần phiên nguồn. |
| FR-QIZ-06 | Hệ thống phải tách kết quả quiz khỏi tiến độ FSRS và danh sách đã lưu. | Làm đúng hoặc sai không đổi thời điểm đến hạn/mức đánh giá, không tự thêm mục cá nhân; mở flashcard liên quan rồi chủ động đánh giá mới cập nhật FSRS. |

### 5.9. Chặn, báo cáo và quản trị

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| FR-SAF-01 | Hệ thống phải cho chặn đối tác theo BR-28. | Chặn trong phiên kết thúc phiên; ghép tự động và mã mời đều không đưa cặp đã chặn vào cùng phòng; không chỉ ẩn nút phía client. |
| FR-SAF-02 | Hệ thống phải cho người học xem và gỡ các bản chặn của mình. | Chỉ gỡ được bản chặn do mình tạo; gỡ một phía không vô hiệu chặn phía còn lại; không thao tác được danh sách của người khác. |
| FR-SAF-03 | Hệ thống phải cho thành viên báo cáo đối tác bằng lý do và mô tả gắn với phiên. | Báo cáo đúng đối tác/phiên đã tham gia được tạo và theo dõi xử lý; không giả danh người gửi, không nhận báo cáo như bằng chứng tự động đúng; chưa có tệp đính kèm hoặc bản ghi cuộc gọi. |
| FR-ADM-01 | Hệ thống phải cho Admin xem danh sách tài khoản và khóa/mở khóa. | Người học không gọi được thao tác này; tài khoản khóa bị từ chối đăng nhập, ghép và cấp quyền phòng mới; yêu cầu nghiệp vụ tiếp theo không được chấp nhận bằng token cũ của tài khoản đã khóa. |
| FR-ADM-02 | Hệ thống phải cho Admin biên soạn bộ chủ đề, tình huống, vai, kiến thức và câu quiz. | Có thể tạo/sửa bản nháp, kiểm tra liên kết; tình huống có mục tiêu và đủ hai vai, kiến thức có nghĩa/ví dụ, câu quiz có đáp án/giải thích trước khi xuất bản. |
| FR-ADM-03 | Hệ thống phải cho xuất bản và ẩn học liệu theo BR-24. | Bản nháp/ẩn không được chọn mới; bộ xuất bản có ít nhất một tình huống hoàn chỉnh, mỗi tình huống có tối thiểu ba câu quiz; báo lỗi rõ khi thiếu nội dung. |
| FR-ADM-04 | Hệ thống phải bảo toàn dữ liệu đã sử dụng khi học liệu được sửa/ẩn. | Một phiên đang chạy, mục đã lưu và kết quả quiz cũ vẫn hiển thị bản tương ứng, không có liên kết chết hoặc thay đáp án cũ; ẩn không phá lịch sử. |
| FR-ADM-05 | Hệ thống phải cho xử lý báo cáo với trạng thái mới, đang xử lý, đã xử lý hoặc bác bỏ. | Admin xem thông tin báo cáo và ghi kết quả xử lý; người học không sửa kết quả quản trị; việc xử lý không mở quyền đọc ghi chú riêng hoặc theo dõi cuộc gọi. |
| FR-ADM-06 | Hệ thống phải cung cấp thống kê sử dụng tổng hợp. | Đếm tài khoản, phiên đã bắt đầu, lượt đánh giá flashcard và lượt quiz đã nộp từ dữ liệu thật; không tính phòng chờ, preview FSRS hoặc request lặp thành hoạt động mới; không đưa nội dung riêng vào thống kê. |

## 6. Đặc tả lịch ôn

### 6.1. Cấu hình chuẩn

| Tham số | Giá trị yêu cầu |
|---|---|
| Mô hình | FSRS-6; không dùng mặc định của thư viện nếu mặc định đó là mô hình khác. |
| Đánh giá trên giao diện | Again = 1; Hard = 2; Good = 3. Không hiển thị Easy trong MVP. |
| Tỷ lệ nhớ mục tiêu | 0,90. Đây là mục tiêu của scheduler, không phải cam kết người dùng nhớ đúng 90% trong thực tế. |
| Trọng số | Bộ mặc định FSRS-6 trong REF-02; lưu cùng phiên bản thuật toán/cấu hình để tái lập. |
| Learning steps | 1 phút, 10 phút; áp dụng chính sách learning của scheduler tương thích. |
| Relearning steps | 10 phút; áp dụng khi học lại theo scheduler. |
| Fuzzing | Tắt. |
| Tối ưu cá nhân | Không có optimizer hoặc giao diện chỉnh trọng số/retention trong MVP. |
| Thời gian | Tính bằng thời điểm server; lưu được thời điểm tuyệt đối, hiển thị theo múi giờ người dùng. |

Bộ trọng số chuẩn theo REF-02, thứ tự từ `w[0]` đến `w[20]`:

```text
[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
```

Again nghĩa là quên/trả lời sai. Hard nghĩa là nhớ đúng nhưng khó khăn. Good nghĩa là nhớ đúng, khá tự tin. Hard không được mô tả thành một mức trả lời sai.

### 6.2. Đầu vào, đầu ra và quy tắc tính

Một lần đánh giá nhận trạng thái thẻ hiện tại, thời điểm ôn trước, thời điểm đánh giá, rating và cấu hình. Kết quả gồm trạng thái ghi nhớ mới, trạng thái learning/relearning/review, thời điểm ôn tiếp theo và một review log. Trạng thái thẻ và review log phải được ghi nhận nhất quán; không có một kết quả mới mà thiếu lịch sử tương ứng.

Đường cong dài hạn FSRS-6 theo REF-02:

$$
R(t,S)=(1+a\,t/S)^{-w_{20}},\qquad a=0.9^{-1/w_{20}}-1.
$$

Sau khi thuật toán cập nhật độ ổn định thành $S'_g$ cho rating $g$, khoảng dài hạn cơ sở tại tỷ lệ nhớ mục tiêu $r$ là:

$$
I_g=\frac{S'_g}{a}\left(r^{-1/w_{20}}-1\right).
$$

Ở $r=0.9$, khoảng cơ sở bằng $S'_g$. Các công thức này chỉ giải thích khoảng dài hạn, không thay toàn bộ thuật toán cập nhật difficulty/stability, learning steps hoặc relearning steps. Khoảng ôn cuối cùng phải lấy từ scheduler đã cấu hình; không gán cố định một số ngày cho mỗi nút.

Thư viện FSRS phải được ghim phiên bản và chọn rõ FSRS-6. Các chi tiết kỹ thuật còn lại như làm tròn, giới hạn khoảng tối đa và chính sách chuyển bước phải được ghi trong cấu hình triển khai và khóa trước khi tạo bộ kết quả kiểm chứng. Chúng phải dùng nhất quán giữa preview và review; không thay ngầm theo lần nâng dependency.

### 6.3. Cách dùng chung tiến độ

- Khóa logic của thẻ nguồn là người học + mục kiến thức nguồn; bộ cá nhân là cách tổ chức, không tạo một trí nhớ khác cho cùng kiến thức.
- Thẻ thủ công do người học tạo có định danh riêng và không được tự hợp nhất với kiến thức chuẩn bằng so sánh văn bản.
- Chưa có đánh giá thì thẻ được xem là mới và có thể học ngay; việc tạo bản ghi kỹ thuật không được tính là một lượt ôn.
- Học trước hạn vẫn phải tính từ thời điểm đánh giá thực tế và trạng thái hiện hành; xem nội dung không đánh giá thì không thay lịch.
- Đến hạn hoặc quá hạn khi quay lại không tự tạo đánh giá và không đặt lại tiến độ.
- Khách dùng tiến độ tạm cùng quy tắc trong thời hạn lượt thử; không có lịch ôn lâu dài sau khi quyền thử hết hạn.

### 6.4. Kiểm chứng scheduler

Trước nghiệm thu, ghi lại phiên bản thư viện, mô hình, trọng số và toàn bộ cấu hình. Chuẩn bị bộ dữ liệu cố định cho thẻ mới, đang học, đang ôn, học lại, ôn trong ngày và quá hạn. Đối chiếu với công thức/ca tham chiếu FSRS-6 hoặc một bản triển khai tham chiếu độc lập cùng cấu hình; không dùng kết quả tự tính từ chính wrapper của ứng dụng làm bằng chứng duy nhất.

Kiểm tra preview không làm đổi dữ liệu; review ghi đúng một lần; ba rating được ánh xạ đúng; cùng trạng thái/thời điểm cho kết quả tái lập; hai lối vào và nhiều bộ cá nhân cùng nhìn thấy một tiến độ. Đây là kế hoạch kiểm chứng, chưa phải kết quả chạy thuật toán trên hệ thống.

## 7. Use cases

### UC-01 — Tài khoản và hồ sơ

- **Tác nhân:** người truy cập, người học.
- **Tiền điều kiện:** website truy cập được; chức năng cần đăng nhập chỉ áp dụng cho tài khoản hoạt động.
- **Luồng chính:** đăng ký email/mật khẩu → đăng nhập → cập nhật tên, trình độ và thông tin tùy chọn → lưu hồ sơ → đăng xuất khi kết thúc sử dụng.
- **Luồng thay thế:** đổi mật khẩu khi đã xác thực; quên mật khẩu thì yêu cầu email, mở liên kết hợp lệ và đặt mật khẩu mới.
- **Ngoại lệ:** email trùng, thông tin sai, tài khoản khóa, liên kết đặt lại mật khẩu hết hạn/đã dùng hoặc email không gửi được đều có phản hồi và không đổi dữ liệu sai.
- **Hậu điều kiện:** hồ sơ thuộc đúng tài khoản; không có quyền Admin tự cấp.
- **Truy vết:** FR-ACC-01, FR-ACC-02, FR-ACC-03, FR-ACC-04, FR-ACC-05, FR-ACC-06.

### UC-02 — Tìm Tomodachi tự động

- **Tác nhân:** hai người học.
- **Tiền điều kiện:** tài khoản hoạt động, có cấp độ, chưa chiếm luồng chờ/phòng khác.
- **Luồng chính:** chọn thời lượng và các tùy chọn → bắt đầu tìm → hệ thống kiểm tra điều kiện hai chiều và xếp ứng viên → hai bên xem đề nghị → cả hai xác nhận trong 30 giây → nhận quyền vào cùng phòng.
- **Luồng thay thế:** sau 2 phút, tiếp tục chờ, sửa tiêu chí, dùng mã mời hoặc ôn tập.
- **Ngoại lệ:** từ chối/hủy/hết hạn giải phóng cặp; request xác nhận muộn bị từ chối; đối tác bị khóa/chặn hoặc đã có phòng không được giữ lại như một cặp hợp lệ.
- **Hậu điều kiện:** một cặp có đúng một phòng hoặc cả hai được giải phóng; chưa kết nối đủ hai người chưa tính phiên đã bắt đầu.
- **Truy vết:** BR-01, BR-02, BR-03, BR-04, BR-05, BR-06; FR-MAT-01, FR-MAT-02, FR-MAT-03, FR-MAT-04, FR-MAT-05.

### UC-03 — Mời bạn hoặc khách bằng mã

- **Tác nhân:** người tạo có tài khoản; người học hoặc khách được mời.
- **Tiền điều kiện:** người tạo đang rảnh; người được mời không chiếm phòng khác.
- **Luồng chính:** tạo phòng chờ → chia sẻ mã → đối tác nhập mã → người tạo chấp nhận → cấp quyền đúng hai thành viên → cả hai kết nối.
- **Luồng thay thế:** người tạo hủy; người xin vào bị từ chối có thể nhập mã khác; người tạo đóng phòng trước khi chuyển sang tìm tự động.
- **Ngoại lệ:** mã sai/hết hạn/đã dùng, phòng đủ người, chặn hoặc tranh chấp chỗ đều không cấp quyền ngoài cặp được nhận; sự cố vào phòng có đường hủy và giải phóng.
- **Hậu điều kiện:** mã không cho thành viên mới chiếm chỗ trong phiên; khách chỉ có quyền của lượt thử.
- **Truy vết:** BR-07, BR-08, BR-25; FR-INV-01, FR-INV-02, FR-INV-03, FR-GST-01.

### UC-04 — Gọi, chat, rời và kết nối lại

- **Tác nhân:** hai thành viên, LiveKit Cloud.
- **Tiền điều kiện:** thành viên được cấp quyền phòng, phiên chưa kết thúc.
- **Luồng chính:** cả hai kết nối → ghi nhận phiên bắt đầu → dùng camera/mic tùy ý, chat và chia sẻ màn hình → một người rời → kết thúc cho cả hai và mở tổng kết.
- **Luồng thay thế:** không cấp quyền mic/camera vẫn gọi/chat theo khả năng; mất kết nối thì người còn lại chờ tối đa 5 phút hoặc rời sớm; phục hồi đúng người giữ trạng thái.
- **Ngoại lệ:** lỗi media/token, người thứ ba, phiên đã hết hạn hoặc quyền không hợp lệ phải được báo và chặn; không phục hồi lịch sử chat như ghi chú.
- **Hậu điều kiện:** kết thúc có lý do và thời lượng hợp lệ; dữ liệu đã xác nhận được giữ theo quyền.
- **Truy vết:** BR-09, BR-10, BR-11, BR-30; FR-SES-01, FR-SES-02, FR-SES-03, FR-SES-04, FR-SES-05, FR-SES-06, FR-SES-07, FR-SES-08.

### UC-05 — Chọn chủ đề và bốc tình huống

- **Tác nhân:** hai thành viên.
- **Tiền điều kiện:** đủ hai người kết nối; đang chọn bộ hoặc chờ bốc.
- **Luồng chính:** cùng xem danh sách → random người điều khiển → trao đổi → người giữ quyền chọn bộ trong 60 giây → cùng thấy bàn bài úp → người giữ quyền bốc một lá → xem tình huống chung và vai riêng.
- **Luồng thay thế:** người còn lại bấm Lấy quyền điều khiển; server xác nhận quyền mới, giữ nguyên trạng thái phòng và thời gian còn lại.
- **Ngoại lệ:** bấm chọn/bốc đồng thời chỉ ghi nhận một kết quả; yêu cầu lặp/đến muộn không tạo lá mới; hết giờ chọn kết thúc; mất kết nối tạm dừng bước, phục hồi theo UC-04.
- **Hậu điều kiện:** hai máy cùng bộ/lá, mỗi người nhận đúng vai; chỉ một lá bị tiêu thụ trong một lần bốc.
- **Truy vết:** BR-12, BR-13, BR-14, BR-16; FR-CAR-01, FR-CAR-02, FR-CAR-03, FR-CAR-04.

### UC-06 — Luyện và điều phối tình huống

- **Tác nhân:** hai thành viên.
- **Tiền điều kiện:** có tình huống hiện tại, đủ hai người kết nối.
- **Luồng chính:** đọc vai → luyện bằng gọi/chat → tự mở gợi ý → thống nhất hoàn thành → gửi yêu cầu chuyển tiếp → đối tác đồng ý → ghi hoàn thành và trở lại bàn bài nếu còn lá.
- **Luồng thay thế:** yêu cầu bỏ qua để đổi thẻ; yêu cầu đổi vai để luyện lại cùng tình huống; đối tác từ chối thì giữ nguyên.
- **Ngoại lệ:** đề nghị cũ không áp lên lá mới; ngắt kết nối không thay cho đồng ý; hết bài không lặp lại lá hoặc tự đổi bộ.
- **Hậu điều kiện:** lá có trạng thái phản ánh xác nhận của người học; không có chấm điểm kaiwa tự động.
- **Truy vết:** BR-15, BR-16; FR-CAR-05, FR-CAR-06, FR-CAR-07.

### UC-07 — Lưu kiến thức và ghi chú

- **Tác nhân:** người học hoặc khách trong lượt thử.
- **Tiền điều kiện:** được truy cập học liệu/phiên liên quan.
- **Luồng chính:** mở gợi ý → lưu một từ/cấu trúc → viết ghi chú riêng → nhận trạng thái đã lưu → xem hai mục tách biệt trong tổng kết.
- **Luồng thay thế:** lưu cùng kiến thức ở tình huống khác; bỏ lưu; người có tài khoản sửa/xóa ghi chú sau phiên; có thể lưu kiến thức khi xem chủ đề ngoài phiên mà không tạo nguồn phiên giả.
- **Ngoại lệ:** lưu lỗi không hiển thị thành công; retry không tạo bản trùng; sửa ID không đọc/ghi được dữ liệu đối tác.
- **Hậu điều kiện:** mục đã lưu học được ngay; có nguồn thật; ghi chú vẫn là nội dung tự do, không có lượt FSRS phát sinh.
- **Truy vết:** BR-17, BR-18, BR-20; FR-LRN-01, FR-LRN-02, FR-LRN-03, FR-LRN-04, FR-LRN-05.

### UC-08 — Học flashcard và tổ chức bộ cá nhân

- **Tác nhân:** người học; khách trong phạm vi thử.
- **Tiền điều kiện:** có quyền với học liệu hoặc thẻ cá nhân.
- **Luồng chính:** chọn học toàn bộ chủ đề hoặc phần đã lưu → chọn thẻ → tự nhớ rồi mở đáp án → xem khoảng dự kiến → chọn Again/Hard/Good → lưu một đánh giá và lịch mới → tiếp tục hoặc kết thúc.
- **Luồng thay thế:** người học tổ chức các bộ riêng hoặc tạo thẻ thủ công; vào danh sách đến hạn; mở cùng kiến thức từ một lối vào khác.
- **Ngoại lệ:** danh sách rỗng có hướng dẫn mở chủ đề/lưu kiến thức; gửi đánh giá lặp không nhân đôi; tab dùng trạng thái cũ phải cập nhật lại; khách hết hạn không ghi thêm.
- **Hậu điều kiện:** một tiến độ thống nhất, có review log; không tự lưu toàn bộ chủ đề hoặc tạo quiz từ thẻ thủ công.
- **Truy vết:** BR-19, BR-20; FR-FLC-01, FR-FLC-02, FR-FLC-03, FR-FLC-04, FR-FLC-05, FR-FLC-06, FR-FLC-07, FR-FLC-08.

### UC-09 — Làm quiz

- **Tác nhân:** người học; khách trong phạm vi thử.
- **Tiền điều kiện:** được truy cập bộ chủ đề và còn quyền thử nếu là khách.
- **Luồng chính:** mở quiz từ chủ đề hoặc tổng kết → nhận tối đa 5 câu → trả lời → nộp → server chấm → xem điểm, đáp án, giải thích và kiến thức liên quan.
- **Luồng thay thế:** ít câu thì dùng số có sẵn; làm lại tạo lượt mới; từ câu sai mở lại học liệu/flashcard.
- **Ngoại lệ:** không có ngân hàng phù hợp không tạo bài; mất phản hồi khi nộp thì lấy lại cùng kết quả, không chấm lại; đáp án chuẩn không được lộ trước nộp; khách hết hạn bị từ chối.
- **Hậu điều kiện:** kết quả thuộc đúng người và bộ; có nguồn phiên nếu mở từ phiên; FSRS và danh sách lưu không tự đổi.
- **Truy vết:** BR-21, BR-22, BR-23; FR-QIZ-01, FR-QIZ-02, FR-QIZ-03, FR-QIZ-04, FR-QIZ-05, FR-QIZ-06.

### UC-10 — Xem tổng kết và lịch sử

- **Tác nhân:** người học; khách chỉ ở tổng kết lượt hiện tại.
- **Tiền điều kiện:** phiên đã bắt đầu và người truy cập là thành viên được phép.
- **Luồng chính:** kết thúc phiên → xem trạng thái/tình huống/thời lượng → xem kiến thức và ghi chú riêng → tùy chọn mức tự tin/nhận xét → mở học liệu/quiz liên quan → người có tài khoản quay lại từ lịch sử.
- **Luồng thay thế:** phiên gián đoạn hoặc hết giờ chọn bộ vẫn có lý do kết thúc; đối tác là khách hiển thị Khách.
- **Ngoại lệ:** truy cập lịch sử người khác bị từ chối; khách hết 15 phút không mở lại; dữ liệu riêng của khách đã dọn không làm mất lịch sử người học.
- **Hậu điều kiện:** dữ liệu sau phiên truy vết được nhưng không bị diễn giải thành chứng nhận trình độ.
- **Truy vết:** BR-26, BR-27; FR-GST-02, FR-GST-03, FR-GST-04, FR-LRN-05, FR-LRN-06, FR-LRN-07.

### UC-11 — Chặn và báo cáo

- **Tác nhân:** thành viên phiên; Admin xử lý báo cáo ở UC-13.
- **Tiền điều kiện:** có quyền với đối tác/phiên được tham chiếu.
- **Luồng chính:** chọn báo cáo → nhập lý do/mô tả → gửi → nhận kết quả tiếp nhận; người học có thể chọn chặn đối tác riêng.
- **Luồng thay thế:** chặn ngay trong phiên thì kết thúc; người học vào danh sách để bỏ chặn của mình.
- **Ngoại lệ:** không giả danh thành viên hoặc báo cáo như thể đã tham gia một phiên khác; bỏ chặn một phía không vượt chặn phía kia; chặn khách có giới hạn định danh nêu ở mục 2.3.
- **Hậu điều kiện:** báo cáo có nguồn phiên, chặn có hiệu lực ở cả hai cách vào phòng; không tự coi báo cáo là kết luận vi phạm.
- **Truy vết:** BR-28, BR-29; FR-SAF-01, FR-SAF-02, FR-SAF-03.

### UC-12 — Quản lý học liệu

- **Tác nhân:** Admin.
- **Tiền điều kiện:** có quyền quản trị.
- **Luồng chính:** tạo bộ theo chủ đề/cấp độ → soạn tình huống, hai vai, gợi ý và kiến thức → soạn câu hỏi/đáp án/giải thích → kiểm tra đủ dữ liệu → xuất bản.
- **Luồng thay thế:** giữ nháp để sửa; sửa nội dung xuất bản; ẩn bộ không còn dùng cho lựa chọn mới.
- **Ngoại lệ:** thiếu vai/đáp án/liên kết hoặc thiếu câu quiz không được xuất bản; chỉnh sửa/ẩn không làm sai nội dung phiên, mục đã lưu hoặc kết quả quiz cũ.
- **Hậu điều kiện:** người học chỉ chọn mới nội dung đã xuất bản; học liệu mẫu đạt số lượng và có nội dung được rà soát.
- **Truy vết:** BR-24; FR-ADM-02, FR-ADM-03, FR-ADM-04.

### UC-13 — Vận hành tài khoản, báo cáo và thống kê

- **Tác nhân:** Admin.
- **Tiền điều kiện:** có quyền quản trị.
- **Luồng chính:** xem tài khoản/báo cáo → xem xét nội dung báo cáo → chuyển trạng thái xử lý và ghi kết quả → khóa tài khoản nếu quyết định xử lý yêu cầu → xem thống kê tổng hợp.
- **Luồng thay thế:** bác bỏ báo cáo; mở khóa tài khoản.
- **Ngoại lệ:** tài khoản người học không gọi được chức năng Admin; không có quyền truy cập ghi chú/call chỉ vì đang xử lý báo cáo; lỗi thống kê không hiển thị số giả.
- **Hậu điều kiện:** trạng thái xử lý và tài khoản nhất quán; quyền truy cập của tài khoản khóa được kiểm tra phía server.
- **Truy vết:** BR-29, BR-30; FR-ADM-01, FR-ADM-05, FR-ADM-06.

## 8. Yêu cầu giao tiếp và dữ liệu

### 8.1. Giao tiếp bên ngoài

| Giao tiếp | Yêu cầu |
|---|---|
| Trình duyệt | Giao diện tiếng Việt, nội dung tiếng Nhật hiển thị đúng; trạng thái đang tải, đang chờ, đã lưu và lỗi được phân biệt; dùng được khi từ chối camera/mic. |
| Frontend–backend | REST/JSON với kiểm tra quyền và đầu vào; phản hồi phân biệt lỗi dữ liệu, hết quyền, trạng thái đã đổi và lỗi dịch vụ. Không dùng response HTTP thành công để che một thao tác chưa được lưu. |
| Backend–LiveKit | Token giới hạn đúng phòng/thành viên và quyền cần thiết; API secret ở server. Sự kiện kết nối cần được kiểm chứng nguồn trước khi dùng cập nhật trạng thái. |
| Kênh dữ liệu LiveKit | Thông báo thay đổi để client lấy trạng thái; không thay backend quyết định lá, vai hoặc quyền. Không phát nội dung vai riêng cho cả phòng. |
| Email | Gửi liên kết đặt lại mật khẩu có thời hạn; chỉ thay mật khẩu sau xác nhận hợp lệ. Trạng thái lỗi gửi được xử lý rõ. |
| FSRS | Dùng mô hình/cấu hình ghim, backend ghi trạng thái và review log; preview không có tác dụng ghi. |

### 8.2. Dữ liệu logic và quan hệ

Đây là yêu cầu thông tin cần quản lý, không quy định collection, schema hoặc endpoint.

| Nhóm dữ liệu | Quan hệ và ràng buộc |
|---|---|
| Tài khoản/hồ sơ | Định danh ổn định, vai trò, trạng thái hoạt động, thông tin hồ sơ; tách thông tin xác thực khỏi thông tin đối tác được xem. |
| Yêu cầu tìm/đề nghị ghép/phòng mời | Chủ sở hữu, tiêu chí, thời điểm, thời hạn, trạng thái, thành viên được giữ chỗ; chỉ một luồng hiện hành cho mỗi người. |
| Bộ và thẻ tình huống | Chủ đề, cấp độ, trạng thái xuất bản; tình huống có hai vai riêng, mục tiêu, gợi ý và kiến thức liên quan. |
| Kiến thức nguồn | Định danh, loại từ/cấu trúc, nội dung học; có thể liên quan nhiều tình huống hoặc bộ. |
| Phiên và lá đã bốc | Đúng hai thành viên, thời điểm/trạng thái, bộ và bản nội dung được dùng, các lá, vai hiện tại, kết quả luyện, lý do kết thúc. |
| Mục đã lưu | Người sở hữu + kiến thức nguồn; nguồn phiên/tình huống nếu có; không tạo phiên giả khi lưu ngoài cuộc gọi. |
| Ghi chú/tự đánh giá | Chủ sở hữu + phiên; nội dung riêng; không công khai cho đối tác hoặc Admin. |
| Bộ/thẻ cá nhân | Bộ thuộc người học; thẻ nguồn tham chiếu mục kiến thức; thẻ thủ công có nội dung và định danh riêng. |
| Tiến độ/review log | Chủ sở hữu + định danh kiến thức/thẻ; cấu hình scheduler, trạng thái, thời điểm, rating; một thao tác chỉ ghi một review log. |
| Ngân hàng/lượt quiz | Bộ và kiến thức liên quan; bản câu hỏi, đáp án chuẩn lúc tạo lượt; câu trả lời, kết quả, chủ sở hữu, nguồn phiên nếu có. |
| Chặn/báo cáo | Người thực hiện, đối tác/phiên, trạng thái; báo cáo có lý do/mô tả và kết quả xử lý. |
| Lượt khách | Định danh tạm, thành viên phòng, thời điểm hết quyền sau phiên; dữ liệu học tập tạm tách khỏi lịch sử thành viên có tài khoản. |

### 8.3. Lưu giữ và thay đổi

- Dữ liệu người có tài khoản tồn tại qua đăng xuất/đăng nhập và trong thời gian vận hành đồ án. MVP không có chức năng tự xóa tài khoản hoặc toàn bộ lịch sử.
- Ghi chú, danh sách đã lưu, bộ và thẻ cá nhân có thao tác sửa/xóa như đặc tả; không dùng việc xóa bộ để xóa tiến độ còn được dùng ở nơi khác.
- Nội dung chuẩn đã được sử dụng phải giữ được bản tương ứng. Cơ chế lưu bản hoặc snapshot thuộc thiết kế; không tạo giao diện versioning ngoài phạm vi.
- Dữ liệu học tập tạm của khách hết quyền sau 15 phút và phải được dọn. Lịch sử của người học, báo cáo và thông tin vận hành tối thiểu được tách riêng; không giữ ghi chú/kết quả học của khách dưới danh nghĩa logs.
- Chat và nội dung media không trở thành dữ liệu lịch sử. Không ghi token, mật khẩu, nội dung ghi chú hoặc media vào logs.
- Thay đổi đồng thời phải giữ các bất biến về thành viên, lá hiện tại, bộ đã chốt, mục lưu duy nhất, tiến độ và kết quả nộp quiz.

## 9. Yêu cầu phi chức năng

| Mã | Yêu cầu | Cách nghiệm thu |
|---|---|---|
| NFR-01 | Hệ thống phải dùng được trên laptop/desktop chạy Windows, Chrome ổn định được ghi rõ phiên bản khi kiểm thử, viewport từ 1366 × 768 CSS pixel. Giao diện phải responsive theo kích thước cửa sổ; giao diện mobile và ứng dụng di động nằm ngoài MVP. | Kiểm tra form, phòng gọi, bàn bài, gợi ý, ghi chú, flashcard và quiz ở viewport tối thiểu, các kích thước lớn hơn và khi thay đổi cửa sổ; không che/cắt nội dung thiết yếu, không tràn ngang toàn trang hoặc làm mất nút thao tác. Kiểm tra phóng to chữ và nội dung dài; cho cuộn khi cần để đọc đủ. |
| NFR-02 | Hệ thống phải vận hành được 2 phòng độc lập với tổng 4 người trong 20 phút trên môi trường online. | Chạy AT-14; không lẫn media, chat, vai, dữ liệu hoặc kết thúc phòng này vì phòng kia kết thúc; ghi nhận lỗi và thời lượng thực tế. |
| NFR-03 | Trong điều kiện kiểm thử mục 11.1, ít nhất 19/20 thao tác dữ liệu thông thường phải hoàn tất trong 3 giây. | Đo từ lúc người dùng xác nhận thao tác đến khi UI nhận kết quả đã xác nhận; mẫu gồm xem học liệu, lưu/bỏ lưu, lưu ghi chú, nộp quiz và đánh giá flashcard; báo từng thời gian và số đạt. |
| NFR-04 | Thay đổi chủ đề, lá và vai đã được server chấp nhận phải xuất hiện đúng trên máy còn lại trong 3 giây ở điều kiện kiểm thử mục 11.1. | Đo tối thiểu 20 thay đổi hợp lệ trong hai phòng; mỗi thay đổi phải có kết quả đúng và đến trong ngưỡng; không đưa thời gian chờ con người đồng ý vào phép đo. |
| NFR-05 | Dữ liệu đã được server xác nhận phải không bị mất hoặc nhân đôi khi tải lại, kết nối lại hoặc gửi lại cùng thao tác. | Chạy lại thao tác chọn/bốc/lưu/đánh giá/nộp quiz, mô phỏng mất phản hồi và tải lại; kiểm tra bất biến dữ liệu thay vì chỉ thông báo giao diện. |
| NFR-06 | Server phải kiểm tra danh tính, vai trò, quyền sở hữu và thành viên trên mọi thao tác được bảo vệ. | Dùng tài khoản khác, khách, token hết hạn và sửa ID để truy cập phòng, vai, ghi chú, tiến độ, quiz, Admin; tất cả truy cập trái quyền bị từ chối. |
| NFR-07 | Website online phải dùng HTTPS; mật khẩu phải được băm bằng cơ chế chuyên dụng; bí mật và token nhạy cảm không được công khai hoặc ghi logs. | Kiểm tra URL, lưu trữ mật khẩu, bundle frontend, response và logs; không có plaintext password/API secret hoặc nội dung riêng; tài khoản khóa không vượt kiểm tra quyền. |
| NFR-08 | Hệ thống phải kiểm tra kiểu/giá trị đầu vào và hiển thị nội dung nhập như dữ liệu an toàn. | Thử chuỗi có markup ở tên/chat/ghi chú, object thay cho chuỗi đăng nhập, rating/cấp độ/đáp án sai kiểu; không thực thi script, thay điều kiện truy vấn hoặc lưu trạng thái sai. |
| NFR-09 | Lỗi mạng, dịch vụ, hết quyền, hết hạn mức và xung đột trạng thái phải có thông báo và hướng xử lý phù hợp. | Thử mất API/LiveKit/email, request lặp và trạng thái cũ; không để trạng thái tải vô hạn, không báo lưu thành công sai, không tự mở quyền hoặc tự chuyển gói trả phí. |
| NFR-10 | Trạng thái chờ/lưu/lỗi, thời hạn và thao tác chung phải được giải thích bằng tiếng Việt nhất quán. | Người dùng nhận biết được đang chờ ai, thẻ nào đã được chọn và dữ liệu đã lưu hay chưa; thông báo cùng tình huống không dùng các thuật ngữ mâu thuẫn; phân biệt thẻ tình huống và flashcard. |
| NFR-11 | Dữ liệu riêng và dữ liệu khách phải tuân thủ BR-26 đến BR-30. | Kiểm tra API và dữ liệu sau hết hạn khách; người học vẫn có lịch sử của mình; Admin/đối tác không đọc ghi chú riêng; không có lịch sử chat hoặc ghi hình trong dữ liệu ứng dụng. |
| NFR-12 | Bản triển khai phải có cấu hình tái lập, dependency được ghim, logs lỗi tối thiểu và cách sao lưu/khôi phục dữ liệu lưu bền. | Người khác trong nhóm chạy được theo cấu hình triển khai; xác định được phiên bản FSRS; thực hiện một lần sao lưu/khôi phục dữ liệu thử trên bản sao và kiểm tra một phiên, ghi chú, tiến độ và kết quả quiz. |

Không áp SLA 24/7, chỉ tiêu băng thông media cố định hoặc đảm bảo mọi mạng đều đạt độ trễ giống nhau. Ngưỡng trên là tiêu chí nghiệm thu trong điều kiện được ghi nhận, không phải kết quả hệ thống hiện tại đã đạt.

## 10. Truy vết yêu cầu

Các dải dưới đây bao gồm mọi mã trong dải, không chỉ hai đầu. Mỗi FR có acceptance criteria tại mục 5; NFR có phép kiểm riêng tại mục 9. Mục tiêu OBJ được định nghĩa trong tài liệu tổng quan.

| Nguồn | Mục tiêu | Yêu cầu | Use case | Nghiệm thu tích hợp |
|---|---|---|---|---|
| DEC-01, DEC-12 | OBJ-05 | NFR-01 đến NFR-12 | UC-01 đến UC-13 | AT-01 đến AT-14 |
| DEC-02 | OBJ-01, OBJ-05 | FR-ACC-01 đến FR-ACC-06 | UC-01 | AT-01, AT-12 |
| DEC-03 | OBJ-01, OBJ-03, OBJ-05 | FR-GST-01 đến FR-GST-04 | UC-03, UC-04, UC-07, UC-08, UC-09, UC-10 | AT-03, AT-11 |
| DEC-04, DEC-05 | OBJ-01 | FR-MAT-01 đến FR-MAT-05; FR-INV-01 đến FR-INV-03 | UC-02, UC-03 | AT-02, AT-03, AT-04 |
| DEC-06 | OBJ-02, OBJ-05 | FR-SES-01 đến FR-SES-08 | UC-04 | AT-05, AT-07, AT-14 |
| DEC-07 | OBJ-02, OBJ-05 | FR-CAR-01 đến FR-CAR-07 | UC-05, UC-06 | AT-06, AT-07 |
| DEC-08 | OBJ-03 | FR-LRN-01 đến FR-LRN-07 | UC-07, UC-10 | AT-08, AT-11 |
| DEC-09 | OBJ-03, OBJ-04 | FR-FLC-01 đến FR-FLC-08 | UC-08 | AT-09 |
| DEC-10 | OBJ-04 | FR-QIZ-01 đến FR-QIZ-06 | UC-09 | AT-10 |
| DEC-11 | OBJ-04, OBJ-05 | FR-SAF-01 đến FR-SAF-03; FR-ADM-01 đến FR-ADM-06 | UC-11, UC-12, UC-13 | AT-12, AT-13 |

| Quy tắc | Phạm vi áp dụng chính |
|---|---|
| BR-01 đến BR-06 | FR-MAT-01 đến FR-MAT-05 |
| BR-07, BR-08 | FR-INV-01 đến FR-INV-03 |
| BR-09 đến BR-11 | FR-SES-01 đến FR-SES-08; FR-LRN-05, FR-LRN-06 |
| BR-12 đến BR-16 | FR-CAR-01 đến FR-CAR-07; FR-SES-06, FR-SES-07 |
| BR-17, BR-18 | FR-LRN-02 đến FR-LRN-05 |
| BR-19, BR-20 | FR-FLC-01 đến FR-FLC-08; FR-QIZ-06 |
| BR-21 đến BR-23 | FR-QIZ-01 đến FR-QIZ-06 |
| BR-24 | FR-ADM-02 đến FR-ADM-04; FR-LRN-01 |
| BR-25 đến BR-27 | FR-GST-01 đến FR-GST-04; FR-LRN-06 |
| BR-28, BR-29 | FR-SAF-01 đến FR-SAF-03; FR-ADM-01, FR-ADM-05 |
| BR-30 | FR-ACC-06; FR-SES-01, FR-SES-03, FR-SES-07; NFR-05 đến NFR-11 |

## 11. Kế hoạch nghiệm thu yêu cầu

### 11.1. Điều kiện kiểm thử

1. Dùng bản triển khai HTTPS, bốn tài khoản thử và một lượt khách; có tài khoản Admin riêng cho kiểm tra quyền.
2. Chuẩn bị đủ học liệu tối thiểu và dữ liệu ghép phân biệt cấp độ, thời lượng, hồ sơ thiếu, bộ lọc không khớp, tài khoản khóa và chặn.
3. Dùng laptop/desktop chạy Windows/Chrome và kích thước theo NFR-01. Ghi rõ phiên bản browser, cấu hình môi trường, hạn mức còn lại, thời điểm và tình trạng mạng.
4. Kiểm tra cuộc gọi giữa ít nhất hai mạng khác nhau. Đo hiệu năng trên kết nối ổn định, không cố ý gây mất mạng hoặc tải nền cạnh tranh; các ca mất mạng được chạy riêng.
5. Các phép đo 3 giây thực hiện khi dịch vụ đã khởi động; ghi riêng thời gian cold start, không bỏ qua lỗi nghiệp vụ xảy ra khi cold start. Thời gian người dùng suy nghĩ, đồng ý hoặc cấp quyền thiết bị không tính vào độ trễ xử lý.
6. Dùng điều khiển thời gian trong kiểm thử để kiểm tra ranh giới 30 giây, 60 giây, 10 phút, 5 phút và 15 phút; kiểm tra ngay trước và tại/sau hạn. Đối chiếu thêm ít nhất một ca với thời gian thực trên bản triển khai.

### 11.2. Kịch bản tích hợp

| Mã | Kịch bản | Kết quả cần chứng minh |
|---|---|---|
| AT-01 | Đăng ký, đăng nhập, hồ sơ, đổi/đặt lại mật khẩu | Không cần xác minh email; không trùng tài khoản; liên kết đặt lại mật khẩu dùng một lần, đúng quyền; hồ sơ hiển thị đúng và không lộ email. |
| AT-02 | Ghép với tập ứng viên khác cấp/mục tiêu/sở thích và bộ lọc | Thỏa điều kiện hai chiều, đúng thứ tự ưu tiên, chấp nhận hai bên trong 30 giây; không ghép nhầm người bị chặn/khóa/đang bận. |
| AT-03 | Tạo phòng mời, khách xin vào, tranh chấp chỗ | Chỉ cặp được chấp nhận vào; mã sai/hết hạn/đã dùng không nhận người mới; khác cấp vẫn vào được; khách không tạo/tìm tự động. |
| AT-04 | Hủy, hết hạn, sửa tiêu chí và chuyển cách tìm | Không giữ chỗ mồ côi, không nhận cặp cũ sau hủy; đủ 2 phút có lựa chọn; không vừa chờ mã vừa tìm tự động. |
| AT-05 | Camera/mic bị từ chối, chat và chia sẻ màn hình | Vẫn vào phòng, chat/rời được; một chia sẻ tại một thời điểm; không lưu chat vào lịch sử; không có ghi âm/ghi hình. |
| AT-06 | Chọn bộ, trải bài, bốc bình thường và bấm đồng thời | Random quyền ban đầu; lấy quyền trực tiếp; chỉ người giữ quyền chọn/bốc; request cũ sau chuyển quyền bị từ chối; không reset đồng hồ hoặc bốc hai lá; reconnect giữ quyền; vai riêng không lộ. |
| AT-07 | Đồng thuận đổi/chuyển, hết bài, mất kết nối và vào lại | Từ chối không đổi; đồng ý chỉ đổi một lần; giữ thẻ/vai đúng khi phục hồi; quá 5 phút hoặc đối tác rời không mở lại; không tính chờ vào hoạt động. |
| AT-08 | Lưu kiến thức và ghi chú trong cuộc gọi, mở lại sau phiên | Một mục nguồn có nhiều nguồn phiên nhưng không trùng danh sách; ghi chú riêng, tự lưu có phản hồi; học flashcard ngay từ mục đã lưu; không thông báo thành công khi lưu thất bại. |
| AT-09 | Ôn một mục qua chủ đề, phần đã lưu và nhiều bộ cá nhân | Dùng chung tiến độ; bỏ lưu không đặt lại lịch; thẻ thủ công có tiến độ riêng; FSRS đối chiếu tham chiếu, preview không ghi, review lặp không nhân đôi. |
| AT-10 | Quiz đủ/thiếu/rỗng ngân hàng, chấm, nộp lặp và làm lại | Tối đa 5 câu không trùng; đúng cách chấm; không lộ đáp án trước nộp; kết quả cũ giữ nguyên; không cập nhật FSRS hoặc tự lưu kiến thức. |
| AT-11 | Phiên có khách kết thúc, kiểm tra trước/sau hạn 15 phút | Khách ôn tạm được trước hạn, hết quyền đúng hạn và dữ liệu học tạm được dọn; người học vẫn có dữ liệu riêng; đăng ký không nhập dữ liệu thử. |
| AT-12 | Sửa ID, token cũ, khóa tài khoản, chặn/bỏ chặn và báo cáo | Không vượt quyền sở hữu/vai; chặn có hiệu lực cả mã mời và tự động; gỡ một bên không gỡ bên kia; Admin không đọc ghi chú hoặc vào cuộc gọi. |
| AT-13 | Xuất bản, sửa và ẩn học liệu; thống kê | Đủ 25 tình huống N5–N1, mỗi tình huống ít nhất 3 câu; nội dung dùng trước đó không đổi; học liệu ẩn không chọn mới; thống kê không đếm request trùng. |
| AT-14 | Hai phòng, bốn người, 20 phút; đo và mô phỏng lỗi dịch vụ | Đáp ứng NFR-02, NFR-03, NFR-04; không lẫn phòng; báo lỗi/retry đúng; không mua dịch vụ hoặc tự nâng gói khi hết hạn mức. |

### 11.3. Điều kiện chấp nhận

- Mọi FR, BR và NFR được kiểm tra bằng acceptance criteria, test case tương ứng hoặc kiểm tra cấu hình/dữ liệu phù hợp. AT là các ca tích hợp trọng tâm, không thay thế các kiểm tra chi tiết trong từng FR.
- Không có lỗi cho phép xem/đổi dữ liệu trái quyền, tạo hai phiên cho một người, bốc hai lá cho cùng bước, mất dữ liệu đã xác nhận hoặc làm sai điểm/lịch ôn.
- Luồng gọi → tình huống → lưu kiến thức → flashcard/quiz → lịch sử chạy được online; luồng khách được kiểm tra riêng.
- Báo cáo nghiệm thu ghi điều kiện đo, kết quả đạt/không đạt và phần chưa kiểm chứng.

## 12. Ràng buộc và quyết định kỹ thuật tiếp theo

Hệ thống sử dụng React, Node.js/Express, REST, MongoDB/Mongoose, JWT và LiveKit Cloud. Backend giữ trạng thái nghiệp vụ; dữ liệu LiveKit dùng thông báo. Socket.IO, Docker, Nginx và CI không phải các chức năng bổ sung bắt buộc.

Các nội dung sau được xác định trong bước thiết kế và phải đáp ứng các yêu cầu nghiệp vụ của SRS:

| Nội dung | Điều kiện phải đáp ứng |
|---|---|
| Runtime và dependency | Chọn phiên bản tương thích, ghim dependency; kiểm tra riêng khả năng chọn FSRS-6, không mặc định phiên bản thư viện đồng nghĩa phiên bản mô hình. |
| Xác thực | Chọn cách lưu/gửi JWT, thời hạn token và cách thu hồi; làm rõ logout, tài khoản khóa, CSRF nếu dùng cookie, rate limit và chính sách mật khẩu. Phải kiểm thử FR-ACC và NFR-06 đến NFR-08. |
| Mã và quyền tạm | Chọn cách sinh mã không dễ đoán, token khách, timeout kết nối kỹ thuật và cách dọn giữ chỗ. Không đổi thời hạn nghiệp vụ đã nêu. |
| FSRS | Chọn thư viện/phiên bản tương thích, khóa chính sách scheduler và bộ fixture; giữ mô hình, rating và cấu hình nghiệp vụ mục 6. |
| Hosting, MongoDB, email, LiveKit | Xác minh hạn mức miễn phí, HTTPS, khả năng gửi thư và runtime; cấu hình sử dụng trong hạn mức miễn phí, không tự động chuyển sang gói trả phí. |
| Lưu bản và dọn dữ liệu | Chọn cơ chế bảo toàn bản học liệu đã dùng, xóa dữ liệu khách và lưu thông tin báo cáo/vận hành tối thiểu; quyền truy cập khách vẫn hết đúng hạn dù dọn vật lý chạy sau. |
| Sao lưu và logs | Có cách sao lưu/khôi phục đơn giản trong hạn mức miễn phí, logs đủ chẩn đoán nhưng không chứa nội dung riêng/bí mật. |

Nhóm phát triển kiểm tra tính tương thích của công nghệ và hạn mức dịch vụ trước khi triển khai. Nếu có ràng buộc kỹ thuật khiến yêu cầu không khả thi, thay đổi phạm vi phải được thống nhất và cập nhật trong SRS cùng tiêu chí nghiệm thu liên quan.

## 13. Tài liệu tham khảo

Các nguồn dưới đây là tiêu chuẩn và tài liệu chính thức của tổ chức hoặc dự án phát hành. Ngày tham khảo: 27/10/2026.

| Mã | Nguồn | Phạm vi sử dụng |
|---|---|---|
| REF-01 | [ISO/IEC/IEEE 29148:2018 — Requirements engineering](https://www.iso.org/standard/72089.html) | Tham khảo phạm vi quy trình và thông tin đặc tả; không tuyên bố tuân thủ toàn bộ tiêu chuẩn. |
| REF-02 | [Open Spaced Repetition — The Algorithm, FSRS-6](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm#fsrs-6) | Định nghĩa mô hình, rating, trọng số mặc định và đường cong quên. |
| REF-03 | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/README.md) | Thư viện có lựa chọn mô hình và cấu hình; API/runtime phải kiểm tra theo bản được ghim khi triển khai. |
| REF-04 | [Anki — Frequently asked questions about FSRS](https://docs.ankiweb.net/faqs/frequently-asked-questions-about-fsrs) | Hỗ trợ tập con rating; khoảng ôn phụ thuộc lịch sử và cấu hình. |
| REF-05 | [LiveKit — Quotas and limits](https://docs.livekit.io/deploy/admin/quotas-and-limits/) | Giới hạn của gói miễn phí; phải đối chiếu tài khoản và hạn mức thực tế trước triển khai/demo. |
