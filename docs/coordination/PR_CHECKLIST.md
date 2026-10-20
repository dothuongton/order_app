# Quy Trình & Checklist Kiểm Tra PR Trước Khi Merge (Issue #5)

Tài liệu này hướng dẫn quy trình tạo PR, kiểm tra tự động và checklist Codex review trước khi merge vào nhánh `main`.

---

## 1. Quy định Ranh giới & Quyền sở hữu tệp (Issue #2 & #5)

| Thành viên / Lane | Phạm vi được sửa | Phạm vi TUYỆT ĐỐI KHÔNG sửa |
|---|---|---|
| **@SangVuxx** (`lane:cms-super-admin`) | `backend/src/modules/admin/**`<br>`frontend/src/pages/admin/**` (trừ AdminLogin) | `AdminLogin.tsx`, `backend/src/modules/cms/**` (CMS của quán), `frontend/src/pages/staff/**`, middleware/auth/schema/pool/config |
| **@dothuongton** (`lane:core`) | Toàn bộ phần còn lại: core, schema, pricing, billing, auth, reports, guest, staff | Không sửa đè các file admin khi lane CMS đang mở |

---

## 2. Checklist Chuẩn Bị PR

Mỗi PR khi tạo cần điền đầy đủ các mục sau:

- [ ] **Issue liên kết**: Ghi rõ mã issue (ví dụ: `Closes #3`, `Fixes #7`).
- [ ] **Mô tả thay đổi**: Nêu rõ giả định thiết kế, quyết định kiến trúc và danh sách file đã thay đổi.
- [ ] **Kiểm tra ranh giới tệp (File Boundaries)**:
  - Chạy kiểm tra: `node scripts/check-file-boundaries.mjs origin/main <github-username>`
  - Không vi phạm file ngoài allowlist của lane.
- [ ] **Kiểm tra Secret & Debug**:
  - Không có `debugger;`, không có test log lộ secret, không hardcode private keys hoặc credentials.
- [ ] **Kết quả Test thực thi**:
  - `npm --prefix backend test`: 100% test cases đạt.
  - `npm --prefix frontend run build`: Không có lỗi compile TypeScript hoặc Vite build.
- [ ] **Migration & Rollback**:
  - Nếu có migration database: đính kèm file SQL up/down hoặc phương án rollback rõ ràng.
- [ ] **Review Codex**:
  - `@dothuongton` sử dụng Codex review độc lập diff trước khi bấm merge.

---

## 3. Cấu hình Status Checks cho nhánh `main` trên GitHub

Chủ repository (`@dothuongton`) thiết lập Branch Protection Rule trên GitHub (`Settings > Branches > main`):
1. Bật **Require a pull request before merging**.
2. Bật **Require status checks to pass before merging**:
   - Status Check 1: `File Boundary & Hygiene Gate`
   - Status Check 2: `Build & Test`
3. Bật **Require branches to be up to date before merging**.

> **Lưu ý bảo mật:** Workflow PR chạy với runner cô lập, sử dụng DB test ephemeral và không được cấp quyền truy cập production secrets.
