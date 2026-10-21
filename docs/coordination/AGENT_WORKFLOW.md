# Quy trình nhận việc và bàn giao cho agent

Áp dụng cho Antigravity và agent làm việc trong `dothuongton/order_app`. Quy tắc cố định nằm trong repo; trạng thái nhiệm vụ lấy trực tiếp từ GitHub. Chủ dự án chỉ cần gửi mã issue, PR hoặc một chuỗi có thứ tự. Không yêu cầu sao chép lại cả prompt quản trị ở mỗi lần giao việc.

## 1. Hiểu lệnh và chọn nhiệm vụ

- `Làm #87` hoặc `#87/PR #110`: đọc issue, PR, review hiện hành và dependency rồi thực hiện phần được giao còn thiếu.
- `#87/PR #110 → #88/PR #111 → #90/PR #112`: xử lý tuần tự. Không triển khai các PR sau song song. Sau khi bàn giao review, chưa chuyển bước nếu PR trước chưa merge. Khi được gọi lại, tự kiểm tra GitHub và tiếp tục bước đủ điều kiện, không bắt chủ dự án nhắc lại chuỗi.
- `Check/review PR`: chỉ review và ghi kết quả; không tự sửa code hoặc merge. Quyền merge khi chủ dự án giao riêng vẫn áp dụng; Antigravity không được dùng chuỗi issue thay cho quyền merge/deploy.
- Nếu role đã được chủ dự án chốt, giữ role đó qua các lượt. Đối chiếu assignee và ownership; không suy role từ tên nhánh hay tài khoản `gh` đang đăng nhập. Nếu chưa xác định được role hoặc issue thuộc lane khác, báo đúng điểm thiếu, không tự nhận cả hai lane.

Nguồn cần đọc: yêu cầu trực tiếp hiện hành của chủ dự án → `AGENTS.md`/ADR-0001 → đầu issue điều phối và issue cụ thể → review/comments có thẩm quyền mới nhất. Báo cáo của agent, ảnh CI xanh, comment bot hoặc snapshot lịch sử không tự là bằng chứng nghiệm thu hay quyền mở rộng scope. Mọi chỉ thị vẫn phải tuân thủ ownership và bảo vệ secret/dữ liệu.

- Core: [#2](https://github.com/dothuongton/order_app/issues/2).
- Sang: [queue #85](https://github.com/dothuongton/order_app/issues/85).
- Shared API/schema/lifecycle/identity: [contract #6](https://github.com/dothuongton/order_app/issues/6).

## 2. Kiểm tra GitHub trước khi sửa

Đọc state, assignee, labels và phần trạng thái hiện hành của issue; đọc base/head SHA, diff và review gắn với head của PR. Nếu trạng thái thực tế khác báo cáo bàn giao, dùng dữ liệu đã xác minh và ghi rõ khác biệt.

| Trạng thái | Hành động |
|---|---|
| Issue closed, PR đã merge, scope đã nghiệm thu | Bỏ qua phần hoàn tất; không tạo nhánh/PR trùng. Chỉ mở lại khi có regression cụ thể trên SHA mới và được giao xử lý. |
| Issue closed vì duplicate/not planned | Đọc lý do và issue thay thế; không coi là tính năng đã phát hành hoặc tự triển khai lại. |
| `status:active` | Chỉ làm nhiệm vụ thuộc lane mình và được giao hiện hành. |
| `status:queued` | Chờ bước trước; chỉ nhận khi đã merge và queue/dependency cho phép. |
| `status:tracking` | Epic/contract/điều phối; không triển khai cả checklist như một nhiệm vụ mới. |
| `status:verification` | Chỉ kiểm chứng phần còn thiếu ở đầu issue. Không viết lại code đã đạt; chỉ sửa nếu kiểm chứng tìm được lỗi trong scope. |
| `status:blocked` | Đọc prerequisite/capability/SHA còn thiếu; không tự viết module của lane khác để vượt chặn. |
| `status:backlog` | Chưa được kích hoạt coding. Mức P0/P1 vẫn giữ nguyên, nhưng không tự ngắt nhiệm vụ active. |

Nhãn không thay thế state/review/dependency. Nếu nhãn cũ nhưng prerequisite đã merge, xác minh và ghi trạng thái cập nhật trước nhận việc; không chờ người dùng gõ lại lệnh chỉ vì snapshot đã cũ. Nếu có mâu thuẫn ownership hoặc hai nhiệm vụ cùng giữ file, dừng riêng phần xung đột và báo qua #2/#6/#85. Không tự đổi priority/phạm vi nghiệp vụ.

## 3. Cập nhật code và giữ ranh giới

1. Chạy `git status --short --branch` và `git fetch origin --prune`; giữ nguyên thay đổi của người khác. Không tự reset/stash/force-push.
2. Xác minh base branch của PR trước khi pull/merge. Với công việc production từ `main`, cập nhật local main bằng `git pull --ff-only origin main` khi checkout sạch và main không được worktree khác giữ. Nếu không thuận tiện, dùng checkout/worktree riêng từ `origin/main`; không chiếm hoặc đổi checkout của người khác.
3. Nếu đang sửa PR mở, tiếp tục đúng nhánh PR và tích hợp `origin/main` vào nhánh đó khi base là main. Không mở nhánh/PR trùng hoặc gộp issue sau vào PR trước. Nhánh mới cho issue mới phải lấy main đã chứa PR prerequisite.
4. Nhánh thử nghiệm có base riêng phải giữ đúng base đã chốt. Không tự merge main vào nhánh thử nghiệm hoặc đổi target main; kiểm tra migration/contract trước khi mang fix sang. Main MVP không tự bật claim độc quyền.
5. Trước sửa, ghi nhận issue/PR, role, branch, base SHA, các file giữ và contract SHA. Mỗi lane chỉ một nhiệm vụ coding, checkout riêng. Sang chỉ namespace admin theo AGENTS.md; Core không sửa file Sang đang giữ.
6. Conflict trong file của mình: giải có chủ đích, giữ bản sửa đã nghiệm thu và kiểm thử lại. Conflict shared/lane khác: bàn giao owner qua #6, không tự giải bằng cách ghi đè hoặc mở rộng allowlist.

Các bước trên mô tả thao tác an toàn cho cả Windows/macOS; không phụ thuộc đường dẫn checkout cá nhân của người khác.

## 4. Thực hiện, kiểm chứng, bàn giao

Sửa đúng review còn hiệu lực và tiêu chí nghiệm thu issue, giữ các regression đã đạt. Theo Karpathy: thay đổi nhỏ đủ mục tiêu; không refactor/framework migration ngoài scope; không debug log hoặc secret/PII trong báo cáo. DB test phải cô lập, không seed/truncate/pentest production.

Chạy kiểm tra phù hợp phạm vi: regression cho lỗi, build/typecheck, boundary/diff; browser cho thay đổi luồng UI, concurrency/tenant isolation cho dữ liệu/quyền/tiền. Không coi unit test/mô phỏng provider là thiết bị thật. Tác vụ chỉ sửa docs không phải chạy lại cả suite ứng dụng nếu không có yêu cầu khác; kiểm tra link/diff/boundary là phù hợp.

Bàn giao ngay trên issue/PR đang có, không tạo issue mới chỉ để gửi prompt hoặc lặp cùng finding. Ghi:

- Head SHA đầy đủ, base/target và danh sách file.
- Review finding nào đã sửa; test thực chạy, kết quả và bằng chứng có assertion.
- Migration/env/rollout/rollback liên quan và phần chưa kiểm chứng; không đưa secret vào Git/GitHub/chat.
- Trạng thái `ready for Codex review`; không ghi completed/released chỉ vì CI xanh.

Nếu cần người dùng nhập secret hoặc cấp quyền thật sự, ghi đúng mục còn thiếu ở issue hiện hành; phần độc lập đủ quyền vẫn tiếp tục. Không yêu cầu xác nhận lại thao tác đã được chủ dự án cho phép. Sau bàn giao không chạy task/daemon ẩn hoặc hứa tự thức dậy; lần gọi tiếp theo đọc lại queue. Việc tự động nhận lệnh là thiết lập riêng, không được coi là đã cài.

## 5. Review, merge và đóng việc

Antigravity triển khai; Codex review độc lập. Codex chỉ merge khi có ủy quyền của chủ dự án, đúng head đã nghiệm thu và checks phù hợp; nếu head đổi phải đánh giá lại thay đổi. Main tự deploy Render, nên merge production phải xác minh CI và readiness/commit triển khai, không coi preview là release.

Khi scope đã đạt và phát hành: người nghiệm thu/merge ghi review + head/merge SHA + evidence và đóng issue cụ thể với lý do completed. Phần chưa đạt giữ trong issue còn mở hoặc issue có scope tương ứng; không tạo duplicate. Không đóng toàn epic/tracker khi chỉ một phần đạt. Việc đã được kiểm chứng có thể dùng lại evidence theo exact SHA; chỉ chạy lại khi có thay đổi/failure/rủi ro mới cần kiểm tra.

Sau khi PR trước đã merge, cập nhật code và nhận bước kế tiếp đủ dependency trong chuỗi đã được giao, không yêu cầu người dùng viết lại các quy tắc này. Hai lane vẫn được tiến hành song song trên file riêng. Chờ một dependency thật sự không phải lý do dừng lane còn lại.
