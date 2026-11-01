# Chiikaiwa — Đặc tả API

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản | 1.0 |
| Ngày | 28/10/2026 |
| Phạm vi | API MVP; backend Express, frontend React; cùng origin |
| Cơ sở | SRS, Kiến trúc hệ thống và Thiết kế cơ sở dữ liệu |
| Base URL | `/api/v1` |

## 1. Quy ước giao tiếp

API dùng HTTPS ở môi trường triển khai, JSON UTF-8 và tên trường camelCase. Đường dẫn trong các bảng tính từ base URL. ID tài nguyên là chuỗi ObjectId 24 ký tự hex; operation ID là UUID do client tạo. Ngày giờ là ISO 8601 UTC; version là số nguyên không âm. `?` chỉ trường tùy chọn. Trường không được liệt kê trong request bị từ chối, không truyền trực tiếp vào MongoDB.

Thành công có dạng `{data, meta: {requestId, serverTime}}`. Danh sách đặt trong `data.items`, có `data.nextCursor` là chuỗi hoặc null. Response 204 không có body. Tài nguyên được tạo trả 201 và Location nếu có endpoint đọc tương ứng. Lỗi có dạng:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Dữ liệu đã thay đổi. Vui lòng tải lại.",
    "details": {"currentVersion": 8}
  },
  "meta": {"requestId": "req-123", "serverTime": "2026-10-28T08:00:00.000Z"}
}
```

Không trả stack trace, query database, secret hoặc dữ liệu của người khác trong lỗi. Client xử lý bằng code, không so sánh message. Dữ liệu có xác thực và token dùng `Cache-Control: no-store`.

Danh sách dùng query `limit` mặc định 20, tối đa 50 và `cursor?`. Cursor do server tạo, gắn bộ lọc/thứ tự; không dùng cursor của truy vấn khác. Mặc định sắp createdAt giảm dần rồi ID giảm dần; lịch sử phiên dùng startedAt, mục đã lưu dùng savedAt, hàng đợi quản trị dùng createdAt. Không nhận tên trường sort tùy ý.

## 2. Xác thực và kiểm soát request

### 2.1. Quyền

| Ký hiệu | Quyền |
|---|---|
| P | Không yêu cầu đăng nhập |
| U | Tài khoản đang hoạt động |
| G | Khách còn quyền trong đúng lượt thử |
| M | Thành viên của phiên, là U hoặc G |
| A | Admin đang hoạt động |

JWT nằm trong cookie HttpOnly, Secure, SameSite=Lax, Path=/, không có Domain; hạn tuyệt đối tối đa 7 ngày. Backend kiểm tra auth session, trạng thái tài khoản và authVersion. Không trả JWT đăng nhập trong JSON và không lưu ở localStorage. Khách dùng cookie bí mật riêng, chỉ có quyền của lượt thử. Nếu có cả cookie tài khoản và khách hợp lệ, tài khoản là danh tính thực hiện; không tự chuyển dữ liệu khách vào tài khoản.

`GET /auth/csrf` trả `{csrfToken}` và thiết lập cookie bảo vệ cần thiết. Mọi request ghi từ browser, kể cả đăng nhập/đăng ký, gửi `X-CSRF-Token`; backend kiểm tra token và Origin theo allowlist. Webhook và maintenance dùng cơ chế riêng. Frontend gửi cookie bằng fetch cùng origin; token LiveKit là credential khác, chỉ dùng cho SDK media.

Tài nguyên riêng truy vấn theo chủ sở hữu; tài nguyên không thuộc phạm vi người gọi trả 404. Biết ID hoặc có role Admin không cấp quyền đọc note, thẻ thủ công, kết quả học riêng hay vai đối tác.

### 2.2. Đồng thời và thử lại

Mọi POST/PATCH/PUT/DELETE nghiệp vụ từ browser gửi `Idempotency-Key`. Khóa gắn actor, method, đường dẫn và hash body; giữ cùng khóa khi retry một ý định, tạo khóa mới khi người dùng thao tác mới. Ngoại lệ: đăng nhập, logout, yêu cầu/reset mật khẩu, heartbeat và mở đáp án không cần receipt; chúng có cơ chế bảo vệ riêng. Đăng ký dùng unique email, không phát lại credential từ receipt.

Request thay đổi tài nguyên có version gửi `expectedVersion` trong body. DELETE dùng query `expectedVersion`. Phiên dùng version chung; note dùng noteVersion; review dùng version tiến độ trong vé đánh giá. Thiếu version bắt buộc trả 422. Version cũ trả 409; không tự retry ý định trên trạng thái mới.

Kiểm tra quyền hiện tại trước khi phát lại kết quả đã commit. Cùng key khác payload trả 409 IDEMPOTENCY_CONFLICT. Receipt giữ 24 giờ; unique nghiệp vụ, review log và trạng thái nộp quiz tiếp tục bảo vệ sau đó. Replay dữ liệu vai luôn dựng từ quyền hiện hành. Không dùng cache để trả dữ liệu riêng đã xóa.

### 2.3. Giới hạn đầu vào

| Trường | Ràng buộc |
|---|---|
| password/newPassword | 8–128 Unicode code point; không trim, không chuẩn hóa Unicode; không bắt buộc nhóm ký tự |
| displayName/name của bộ cá nhân | Trim, 1–100 code point |
| note | Tối đa 10.000 code point; giữ xuống dòng |
| front/back thẻ thủ công | Không chỉ có khoảng trắng; tối đa 2.000 code point mỗi mặt |
| selfAssessment.comment | Tối đa 1.000 code point |
| report.description | Tối đa 2.000 code point |
| email | Đúng cú pháp email; trim/chuyển chữ thường cho khóa đăng nhập; không sửa dấu chấm hoặc +tag |
| profile | level N5–N1; tối đa 3 interests khác nhau; goal tối đa một giá trị; các mã theo danh mục server |
| confidence/rating | Confidence nguyên 1–5; rating chỉ 1, 2, 3 |

PATCH bỏ trường nghĩa là giữ nguyên; null chỉ được dùng để xóa trường hồ sơ tùy chọn hoặc nhận xét tùy chọn. Không nhận null cho ID, version hoặc trường bắt buộc. Nội dung nhập là văn bản thuần, không thực thi HTML. JSON body tối đa 1 MiB; vượt trả 413. Đây là giới hạn vận chuyển, không cho phép vượt giới hạn từng trường.

## 3. Kiểu dữ liệu trả về

Các object dưới đây là projection API, không phải document MongoDB. Mọi ObjectId được trả dưới tên id hoặc tên reference tương ứng.

| Kiểu | Trường |
|---|---|
| Self | id, email, displayName, avatarKey, role, profile, version |
| Partner | actorKey, displayName hoặc nhãn Khách, avatarKey?, profile gồm thông tin tự khai được phép hiển thị; không email |
| Coordination | mode, resourceId?, version, search? gồm requestId, criteria, queuedAt, leaseUntil |
| Proposal | id, status, version, partner, commonCriteria, suggestedMinutes, expiresAt, acceptedByMe, acceptedByPartner, sessionId? |
| Invitation | id, status, version, expiresAt, sessionId?; code chỉ trả cho host |
| InviteRequest | id, invitationId, requester: Partner, status, version, expiresAt, sessionId? |
| Session | id, status, version, controllerKey?, members: Partner[2], startedAt?, endedAt?, endReason?, suggestedMinutes?, activeDurationMs, selectionRemainingMs, reconnectUntil?, deckVersionId?, slots, currentCard?, pendingAction?, screenShare |
| Slot | slot: integer, status; không scenarioVersionId hoặc nội dung lá chưa bốc |
| CurrentCard | id, scenarioVersionId, title, context, objective, myRole, status; không vai đối tác |
| PendingAction | id, kind, cardId, proposedBy, proposedAt; kind swapRoles/skip/completeAndNext |
| PersonalSession | sessionId, note?, noteVersion, selfAssessment?, version |
| Knowledge | id là định danh ổn định, versionId, type, expression, reading?, meaning, examples, isSaved |
| SavedItem | id, knowledge: Knowledge dùng bản mới nhất, savedAt, version; nguồn xem qua endpoint riêng |
| Deck | id, name, version, createdAt |
| ManualCard | id, cardKey, front, back, version |
| Progress | cardKey, state, dueAt?, lastReviewAt?, reps, lapses, version; thẻ chưa học có state=new, version=0 và chưa có dueAt |
| QuizPublic | id, deckVersionId, sourceSessionId?, status, total, version, questions gồm questionVersionId, type, prompt, options? |
| QuizResult | Các trường QuizPublic, answers, score, submittedAt, results gồm questionVersionId, isCorrect, points, đáp án chuẩn, explanation, knowledgeVersionIds |

Trong Session, pendingAction và currentCard vắng khi chưa có; slots là mảng Slot. screenShare chỉ gồm state và ownerKey nếu có. activeDurationMs đã cộng phần đang hoạt động tới serverTime; không cộng lại ở database chỉ vì GET. Quyền truy cập bộ lịch sử/ẩn được kiểm tra theo nguồn, không theo ID đơn thuần.

## 4. Tài khoản và danh mục

Trong bảng, response mô tả giá trị data; `{}` là body rỗng. Các lỗi chung tại mục 12 áp dụng cho mọi endpoint.

| Method/path | Quyền | Request | Thành công |
|---|---|---|---|
| GET /auth/csrf | P | — | 200 {csrfToken} |
| POST /auth/register | P | {email,password,displayName} | 201 {user: Self}; không tự đăng nhập |
| POST /auth/login | P | {email,password} | 200 {user: Self,expiresAt}; set cookie |
| POST /auth/logout | U/G | {} | 204; thu hồi cookie hiện tại; cookie đã hết hiệu lực vẫn xóa an toàn |
| GET /auth/me | U/G | — | 200 {kind,user?: Self,guest?: {sessionId?,expiresAt?,status}} |
| POST /auth/password-change | U | {currentPassword,newPassword} | 204; thu hồi mọi phiên đăng nhập cũ |
| POST /auth/password-reset-requests | P | {email} | 202 {message} phản hồi trung tính |
| POST /auth/password-resets | P | {token,newPassword} | 204; token 15 phút, một lần; không tự đăng nhập |
| PATCH /me/profile | U | {expectedVersion,displayName?,avatarKey?,profile?} | 200 Self |
| GET /catalogs | P | — | 200 {levels,durations,goals,interests,languages,countries,ageGroups,genders,avatars}; mỗi mục {code,label} |

Sai thông tin đăng nhập trả 401 INVALID_CREDENTIALS; tài khoản khóa chỉ được báo ACCOUNT_LOCKED sau xác thực mật khẩu hợp lệ. Email đăng ký trùng trả 409 EMAIL_EXISTS. Reset token sai/hết hạn/đã dùng cùng trả 400 RESET_TOKEN_INVALID. Yêu cầu gửi reset trả cùng nội dung cho email tồn tại hoặc không; lỗi dịch vụ email công khai chỉ được thông báo theo trạng thái dịch vụ chung, không theo việc email có tài khoản. Không thay mật khẩu nếu gửi thư thất bại.

Profile dùng mã tại Database Design mục 2.2; PATCH profile chỉ sửa các trường được gửi, không thay toàn bộ object. Không cho client sửa role, status, authVersion. Đổi mật khẩu không tự kết thúc cuộc gọi đã cấp quyền; các request xác thực tiếp theo cần đăng nhập lại.

## 5. Ghép bạn và mã mời

| Method/path | Quyền | Request/query | Thành công |
|---|---|---|---|
| GET /me/coordination | U/G | — | 200 Coordination |
| POST /matching/searches | U | {level,desiredMinutes,allowAdjacent,filters?: {countryCode?,ageGroup?,gender?}} | 201 Coordination |
| POST /matching/searches/:requestId/heartbeat | U | {} | 200 {leaseUntil} |
| DELETE /matching/searches/:requestId | U | expectedVersion | 204; hủy đúng lượt |
| GET /matching/proposals/:id | U | — | 200 Proposal |
| POST /matching/proposals/:id/responses | U | {expectedVersion,decision: accept/reject} | 200 Proposal |
| DELETE /matching/proposals/:id | U | expectedVersion | 204; hủy và giải phóng cả hai |
| POST /invitations | U | {} | 201 Invitation |
| GET /invitations/:id | U/G | — | 200 Invitation; host hoặc người có request liên quan |
| DELETE /invitations/:id | U host | expectedVersion | 204 |
| POST /invitation-requests | U | {code} | 201 InviteRequest |
| POST /guest-trials | P | {code} | 201 {request: InviteRequest,guest: {status}}; set cookie khách |
| GET /invitation-requests/:id | U/G | — | 200 InviteRequest; host hoặc requester |
| GET /invitations/:id/requests | U host | status?,limit?,cursor? | 200 danh sách InviteRequest |
| POST /invitation-requests/:id/responses | U host | {expectedVersion,decision: accept/reject} | 200 InviteRequest |
| DELETE /invitation-requests/:id | U/G requester | expectedVersion | 204 |

Hồ sơ tùy chọn được chụp từ tài khoản khi tạo lượt tìm. filters bỏ trống nghĩa là không giới hạn; đối tác thiếu trường đang bị lọc không đạt. Ghép theo thứ tự ưu tiên SRS, không tự nới tiêu chí. Thay tiêu chí phải hủy lượt cũ rồi tạo mới. Sau hai phút, client hiển thị tiếp tục/sửa/mời/ôn; chọn rời tìm phải hủy trước.

Polling coordination/proposal mỗi 2 giây, không request chồng. Heartbeat tìm kiếm mỗi 10 giây, lease 30 giây; lease hết thì reconcile giải phóng, không tự tìm lại. Proposal có hạn 30 giây; đủ hai accept mới có sessionId. Cùng accept tới đồng thời mà stale version thì client lấy lại trạng thái trước khi gửi ý định mới.

Mã mời hiệu lực 10 phút, sinh từ 10 ký tự chữ hoa/số không gây nhầm lẫn; server kiểm tra collision. Nhập mã trim/chuyển chữ hoa. Chỉ host thấy code. Một mã chỉ cấp một phiên; nhiều request không làm phòng vượt hai người. Tạo guest trial khi đang có cookie tài khoản trả 409 IDENTITY_CONFLICT; không tự chuyển danh tính. Retry guest-trials dùng cookie khách đã cấp và cùng key để lấy request cũ; không tạo lượt mới khi đã chiếm luồng.

## 6. Phiên, media và thẻ tình huống

| Method/path | Quyền | Request | Thành công |
|---|---|---|---|
| GET /sessions/:id | M | — | 200 Session |
| POST /sessions/:id/media-token | M | {} | 200 {url,token,expiresAt}; chỉ phòng/identity được cấp |
| POST /sessions/:id/leave | M | {} | 200 Session ended; gọi lại không kết thúc lần hai |
| GET /sessions/:id/deck-options | M | limit?,cursor? | 200 danh sách {id,versionId,title,level,description} |
| POST /sessions/:id/deck-selection | M | {expectedVersion,deckVersionId} | 200 Session |
| POST /sessions/:id/control/claim | M | {expectedVersion} | 200 Session; chuyển quyền cho người gọi |
| POST /sessions/:id/draws | M | {expectedVersion,slot} | 200 Session |
| GET /sessions/:id/cards/:cardId/hints | M | — | 200 {hints,knowledge: Knowledge[]}; chỉ lá đã bốc của phiên |
| POST /sessions/:id/actions | M | {expectedVersion,kind,cardId} | 201 {session: Session} |
| POST /sessions/:id/actions/:actionId/responses | M đối tác | {expectedVersion,decision: accept/reject} | 200 Session |
| POST /sessions/:id/screen-share/claim | M | {expectedVersion} | 200 {session: Session}; 202 cùng body nếu thu hồi/cấp quyền chưa xong |
| POST /sessions/:id/screen-share/release | M chủ chia sẻ | {} | 200 hoặc 202 {session: Session} |
| GET /sessions/:id/summary | M | — | 200 {session,drawnCards,personal: PersonalSession,savedSources,quizAttempts} |
| GET /me/sessions | U | limit?,cursor? | 200 danh sách Session rút gọn, không vai/hints |

summary chỉ dành cho phiên ended; drawnCards gồm id, scenarioVersionId, title, status, drawnAt, finishedAt?; savedSources/quizAttempts chỉ của người gọi. Dữ liệu lớn lấy tiếp qua các danh sách cá nhân tại mục 8–9, không nhúng lịch sử ôn vào summary.

Chọn bộ chỉ khi cả hai kết nối, đang chọn và còn trong 60 giây hoạt động. Hết hạn kết thúc phiên. Sau chọn, server lưu ánh xạ lá úp; draw chỉ nhận slot chưa bốc, không nhận scenario ID tùy ý. Chọn/bốc yêu cầu actorKey khớp controllerKey trong điều kiện ghi cùng expectedVersion. Lấy quyền và chọn/bốc cạnh tranh trên cùng version; request cũ nhận xung đột, không tự retry trên quyền mới.

`control/claim` yêu cầu cả hai kết nối, phiên active và chưa hết hạn; không cần đối tác duyệt. Server lấy actor từ phiên xác thực, không nhận controllerKey trong body. Người đang giữ quyền gọi lại không chuyển cho đối tác; replay cùng Idempotency-Key không giành lại quyền đã chuyển về sau. Thiếu quyền chọn/bốc trả 403 CONTROL_REQUIRED; version cũ trả 409 VERSION_CONFLICT. Disconnect giữ controllerKey, khóa claim; reconnect không random lại.

swapRoles đổi vai; skip đánh dấu bỏ qua; completeAndNext đánh dấu hoàn thành. Sau skip/complete, currentCard rỗng và người điều khiển bốc lá tiếp bằng endpoint draws. Không tự bốc hộ, không lặp lá. Chỉ một pending action; người đề nghị không tự accept. Reject giữ lá/vai. Disconnect hủy pending action, tạm dừng thao tác chung/bộ đếm chọn; nối lại không đặt lại 60 giây.

Media token có hạn 10 phút, không vượt deadline quyền hiện hành. Hạn token chỉ giới hạn kết nối, không đặt giới hạn cuộc gọi. Quyền kết thúc/khóa/chặn được thực thi bằng thu hồi LiveKit, không chờ token hết hạn. Backend không công nhận client tự khai connected; hiện diện lấy từ webhook/đối chiếu LiveKit. Mất liên lạc lúc preparing hoặc đang gọi có thời gian phục hồi tối đa 5 phút; quá hạn không hồi sinh phiên.

Chia sẻ màn hình: claim trước khi publish; chỉ publish khi state/grant cho phép. Người dùng hủy hộp chọn màn hình thì gọi release. Không cấp người thứ hai trước khi thu hồi quyền cũ. Cam/mic và chat dùng SDK LiveKit, không có REST endpoint lưu chat. Phiên đã ended từ chối cấp token, draw, chọn bộ và action.

## 7. Kho học liệu

| Method/path | Quyền | Query | Thành công |
|---|---|---|---|
| GET /topics | U | level?,limit?,cursor? | 200 danh sách {id,versionId,title,level,description} đã xuất bản |
| GET /topic-versions/:id | U/G | — | 200 {id,contentId,title,level,description,knowledgeCount,questionCount} |
| GET /topic-versions/:id/knowledge | U/G | limit?,cursor? | 200 danh sách Knowledge của đúng bản nguồn |
| GET /knowledge/:id | U/G | versionId? | 200 Knowledge; không có versionId lấy bản xuất bản mới nhất |

Khách chỉ đọc học liệu trong lượt thử. Bản ẩn/lịch sử chỉ đọc nếu có nguồn hợp lệ. Endpoint học liệu chung không trả roleA/roleB hoặc đáp án ngân hàng. Flashcard lấy tập định danh từ bản bộ nhưng dùng nội dung kiến thức mới nhất; endpoint nguồn vẫn trả bản từng gặp.

## 8. Ghi chú, đã lưu và bộ cá nhân

| Method/path | Quyền | Request/query | Thành công |
|---|---|---|---|
| GET /sessions/:id/personal | M | — | 200 PersonalSession; chưa có note trả noteVersion=0 |
| PUT /sessions/:id/note | M | {expectedVersion,note} | 200 PersonalSession; expectedVersion là noteVersion |
| DELETE /sessions/:id/note | M | expectedVersion | 204 |
| PUT /sessions/:id/self-assessment | M | {expectedVersion,confidence,comment?} | 200 PersonalSession; version của PersonalSession |
| GET /me/saved-items | U/G | sessionId?,limit?,cursor? | 200 danh sách SavedItem |
| POST /me/saved-items | U/G | {knowledgeVersionId,deckVersionId,sessionId?,scenarioVersionId?} | 200 SavedItem; upsert, bổ sung nguồn |
| DELETE /me/saved-items/:id | U/G | expectedVersion | 204; bỏ lưu, không xóa FSRS |
| GET /me/saved-items/:id/sources | U/G | limit?,cursor? | 200 danh sách {knowledgeVersionId,deckVersionId,sessionId?,scenarioVersionId?,createdAt} |
| GET /me/decks | U | limit?,cursor? | 200 danh sách Deck |
| POST /me/decks | U | {name} | 201 Deck |
| PATCH /me/decks/:id | U | {expectedVersion,name} | 200 Deck |
| DELETE /me/decks/:id | U | expectedVersion | 202 {id,status: deleting} |
| GET /me/decks/:id/cards | U | limit?,cursor? | 200 danh sách {cardKey,content: Knowledge hoặc ManualCard} |
| PUT /me/decks/:id/cards/:cardKey | U | {expectedVersion} | 200 Deck; thêm không trùng |
| DELETE /me/decks/:id/cards/:cardKey | U | expectedVersion | 204; chỉ bỏ quan hệ bộ–thẻ |
| GET /me/manual-cards | U | limit?,cursor? | 200 danh sách ManualCard |
| POST /me/manual-cards | U | {front,back} | 201 ManualCard |
| GET /me/manual-cards/:id | U | — | 200 ManualCard |
| PATCH /me/manual-cards/:id | U | {expectedVersion,front?,back?} | 200 ManualCard |
| DELETE /me/manual-cards/:id | U | expectedVersion | 202 {id,status: deleting} |

cardKey trên URL phải percent-encode. Nguồn lưu trong phiên yêu cầu cả sessionId/scenarioVersionId, kiểm tra tình huống đã bốc và kiến thức liên quan. Ngoài phiên bỏ cả hai. Bỏ lưu vẫn giữ nguồn lịch sử; sources còn truy cập được bởi chủ qua summary. Không tạo review chỉ vì lưu hoặc thêm bộ.

Xóa bộ/thẻ có hiệu lực trên giao diện ngay khi trạng thái deleting được ghi. GET tài nguyên đang deleting trả 410 RESOURCE_DELETING; hoàn tất xóa trả 404. Cleanup có thể chạy lại, ngăn thêm entry/review mới trong lúc xóa. Xóa thẻ thủ công xóa cả log/tiến độ, giữ số lượt ôn tổng hợp. Xóa bộ giữ thẻ/tiến độ.

## 9. Flashcard và quiz

### 9.1. Flashcard

StudyScope là `{type: topic,topicVersionId}` hoặc `{type: saved}` hoặc `{type: personalDeck,deckId}`. Khách chỉ dùng topic của lượt thử và saved tạm. Backend kiểm tra scope trước khi phân giải cardKey.

| Method/path | Quyền | Request/query | Thành công |
|---|---|---|---|
| POST /study/cards/query | U/G | {scope,mode: all/due,limit?,cursor?} | 200 danh sách {cardKey,front,contentVersionId?,manualVersion?,progress: Progress}; chỉ đọc, không cần receipt |
| POST /study/cards/reveal | U/G | {scope,cardKey} | 200 {cardKey,front,back,progress,reviewTicket,ticketExpiresAt,preview} |
| POST /study/reviews | U/G | {reviewTicket,rating} | 201 {cardKey,progress: Progress,reviewedAt}; operation ID lấy từ Idempotency-Key |
| GET /me/reviews | U/G | cardKey,limit?,cursor? | 200 danh sách {id,cardKey,rating,reviewedAt,previousDueAt?,nextDueAt} |

mode=due bao gồm thẻ mới và đến hạn; mode=all cho học trước hạn. Query không tạo tiến độ giả. preview là mảng `{rating,label,dueAt}` cho Again/Hard/Good, tính tại serverTime. Review tính lại ở thời điểm server nhận đánh giá, nên có thể khác preview theo thời gian trôi.

Vé đánh giá được ký phía server, hạn 30 phút và không vượt expiresAt của khách; chứa owner, cardKey, revision nội dung, version tiến độ, cấu hình scheduler. Vé hết hạn trả 409 REVIEW_TICKET_EXPIRED, người học mở lại đáp án. Không chấp nhận dueAt, stability hoặc difficulty từ client. Cấu hình FSRS-6 theo SRS/Database Design; fixture phải khóa phiên bản thư viện trước nghiệm thu.

Hai tab dùng cùng version: chỉ một review thành công; tab còn lại nhận 409 VERSION_CONFLICT. Retry cùng key trả lượt đã commit, không tăng log/thống kê. Thay revision kiến thức không reset lịch. Thẻ đã xóa hoặc khách hết quyền không được replay kết quả riêng.

### 9.2. Quiz

| Method/path | Quyền | Request/query | Thành công |
|---|---|---|---|
| POST /quizzes | U/G | {deckVersionId,sourceSessionId?} | 201 QuizPublic |
| GET /quizzes/:id | U/G chủ | — | 200 QuizPublic hoặc QuizResult theo trạng thái |
| POST /quizzes/:id/submission | U/G chủ | {expectedVersion,answers: [{questionVersionId,optionId?,text?}]} | 200 QuizResult |
| GET /me/quizzes | U/G | sourceSessionId?,limit?,cursor? | 200 danh sách {id,deckVersionId,status,total,score?,createdAt,submittedAt?} |

Không có câu trả 409 QUIZ_UNAVAILABLE và không tạo lượt. Tối đa 5 câu khác nhau, không theo bookmark. Trắc nghiệm chỉ optionId, điền chỉ text; không nhận câu lạ hoặc câu trùng. Câu bỏ khỏi answers tính 0. Điền chỉ trim đầu/cuối, so khớp chính xác đáp án chuẩn. Snapshot đáp án không được gửi trước nộp.

Nộp lại cùng ý định trả kết quả đã lưu. Lượt đã submitted không nhận thay câu trả lời; payload khác trả 409 QUIZ_ALREADY_SUBMITTED. Làm lại gọi POST /quizzes, tạo ID mới. Quiz không thay FSRS hoặc tự lưu kiến thức.

## 10. Chặn, báo cáo và quản trị

| Method/path | Quyền | Request/query | Thành công |
|---|---|---|---|
| GET /me/blocks | U/G | limit?,cursor? | 200 danh sách {id,partner: Partner,createdAt} |
| POST /me/blocks | U/G | {sessionId,targetActorKey} | 200 {id}; kiểm tra đúng đối tác |
| DELETE /me/blocks/:id | U/G chủ | — | 204 |
| POST /reports | U/G | {sessionId,targetActorKey,reason,description?} | 201 {id,status: new,createdAt} |
| GET /admin/users | A | status?,limit?,cursor? | 200 danh sách {id,email,displayName,status,version} |
| PATCH /admin/users/:id/status | A | {expectedVersion,status: active/locked} | 200 {id,status,version} |
| GET /admin/reports | A | status?,limit?,cursor? | 200 danh sách Report |
| GET /admin/reports/:id | A | — | 200 Report |
| PATCH /admin/reports/:id | A | {expectedVersion,status,resolution?} | 200 Report |
| GET /admin/statistics | A | — | 200 {registeredAccounts,startedSessions,reviewCount,submittedQuizCount} |
| GET /admin/content | A | kind?,status?,level?,limit?,cursor? | 200 danh sách ContentItem |
| POST /admin/content | A | {kind,draftPayload} | 201 ContentItem |
| GET /admin/content/:id | A | — | 200 ContentItem |
| PATCH /admin/content/:id | A | {expectedVersion,draftPayload} | 200 ContentItem; thay toàn bộ payload nháp |
| POST /admin/content/:id/publish | A | {expectedVersion} | 200 ContentItem |
| POST /admin/content/:id/hide | A | {expectedVersion} | 200 ContentItem |

Report gồm id, reporterKey, reportedKey, sessionId, reason, description?, status, resolution?, handledBy?, handledAt?, version, createdAt. reason là văn bản không rỗng; chưa có taxonomy bắt buộc. ContentItem gồm id, kind, status, draftPayload?, publishedVersionId?, latestRevision, version. kind và draftPayload tuân bốn schema tại Database Design mục 7.2; không cho sửa kind sau tạo. Lỗi xuất bản trả 422 CONTENT_INCOMPLETE cùng danh sách field/ref thiếu, không tạo revision nửa chừng.

Chặn có hiệu lực hai chiều khi cấp phòng nhưng chỉ chủ bản chặn được gỡ. Chặn trong phiên kết thúc phiên; báo cáo không tự chặn. Guest chỉ báo cáo/chặn trong phạm vi quyền thử; không cam kết nhận diện lại người thật bằng danh tính mới. Admin không có endpoint đọc note riêng, thẻ thủ công hoặc media của người khác.

## 11. Webhook, thông báo và vận hành

`POST /webhooks/livekit` nhận raw body và header chữ ký theo SDK LiveKit. Xác minh chữ ký trước xử lý; không dùng cookie/CSRF. Trả 204 khi đã xử lý hoặc sự kiện trùng; chữ ký sai 401; lỗi tạm xử lý 503. Dedup eventId trong 7 ngày, đồng thời kiểm tra SID/thời điểm/trạng thái để sự kiện cũ vẫn không đảo trạng thái sau khi receipt bị dọn. Không coi webhook được đảm bảo giao thành công; đối chiếu LiveKit khi cần.

Thông báo data trong phòng chỉ có `{type: session.updated,sessionId,version}`. Client nhận version mới thì GET Session; bỏ qua version cũ, không dùng payload thông báo để cấp vai/quyền. Khi đang ở phòng, polling dự phòng 2 giây, không chồng request; lỗi mạng backoff 2/4/8/16 giây, tối đa 16 giây. Thời gian chờ, quyền khách và kết nối lại vẫn tính theo server, không theo số lần polling.

`POST /maintenance/reconcile` dành cho công cụ vận hành có Bearer secret riêng; trả 200 `{processed,remaining}`. Adapter cron của nền tảng gọi cùng service sau xác thực secret theo giao thức cron; không mở quyền này cho Admin qua cookie. Mỗi lượt xử lý tối đa 100 tài nguyên, có thể chạy lại. `GET /health` công khai trả 200 `{status: ok}` hoặc 503 `{status: unavailable}`, không tiết lộ cấu hình/connection string.

Rate limit ban đầu: đăng nhập 10 lần/15 phút theo IP và emailKey; reset request 3 lần/15 phút theo emailKey và 20 lần/15 phút theo IP; nhập mã/guest trial 20 lần/5 phút theo IP; ghi nghiệp vụ 120 lần/phút theo actor. Polling/heartbeat không tính vào quota ghi nghiệp vụ. Bộ đếm email dùng khóa hash, áp cả email không tồn tại. Vượt hạn trả 429 và Retry-After theo số giây; không khóa tài khoản vĩnh viễn. Đây là cấu hình kỹ thuật, kiểm tra lại bằng tải demo trước triển khai.

## 12. Mã lỗi

| HTTP | Code | Xử lý client |
|---|---|---|
| 400 | MALFORMED_REQUEST, INVALID_CURSOR, RESET_TOKEN_INVALID | Sửa request hoặc xin liên kết mới |
| 401 | AUTH_REQUIRED, SESSION_EXPIRED, INVALID_CREDENTIALS | Đăng nhập lại hoặc sửa thông tin |
| 403 | FORBIDDEN, CSRF_INVALID, ACCOUNT_LOCKED, CONTROL_REQUIRED | Dừng thao tác; không tự retry |
| 404 | RESOURCE_NOT_FOUND | Tài nguyên không tồn tại/ngoài phạm vi |
| 409 | VERSION_CONFLICT, IDEMPOTENCY_CONFLICT | Tải lại trạng thái; không ghi đè |
| 409 | ACTOR_BUSY, IDENTITY_CONFLICT, PAIR_BLOCKED | Kết thúc luồng cũ hoặc đổi lựa chọn |
| 409 | INVITATION_UNAVAILABLE, PROPOSAL_EXPIRED | Không cấp phòng; lấy lại coordination |
| 409 | SESSION_ENDED, SESSION_RECONNECTING, ACTION_PENDING, INVALID_SESSION_STATE | Hiển thị trạng thái server, dừng thao tác không hợp lệ |
| 409 | DECK_ALREADY_SELECTED, SLOT_UNAVAILABLE, DECK_EXHAUSTED, SCREEN_SHARE_BUSY | Đồng bộ lại phiên |
| 409 | REVIEW_TICKET_EXPIRED, QUIZ_UNAVAILABLE, QUIZ_ALREADY_SUBMITTED, EMAIL_EXISTS | Xử lý theo luồng tương ứng |
| 410 | GUEST_EXPIRED, RESOURCE_DELETING | Ngừng truy cập dữ liệu tạm/tài nguyên đang xóa |
| 413 | PAYLOAD_TOO_LARGE | Giảm kích thước request |
| 415 | UNSUPPORTED_MEDIA_TYPE | Gửi JSON cho endpoint JSON |
| 422 | VALIDATION_FAILED, CONTENT_INCOMPLETE | Hiển thị error.details.fields: [{path,code,message}] |
| 429 | RATE_LIMITED | Chờ Retry-After |
| 500 | INTERNAL_ERROR | Hiển thị requestId để tra lỗi |
| 503 | SERVICE_UNAVAILABLE | Retry có backoff; giữ key nếu chưa biết ghi đã commit |

Hết quyền khách được trả 410 khi còn nhận diện được bản ghi hết hạn; sau khi xóa gốc có thể trả 401. Cả hai đều không trả dữ liệu học tạm. API chỉ trả currentVersion khi người gọi có quyền tài nguyên. Mã mời sai/hết hạn/đã dùng cùng INVITATION_UNAVAILABLE để không tiết lộ trạng thái phòng không liên quan.

## 13. Ví dụ luồng đồng thời

```http
POST /api/v1/sessions/507f1f77bcf86cd799439011/draws
Content-Type: application/json
X-CSRF-Token: <csrf-token>
Idempotency-Key: 4f63d5d0-d68a-4704-81a3-2833f534e532

{"expectedVersion":7,"slot":2}
```

Server kiểm tra thành viên, controllerKey, hiện diện và version, chọn đúng lá gắn slot rồi commit version 8. Response 200 chứa Session với currentCard chỉ có myRole. Request cùng version 7 nhận 409 nếu trạng thái đã đổi; người không giữ quyền trên version hiện hành nhận 403 CONTROL_REQUIRED. Client GET lại để đồng bộ lá và người điều khiển. Gửi lại chính request đã commit với cùng key không bốc thêm lá; vai trả về phải theo quyền hiện tại.

Kiểm thử quyền điều khiển: random đúng một lần khi bắt đầu; claim cạnh tranh draw; request từ controller cũ; retry claim sau lần chuyển quyền khác; giữ quyền qua reconnect; từ chối khi thiếu thành viên hoặc ended.

Với review, Idempotency-Key trở thành operationId của log; với quiz, kết quả lần nộp đã lưu là nguồn trả retry. Timeout mạng không chứng minh transaction thất bại: frontend giữ key và không tự tạo ý định mới.

## 14. Truy vết và nghiệm thu

| Yêu cầu SRS | Mục đặc tả |
|---|---|
| FR-ACC-01–06 | 2, 4 |
| FR-MAT-01–05, FR-INV-01–03 | 5 |
| FR-GST-01–04 | 2, 5–9, 12 |
| FR-SES-01–08, FR-CAR-01–07 | 6, 11, 13 |
| FR-LRN-01–07 | 6–8 |
| FR-FLC-01–08, FR-QIZ-01–06 | 8–9 |
| FR-SAF-01–03, FR-ADM-01–06 | 10 |

Kiểm thử contract bao gồm: thiếu/sai loại trường, ranh giới độ dài Unicode, CSRF, quyền chính chủ/thành viên/Admin, không lộ đáp án/vai, hai request cùng version, retry sau timeout, token reset một lần, khách hết quyền trước cleanup, block/khóa cạnh tranh cấp phòng, xóa thẻ cạnh tranh review, quiz snapshot và webhook muộn. Đối chiếu các ca DB-T01–19 của thiết kế database.

Chạy luồng tích hợp từ đăng ký đến ghép/mời, gọi, chọn/bốc, lưu/note, kết thúc, flashcard và quiz; kiểm tra hai phòng đồng thời theo SRS. Kiểm tra rate limit không chặn polling hợp lệ. Các ca là điều kiện nghiệm thu khi triển khai, chưa phải kết quả chạy API thực tế.

## 15. Tham khảo

Quy ước method/status tham khảo [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html), đối chiếu ngày 28/10/2026. Envelope, endpoint, mã lỗi nghiệp vụ và thời hạn kỹ thuật trong tài liệu là contract riêng của Chiikaiwa. Chi tiết schema học liệu, enum hồ sơ và cấu hình FSRS tuân thiết kế database/SRS; không sao chép document database trực tiếp thành response.
