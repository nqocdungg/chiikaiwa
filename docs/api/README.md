# OpenAPI và Swagger

`openapi.yaml` là contract máy đọc được cho các REST endpoint đã triển khai. Swagger UI chỉ đọc contract này để hiển thị tài liệu; Express không tự sinh endpoint hoặc schema cho Swagger.

## Xem tài liệu local

Chạy API từ root repo:

```sh
npm run dev --workspace server
```

- Swagger UI: http://127.0.0.1:3000/api/docs
- OpenAPI YAML: http://127.0.0.1:3000/api/openapi.yaml

Swagger UI dùng để đọc contract và thử các request đơn giản. Các request ghi vẫn phải tuân cookie xác thực, CSRF, `Origin` và `Idempotency-Key`; integration test là bằng chứng chính cho luồng bảo mật đầy đủ.

## Khi thêm hoặc đổi endpoint

1. Đọc `AGENTS.md`, `docs/design/07-api-specification.md`, file router/validation/service và test liên quan.
2. Cập nhật `paths` trong `docs/api/openapi.yaml`: method, quyền, parameter, request body, response và error code.
3. Cập nhật hoặc tái sử dụng schema trong `components`. DTO không được chứa trường riêng tư ngoài contract.
4. Thêm example giả, không dùng secret, credential hoặc dữ liệu người dùng thật.
5. Đối chiếu đường dẫn thực tế sau prefix `/api/v1`; không mô tả endpoint chưa được mount.
6. Chạy:

```sh
npm run openapi:check
npm run check
```

Nếu thiết kế và code mâu thuẫn, không sửa `docs/design/01-…` đến `07-…` để khớp code khi task chưa cho phép. Báo vị trí mâu thuẫn và làm rõ contract trước khi tiếp tục phần phụ thuộc.

## Quy ước

- `docs/design/07-api-specification.md` giữ quyết định contract/nghiệp vụ đã duyệt.
- `docs/api/openapi.yaml` mô tả chính xác contract đã triển khai để công cụ và frontend đọc.
- Mọi PR thay đổi REST API phải cập nhật code, OpenAPI và test trong cùng PR.
- Schema dùng `$ref` thay vì sao chép. Error dùng `ErrorResponse`; response thành công giữ envelope `{data, meta}`.
- `operationId` phải duy nhất, ổn định và diễn tả hành động.
- Chỉ khai báo security thực tế. Không ghi token, cookie hoặc giá trị `.env` vào tài liệu.

Spec ban đầu bao phủ health check và BE-009. Các module hiện có khác được bổ sung dần trong task thay đổi endpoint tương ứng; Swagger không được coi là danh sách đầy đủ cho tới khi phạm vi đó được khai báo.

## Prompt mẫu cho AI

Khi giao task backend cho AI, dùng prompt sau và thay phần trong ngoặc:

```text
Đọc AGENTS.md, docs/api/README.md, docs/design/07-api-specification.md,
docs/api/openapi.yaml và router/validation/test liên quan.

Thực hiện [mô tả task và Task ID]. Nếu thêm hoặc đổi REST endpoint:
- cập nhật paths, components schema, security, request/response và error trong
  docs/api/openapi.yaml;
- không tự sửa docs/design/01–07 nếu task không yêu cầu;
- thêm hoặc cập nhật test contract;
- chạy npm run openapi:check và npm run check;
- báo rõ endpoint nào chưa được kiểm chứng hoặc còn dependency.
```

Chỉ cần bảo AI đọc `AGENTS.md` từ root repo cũng sẽ dẫn tới hướng dẫn này, nhưng nêu trực tiếp các file trên giúp giới hạn phạm vi và giảm nguy cơ quên cập nhật OpenAPI.
