# Project Progress Handoff

File này giúp agent hoặc thành viên tiếp theo nắm nhanh task đã làm và biết cần tiếp tục từ đâu.

- Mỗi task một mục, đặt ở sprint tương ứng. Cập nhật mục đó nếu có thay đổi; không tạo mục cho từng lần làm.
- Ghi thông tin ngắn gọn, đúng thực tế. Không ghi secret.
- Tiến độ và giờ làm đang chạy vẫn cập nhật trong [Project Tracker](https://docs.google.com/spreadsheets/d/1KHBM3jEzq8Xwzja7hEvauExb6wlh72pM9962bpQcgSk/edit).

## Mẫu cập nhật

```markdown
### <TASK-ID> — <Tên task>

- Ngày cập nhật: YYYY-MM-DD
- Trạng thái: <Đã xong / Còn dở / Bị chặn>
- PR: <link hoặc Chưa có>
- Đã làm: <kết quả chính>
- File liên quan: <đường dẫn>
- Kiểm chứng: <lệnh và kết quả, hoặc Chưa chạy>
- Tiếp theo: <việc cụ thể agent sau cần làm, hoặc Không có>
- Lưu ý/blocker: <điều cần biết, hoặc Không có>
```

## Sprint 1

### OPS-002 — MongoDB indexes và transaction

- Ngày cập nhật: 2026-11-03
- Trạng thái: Đã hoàn thành
- PR: 49ebcbf4aec5fc10bf62c08dee1638352ff98c6a
- Đã làm: Cấu hình kết nối/reuse MongoDB, transaction helper và duplicate-key handling; thêm migration indexes chạy lặp an toàn; thêm kiểm tra index Atlas theo key/options. Atlas đã hiện migration record và các collections theo ảnh đã gửi.
- File liên quan: `server/persistence/database.js`, `server/persistence/migrations/`, `scripts/verify-atlas-transaction.js`, `server/persistence/index-definition.js`, `tests/integration/database.test.js`.
- Kiểm chứng: Người thực hiện đã báo integration tests pass và migration chạy được; `npm run typecheck` pass ngày 2026-11-03. Chưa có bằng chứng đã chạy `npm run check` hoặc `npm run db:verify-atlas-transaction` trên Atlas.
- Tiếp theo: Chạy `npm run check`; trên Atlas `chiikaiwa_dev`, xác nhận migration chạy hai lần và kiểm tra index; chạy `npm run db:verify-atlas-transaction`. Ghi kết quả/evidence và cập nhật trạng thái, review, PR trong Project Tracker.
- Lưu ý/blocker: Không sửa migration `20261103000100-add-design-indexes.js` đã áp dụng; migration checksum phải giữ nguyên. Branch hiện tại có commits `b0edaeb` và `652f4c5`.

### BE-004 — Models mục đã lưu và nguồn kiến thức

- Ngày cập nhật: 2026-11-05
- Trạng thái: Đã triển khai và self-test; chờ review của Hạnh Nhi.
- PR: Chưa xác minh URL; branch `feature/BE-004-saved-items-models`, base `develop` tại `fef323b`.
- Đã làm: Models và repository cho `saved_items`/`saved_sources`; unique owner–knowledge và nguồn theo revision/context. Ghi trong transaction, bỏ lưu bằng version/CAS, giữ ID/nguồn và không thay tiến độ FSRS. Từ chối reference tùy chọn bằng null; kiểm tra nguồn trước khi ghi item. Dùng lại migration/index hiện có.
- File liên quan: `server/modules/learning/saved-item-models.js`, `server/modules/learning/saved-item-repository.js`, `tests/server/saved-item-models.test.js`, `tests/integration/saved-items.test.js`.
- Kiểm chứng: Unit schema 15/15 pass; integration BE-004 11/11 pass khi shuffle seed 42 và 87. Đã sửa cleanup đủ bốn collection để test không phụ thuộc thứ tự. `npm run check` pass: format/lint/typecheck, 58 unit/HTTP/component tests, 17 integration tests, build sản phẩm và Storybook. Môi trường Node 24.22.2/npm 11.21.1, MongoDB 8.2.7 replica set tạm, không dùng Atlas. Storybook có cảnh báo chunk lớn, không chặn build. `git diff --check` pass.
- Truy vấn nguồn: Lấy knowledgeId từ item cùng owner rồi lọc source theo owner/knowledge/item. Với 100 item và 200 source của một owner, `explain` xét 2 source thay vì 200, cộng một lần đọc item; vẫn sort các nguồn của riêng knowledge đó. Không thêm index.
- Tiếp theo: Xác nhận URL PR/evidence, chạy CI trên PR và nhờ Hạnh Nhi review. OPS-002 đã có evidence và được bảng ghi nhận DoD; thiếu actual/remaining không chặn nghiệm thu.
- Lưu ý tích hợp: Service xác thực owner, kiểm tra quyền revision/nguồn phiên, guest guard và receipt trong cùng transaction. `listSavedSources` trả Promise danh sách; API cần áp phân trang/projection theo contract. Chưa nghiệm thu HTTP hoặc Atlas cho chức năng đã lưu.

## Sprint 2

Chưa có cập nhật.

## Sprint 3

Chưa có cập nhật.
