import React from 'react';
import {
    X,
    CheckSquare,
    Square,
    Store,
    Users,
    BarChart3,
    Shield,
    Phone,
    MapPin,
    Mail,
    Calendar,
    Layers,
    DollarSign,
    CheckCircle2,
    AlertTriangle,
    Archive,
    Edit3
} from 'lucide-react';
import { SystemRole, ShopDetail, ShopSummary, AuditLogItem } from '../../types/admin.js';
import { useModalA11y } from '../../hooks/admin/useModalA11y.js';

export type RightDrawerContent =
    | { type: 'permissions'; role: SystemRole }
    | { type: 'shop-detail'; shop: ShopDetail | ShopSummary }
    | { type: 'audit-detail'; log: AuditLogItem }
    | null;

interface AdminRightDrawerProps {
    isOpen: boolean;
    content: RightDrawerContent;
    onClose: () => void;
    onSavePermissions?: (roleId: string, updatedGroups: any[]) => void;
    onEditShop?: (shop: ShopDetail | ShopSummary) => void;
    onToggleShopStatus?: (shop: ShopDetail | ShopSummary, newStatus: 'active' | 'suspended' | 'archived') => void;
}

export const AdminRightDrawer: React.FC<AdminRightDrawerProps> = ({
    isOpen,
    content,
    onClose,
    onSavePermissions,
    onEditShop,
    onToggleShopStatus
}) => {
    // Local state for permissions checkboxes when in permissions mode
    const [permissionGroups, setPermissionGroups] = React.useState<any[]>([]);

    const drawerRef = React.useRef<HTMLElement>(null);

    React.useEffect(() => {
        if (content?.type === 'permissions') {
            setPermissionGroups(JSON.parse(JSON.stringify(content.role.permissionGroups)));
        }
    }, [content]);

    // Standard accessible drawer: focus trap, restore, topmost ESC, scroll lock (Issue #88)
    useModalA11y({
        isOpen: isOpen && !!content,
        onClose,
        containerRef: drawerRef,
        modalId: 'admin-right-drawer'
    });

    if (!isOpen || !content) return null;

    // Read-only permissions mode (Issue #81): RBAC modification is reserved for Identity phase (#38/#48)

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop overlay */}
            <div
                onClick={onClose}
                className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity duration-300"
            />

            {/* Slide-over panel */}
            <aside
                ref={drawerRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                className="relative w-full max-w-full sm:max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300 outline-none"
            >
                {/* =========================================================================
                    1. PERMISSIONS MODE (Image 1 style)
                   ========================================================================= */}
                {content.type === 'permissions' && (
                    <>
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-start justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Chi tiết Quyền hạn (Read-only)</h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Vai trò:{' '}
                                    <span className="font-bold text-blue-600">{content.role.name}</span>
                                    <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500 uppercase">{content.role.code}</span>
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Permission Groups Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {permissionGroups.map((group) => (
                                <div
                                    key={group.id}
                                    className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4.5 space-y-3"
                                >
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                                        {group.id === 'shops' && <Store className="w-4 h-4 text-blue-600" />}
                                        {group.id === 'users' && <Users className="w-4 h-4 text-indigo-600" />}
                                        {group.id === 'system' && <BarChart3 className="w-4 h-4 text-purple-600" />}
                                        <span>{group.title}</span>
                                    </div>

                                    <div className="space-y-2.5 pt-1">
                                        {group.permissions.map((perm: any) => (
                                            <div
                                                key={perm.id}
                                                className="flex items-center gap-3 p-1.5 rounded-lg select-none"
                                            >
                                                {perm.enabled ? (
                                                    <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 fill-blue-50" />
                                                ) : (
                                                    <Square className="w-5 h-5 text-slate-300 shrink-0" />
                                                )}
                                                <div className="text-xs">
                                                    <p
                                                        className={`font-semibold ${
                                                            perm.enabled ? 'text-slate-900' : 'text-slate-500'
                                                        }`}
                                                    >
                                                        {perm.label}
                                                    </p>
                                                    {perm.description && (
                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                            {perm.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Sticky Action Footer (truthful read-only policy notice) */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50/80">
                            <div className="flex items-start gap-2.5 p-3 bg-blue-50/60 border border-blue-100 rounded-xl mb-3">
                                <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                    Chính sách phân quyền mặc định của nền tảng (Read-only). Tùy chỉnh vai trò và cấp quyền động sẽ được hỗ trợ trong phân hệ Quản lý Danh tính (#38/#48).
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-full py-3 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition"
                            >
                                Đóng
                            </button>
                        </div>
                    </>
                )}

                {/* =========================================================================
                    2. SHOP DETAIL MODE
                   ========================================================================= */}
                {content.type === 'shop-detail' && (
                    <>
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                                    <Store className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 leading-tight">
                                        {content.shop.name}
                                    </h3>
                                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                                        slug: /{content.shop.slug}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body Details */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            {/* Status Pill Card */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                                <div>
                                    <span className="text-xs text-slate-400 font-medium">Trạng thái hiện tại</span>
                                    <div className="mt-1">
                                        {content.shop.status === 'active' && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Đang hoạt động
                                            </span>
                                        )}
                                        {content.shop.status === 'suspended' && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                Đang tạm dừng
                                            </span>
                                        )}
                                        {content.shop.status === 'archived' && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300">
                                                <Archive className="w-3.5 h-3.5" />
                                                Đã lưu trữ
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs text-slate-400 font-medium">Phiên bản giao diện</span>
                                    <p className="text-xs font-bold text-slate-700 mt-1">v{content.shop.activePublishedVersion || 1}</p>
                                </div>
                            </div>

                            {/* Contact info */}
                            <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                    Thông tin liên hệ
                                </h4>
                                <div className="space-y-2 text-xs">
                                    <div className="flex items-center gap-2.5 text-slate-600">
                                        <Phone className="w-4 h-4 text-slate-400" />
                                        <span>{content.shop.phone || 'Chưa cập nhật SĐT'}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-slate-600">
                                        <MapPin className="w-4 h-4 text-slate-400" />
                                        <span>{content.shop.address || 'Chưa cập nhật địa chỉ'}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-slate-600">
                                        <Calendar className="w-4 h-4 text-slate-400" />
                                        <span>Ngày tạo: {new Date(content.shop.createdAt).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Owner info */}
                            <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                    Tài khoản Chủ quán
                                </h4>
                                {content.shop.owner ? (
                                    <div className="space-y-2 text-xs">
                                        <div className="flex items-center gap-2.5 text-slate-800 font-bold">
                                            <Users className="w-4 h-4 text-slate-400" />
                                            <span>{content.shop.owner.fullName}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-slate-600">
                                            <Mail className="w-4 h-4 text-slate-400" />
                                            <span className="font-mono">{content.shop.owner.email}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic">Chưa gán thông tin chủ quán</p>
                                )}
                            </div>

                            {/* Metrics Cards */}
                            {(() => {
                                const metrics = content.shop.metrics ?? {
                                    tableCount: content.shop.tableCount,
                                    orderCount: content.shop.orderCount,
                                    totalRevenue: content.shop.totalRevenue
                                };
                                const tableCountDisplay = typeof metrics?.tableCount === 'number'
                                    ? metrics.tableCount
                                    : '—';
                                const revenueDisplay = typeof metrics?.totalRevenue === 'number'
                                    ? `${metrics.totalRevenue.toLocaleString('vi-VN')} đ`
                                    : '—';

                                return (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                            <span className="text-[11px] font-semibold text-blue-700">Tổng số bàn</span>
                                            <p className="text-2xl font-extrabold text-blue-900 mt-1">
                                                {tableCountDisplay}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                                            <span className="text-[11px] font-semibold text-emerald-700">Doanh thu chốt</span>
                                            <p className="text-lg font-extrabold text-emerald-900 mt-1">
                                                {revenueDisplay}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Actions Footer */}
                        <div className="p-6 border-t border-slate-100 bg-white space-y-2.5">
                            {onEditShop && (
                                <button
                                    onClick={() => onEditShop(content.shop)}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition"
                                >
                                    <Edit3 className="w-4 h-4" />
                                    <span>Chỉnh sửa thông tin quán</span>
                                </button>
                            )}

                            {onToggleShopStatus && content.shop.status === 'active' && (
                                <button
                                    onClick={() => onToggleShopStatus(content.shop, 'suspended')}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl transition border border-amber-200"
                                >
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>Tạm dừng hoạt động quán</span>
                                </button>
                            )}

                            {onToggleShopStatus && content.shop.status === 'suspended' && (
                                <button
                                    onClick={() => onToggleShopStatus(content.shop, 'active')}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-blue-500/20"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Kích hoạt lại quán</span>
                                </button>
                            )}

                            {onToggleShopStatus && content.shop.status !== 'archived' && (
                                <button
                                    onClick={() => onToggleShopStatus(content.shop, 'archived')}
                                    className="w-full flex items-center justify-center gap-2 py-2 px-4 text-rose-600 hover:bg-rose-50 font-semibold text-xs rounded-xl transition"
                                >
                                    <Archive className="w-3.5 h-3.5" />
                                    <span>Lưu trữ quán (Zero Hard-Delete)</span>
                                </button>
                            )}
                        </div>
                    </>
                )}

                {/* =========================================================================
                    3. AUDIT DIFF DETAIL MODE
                   ========================================================================= */}
                {content.type === 'audit-detail' && (() => {
                    const log = content.log;
                    const actorName = log.userName || (log.userId ? `Người dùng (${log.userId.slice(0, 8)}...)` : 'Hệ thống / Tự động');
                    const actorEmail = log.userEmail || (log.userId ? 'Tài khoản không có email hoặc đã xoá' : '—');
                    const formattedDate = (() => {
                        try {
                            const d = new Date(log.createdAt);
                            return isNaN(d.getTime()) ? log.createdAt : d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + ' (UTC+7)';
                        } catch {
                            return log.createdAt;
                        }
                    })();

                    // Recursive redaction for sensitive fields
                    const redactSensitive = (val: any): any => {
                        if (!val || typeof val !== 'object') return val;
                        if (Array.isArray(val)) return val.map(redactSensitive);
                        const sanitized: Record<string, any> = {};
                        for (const [k, v] of Object.entries(val)) {
                            if (/password|token|secret|hash|credential|auth|p256dh|private/i.test(k)) {
                                sanitized[k] = '[ĐÃ ẨN / REDACTED]';
                            } else if (typeof v === 'object' && v !== null) {
                                sanitized[k] = redactSensitive(v);
                            } else {
                                sanitized[k] = v;
                            }
                        }
                        return sanitized;
                    };

                    const sanitizedDetails = redactSensitive(log.details);
                    const hasBeforeAfter = sanitizedDetails && typeof sanitizedDetails === 'object' && ('previous' in sanitizedDetails || 'updated' in sanitizedDetails);

                    return (
                        <>
                            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Chi tiết Thao tác</h3>
                                    <p className="text-xs text-blue-600 font-mono mt-0.5">{log.action}</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                                    <div>
                                        <span className="text-slate-400 font-medium">Người thực hiện:</span>
                                        <p className="font-bold text-slate-800">{actorName}</p>
                                        <p className="text-[11px] font-mono text-slate-500">{actorEmail}</p>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 font-medium">Thời gian:</span>
                                        <p className="font-medium text-slate-700 font-mono text-[11px]">{formattedDate}</p>
                                    </div>
                                    {log.tenantName && (
                                        <div>
                                            <span className="text-slate-400 font-medium">Quán áp dụng:</span>
                                            <p className="font-bold text-blue-600">{log.tenantName}</p>
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-slate-400 font-medium">Đối tượng:</span>
                                        <p className="font-mono text-slate-600">{log.resourceType}: {log.resourceId}</p>
                                    </div>
                                </div>

                                {hasBeforeAfter ? (() => {
                                    const prev = sanitizedDetails.previous || {};
                                    const curr = sanitizedDetails.updated || {};
                                    const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(curr)]));

                                    return (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                                So sánh Thay đổi (Before / After)
                                            </h4>
                                            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white text-xs">
                                                {allKeys.map(key => {
                                                    const prevVal = prev[key];
                                                    const currVal = curr[key];
                                                    const isChanged = JSON.stringify(prevVal) !== JSON.stringify(currVal);

                                                    return (
                                                        <div key={key} className={`p-3 space-y-1.5 ${isChanged ? 'bg-amber-50/40' : 'bg-slate-50/30'}`}>
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-mono font-bold text-slate-700">{key}</span>
                                                                {isChanged ? (
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                                        Đã đổi
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400">Không đổi</span>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                                                                <div className="p-2 rounded-xl bg-rose-50/80 text-rose-800 border border-rose-100 min-w-0">
                                                                    <span className="block text-[9px] uppercase font-bold text-rose-500 mb-0.5">Trước:</span>
                                                                    <span className="break-all whitespace-pre-wrap">{prevVal !== undefined ? JSON.stringify(prevVal) : '—'}</span>
                                                                </div>
                                                                <div className="p-2 rounded-xl bg-emerald-50/80 text-emerald-800 border border-emerald-100 min-w-0">
                                                                    <span className="block text-[9px] uppercase font-bold text-emerald-500 mb-0.5">Sau:</span>
                                                                    <span className="break-all whitespace-pre-wrap">{currVal !== undefined ? JSON.stringify(currVal) : '—'}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <details className="text-xs text-slate-500 pt-1 group">
                                                <summary className="cursor-pointer font-semibold hover:text-slate-800 select-none">
                                                    Xem dữ liệu JSON gốc (đã bảo mật)
                                                </summary>
                                                <pre className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                                                    {JSON.stringify(sanitizedDetails, null, 2)}
                                                </pre>
                                            </details>
                                        </div>
                                    );
                                })() : (
                                    <div>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                                            Dữ liệu Chi tiết (JSON)
                                        </h4>
                                        <pre className="p-4 bg-slate-950 text-slate-200 rounded-2xl text-xs font-mono whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                                            {JSON.stringify(sanitizedDetails, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-slate-100 bg-white">
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                                >
                                    Đóng
                                </button>
                            </div>
                        </>
                    );
                })()}
            </aside>
        </div>
    );
};
