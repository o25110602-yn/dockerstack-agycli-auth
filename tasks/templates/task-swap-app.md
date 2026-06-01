# Task: Swap App — Triển khai app mới thay thế `services/app`

## Mục đích

Template này dùng khi user clone repo thành thư mục mới, rồi nhờ AI Agent triển khai một app mới thay thế `services/app` hiện tại.
Luồng làm việc tuân thủ cấu trúc [task-template.md](task-template.md).

---

## User prompt

> Triển khai dự án `agy-cli-auth`

### Spec 1 — App mô tả

> Đây là dự án web app, dùng để grant app agy-cli, lưu lại token trên realtime database google.
> Thay đổi các thông tin `docker-stack-template` thành `dockerstack-agycli-auth` trong các files như: `package.json`,`deploy.yml`...


### Spec 2 — Source code

> Source code `agy-cli-auth` sẽ thay thế toàn bộ thư mục `services/app`.
>
> - Đường dẫn source gốc: `./agy-cli-auth`
> - Cách chuyển: copy toàn bộ source vào `services/app/` (xóa nội dung cũ trước) (`services/app/` => `services/agy-cli-auth/`)
> - Có Dockerfile 

### Spec 3 — Docker Compose (`compose.apps.yml`)

> Mô tả thay đổi cho `compose.apps.yml`:
>
> - Runtime: `<node>`
> - Build context (nếu Delivery=build): `./services/app`
> - Internal port (APP_PORT): `<number>`
> - Health path: `<path>` (ví dụ `/health`, `/api/health`, `/`)
> - Volumes cần mount:  `./docker-volumes`
> - Auth: `<protected-by-tinyauth>`
> - Depends on: `<tinyauth>`

### Spec 4 — ENV mới (`.env.example`)

> Theo `agy-cli-auth/.env.example`, nhưng thay đổi prefix là:`AGYCLI_AUTH_`
>
> **Yêu cầu bắt buộc khi liệt kê:**
>
> - Mỗi biến **phải có comment** diễn giải rõ mục đích, ảnh hưởng khi thay đổi.
> - Nếu biến có **tập giá trị cố định** → comment **toàn bộ giá trị hợp lệ** kèm tác dụng từng giá trị.
> - Nếu giá trị cần **lấy từ web** (API key, secret, token…) → ghi rõ **link** và **hướng dẫn ngắn** cách lấy.
>
> **Ví dụ format:**
>
> ```dotenv
> # Môi trường chạy ứng dụng.
> # Giá trị hợp lệ:
> #   development  → bật hot-reload, log verbose, tắt cache
> #   staging      → giống production nhưng dùng DB test
> #   production   → tắt debug, bật cache, gửi error lên Sentry
> APP_ENV=development
>
> # Cấp độ log output.
> # Giá trị hợp lệ: error | warn | info | debug | trace
> #   error  → chỉ lỗi nghiêm trọng
> #   warn   → lỗi + cảnh báo
> #   info   → thêm sự kiện chính (mặc định production)
> #   debug  → thêm luồng xử lý nội bộ
> #   trace  → toàn bộ, rất verbose
> LOG_LEVEL=info
>
> # Secret key dùng để ký JWT token.
> # Lấy tại: https://your-auth-provider.com/dashboard → Settings → API Keys
> # Hướng dẫn: Đăng nhập → chọn project → Copy "Secret Key"
> # KHÔNG commit giá trị thật lên Git.
> MY_APP_SECRET=change-me
> ```
>

### Spec 5 — SQLite / Litestream

> KHÔNG
>

### Spec 6 — Thông tin bổ sung

> Sẽ ENABLE RCLONE để backup dữ liệu runtime

---

## Thông tin cần xác nhận

Agent điền mục này nếu prompt thiếu dữ liệu cần thiết để triển khai đúng.

- [x] Không cần hỏi thêm
- [ ] Cần hỏi user trước khi làm

Câu hỏi cần xác nhận:

- ***

## Checklist triển khai

Agent tự tạo checklist từ các Spec ở trên, rồi đánh dấu khi từng bước hoàn tất.

### Phase 0 — Đọc hiểu & xác nhận

- [x] Đọc yêu cầu user và xác định phạm vi thay đổi
- [x] Kiểm tra rule bắt buộc trong `AGENTS.md`
- [x] Đọc `AGENT_APP_SWAP.md` — nắm invariants (**section 2**) VÀ common failure patterns (**section 4**)
- [x] Xác nhận đủ 6 Spec — nếu thiếu, hỏi user trước khi làm

### Phase 1 — Chuẩn bị source code

- [x] Xóa toàn bộ nội dung `services/app/` (giữ thư mục)
- [x] Copy source code app mới vào `services/app/`
- [x] Kiểm tra / tạo `services/app/Dockerfile` phù hợp runtime mới
- [x] Kiểm tra `.dockerignore` trong `services/app/` (tạo nếu cần)

### Phase 2 — Cập nhật compose.apps.yml

- [x] Sửa `compose.apps.yml` theo Spec 3 (image/build, port, env, volumes, labels, healthcheck)
- [x] Giữ đúng invariants từ `AGENT_APP_SWAP.md` section 2
- [x] Auth labels: giữ đủ 4 label `forward_auth` theo invariant 27
- [x] Nếu app dùng SSE/WebSocket: thêm `caddy.reverse_proxy.flush_interval=-1`
- [ ] Nếu bỏ auth (Spec 3 = public): bỏ `forward_auth` labels, giữ `reverse_proxy` labels — N/A (giữ protected)

### Phase 3 — Cập nhật .env.example

- [x] Thêm ENV mới theo Spec 4 vào section `APPLICATION` trong `.env.example`
- [x] Mỗi ENV mới phải có comment rõ ràng: mục đích, giá trị hợp lệ, link lấy giá trị (nếu cần)
- [x] Cập nhật `APP_IMAGE`, `APP_PORT`, `HEALTH_PATH` nếu khác mặc định — không đổi (Node, port 3000, /health)
- [x] Xóa ENV cũ không còn dùng

### Phase 4 — SQLite / Litestream (nếu Spec 5 = có)

- N/A — Spec 5 = KHÔNG dùng SQLite

### Phase 5 — Rclone compatibility check

- [x] Xác nhận tất cả app data volumes nằm dưới `${DOCKER_VOLUMES_ROOT}` (`app/logs`, `app/data`, `app/login-snapshot`, `agy-dev/gemini`)
- [x] Đã đặt `ENABLE_RCLONE=true` trong `.env.example`

### Phase 6 — Cập nhật docs & validate

- [x] Cập nhật `docs/services/app.md` mô tả app mới
- [ ] Cập nhật `docs/services/litestream.md` nếu có thay đổi Litestream — N/A
- [x] Chạy `npm run dockerapp-validate:env` (PASS các field AGYCLI_AUTH_*; còn lỗi runtime do user phải cung cấp Firebase JSON / Rclone / Cloudflared credentials)
- [x] Chạy `npm run dockerapp-validate:compose` — PASS
- [x] Cập nhật `docker-compose/scripts/validate-env.js` thêm validate AGYCLI_AUTH_*

### Phase 7 — Mock data kiểm thử

- [x] Kiểm tra lại toàn bộ thay đổi phù hợp yêu cầu
- [x] Đối chiếu lại tất cả failure patterns trong `AGENT_APP_SWAP.md` section 4
- [x] Cập nhật `.opushforce.message` đúng format trong `AGENTS.md`
- [x] Trả lời user ngắn gọn kèm danh sách file đã chỉnh

### Phase 8 — Hoàn tất

- [x] Kiểm tra lại toàn bộ thay đổi phù hợp yêu cầu
- [x] Đối chiếu lại tất cả failure patterns trong `AGENT_APP_SWAP.md` section 4
- [x] Cập nhật `.opushforce.message` đúng format trong `AGENTS.md`
- [x] Trả lời user ngắn gọn kèm danh sách file đã chỉnh

---

## File liên quan — Danh sách file mà Agent có thể đọc/chỉnh

Tham chiếu từ `AGENT_APP_SWAP.md` section 3 (Default Editable Files):

| File                                     | Hành động                 | Ghi chú                        |
| ---------------------------------------- | ------------------------- | ------------------------------ |
| `services/app/**`                        | Xóa cũ + thay source mới  | Thư mục chính của app          |
| `services/app/Dockerfile`                | Tạo mới / sửa             | Dockerfile phù hợp runtime     |
| `compose.apps.yml`                       | Sửa                       | Service `app` definition       |
| `.env.example`                           | Sửa                       | Thêm/sửa ENV mới               |
| `docker-compose/compose.auth.yml`        | Sửa (nếu cần)             | Litestream volumes, Tinyauth   |
| `services/litestream/litestream.yml`     | Sửa (nếu app dùng SQLite) | Thêm DB replica config         |
| `services/litestream/entrypoint.sh`      | Sửa (nếu app dùng SQLite) | Restore gate                   |
| `docker-compose/scripts/validate-env.js` | Sửa (nếu ENV mới)         | Validation rules               |
| `docker-compose/compose.rclone.yml`      | Sửa (nếu cần)             | Rclone sync config             |
| `services/rclone/rclone.conf.example`    | Sửa (nếu remote thay đổi) | Remote storage template        |
| `services/rclone/entrypoint.sh`          | Sửa (nếu sync logic đổi)  | Rclone sync loop script        |
| `docs/services/app.md`                   | Sửa                       | Tài liệu app mới               |
| `docs/services/litestream.md`            | Sửa (nếu cần)             | Tài liệu Litestream            |
| `docs/services/tinyauth.md`             | Sửa (nếu auth thay đổi)   | Tài liệu Tinyauth              |
| `docs/services/rclone.md`               | Sửa (nếu cần)             | Tài liệu Rclone                |

Agent cập nhật thêm file đã đọc/chỉnh vào đây:

- ***

## Kết quả kiểm tra

Agent ghi command đã chạy hoặc lý do không chạy.

- `npm run dockerapp-validate:env` →
- `npm run dockerapp-validate:compose` →

---

## Ghi chú cho lần sau

Chỉ ghi thông tin hữu ích trực tiếp cho task này, không thay cho memory dài hạn.

-
