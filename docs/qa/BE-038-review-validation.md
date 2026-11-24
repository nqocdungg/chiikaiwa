# BE-038 — Kiểm chứng bổ sung sau review

## Phạm vi local

- OpenAPI khai báo `429 RateLimited` cho hủy invitation, hủy request và phản hồi request; contract test kiểm cả ba operation cùng publish/hide, đồng thời integration test kiểm runtime `429 RATE_LIMITED` + `Retry-After` cho cả ba mutation của invitation.
- Integration tests cố định `Date` trong từng ca để seed bucket và HTTP request dùng cùng cửa sổ; timer mạng và MongoDB vẫn chạy thật, đồng hồ được khôi phục sau mỗi ca.
- Xóa alias `INVITATION_CODE_LOOKUP_*` không còn consumer trong invitation service.
- `getClientIp` hỗ trợ đọc hop hợp lệ đầu tiên của `x-vercel-forwarded-for` khi `VERCEL` được bật (rơi về socket IP khi thiếu hoặc không hợp lệ), không nuốt âm thầm lỗi parse `TRUSTED_PROXY_IPS` (ghi `console.warn` và fallback an toàn về socket IP), kèm unit test cho Vercel IP extraction và hướng dẫn cấu hình trong `.env.example` / `README.md`.

## Heartbeat — Not Run

Branch hiện chưa triển khai endpoint matching heartbeat. Kiểm thử GET/polling không chứng minh ngoại lệ heartbeat đã hoạt động. Phần này phụ thuộc BE-028: khi endpoint có mặt, kiểm tra heartbeat không tăng quota ghi, vẫn hoạt động khi quota ghi đã đầy, đồng thời giữ kiểm tra quyền và lease theo contract. Chưa ghi Passed cho tiêu chí này.

## IP trên Vercel Preview — Not Run

Code đã hỗ trợ đọc `x-vercel-forwarded-for` khi `VERCEL` được bật và có unit test local, nhưng chưa có bằng chứng chạy thực tế từ hai mạng độc lập trên cùng Preview deployment. Test local không chứng minh được cấu hình header/routing trên môi trường Vercel thực.

Cần kiểm chứng với hai mạng (ví dụ Wi-Fi và mạng di động), cùng deployment và cửa sổ quota, trên môi trường test được phép:

1. Ghi deployment SHA và cấu hình proxy đã xác minh, không ghi secret hoặc IP thô vào báo cáo công khai.
2. Từ mỗi mạng, gửi request kiểm thử và đối chiếu bucket đã hash; xác nhận hai mạng không cùng bucket do socket proxy chung.
3. Kiểm tra request tự đặt forwarded header không thể chọn tùy ý bucket của người khác.
4. Nếu hai mạng vào cùng bucket, xác minh nguồn IP/trust boundary của nền tảng trước khi sửa config/code và thêm regression test. Không bật tin mọi forwarded header để né lỗi.

Chưa đổi cấu hình deployment, chưa chạy request ghi lên Preview và chưa đánh dấu các câu hỏi này đã giải quyết.
