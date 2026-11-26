# Checklist Biên soạn & Rà soát Học liệu Seed (PB-31 / DATA-001)

Tài liệu này xác định các tiêu chí bắt buộc khi biên soạn dữ liệu học liệu seed (N5–N1) trước khi xuất bản vào cơ sở dữ liệu. Được sử dụng cho các đợt biên soạn `DATA-001`, `DATA-002`, `DATA-003`, `DATA-004`, `DATA-005`.

## 1. Tiêu chí số lượng tối thiểu (PB-31 & Tổng quan §5.1)

- [ ] **Tổng số tình huống:** Tối thiểu **25 tình huống** toàn hệ thống.
- [ ] **Phân bổ theo cấp độ JLPT:**
  - [ ] **N5:** Tối thiểu 5 tình huống hoàn chỉnh.
  - [ ] **N4:** Tối thiểu 5 tình huống hoàn chỉnh.
  - [ ] **N3:** Tối thiểu 5 tình huống hoàn chỉnh.
  - [ ] **N2:** Tối thiểu 5 tình huống hoàn chỉnh.
  - [ ] **N1:** Tối thiểu 5 tình huống hoàn chỉnh.
- [ ] **Tỷ lệ Quiz:** Mỗi tình huống bắt buộc có ít nhất **3 câu hỏi quiz** (tổng cộng tối thiểu 75 câu quiz toàn hệ thống).
- [ ] **Bộ chủ đề (Deck):** Mỗi cấp độ có ít nhất 1 bộ chủ đề; bộ dùng cho demo bốc bài có nhiều tình huống.

---

## 2. Tiêu chí chất lượng & cấu trúc dữ liệu (Database Design §7.1 & §7.2)

### Quy chuẩn định danh (Content Item & Content Version)

- [ ] Mỗi record có `contentId` (hoặc `_id` item): chuỗi ObjectId 24 ký tự hex đại diện cho định danh bền vững của học liệu (`content_items`).
- [ ] Mỗi record có `versionId`: chuỗi ObjectId 24 ký tự hex đại diện cho bản xuất bản (`content_versions`), với `revision` nguyên dương (bắt đầu từ `1`).
- [ ] Các mối quan hệ liên kết giữa các bản xuất bản trỏ tới `versionId` của bản ghi đích theo đúng hợp đồng Database Design §7.2 (`knowledgeVersionIds`, `questionVersionIds`, `scenarioVersionIds`).

### Thẻ tình huống (Scenario)

- [ ] Có bối cảnh (`context`) rõ ràng, mô tả tình huống giao tiếp đời thực.
- [ ] Có mục tiêu giao tiếp (`objective`) cụ thể để hai người học đo lường mức độ hoàn thành khi kết thúc.
- [ ] Có 2 vai độc lập (`roleA`, `roleB`), thể hiện rõ vai trò của từng người (người mua / người bán, bạn bè, đồng nghiệp...), không để trống hoặc sao chép nguyên văn vai của nhau.
- [ ] Có ít nhất 1 gợi ý diễn đạt (`hints`).
- [ ] Chứa tối thiểu 3 ID câu hỏi quiz (`questionVersionIds`) liên quan trực tiếp đến tình huống.
- [ ] Liên kết đúng với các mục kiến thức (`knowledgeVersionIds`) tương ứng.

### Kiến thức (Knowledge)

- [ ] Phân loại đúng loại: `vocabulary` (từ vựng) hoặc `grammar` (cấu trúc ngữ pháp).
- [ ] Có cách đọc (`reading`), giải nghĩa tiếng Việt (`meaning`) chuẩn xác.
- [ ] Có ít nhất 1 câu ví dụ song ngữ Nhật - Việt (`examples`) minh họa cách dùng trong ngữ cảnh.

### Câu hỏi Quiz (Question)

- [ ] **Trắc nghiệm (`multipleChoice`):**
  - Có mảng `options` chứa ít nhất 2 phương án lựa chọn.
  - Mỗi option có `id` duy nhất và nội dung `text` không rỗng.
  - Có `correctOptionId` hợp lệ và bắt buộc phải nằm trong danh sách `options`.
- [ ] **Điền ngắn (`shortAnswer`):**
  - Có mảng `acceptedAnswers` chứa ít nhất 1 đáp án được chấp nhận.
- [ ] Có giải thích (`explanation`) chi tiết vì sao đáp án đó đúng.
- [ ] Liên kết đúng tới `knowledgeVersionIds` nguồn nếu câu hỏi kiểm tra kiến thức đó.

### Bộ chủ đề (Deck)

- [ ] Tiêu đề (`title`) và khóa chủ đề (`topicKey`) rõ ràng.
- [ ] Cấp độ (`level`) thuộc một trong các cấp: `N5`, `N4`, `N3`, `N2`, `N1`.
- [ ] Mô tả (`description`) khái quát mục tiêu của bộ.
- [ ] Mảng `scenarioVersionIds` chứa ít nhất 1 tình huống hợp lệ.
- [ ] Danh sách `knowledgeVersionIds` và `questionVersionIds` được hợp nhất đầy đủ từ các tình huống trong bộ.

---

## 3. Quy trình rà soát học liệu (Review Workflow)

1. **Biên soạn:** Nhóm biên soạn nhập liệu vào file module dữ liệu JavaScript hoặc JSON.
2. **Kiểm tra tự động (Automated Quality Gate):**
   - Chạy hàm `validateSeedDataset(dataset)` từ `server/modules/content/content-validator.js`.
   - Kết quả phải đạt `isValid = true` và mảng `errors` rỗng trước khi chuyển sang bước tiếp theo.
3. **Kiểm tra nghiệp vụ tiếng Nhật:**
   - Người review chuyên môn kiểm tra tính tự nhiên của câu thoại, độ chính xác của ngữ pháp và từ vựng, mức độ phân loại phù hợp với cấp độ JLPT (N5–N1).
4. **Nghiệm thu & Seed:**
   - Sau khi review đạt, dữ liệu được chuyển giao cho script seed `DATA-002` để nạp an toàn vào cơ sở dữ liệu.

## 4. Bộ học liệu N5–N1 v2

[Manifest v2](../../server/persistence/seed/topic-content-v2.json) gồm 20 bộ, 60 tình huống, 306 mục kiến thức và 367 câu quiz. Phiếu review theo từng `seedKey` nằm trong `metadata.scenarioReviewBySeedKey`. Người duyệt khác tác giả cần xác nhận tiếng Nhật, bản dịch, cấp độ, ngữ vực, gợi ý, phương án nhiễu và nguồn trước khi xuất bản.

### Kiểm tra seed trên replica set tạm

```sh
npx vitest run --project integration tests/integration/topic-content-v2.integration.test.js
```

Ca kiểm thử trỏ tới replica set tạm độc lập với `.env`. Nó dùng cùng bộ chuyển manifest với lệnh seed v2, chạy seed hai lần rồi đối chiếu bộ theo cấp, kiến thức và số tình huống mỗi bộ. Dữ liệu xuất bản trong ca kiểm thử phục vụ kiểm tra luồng đọc.

### Nạp bản đã duyệt

Sau khi hoàn tất review độc lập, ghi `humanReviewer` và `reviewStatus: "approved"` vào phiếu của từng tình huống, khớp với `scenarioVersionId` được duyệt. Đặt `reviewStatus` của manifest thành `"approved"` khi đã duyệt đủ. Dùng `npm run db:status` để xác nhận database đích đã có các migration theo [hướng dẫn thiết lập](local.md).

```sh
npm run db:seed:topics -- chiikaiwa_dev
```

Chạy với URI của môi trường đích và tên database trùng `MONGODB_DB_NAME`. Lệnh hỗ trợ dev, demo và test. Nó yêu cầu sẵn một Admin đang hoạt động và kiểm tra trạng thái duyệt trước khi kết nối. Sau khi xác nhận bộ mới xuất hiện đúng cấp và dữ liệu đọc được, dùng thao tác **Ẩn** của Admin với đúng các bộ cũ đã được đối chiếu bên dưới. Bản đã dùng trong lịch sử vẫn truy được qua revision đã lưu.

### Đối chiếu trước khi thay dữ liệu đã xuất bản

Các mục dưới đây là ứng viên đối chiếu từ source seed hiện tại. Xác nhận lại với database đích, vì phiên bản đang xuất bản và bản đã lưu trong lịch sử có thể khác source.

| Bộ trong seed hiện tại                      | contentId hiện tại         | Bộ v2 cần đối chiếu                                                                      |
| ------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| Quán cà phê & Nhà hàng · N5                 | `672000000000000000001001` | Quán cà phê · `b56b39e30e8337dcc5f4be53`                                                 |
| Giao tiếp Đời sống & Công sở Trung cấp · N3 | `672300000000000000001001` | Đối chiếu theo tình huống với Việc làm thêm, Thuê nhà và sinh hoạt, Dịch vụ và khiếu nại |
| Thương thảo & Quản trị Doanh nghiệp · N1    | `672500000000000000001001` | Đàm phán và quản trị · `6f8abc023397ff2ad10ea559`                                        |

Các từ có cùng cách viết và loại trong hai nguồn gồm `確認`, `都合`, `交換`, `予定` và `見通し`. Xác nhận nghĩa và cách dùng trước khi tái sử dụng ID. Khi đã xác nhận cùng mục kiến thức, giữ `contentId` hiện tại để người học tiếp tục dùng tiến độ FSRS và thêm revision nếu nội dung thay đổi.

`metadata.revisionMigrationBySeedKey` đối chiếu với manifest v1. Ca seed thử bắt đầu từ database trống. Nếu môi trường đích từng nạp bản v2 trước khi chỉnh, đối chiếu thêm các revision đã có của bản đó để xác định số revision tiếp theo.

Khi chuyển dữ liệu đã có trong project, lập ánh xạ từ ID thực tế, xác nhận các tham chiếu từ mục đã lưu, phiên, quiz và tiến độ rồi chọn bộ cũ cần ẩn. Giữ các revision mà lịch sử đã tham chiếu. Ghi lại danh mục trước và sau khi chuyển, kết quả chạy seed lần hai, và bằng chứng AT-13 theo QA-026.
