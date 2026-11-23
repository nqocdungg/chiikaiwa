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
