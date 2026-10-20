# API matrix — HEAD 1a773f7

Kiểm kê tĩnh 65 route. Đây là ma trận điểm gắn middleware, không phải khẳng định mọi nhánh xử lý đã được test. Cần kiểm tra tenant/input/side effects ở phần handler; xem báo cáo chính cho các lỗ hổng đã tái hiện.

| Route | Xác thực/ủy quyền nền | Quyền riêng ở route | Nguồn |
|---|---|---|---|
| POST /api/v1/auth/login | Staff cho /me; login/logout công khai | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/auth/auth.routes.ts:12 |
| GET /api/v1/auth/me | Staff cho /me; login/logout công khai | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/auth/auth.routes.ts:120 |
| POST /api/v1/auth/logout | Staff cho /me; login/logout công khai | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/auth/auth.routes.ts:126 |
| GET /api/v1/public/tables/:qrId/menu | Guest cho /guest/*; public cho /public/* | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/guest/guest.routes.ts:11 |
| POST /api/v1/public/tables/:qrId/join | Guest cho /guest/*; public cho /public/* | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/guest/guest.routes.ts:28 |
| GET /api/v1/guest/session | Guest cho /guest/*; public cho /public/* | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/guest/guest.routes.ts:63 |
| POST /api/v1/guest/orders | Guest cho /guest/*; public cho /public/* | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/guest/guest.routes.ts:82 |
| GET /api/v1/guest/orders | Guest cho /guest/*; public cho /public/* | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/guest/guest.routes.ts:112 |
| GET /api/v1/guest/bill-summary | Guest cho /guest/*; public cho /public/* | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/guest/guest.routes.ts:123 |
| POST /api/v1/guest/service-requests | Guest cho /guest/*; public cho /public/* | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/guest/guest.routes.ts:134 |
| GET /api/v1/guest/operations/:requestId | Guest cho /guest/*; public cho /public/* | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/guest/guest.routes.ts:161 |
| GET /api/v1/staff/dashboard/snapshot | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:19 |
| POST /api/v1/staff/tables/:id/open | Staff + membership active | session.open | backend/src/modules/staff/staff.routes.ts:30 |
| POST /api/v1/staff/tables/:id/mark-ready | Staff + membership active | table.manage | backend/src/modules/staff/staff.routes.ts:46 |
| POST /api/v1/staff/order-items/:id/accept | Staff + membership active | order.manage | backend/src/modules/staff/staff.routes.ts:62 |
| POST /api/v1/staff/sessions/:id/accept-all | Staff + membership active | order.manage | backend/src/modules/staff/staff.routes.ts:79 |
| POST /api/v1/staff/order-items/:id/serve | Staff + membership active | order.serve | backend/src/modules/staff/staff.routes.ts:91 |
| POST /api/v1/staff/sessions/:id/serve-all | Staff + membership active | order.serve | backend/src/modules/staff/staff.routes.ts:108 |
| POST /api/v1/staff/order-items/:id/cancel | Staff + membership active | order.cancel | backend/src/modules/staff/staff.routes.ts:120 |
| GET /api/v1/staff/sessions/:id/bill-summary | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:144 |
| POST /api/v1/staff/sessions/:id/confirm-payment-and-close | Staff + membership active | session.confirm_payment_close | backend/src/modules/staff/staff.routes.ts:160 |
| POST /api/v1/staff/sessions/:id/close-without-charge | Staff + membership active | session.close_without_charge | backend/src/modules/staff/staff.routes.ts:190 |
| POST /api/v1/staff/service-requests/:id/accept | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:212 |
| POST /api/v1/staff/service-requests/:id/complete | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:227 |
| POST /api/v1/staff/service-requests/:id/cancel | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:242 |
| GET /api/v1/staff/tables/:id/qr-code | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:259 |
| GET /api/v1/staff/menu/categories | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:292 |
| GET /api/v1/staff/menu/items | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:539 |
| GET /api/v1/staff/menu/items/:id | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/staff/staff.routes.ts:676 |
| POST /api/v1/staff/menu/reorder | Staff + membership active | menu.manage | backend/src/modules/staff/staff.routes.ts:691 |
| PUT /api/v1/staff/menu/items/:id/toggle-available | Staff + membership active | menu.manage | backend/src/modules/staff/staff.routes.ts:738 |
| POST /api/v1/staff/menu/items | Staff + membership active | menu.manage | backend/src/modules/staff/staff.routes.ts:794 |
| PUT /api/v1/staff/menu/items/:id | Staff + membership active | menu.manage | backend/src/modules/staff/staff.routes.ts:861 |
| DELETE /api/v1/staff/menu/items/:id | Staff + membership active | menu.manage | backend/src/modules/staff/staff.routes.ts:957 |
| POST /api/v1/staff/tables | Staff + membership active | table.manage | backend/src/modules/staff/staff.routes.ts:976 |
| PATCH /api/v1/staff/tables/:id | Staff + membership active | table.manage | backend/src/modules/staff/staff.routes.ts:1016 |
| DELETE /api/v1/staff/tables/:id | Staff + membership active | table.manage | backend/src/modules/staff/staff.routes.ts:1063 |
| POST /api/v1/cms/upload | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:22 |
| GET /api/v1/cms/profile | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:57 |
| PATCH /api/v1/cms/profile | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:71 |
| GET /api/v1/cms/draft | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:85 |
| PUT /api/v1/cms/draft | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:99 |
| POST /api/v1/cms/publish | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:125 |
| GET /api/v1/cms/versions | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:140 |
| POST /api/v1/cms/rollback | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:154 |
| GET /api/v1/cms/banners | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:171 |
| POST /api/v1/cms/banners | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:181 |
| PATCH /api/v1/cms/banners/:id | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:191 |
| DELETE /api/v1/cms/banners/:id | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:201 |
| GET /api/v1/cms/promotions | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:213 |
| POST /api/v1/cms/promotions | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:223 |
| PATCH /api/v1/cms/promotions/:id | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:233 |
| DELETE /api/v1/cms/promotions/:id | Staff + owner/manager | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/cms/cms.routes.ts:243 |
| GET /api/v1/admin/stats | Super Admin từ DB | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/admin/admin.routes.ts:19 |
| GET /api/v1/admin/shops | Super Admin từ DB | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/admin/admin.routes.ts:32 |
| POST /api/v1/admin/shops | Super Admin từ DB | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/admin/admin.routes.ts:47 |
| PATCH /api/v1/admin/shops/:id | Super Admin từ DB | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/admin/admin.routes.ts:75 |
| GET /api/v1/admin/templates | Super Admin từ DB | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/admin/admin.routes.ts:99 |
| GET /api/v1/admin/audit-logs | Super Admin từ DB | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/admin/admin.routes.ts:112 |
| GET /api/v1/staff/reports/summary | Staff + report.view | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/reports/reports.routes.ts:10 |
| GET /api/v1/staff/push/public-key | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/push/push.routes.ts:14 |
| GET /api/v1/staff/push/status | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/push/push.routes.ts:23 |
| POST /api/v1/staff/push/subscribe | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/push/push.routes.ts:41 |
| POST /api/v1/staff/push/unsubscribe | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/push/push.routes.ts:74 |
| POST /api/v1/staff/push/test | Staff + membership active | Quyền router / không có kiểm tra quyền bổ sung | backend/src/modules/push/push.routes.ts:101 |
