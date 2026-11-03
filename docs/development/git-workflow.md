# Git workflow

## Branch

`main` là default branch, giữ bản có thể phát hành. `develop` tích hợp công việc cho bản phát hành tiếp theo. Mọi thay đổi vào hai nhánh này đi qua pull request.

Nhánh task dùng `<type>/<TASK-ID>-<short-description>`. Giữ Task ID từ [bảng quản lý](scrum.md); không dùng mã PB hoặc test thay thế. Prefix và mô tả viết thường, tiếng Anh, nối bằng dấu gạch ngang; Task ID giữ nguyên chữ hoa và ba chữ số.

| Nhánh               | Tách từ   | Đích PR             | Ví dụ                                         |
| ------------------- | --------- | ------------------- | --------------------------------------------- |
| `feature/`          | `develop` | `develop`           | `feature/BE-001-add-authentication`           |
| `fix/`              | `develop` | `develop`           | `fix/BE-001-reject-expired-session`           |
| `refactor/`         | `develop` | `develop`           | `refactor/BE-001-simplify-session-validation` |
| `docs/`             | `develop` | `develop`           | `docs/OPS-008-update-setup-guide`             |
| `test/`             | `develop` | `develop`           | `test/QA-027-cover-release-candidate`         |
| `chore/`            | `develop` | `develop`           | `chore/OPS-004-update-ci`                     |
| `release/<version>` | `develop` | `main` và `develop` | `release/0.2.0`                               |
| `hotfix/`           | `main`    | `main` và `develop` | `hotfix/BE-001-fix-login-crash`               |

Một branch phục vụ một task hoặc phần việc rõ ràng. Ví dụ chỉ minh họa cú pháp; dùng ID của task thực tế, cấp task riêng cho lỗi phát sinh. Không tạo branch theo tên thành viên hoặc branch hình thức cho QA chỉ chạy test, ghi kết quả. Branch do Dependabot quản lý không phải theo mẫu task.

## Phát triển và phát hành

```text
develop → feature/fix/docs/test/chore/refactor → PR → develop
develop → release/<version> → PR → main → tag v<version>
                           → PR → develop
main    → hotfix/<task>     → PR → main → tag bản vá
                           → PR → develop
```

- Tạo nhánh từ base mới nhất. Tự review diff, chạy kiểm tra liên quan rồi mở PR; dùng Draft khi chưa đủ kiểm chứng hoặc còn cần trao đổi.
- Khi đủ phạm vi phát hành, tạo release branch từ `develop`. Chỉ sửa lỗi và hoàn thiện phiên bản/tài liệu phát hành trên release; chức năng mới tiếp tục ở `develop`.
- Nhánh sửa lỗi release tách từ và PR về release tương ứng. Không gộp thêm feature từ `develop` trong lúc ổn định release.
- Release đạt điều kiện kiểm thử mới PR vào `main`. Tạo tag `v<version>` tại commit phát hành; tích hợp thay đổi release về `develop` trước khi xóa nhánh.
- Hotfix tách từ `main`, kiểm chứng rồi PR vào `main` và `develop`. Nếu có release đang mở, đưa bản sửa vào release đó trước khi phát hành.
- Phát hành thông thường đi qua release branch. Sprint không bắt buộc trùng lịch phát hành. Merge, tạo tag và deploy là các thao tác riêng.

## Merge và conflict

Merge commit được dùng cho mọi loại PR. **Squash merge là tùy chọn** cho PR task khi cần gộp các commit nhỏ; không bắt buộc. Dùng merge commit cho release, hotfix và đồng bộ giữa các nhánh dùng chung để giữ quan hệ lịch sử.

Không rebase hoặc force-push `main`, `develop` hay release branch dùng chung. Chỉ rebase branch cá nhân khi không ảnh hưởng người khác hoặc đã thống nhất trước. Khi cần push lịch sử cá nhân đã viết lại, dùng `--force-with-lease` sau khi kiểm tra remote.

Resolve conflict theo yêu cầu và code của cả hai phía; không chọn toàn bộ một phía chỉ để hết conflict. Chạy lại kiểm tra liên quan và yêu cầu review phần thay đổi đáng kể. Xóa branch task sau merge; release/hotfix chỉ xóa khi hoàn tất các hướng tích hợp cần thiết.

## Commit

Dùng [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
type(scope): description

Optional body

Refs: BE-001
```

| Type       | Khi dùng                               |
| ---------- | -------------------------------------- |
| `feat`     | Thêm khả năng hoặc hành vi mới         |
| `fix`      | Sửa hành vi sai                        |
| `refactor` | Đổi cấu trúc, giữ hành vi              |
| `docs`     | Tài liệu                               |
| `test`     | Kiểm thử                               |
| `style`    | Format, không đổi logic                |
| `build`    | Dependency, package manager hoặc build |
| `ci`       | Workflow CI và automation              |
| `chore`    | Bảo trì khác                           |

Scope tùy chọn, phản ánh thành phần/module như `client`, `server`, `identity`, `sessions`, `database`, `deps`. Description bằng tiếng Anh, dùng động từ, không chấm cuối. Body giải thích lý do hoặc ràng buộc khi cần; footer `Refs: <TASK-ID>` liên kết task. Branch `feature/` tương ứng với commit type `feat`; branch `chore/` có thể chứa thay đổi loại `build` hoặc `ci`.

```text
feat(identity): add authentication endpoints
fix(sessions): reject expired invitations
build(deps): update mongoose
ci: validate pull requests
```

Một commit có mục đích rõ, không chứa thay đổi tiện tay không liên quan. Tránh message như `update`, `done`, `fix stuff`. Breaking change dùng `!` hoặc footer `BREAKING CHANGE:` kèm ảnh hưởng và cách chuyển đổi. Merge message tự động được miễn mẫu Conventional Commits; commit được giữ lại khi merge vẫn cần rõ nghĩa. Nếu squash, đặt lại message đại diện cho toàn PR.

Trước commit, kiểm tra diff và staged diff; chỉ stage file của task. Không đưa `.env`, dữ liệu riêng hoặc output build vào Git.

## Pull request và review

Tiêu đề theo commit convention, Task ID ở cuối:

```text
feat(identity): add authentication endpoints [BE-001]
chore(release): release v0.2.0
chore: sync main into develop
```

Một PR tập trung vào một mục tiêu. UI, API, database và test cho cùng hành vi có thể nằm cùng PR. Dùng [template PR](../../.github/pull_request_template.md): Task, What, Why, How, Environment Variables, Validation và Compatibility / Deployment. Liên kết dòng task trên Sheets, ghi PB/test liên quan; UI kèm ảnh/video khi giúp review. Mục không áp dụng ghi `None`; không đánh dấu test đã chạy nếu chưa có kết quả.

Reviewer đọc description trước, đối chiếu yêu cầu, code và bằng chứng. Ưu tiên tính đúng, quyền, bảo mật, dữ liệu, đồng thời, xử lý lỗi và khả năng tương thích; không yêu cầu thay đổi chỉ vì sở thích.

| Comment        | Xử lý                                                          |
| -------------- | -------------------------------------------------------------- |
| **Must fix**   | Giải quyết trước merge                                         |
| **Should fix** | Sửa hoặc thống nhất lý do/phương án theo sau                   |
| **Nit**        | Góp ý nhỏ, không chặn merge                                    |
| **Question**   | Trả lời và làm rõ; chỉ chặn nếu còn vấn đề ảnh hưởng tính đúng |

Tác giả trả lời đã sửa gì hoặc lý do không sửa. Không tự resolve bất đồng; reviewer xác nhận vấn đề đã giải quyết. Khi chưa thống nhất, nhờ thành viên phụ trách kỹ thuật xem xét.

Merge khi CI và kiểm tra liên quan pass, có ít nhất một người khác approve, các yêu cầu Must fix và review conversations đã xử lý. Thay đổi đáng kể sau review phải được xem lại. Cập nhật bằng chứng và trạng thái task sau tích hợp; merge PR không tự động làm task đạt Done.

## Dependency updates

[Dependabot](../../.github/dependabot.yml) theo dõi npm workspaces và GitHub Actions hằng tuần, thứ Hai 09:00 giờ Việt Nam. Minor/patch npm gom theo runtime/development, Actions gom riêng; major tạo PR riêng. Giới hạn PR version updates đang mở: npm 3, Actions 2. Giữ tiêu đề/branch bot tạo, không cần task hình thức cho mỗi đề xuất.

Đọc release notes và diff manifest/lockfile, kiểm tra runtime và peer dependencies. Review các package liên quan cùng nhau, như React/React DOM/typings hoặc Storybook/addons. Giữ phiên bản chính xác. `@types/node` theo runtime Node 24; bot bỏ qua major của package này. Khi nâng major Node, cập nhật typings và xem lại ngoại lệ cùng task. Node, npm trong `packageManager` và MongoDB binary cần được rà soát riêng.

PR bot có cùng yêu cầu CI và review, không auto-merge. Ưu tiên bản vá bảo mật, đánh giá ảnh hưởng rồi đưa qua luồng release/hotfix phù hợp và đồng bộ về `develop`.

## Thiết lập repository

- Giữ default branch `main`. Bảo vệ `main` và `develop`: yêu cầu PR, job `check` thành công, ít nhất một approval khác tác giả, giải quyết review conversations; chặn force-push và xóa branch. Không yêu cầu linear history khi dùng merge commit.
- Bật dependency graph, Dependabot alerts và security updates trên GitHub; cấu hình trong source không tự bật các settings này. Ruleset cho private repository phụ thuộc gói GitHub.
- Giữ file Dependabot trên default branch. Version updates hướng về `develop`; security updates theo default branch. Khi đặt `target-branch`, các tùy chọn của block đó không áp dụng cho security updates; kiểm tra riêng chính sách mặc định/ngoại lệ bảo mật.

### Chuyển sang Git Flow

Trước khi nhận PR task theo quy trình này, maintainer hoàn tất:

1. Đồng bộ các thay đổi hiện có trên `main`, tạo và publish `develop` từ đó.
2. Bảo vệ hai nhánh; xác nhận quyền merge và job bắt buộc trên GitHub.
3. Bổ sung CI khi push `develop`, giữ CI trên PR; cấu hình version updates của Dependabot về `develop` và xác minh security updates trên `main`.
4. Thông báo base mới cho task đang mở; không đổi tên hoặc viết lại lịch sử branch của người khác.

Các thay đổi tài liệu chuyển quy trình khi chưa có `develop` dùng branch `docs/<short-description>` từ `main` và PR về `main`. Không tự tạo Task ID ngoài bảng để phục vụ bước chuyển đổi.
