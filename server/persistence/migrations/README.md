# Database migrations

Business collections are introduced with their modules, using the schema and indexes in Database Design. No business data is seeded by the foundation, ngoại trừ document baseline lifetime của statistics do migration 20261124000100-ensure-lifetime-statistics tạo cho DB rỗng.

Add an ES module named `YYYYMMDDHHmmss-description.js` exporting `async function up(db)`. Use a JSDoc `import('mongoose').mongo.Db` parameter type. Each migration must check its preconditions, create or verify validators/indexes explicitly, and be safe to rerun after partial failure. Compare existing index keys/options; stop on conflicting definitions or duplicate data. Do not silently drop indexes, delete duplicates or overwrite published revisions.

Run `npm run db:status`, then `npm run db:migrate` against the intended database. Applied files are recorded with a SHA-256 checksum and must never be edited or removed. Add a forward migration for changes. A database lock prevents concurrent migration runners. If a process is killed, inspect the migration and ensure no runner is active before removing `_migration_lock` document `exclusive`; rerun the idempotent migration.

Collection/index DDL is not wrapped in a transaction. Multi-document data changes can use a separate short transaction with primary/snapshot/majority settings. Do not call external services inside a transaction. Back up persistent data before changing it. Application startup never runs migrations or creates indexes automatically.

## Hướng dẫn vận hành: Khởi tạo Lifetime Statistics (BE-034)

Migration `20261124000100-ensure-lifetime-statistics.js` đảm bảo khởi tạo document `_id: 'lifetime'` với 4 bộ đếm tích lũy (`registeredAccounts`, `startedSessions`, `reviewCount`, `submittedQuizCount`) bằng 0.

### Cơ chế an toàn và thứ tự khởi tạo

- **Thứ tự trên DB mới**: Luôn chạy migration trước khi seed (`npm run db:migrate` trước `npm run db:seed` theo 06 §13.1).
- **Database mới (chưa có dữ liệu nghiệp vụ)**: Migration tự động tạo document `lifetime` với 4 giá trị bằng `0` (`$setOnInsert`).
- **Database đã có dữ liệu trước BE-034 hoặc restore thiếu document `lifetime`**: Nếu bất kỳ bảng nào trong `users`, `practice_sessions`, `review_logs`, `quiz_attempts` đã có dữ liệu mà chưa có document `lifetime`, migration **dừng với lỗi** (không ghi vào `_schema_migrations`) và không tự tạo số 0 giả mạo (06 §9, 07 §10). Lý do: khi thiếu bộ đếm, đăng ký, review, nộp quiz và bắt đầu phiên đều rollback (BE-034), nên không được để triển khai tiếp tục khi chưa có baseline đã xác minh.
- **Sau khi chèn baseline đã xác minh**: chạy lại `npm run db:migrate`; migration thấy document đã có và hoàn tất mà không sửa gì.
- **Kiểm tra sau triển khai hoặc restore**: `GET /admin/statistics` phải trả `200` với bốn số. Nếu trả `503`, các luồng đăng ký, review, nộp quiz và bắt đầu phiên sẽ không hoàn tất cho đến khi document hợp lệ.

### Quy trình tạo baseline thủ công trên Production

Khi triển khai lên database đã có dữ liệu từ trước hoặc sau khi khôi phục snapshot thiếu document `lifetime`, DevOps/vận hành cần thực hiện **trước** `npm run db:migrate`:

1. **Đối chiếu số liệu chính xác**:
   - `startedSessions`, `reviewCount`, `submittedQuizCount`: **Chỉ lấy từ snapshot hoặc nguồn sao lưu đã xác minh, tuyệt đối không đếm lại từ các collection hiện có** vì log của khách và thẻ thủ công đã bị xóa định kỳ (06 §9, 06 §12.2).
   - `registeredAccounts`: Có thể đối chiếu bằng `db.users.countDocuments({})`, và **phải tính cả tài khoản Admin** (06 §9).
2. **Thực thi lệnh Mongo shell (chỉ chạy một lần duy nhất)**:
   ```javascript
   db.statistics.insertOne({
     _id: 'lifetime',
     registeredAccounts: <số_user_đã_đối_chiếu_gồm_Admin>,
     startedSessions: <giá_trị_từ_snapshot>,
     reviewCount: <giá_trị_từ_snapshot>,
     submittedQuizCount: <giá_trị_từ_snapshot>,
     updatedAt: new Date()
   });
   ```
3. **Xác nhận sau can thiệp**: Gọi `GET /api/v1/admin/statistics` (với cookie Admin) và xác nhận API trả về `200 OK` với đầy đủ bốn bộ đếm.
