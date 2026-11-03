# Scrum và quản lý công việc

## Kế hoạch và trách nhiệm

Sprint dài **2 tuần**. [Project Tracker](https://docs.google.com/spreadsheets/d/1KHBM3jEzq8Xwzja7hEvauExb6wlh72pM9962bpQcgSk/edit) quản lý kế hoạch triển khai 6 tuần, 3 sprint, phân công và bằng chứng. [Product Backlog](../design/03-product-backlog.md) và SRS quản lý phạm vi/tiêu chí sản phẩm; tiến độ trên bảng không tự thay đổi yêu cầu thiết kế.

| Trách nhiệm   | Nội dung                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Product Owner | Duy trì Product Goal, sắp xếp ưu tiên backlog và làm rõ giá trị/tiêu chí chấp nhận                      |
| Scrum Master  | Hỗ trợ thực hành Scrum, xử lý trở ngại và theo dõi cải tiến quy trình                                   |
| Developers    | Chọn lượng việc theo năng lực, lập và cập nhật Sprint Backlog, tạo phần sản phẩm đạt Definition of Done |
| Owner task    | Điều phối đầu ra, dependencies, self-test và cập nhật task                                              |
| Reviewer      | Thành viên khác kiểm tra đầu ra và bằng chứng theo Task Handoff                                         |

Nhóm phân công người đảm nhiệm Product Owner và Scrum Master trước Sprint Planning. Owner/reviewer của từng task lấy từ bảng. BE/FE là loại công việc, không phải nhóm nhân sự tách biệt; một owner có thể thực hiện xuyên suốt một chức năng.

## Nhịp sprint

| Hoạt động          | Thời điểm                         | Đầu ra                                                                           |
| ------------------ | --------------------------------- | -------------------------------------------------------------------------------- |
| Sprint Planning    | Đầu sprint                        | Sprint Goal, công việc được chọn, kế hoạch và dependencies theo năng lực thực tế |
| Daily Scrum        | Mỗi ngày làm việc, tối đa 15 phút | Kiểm tra tiến độ tới Sprint Goal, blocker và điều chỉnh công việc tiếp theo      |
| Backlog refinement | Trong sprint                      | Làm rõ, chia nhỏ và ước lượng công việc sắp tới                                  |
| Sprint Review      | Cuối sprint                       | Xem phần đã Done cùng bên liên quan, ghi phản hồi và điều chỉnh backlog          |
| Retrospective      | Sau Review, trước sprint mới      | Cải tiến có owner, hạn thực hiện và theo dõi ở sprint kế tiếp                    |

Planning/Review/Retro được sắp lịch trong capacity của nhóm. Daily phục vụ điều phối công việc; tách thảo luận kỹ thuật dài sang buổi riêng. Refinement là hoạt động liên tục, không phải một sự kiện bắt buộc riêng của Scrum.

Phạm vi công việc có thể điều chỉnh cùng Product Owner để giữ Sprint Goal; không giảm chất lượng để chạy theo số task. Task chưa Done cuối sprint được đánh giá và lập kế hoạch lại, không tự kéo dài sprint. Sprint Review không phải cổng bắt buộc để phát hành; áp dụng [Git workflow](git-workflow.md) khi có bản đủ điều kiện phát hành.

## Bảng quản lý và định danh

| Tab            | Vai trò                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `Overview`     | Quy ước, capacity, tổng hợp tiến độ và cảnh báo                                              |
| `Sprint Plan`  | Sprint Goal, đầu ra, exit criteria, Review và hành động cải tiến                             |
| `Task Tracker` | Owner, sprint, estimate, status, actual/remaining, review, blocker, evidence và dependencies |
| `Task Handoff` | Objective, implementation steps, inputs, dependencies, deliverables, AC, testing và reviewer |
| `Test Cases`   | Ca nguồn, người kiểm tra, kết quả, actual, build/environment và evidence/defect              |

`_Data` là tab dữ liệu nền; chỉ cập nhật cấu trúc allocation/dependencies khi hiểu các công thức liên quan. Không ghi đè cột tự tính trong tracker.

Task ID theo `<GROUP>-<NNN>`: `OPS` (nền tảng/vận hành), `BE` (backend), `FE` (frontend), `DATA` (dữ liệu/seed), `QA` (kiểm thử). Mỗi nhóm đánh số riêng từ `001`, tăng liên tục; giữ ID ổn định, không tái sử dụng ID hoặc lấy số hàng làm ID. Tra mã cũ trong `_Data` khi cần.

- `BE-001` là task triển khai; `PB-02` là hạng mục Product Backlog; `AT-01`, `DB-T01`, `AV-05` là ca kiểm chứng. Không dùng thay thế lẫn nhau.
- Dùng Task ID trong branch/PR theo Git workflow; ghi PB/test liên quan để truy vết. Một PB có thể cần nhiều task BE, FE và QA.
- Lỗi phát sinh có task cụ thể: bước tái hiện, đầu ra, AC, owner, estimate và dependencies. Cấp ID theo nhóm phù hợp và cập nhật capacity trước khi nhận thêm việc.
- Công việc chỉ chạy kiểm thử hoặc vận hành có thể chỉ cần evidence; không tạo branch, code hoặc test hình thức để đánh dấu hoàn thành.

## Nhận task và cập nhật tiến độ

1. Đọc Task Tracker và Task Handoff theo sprint, tuần hoàn thành và dependencies. Kiểm tra objective, AC, inputs, owner/reviewer trước triển khai.
2. BE/FE có thể làm từ contract và fixture đã thống nhất. Dependencies là điều kiện tích hợp/Done; QA nghiệm thu trên build thật sau predecessor.
3. Cập nhật `Status`, `Actual h`, `Remaining h`, `Review`, `Blocker` và `Evidence / PR` khi có thay đổi. Không ghi số giờ hoặc kết quả review chưa được xác nhận.
4. Reviewer xác nhận theo AC và testing requirements; Test Cases chỉ Passed khi đạt đầy đủ Expected Result. Ghi rõ phần chưa chạy, actual result, build/environment và bằng chứng.

Trạng thái dùng đúng bảng: `To Do` → `In Progress` → `In Review` → `Done`; dùng `Blocked` khi không thể tiếp tục. Ghi nguyên nhân, hỗ trợ cần thiết và trạng thái cần quay lại khi hết blocker. `In Review` bao gồm kiểm tra đầu ra/QA cần thiết trước Done; không thêm trạng thái riêng ngoài bảng.

Ước lượng và giờ thực tế phục vụ lập kế hoạch, không phải thước đo xếp hạng cá nhân. `DoD Effort %` là effort đã xác nhận, không đồng nghĩa tỷ lệ chức năng hoàn tất. Nghiệm thu PB cần đủ task DoD, QA chéo và checklist AC; hoàn thành task không thay thế nghiệm thu toàn MVP.

## Definition of Done

Task chỉ Done khi:

- AC và self-test đạt; các phần cần thiết đã tích hợp API/service thật.
- Dependencies hoàn tất theo điều kiện nghiệm thu; reviewer khác owner chấp nhận.
- Có PR khi thay đổi source, kết quả kiểm chứng và evidence truy vết được.
- Tài liệu/config cần thiết cập nhật; không chứa secret hoặc dữ liệu riêng.
- Actual/remaining được ghi theo thực tế, remaining bằng 0.

Merge PR hoặc build thành công không tự động chứng minh task Done. Với dữ liệu, QA hoặc vận hành, đánh giá đầu ra và bằng chứng theo Task Handoff.

## Giao tiếp

Update hằng ngày nêu kết quả so với kế hoạch, link bằng chứng, mục tiêu tiếp theo và blocker. Cập nhật trực tiếp trên bảng, PR hoặc kênh nhóm; không duy trì nhiều bản tiến độ độc lập.

Khi bị kẹt, tự kiểm tra có giới hạn; khoảng một giờ chưa ra thì báo hỗ trợ. Rủi ro dữ liệu/bảo mật hoặc vấn đề chặn người khác cần báo ngay. Thông tin gồm mục tiêu, việc đã thử, lỗi/kết quả, giả thuyết và cần hỗ trợ gì từ ai trước khi nào. Action item của Retro phải có owner và hạn, được xem lại trong sprint sau.

Tham chiếu: [Scrum Guide](https://scrumguides.org/scrum-guide.html).
