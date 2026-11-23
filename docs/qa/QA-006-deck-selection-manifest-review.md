# QA-006 — Rà soát contract chọn bộ chủ đề và manifest

- **Task ID:** QA-006 (Sprint 2)
- **Owner:** Hạnh Nhi (`HanhNhiDo`)
- **Reviewer:** Yến Nhi
- **PB References:** PB-12, PB-32
- **PR đã merge:** PR #52 (`test(sessions): review deck selection contract and manifest [QA-006]`), merge commit `7250727` (`7250727c2859e5f5feddbabbcc5e66b5a406bd15`) ngày `2026-11-16` (có `APPROVED` từ tài khoản GitHub `nt-thuyr`, body trống, chưa có quyết định bằng văn bản cho từng câu hỏi Q1/Q2b/Q3).
- **Cơ sở đối chiếu hiện tại:** `origin/develop@5d89d8c` (cùng đối chiếu tham khảo nhánh chưa merge `origin/feature/BE-022-session-card-flow@a173c8e` — PR #59 đang `OPEN`, 0 review).
- **Trạng thái:** Đã merge đối chiếu & fixtures ở PR #52; còn chờ quyết định chính thức cho Q1, Q2b, Q3 (chưa ghi `Done`).

---

## 1. Bối cảnh và phạm vi

Rà soát contract giữa các nguồn:

- [02-srs.md](../design/02-srs.md): `FR-CAR-01`, `FR-CAR-02`, `BR-12`, `BR-29`, `BR-30`, `NFR-05`–`NFR-09`, `NFR-11`.
- [04-ui-ux-design.md](../design/04-ui-ux-design.md): `UF-05`, `SC-08`.
- [06-database-design.md](../design/06-database-design.md): `§6.1` (`practice_sessions`), `§6.2` (`session_cards`), `§7.1` (`content_items`), `§7.2` (`content_versions`), `§11.2` (`TX-07`, `TX-11`), `§12.1` (`Projection`).
- [07-api-specification.md](../design/07-api-specification.md): `§1`–`§3`, `§6`, `§7`, `§12`.
- [openapi.yaml](../api/openapi.yaml) và source hiện có trên `origin/develop@5d89d8c`:
  - [content-dto.js](../../server/modules/content/content-dto.js)
  - [content-repository.js](../../server/modules/content/content-repository.js)
  - [content-validator.js](../../server/modules/content/content-validator.js)
  - [content-service.js](../../server/modules/content/content-service.js)
  - [content-learner-router.js](../../server/modules/content/content-learner-router.js)
  - [session-projection.js](../../server/modules/sessions/session-projection.js)
  - [session-service.js](../../server/modules/sessions/session-service.js)
  - [sessions-router.js](../../server/modules/sessions/sessions-router.js)
  - [DeckPicker.jsx](../../client/src/features/kaiwa/components/DeckPicker.jsx) (đã merge qua FE-004 / PR #56)

> **Phân biệt code đã merge và nhánh chưa merge:**
>
> - **Đã merge trên `origin/develop@5d89d8c`:** `docs/design/07-api-specification.md` §6 vẫn chỉ có 5 trường `{id, versionId, title, level, description}`; `docs/api/openapi.yaml` và `sessions-router.js` chưa có `GET /sessions/:id/deck-options`, `POST /sessions/:id/deck-selection` hay `POST /sessions/:id/control/claim`; `FE-004` (PR #56) đã merge `DeckPicker.jsx` hiển thị `{deck.count} tình huống`.
> - **Chỉ tồn tại trên nhánh chưa merge `origin/feature/BE-022-session-card-flow@a173c8e` (PR #59 `OPEN`, chưa review/merge):** đã triển khai nháp các endpoint trên và đề xuất sửa `07-api-specification.md` / `openapi.yaml` theo hướng bổ sung `scenarioCount` (Q1), giữ nguyên `limit?, cursor?` (Q2a), trả `409 SESSION_ENDED` khi phiên kết thúc (Q2b) và trả `404 RESOURCE_NOT_FOUND` khi chọn bộ ẩn/nháp/revision cũ/sai loại (Q3). Các thay đổi này chưa được duyệt hay tích hợp vào `develop`, nên chưa được xem là contract đã chấp thuận.

---

## 2. Bảng đối chiếu contract (Yêu cầu → Nguồn → Field/Response → Implementation → Điểm thiếu/Mâu thuẫn)

### 2.1. Dữ liệu FE cần hiển thị & chọn bộ (`SC-08`, `FR-CAR-01`, `FR-CAR-02`)

| Yêu cầu                                                                               | Tài liệu nguồn                                                         | Field / Response theo thiết kế                                                                                                                                                                                                                                                          | Implementation hiện có (`origin/develop`)                                                                                                                                                    | Điểm thiếu / Mâu thuẫn                                                                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Hiển thị danh sách bộ đã xuất bản với **chủ đề, cấp độ, số tình huống** trên cả 2 máy | `02-srs.md` `FR-CAR-01` (#L262); `04-ui-ux-design.md` `SC-08` (#L148)  | `07 §6` (#L156): `GET /sessions/:id/deck-options` trả `200` danh sách `{id, versionId, title, level, description}`                                                                                                                                                                      | **Chưa triển khai** trên `develop` (`sessions-router.js` mới có `GET /:id`, `POST /:id/leave`, `POST /:id/media-token`). Chưa có trong `openapi.yaml`.                                       | **Mâu thuẫn (Blocker Q1):** `07 §6` thiếu trường **`scenarioCount`**, trong khi `FR-CAR-01` bắt buộc nhận biết "số tình huống". |
| Hỗ trợ cấp độ N5–N1 khi xem danh sách chọn bộ                                         | `02-srs.md` `FR-CAR-01` (#L262); `06 §7.1` (#L264)                     | `07 §6` (#L156): query chỉ ghi `limit?, cursor?` (khác `07 §7` `GET /topics` có `level?, limit?, cursor?`).                                                                                                                                                                             | `GET /topics` hỗ trợ `level` (`N5`–`N1`); `deck-options` chưa có trên `develop`.                                                                                                             | **Cần làm rõ (Q2):** `GET /sessions/:id/deck-options` có cần query `level?` hay không?                                          |
| Hiển thị đồng hồ chọn bộ 60s, người giữ quyền điều khiển và nút lấy quyền             | `02-srs.md` `FR-CAR-02`, `BR-12`; `04-ui-ux-design.md` `SC-08` (#L170) | `07 §3` `Session` (#L86): `controllerKey?`, `selectionRemainingMs`, `status`, `version`, `deckVersionId?`. `07 §6`: `POST /sessions/:id/control/claim` (`{expectedVersion}`) → `200 Session`; `POST /sessions/:id/deck-selection` (`{expectedVersion, deckVersionId}`) → `200 Session`. | `session-projection.js` (#L48–66) đã project đủ `controllerKey`, `selectionRemainingMs`, `deckVersionId`, `version`, `status`. Hai endpoint `POST` chưa có trên `develop` và `openapi.yaml`. | **Khớp phần `Session` projection.** Thiếu endpoint & OpenAPI trên `develop` (thuộc phạm vi BE-022 sau khi chốt QA-006).         |

### 2.2. `scenarioCount`, `deck-options` và `manifest`

| Yêu cầu                                                                  | Tài liệu nguồn                                                | Field / Response theo thiết kế                                                                                                                                                                                              | Implementation hiện có (`origin/develop`)                                                                                                                                                                            | Điểm thiếu / Mâu thuẫn                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest bộ chủ đề hợp nhất lúc xuất bản                                 | `06 §7.2` (#L281, #L285, #L291)                               | `content_versions` (`kind: 'deck'`) lưu `payload`: `{title, topicKey, level, description, scenarioVersionIds, knowledgeVersionIds, questionVersionIds}`; kiểm tra BSON size, không 2 revision cùng `contentId`.             | `resolveDeckManifest` (`content-validator.js` #L1630+) hợp nhất `knowledgeVersionIds` và `questionVersionIds` từ scenarios + direct refs, loại trùng `versionId`, chặn `DUPLICATE_CONTENT_REVISION`, kiểm BSON size. | **Khớp.** Manifest đã lưu sẵn `scenarioVersionIds` trong `content_versions.payload`, đủ nguồn để tính `scenarioCount = payload.scenarioVersionIds.length`.                                                                                                |
| Nhất quán `scenarioCount` giữa `deck-options` và kho học liệu (`topics`) | `02-srs.md` `FR-CAR-01`; `07 §6` (#L156); `07 §7` (#L184–185) | `07 §6`: `deck-options` không có `scenarioCount`. `07 §7`: `GET /topics` trả `{id, versionId, title, level, description}`; `GET /topic-versions/:id` trả `{..., knowledgeCount, questionCount}` (không có `scenarioCount`). | `toTopicSummaryDto` (`content-dto.js` #L166) và `toTopicVersionDetailDto` (#L189) khớp `07 §7` & `openapi.yaml` (`TopicSummary`, `TopicVersionDetail`), đều chưa có `scenarioCount`.                                 | **Thiếu đồng bộ (Q1):** Nếu FE dùng chung card hiển thị bộ hoặc hiển thị số tình huống ở cả `SC-08` và `SC-11`, cần chốt thêm `scenarioCount` vào `deck-options` (bắt buộc theo `FR-CAR-01`) và cân nhắc bổ sung ở `TopicSummary` / `TopicVersionDetail`. |

### 2.3. ID / `version` / `revision` và toàn vẹn tham chiếu

| Yêu cầu                                                                                                         | Tài liệu nguồn                              | Field / Response theo thiết kế                                                                                                                                                                             | Implementation hiện có (`origin/develop`)                                                                                                                                                            | Điểm thiếu / Mâu thuẫn                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phân biệt `id` (`contentId`), `versionId` (`publishedVersionId` / `deckVersionId`), `version` (CAS), `revision` | `06 §7.1–7.2`; `07 §3`, `§6`, `§7`          | `deck-options`: `id` = `content_items._id`, `versionId` = `content_items.publishedVersionId`. `deck-selection`: gửi `deckVersionId` (là `versionId`) + `expectedVersion` (là `practice_sessions.version`). | `content-dto.js` (#L169–176) map đúng `id` → `itemDoc._id`, `versionId` → `itemDoc.publishedVersionId`. `publishContentItemTx` (#L214–217) đồng bộ `level`, `title` lên `content_items` khi publish. | **Cần chốt xử lý lỗi (Q3):** Khi client gửi `deckVersionId` là `contentId` (nhầm ID), thuộc revision cũ không còn là `publishedVersionId`, hoặc thuộc bộ đã `hidden`, `07 §12` chưa quy định rõ mã lỗi (`404` vs `409` vs `422`). |
| Toàn vẹn tham chiếu khi xuất bản & chọn bộ                                                                      | `06 §7.2` (#L283, #L285); `06 §6.1` (#L217) | Tham chiếu phải đúng `kind`, tồn tại trong `content_versions`, không 2 revision của cùng `contentId`, bộ có ≥ 1 tình huống, tình huống có ≥ 3 câu hỏi.                                                     | `validatePublishCompleteness` (`content-validator.js` #L1274+) và `resolveDeckManifest` (#L1630+) kiểm tra đủ `kind`, tồn tại `content_versions`, ngưỡng tối thiểu và `DUPLICATE_CONTENT_REVISION`.  | **Lưu ý:** `resolveDeckManifest` kiểm tra sự tồn tại trong `content_versions` (tức đã từng publish) nhưng không chặn nếu `content_items` của scenario/knowledge/question con bị đặt `hidden` sau đó.                              |

### 2.4. Quyền truy cập, `published` / `hidden` / `empty` và `draft` / `reference`

| Yêu cầu                                               | Tài liệu nguồn                                                 | Field / Response theo thiết kế                                                                                                                                                                                                                            | Implementation hiện có (`origin/develop`)                                                                                                                                                                             | Điểm thiếu / Mâu thuẫn                                                                                                                                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quyền `M` (thành viên `U` hoặc `G` của phiên)         | `07 §2.1` (#L41, #L48), `§6` (#L156–158); `02-srs.md` `NFR-06` | Chỉ 2 thành viên phiên được gọi `deck-options`, `deck-selection`, `control/claim`; ngoài phạm vi trả `404 RESOURCE_NOT_FOUND`. Guest hết hạn trả `410 GUEST_EXPIRED`; không phải `controllerKey` trả `403 CONTROL_REQUIRED`.                              | `sessions-router.js` dùng `requireAuth(['U', 'G'])` và kiểm tra membership trong service (`404` cho non-member). `assertDeckVersionSourceAccess` (`content-service.js` #L874+) kiểm tra nguồn lịch sử/ẩn cho `U`/`G`. | **Khớp.**                                                                                                                                                                                                                                     |
| Lọc `published` / loại trừ `hidden`, `draft`, bộ rỗng | `02-srs.md` `FR-CAR-01`; `06 §7.1–7.2` (#L270, #L287)          | Chỉ bộ `status === 'published'` và có `publishedVersionId !== null` xuất hiện trong `deck-options`. Bộ `hidden` không được chọn mới nhưng phiên đã chọn trước khi ẩn vẫn đọc được. Bộ rỗng (`0` scenario) bị chặn lúc publish (`422 CONTENT_INCOMPLETE`). | `queryPublishedTopics` (`content-repository.js` #L353–357) lọc `{ kind: 'deck', status: 'published', publishedVersionId: { $ne: null } }`. `hideContentItemCas` (#L282–286) giữ nguyên `publishedVersionId`.          | **Khớp** ở tầng repository/publish. **Cần cảnh báo (Q4):** `toTopicSummaryDto` (`content-dto.js` #L167) có fallback `versionDoc?.payload ?? itemDoc.draftPayload ?? {}` — nếu `versionDoc` thiếu sẽ có nguy cơ lộ `draftPayload.description`. |
| Trạng thái danh sách rỗng (`empty`)                   | `04-ui-ux-design.md` `§6` (#L187)                              | Khi không có bộ `published` nào: trả `200 { data: { items: [], nextCursor: null }, meta }`.                                                                                                                                                               | `listPublishedTopics` (`content-service.js` #L852–860) trả `{ items: [], nextCursor: null }`.                                                                                                                         | **Khớp.**                                                                                                                                                                                                                                     |

### 2.5. Projection không lộ lá chưa bốc, vai riêng hoặc đáp án

| Yêu cầu                                                      | Tài liệu nguồn                                               | Field / Response theo thiết kế                                                                                                                                                                                                     | Implementation hiện có (`origin/develop`)                                                                                                                                                                           | Điểm thiếu / Mâu thuẫn                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `deck-options` không lộ manifest chi tiết, vai hoặc đáp án   | `06 §12.1` (#L507, #L509); `07 §6` (#L156)                   | Chỉ trả metadata tóm tắt bộ (`id`, `versionId`, `title`, `level`, `description`, và `scenarioCount` sau khi chốt). Không trả `scenarioVersionIds`, `knowledgeVersionIds`, `questionVersionIds`, `draftPayload`, `roleA/B`, đáp án. | `toTopicSummaryDto` (`content-dto.js` #L166–181) chỉ trả 5 trường tóm tắt (trừ rủi ro fallback `draftPayload` ở Q4).                                                                                                | **Khớp** về cấu trúc DTO (chỉ cần bỏ fallback `draftPayload`). |
| `Session` sau `deck-selection` không lộ lá úp và vai đối tác | `06 §6.2` (#L242, #L246), `§12.1` (#L507); `07 §3` (#L86–88) | `slots`: chỉ `[{slot, status}]` (không `scenarioVersionId`, không nội dung). `currentCard`: chỉ có khi đã bốc và chỉ trả `myRole` theo `actorKey`.                                                                                 | `projectSession` (`session-projection.js` #L54, #L88–109): `slots` chỉ map `{ slot: card.slot, status: card.status }`; `currentCard` chỉ set `myRole` theo `roleAKey === actorKey ? payload.roleA : payload.roleB`. | **Khớp hoàn toàn.**                                            |

---

## 3. Các quyết định còn thiếu & phân loại findings

### Q1 (Blocker — Chưa tìm thấy quyết định chính thức; sai khác yêu cầu UI/SRS vs contract API): Thiếu `scenarioCount` trong `GET /sessions/:id/deck-options`

- **Nguồn:** `02-srs.md` `FR-CAR-01` (#L262); `04-ui-ux-design.md` `SC-08` (#L148); `07-api-specification.md` `§6` (#L156), `§7` (#L184–185); `06-database-design.md` `§7.2` (#L281); [DeckPicker.jsx](../../client/src/features/kaiwa/components/DeckPicker.jsx) (`#L4`, `#L28`).
- **Bằng chứng:**
  - `FR-CAR-01` quy định: _"Hệ thống phải cho cả hai xem cùng danh sách bộ đã xuất bản, nhận biết chủ đề, cấp độ và số tình huống."_
  - Trên `origin/develop@5d89d8c` (đã merge): `07 §6` (#L156) chỉ đặc tả `GET /sessions/:id/deck-options` trả `{id, versionId, title, level, description}`, không có `scenarioCount`; `openapi.yaml` chưa có endpoint này. Trong `content_versions` (`kind: 'deck'`, `06 §7.2`), mảng `payload.scenarioVersionIds` đã có sẵn để đếm. Ngoài ra, `FE-004` (PR #56, đã merge) đã đưa `DeckPicker.jsx` lên `develop` với phần hiển thị `{deck.count} tình huống`.
  - Trên nhánh chưa merge `origin/feature/BE-022-session-card-flow@a173c8e` (PR #59 `OPEN`, 0 review): đã triển khai `scenarioCount` từ `scenarioVersionIds` và đề xuất cập nhật `07 §6` + `openapi.yaml` (`minimum: 0`, chưa đồng bộ `07 §7`), nhưng chưa được duyệt hoặc merge.
- **Ảnh hưởng:** Chặn FE hiển thị số tình huống ở `SC-08` trước khi chọn bộ; nếu không chốt, `BE-022` và `FE` có thể dùng DTO hoặc ràng buộc (`minimum: 1` vs `0`) khác nhau.
- **Đề xuất tối thiểu & nơi cần đồng bộ (chưa phải contract đã chấp thuận):**
  - Bổ sung `scenarioCount: integer` (`>= 1`) vào response item của `GET /sessions/:id/deck-options` (tính từ số `payload.scenarioVersionIds` phân biệt).
  - Nơi cần đồng bộ khi được duyệt: `docs/design/07-api-specification.md` (`§6`, và cân nhắc đồng bộ `§7` cho `GET /topics` / `GET /topic-versions/:id`), `docs/api/openapi.yaml`, implementation `BE-022` và client `FE` (`SC-08`).
- **Người cần quyết định:** Reviewer **Yến Nhi** cùng nhóm (Product/BE/FE).

### Q2 — Tách đề xuất `level` filter và câu hỏi quyền/trạng thái phiên ở `GET /sessions/:id/deck-options`

#### Q2a (Đề xuất tùy chọn — Không phải blocker): Hỗ trợ query `level?` trên `GET /sessions/:id/deck-options`

- **Nguồn:** `02-srs.md` `FR-CAR-01` (#L262); `07-api-specification.md` `§6` (#L156) vs `§7` (#L184).
- **Bằng chứng:** `GET /topics` (`07 §7`) có `level?, limit?, cursor?`, còn `GET /sessions/:id/deck-options` (`07 §6`) chỉ có `limit?, cursor?`. `FR-CAR-01` chỉ yêu cầu _"Danh sách hỗ trợ N5–N1"_, không bắt buộc query param `level` ở API phòng. Nhánh chưa merge `BE-022@a173c8e` (PR #59) cũng giữ nguyên `limit?, cursor?`.
- **Ảnh hưởng:** Không chặn triển khai `BE-022`/`FE` nếu FE lọc cục bộ hoặc hiển thị chung tất cả bộ.
- **Khuyến nghị:** Giữ là đề xuất tùy chọn; không cần thay đổi contract nếu nhóm không yêu cầu lọc phía server.
- **Người cần quyết định:** Reviewer **Yến Nhi** và **FE/BE**.

#### Q2b (Cần chốt nghiệp vụ — Chưa tìm thấy quyết định chính thức): Điều kiện trạng thái phiên khi gọi `GET /sessions/:id/deck-options`

- **Nguồn:** `02-srs.md` `FR-CAR-02`, `BR-12` (#L143); `06-database-design.md` `§6.1` (#L210–218); `07-api-specification.md` `§6` (#L156, #L170, #L178), `§12` (#L298).
- **Bằng chứng:**
  - Trên `origin/develop@5d89d8c`: `07 §6` (#L170, #L178) quy định điều kiện _chọn bộ_ (`POST /deck-selection`) và việc phiên `ended` từ chối token/draw/chọn bộ/action, nhưng chưa nêu rõ `GET /sessions/:id/deck-options` có bị chặn khi phiên đang `preparing`, `reconnecting` hoặc `ended` hay không.
  - Trên nhánh chưa merge `origin/feature/BE-022-session-card-flow@a173c8e` (PR #59 `OPEN`, 0 review): đã triển khai cho phép thành viên đọc khi phiên chưa `ended`, reconcile deadline và trả `409 SESSION_ENDED` khi phiên đã `ended` (kèm đề xuất cập nhật `07 §6` và `openapi.yaml`), nhưng chưa được duyệt hoặc merge.
- **Ảnh hưởng:** Nếu không thống nhất, BE có thể trả danh sách cho phiên `ended` hoặc chặn nhầm lúc một bên vừa mất kết nối tạm (`reconnecting`).
- **Khuyến nghị (chưa phải contract đã chấp thuận):** Cho phép thành viên đọc khi phiên chưa `ended` (`preparing`, `active`, `reconnecting`); trả `409 SESSION_ENDED` nếu phiên đã `ended` (sau khi reconcile deadline, theo mã lỗi hiện có tại `07 §12`).
- **Người cần quyết định:** Reviewer **Yến Nhi** và **BE-022**.

### Q3 (Cần chốt — Chưa tìm thấy quyết định chính thức; khoảng trống quy tắc lỗi): `POST /sessions/:id/deck-selection` khi `deckVersionId` ẩn, nháp, revision cũ hoặc sai loại

- **Nguồn:** `06-database-design.md` `§7.2` (#L287); `07-api-specification.md` `§6` (#L157, #L170), `§12` (#L294–304).
- **Bằng chứng:**
  - `06 §7.2` (#L287) quy định: _"Danh mục chọn mới lấy bộ đang published và publishedVersionId."_
  - Bảng mã lỗi `07 §12` hiện có các mã liên quan: `404 RESOURCE_NOT_FOUND`, `403 CONTROL_REQUIRED`, `409 DECK_ALREADY_SELECTED`, `409 INVALID_SESSION_STATE`, `409 SESSION_ENDED`, `409 SESSION_RECONNECTING`, `409 VERSION_CONFLICT`, `422 VALIDATION_FAILED`.
  - Trên `origin/develop@5d89d8c`: `07 §6` và `§12` chưa quy định cụ thể mã lỗi cho 3 trường hợp hợp lệ về cú pháp ObjectId nhưng không hợp lệ để chọn mới:
    1. `deckVersionId` thuộc bộ đang `status: 'hidden'` hoặc `'draft'` (ví dụ: tại t=10s hai người tải `deck-options` thấy bộ A; tại t=20s Admin ẩn bộ A; tại t=25s controller gửi `deck-selection` với bộ A).
    2. `deckVersionId` là một revision cũ (`content_versions._id` tồn tại nhưng không còn là `content_items.publishedVersionId` hiện tại do Admin vừa xuất bản revision mới).
    3. `deckVersionId` thực chất là `contentId` (`content_items._id`) hoặc ID của `scenario`/`knowledge`/`question` thay vì `deck` version.
  - Trên nhánh chưa merge `origin/feature/BE-022-session-card-flow@a173c8e` (PR #59 `OPEN`, 0 review): đang triển khai trả chung `404 RESOURCE_NOT_FOUND` cho cả 3 trường hợp trên (riêng bộ 0 tình huống trả `409 DECK_EXHAUSTED`) và đề xuất ghi quy tắc này vào `07 §6` + `openapi.yaml`, nhưng chưa được duyệt hoặc merge.
- **Ảnh hưởng:** FE `SC-08` cần phân biệt tình huống dữ liệu cũ do race với Admin (để tải lại `deck-options`) với lỗi tài nguyên không tồn tại hoặc sai input; nếu không chốt, mỗi endpoint/task có thể tự trả mã khác nhau.
- **Các phương án đối chiếu theo quy tắc lỗi hiện có (chưa phải contract đã chấp thuận):**
  - _Phương án 1:_ Dùng `404 RESOURCE_NOT_FOUND` cho trường hợp (3) không tồn tại/sai kind, và dùng `409 INVALID_SESSION_STATE` (hoặc trình nhóm xem xét bổ sung mã riêng vào `07 §12` nếu muốn tách trạng thái bộ khỏi trạng thái phiên) cho (1) & (2) để client tải lại `deck-options`.
  - _Phương án 2:_ Dùng chung `404 RESOURCE_NOT_FOUND` cho cả (1), (2), (3) theo nguyên tắc tài nguyên không còn trong phạm vi chọn mới.
- **Người cần quyết định:** Reviewer **Yến Nhi** cùng nhóm thiết kế API/BE-022/FE.

### Q4 (Rủi ro phòng thủ — Chưa chứng minh đường lỗi trong vận hành bình thường): Fallback `draftPayload` trong `toTopicSummaryDto`

- **Nguồn:** `06-database-design.md` `§12.1` (#L509); `server/modules/content/content-dto.js` (#L166–181); `server/modules/content/content-service.js` (#L807–861); `server/modules/content/content-repository.js` (#L203–217, #L345–383).
- **Bằng chứng truy vết (kiểm tra lại trên `origin/develop@5d89d8c`):**
  - Đã grep toàn bộ `server/`, `client/` và `tests/`: caller duy nhất của `toTopicSummaryDto(itemDoc, versionDoc)` vẫn là `listPublishedTopics` (`content-service.js#L857`). Nhánh chưa merge `BE-022@a173c8e` không gọi `toTopicSummaryDto` mà đọc trực tiếp `version.payload` theo hướng fail-closed.
  - `listPublishedTopics` gọi `queryPublishedTopics` (`content-repository.js#L353-357`) lọc `{ kind: 'deck', status: 'published', publishedVersionId: { $ne: null } }`, sau đó load `content_versions` qua `findContentVersionsByIds`.
  - Trong luồng bình thường (`publishContentItemTx` / `seedContentDataset`), `content_versions` được chèn cùng transaction với việc gán `publishedVersionId` và là bản bất biến không bị xóa. Vì vậy `versionDoc` luôn tồn tại khi dữ liệu toàn vẹn; `versionDoc` chỉ thiếu nếu DB bị hỏng tham chiếu (`publishedVersionId` mồ côi).
  - Tuy nhiên, dòng `const payload = versionDoc?.payload ?? itemDoc.draftPayload ?? {};` tại `content-dto.js#L167` vẫn còn nhánh fallback về `itemDoc.draftPayload`.
- **Ảnh hưởng:** Chưa chứng minh được đường lộ `draftPayload` trong vận hành bình thường; đây là **rủi ro phòng thủ** nếu xảy ra lỗi dữ liệu mồ côi hoặc khi có caller mới truyền thiếu `versionDoc`.
- **Khuyến nghị:** Khi có task chỉnh sửa module `content`, bỏ fallback `itemDoc.draftPayload` tại `toTopicSummaryDto` (fail-closed hoặc bỏ qua item thiếu `versionDoc`).
- **Người cần quyết định:** Reviewer **Yến Nhi** và owner module `content`.

---

## 4. Fixtures đã chuẩn bị (phân tách phần contract vs đề xuất)

Đã tạo [deck-selection-fixtures.js](../../tests/fixtures/deck-selection-fixtures.js) theo convention của `tests/fixtures/`, phân tách rõ:

- **Phần theo contract hiện hành (`06 §7.2`, `07 §6`):**
  - `DECK_SELECTION_CONTENT_VERSIONS`: đầy đủ `knowledge`, `question` (3 câu `multipleChoice` + `shortAnswer`), `scenario` (2 tình huống bộ `published` + 1 tình huống bộ `hidden`), `deck` (`publishedDeckV1`, `hiddenDeckV1`) với ID hex 24 ký tự và toàn vẹn tham chiếu.
  - `DECK_SELECTION_CONTENT_ITEMS`: `publishedDeck` (kèm `draftPayload` chứa chuỗi `DRAFT_LEAK_GUARD`), `hiddenDeck` (giữ `publishedVersionId` cho lịch sử), `draftDeck`, `emptyDraftDeck` (0 tình huống).
  - `createSelectingSessionFixture` & `SESSION_FACE_DOWN_CARDS_FIXTURE`: phiên `active` đang chọn bộ (60s) và 2 lá úp `faceDown`.
  - `CONTRACT_DECK_OPTION_PROJECTIONS` (`withMixedCatalog`, `emptyCatalog`): đúng 5 trường `{ id, versionId, title, level, description }` theo `07 §6` hiện hành, **không** đưa `scenarioCount` vào expected contract chính thức.
  - `FORBIDDEN_PROJECTION_FIELDS`: các trường bị cấm trong `deck-options` và `Session.slots` (`faceDown`).
- **Phần đề xuất chờ duyệt (`PROPOSED_DECK_OPTION_EXTENSIONS`):**
  - `publishedDeckScenarioCount: 2` (tách riêng, chỉ đưa vào expected chính thức sau khi Q1 được reviewer và nhóm chốt).

**Điểm cần reviewer (Yến Nhi) duyệt:**

1. Duyệt bộ dữ liệu `published` / `hidden` / `draft` / `empty` và `FORBIDDEN_PROJECTION_FIELDS` trong [deck-selection-fixtures.js](../../tests/fixtures/deck-selection-fixtures.js).
2. Chốt các quyết định Q1–Q4 (đặc biệt Q1 `scenarioCount` và Q3 mã lỗi `deck-selection`).

---

## 5. Kết quả kiểm chứng và bằng chứng review

- **Bằng chứng PR #52 (đã merge vào `develop`):**
  - Merge commit: `7250727` (`7250727c2859e5f5feddbabbcc5e66b5a406bd15`), ngày `2026-11-16` (`2026-11-16T10:03:16Z`).
  - Review trên GitHub: tài khoản `nt-thuyr` đã gửi `APPROVED` lúc `2026-11-16T10:03:04Z` với body trống (0 review comments). Đây là bằng chứng review/approval hợp lệ cho PR #52 (không suy đoán mapping tài khoản GitHub nếu chưa xác minh), nhưng không thay thế cho quyết định bằng văn bản của nhóm đối với từng câu hỏi Q1, Q2b và Q3.
  - Kiểm chứng tự động tại PR #52 (`Node v24.22.1`, `npm@11.21.1`): `corepack npm ci` và `corepack npm run check` pass (format, lint 0 warnings, typecheck 0 errors, 25 files / 349 unit/HTTP/component tests, 16 files / 183 integration tests trên MongoDB replica set tạm, build và Storybook).
- **Rà soát lại trên `origin/develop@5d89d8c` (2026-11-22):**
  - Xác minh `docs/design/01–07`, `server/modules/content/`, `server/persistence/models/` và `tests/fixtures/deck-selection-fixtures.js` không có thay đổi làm sai lệch fixtures kể từ `93f1593`.
  - Xác minh `FE-004` (PR #56, đã merge) đã có `DeckPicker.jsx` hiển thị `{deck.count} tình huống`; còn `BE-022` hiện mở PR #59 (`origin/feature/BE-022-session-card-flow@a173c8e`, 0 review, chưa merge).
  - Kiểm tra đợt cập nhật tài liệu trên nhánh `docs/QA-006-update-review-evidence`: format (`prettier --check`), kiểm tra liên kết tương đối và `git diff --check`. Không thay đổi code chức năng, fixture, `docs/design/01–07` hoặc `docs/api/openapi.yaml`.
