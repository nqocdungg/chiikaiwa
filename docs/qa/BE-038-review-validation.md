# BE-038 — Kiểm chứng bổ sung sau review

## Phạm vi local

- OpenAPI khai báo `429 RateLimited` cho hủy invitation, hủy request và phản hồi request; contract test kiểm cả ba operation cùng publish/hide.
- Integration tests cố định `Date` trong từng ca để seed bucket và HTTP request dùng cùng cửa sổ; timer mạng và MongoDB vẫn chạy thật, đồng hồ được khôi phục sau mỗi ca.
- Xóa alias `INVITATION_CODE_LOOKUP_*` không còn consumer trong invitation service.

## Heartbeat — Not Run

Branch hiện chưa triển khai endpoint matching heartbeat. Kiểm thử GET/polling không chứng minh ngoại lệ heartbeat đã hoạt động. Phần này phụ thuộc BE-028: khi endpoint có mặt, kiểm tra heartbeat không tăng quota ghi, vẫn hoạt động khi quota ghi đã đầy, đồng thời giữ kiểm tra quyền và lease theo contract. Chưa ghi Passed cho tiêu chí này.

## IP trên Vercel Preview — Not Run

Chưa có bằng chứng từ hai mạng độc lập trên cùng Preview deployment. `getClientIp` hiện chỉ tin forwarded IP khi socket peer nằm trong `TRUSTED_PROXY_IPS`; khi không cấu hình, hàm dùng socket IP. Test trusted proxy local không chứng minh cấu hình Vercel đúng.

Cần kiểm chứng với hai mạng (ví dụ Wi-Fi và mạng di động), cùng deployment và cửa sổ quota, trên môi trường test được phép:

1. Ghi deployment SHA và cấu hình proxy đã xác minh, không ghi secret hoặc IP thô vào báo cáo công khai.
2. Từ mỗi mạng, gửi request kiểm thử và đối chiếu bucket đã hash; xác nhận hai mạng không cùng bucket do socket proxy chung.
3. Kiểm tra request tự đặt forwarded header không thể chọn tùy ý bucket của người khác.
4. Nếu hai mạng vào cùng bucket, xác minh nguồn IP/trust boundary của nền tảng trước khi sửa config/code và thêm regression test. Không bật tin mọi forwarded header để né lỗi.

Chưa đổi cấu hình deployment, chưa chạy request ghi lên Preview và chưa đánh dấu các câu hỏi này đã giải quyết.
