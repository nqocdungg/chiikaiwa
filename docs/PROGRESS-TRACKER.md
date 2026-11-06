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

### BE-006 — Kiểm chứng và ghim FSRS-6

- Ngày cập nhật: 2026-11-06
- Trạng thái: Đã triển khai và self-test; chờ review.
- PR: Chưa có; branch `feature/BE-006-verify-fsrs-six`, base `develop` tại `b96d828`.
- Đã làm: Ghim `ts-fsrs@6.0.0`, chọn rõ FSRS-6 và 21 weights của SRS. Khóa retention 0,90, learning 1m/10m, relearning 10m, tắt fuzz, giới hạn 36.500 ngày và ngày lịch UTC. Cấu hình bất biến có hash; từ chối config/tiến độ không khớp. Preview và review dùng chung luồng tính thuần, trả trạng thái/log draft và không sửa input hay ghi database.
- File liên quan: `server/integrations/fsrs.js`, `server/integrations/fsrs-config.js`, `tests/server/fsrs.test.js`, `tests/fixtures/fsrs-reference.json`, `scripts/generate-fsrs-fixtures.py`, manifest/lockfile và thiết kế 02/05/06.
- Kiểm chứng: `npm ci` và `npm run check` pass: format/lint/typecheck, 176 unit/HTTP/component tests, 31 integration tests, build sản phẩm và Storybook. 49 test FSRS pass cả khi shuffle seed 20261106, gồm 27 kết quả tham chiếu từ công thức độc lập cho chín tình huống; fixture tái tạo được và các liên kết local hợp lệ. Node 24.22.2/npm 11.21.1, MongoDB 8.2.7 replica set tạm, không dùng Atlas. Storybook có cảnh báo chunk lớn/timing, không chặn build. `git diff --check` pass; chưa có kết quả CI.
- Tiếp theo: Mở PR về `develop`, chạy CI, fixture cùng adapter. Chỉ đánh dấu Done sau khi đạt DoD của nhóm.
- Lưu ý tích hợp: BE-014/BE-025 cùng dependencies lưu `scheduler_configs`, gắn owner/card/revision/version vào log, kiểm tra ticket/quyền và commit progress/log/statistics với CAS/receipt. Chưa nghiệm thu retry chỉ ghi một lần hoặc toàn bộ AV-06. Quyết định cấu hình tại [SRS §6.2](design/02-srs.md#62-đầu-vào-đầu-ra-và-quy-tắc-tính), adapter tại [kiến trúc §9.2](design/05-system-architecture.md#92-fsrs), cấu hình lưu trữ tại [database §8.4](design/06-database-design.md#84-review_logs-và-scheduler_configs).

#### Bàn giao adapter và fixture BE-006

Gọi `previewCard(progress, now, schedulerConfig)` hoặc `reviewCard(progress, now, rating, schedulerConfig)` từ `server/integrations/fsrs.js`; config export từ `fsrs-config.js` cùng thư mục. `now` lấy ở server; `null` biểu thị chưa có tiến độ. Tiến độ có sẵn dùng contract database §8.3, timestamps là `Date`, trường tùy chọn vắng mặt thay vì `null`. Adapter ánh xạ `state` sang enum thư viện và `learningSteps` sang `learningStep`; từ chối config khác, tiến độ mang config ID khác hoặc thời điểm trước lần ôn trước.

Preview trả ba kết quả qua cùng luồng review. Review trả `{ progress, log }`; log gồm rating, `reviewedAt`, before/after state và config ID. Các snapshot độc lập; cả hai hàm không sửa input hoặc ghi database. Log đầu ra là bản nháp: service phải bổ sung danh tính, revision, version và thông tin chống lặp trước khi ghi transaction. Khi commit lấy lại giờ server và tính lại, không dùng lịch preview cũ.

Fixture có 27 kết quả cho chín tình huống, được tạo từ công thức FSRS-6 độc lập và bảng bước học theo policy đã khóa. Script Python chỉ dùng standard library, không import adapter/ts-fsrs. D/S tham chiếu không làm tròn trung gian; sai số cho phép là `1e-7 × max(1, |tham chiếu|)` để bao phủ sai số làm tròn native. State, thời điểm, counters, elapsed/scheduled days và config ID phải khớp chính xác. Đây là kiểm chứng công thức cùng bảng policy, không phải đối chiếu hai thư viện có policy tương đương.

Tái tạo bằng `python scripts/generate-fsrs-fixtures.py`, rồi `npx prettier --write tests/fixtures/fsrs-reference.json`; chạy `npx vitest run --project server tests/server/fsrs.test.js`. Test/CI thông thường chỉ đọc JSON, không cần Python. Thay fixture phải review config, input và công thức; không sinh lại expected để bỏ qua sai khác chưa giải thích. Nguồn công thức và ngày đối chiếu được ghi trong fixture; policy nguồn được kiểm tra từ npm package `ts-fsrs@6.0.0`.

## Sprint 2

Chưa có cập nhật.

## Sprint 3

Chưa có cập nhật.
