import React, { useState } from 'react';
import { History, ChevronRight, Filter, RotateCcw, ChevronLeft, Calendar, Download, Loader2, AlertCircle } from 'lucide-react';
import { AuditLogItem, PaginationMeta } from '../../types/admin.js';
import { AdminApi } from '../../api/admin.js';

interface AuditLogsViewProps {
    logs: AuditLogItem[];
    pagination: PaginationMeta | null;
    onPageChange: (page: number) => void;
    onSelectLog: (log: AuditLogItem) => void;
    isLoading?: boolean;
    selectedAction?: string;
    onActionChange?: (action: string) => void;
    startDate?: string;
    onStartDateChange?: (date: string) => void;
    endDate?: string;
    onEndDateChange?: (date: string) => void;
    onResetFilters?: () => void;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
    logs,
    pagination,
    onPageChange,
    onSelectLog,
    isLoading = false,
    selectedAction = '',
    onActionChange,
    startDate = '',
    onStartDateChange,
    endDate = '',
    onEndDateChange,
    onResetFilters
}) => {
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);

    const handleExportCsv = async () => {
        try {
            setIsExporting(true);
            setExportError(null);

            const blob = await AdminApi.exportAuditLogsCsv({
                action: selectedAction || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined
            });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            a.download = `audit-logs-${yyyy}${mm}${dd}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setExportError(err.message || 'Không thể xuất tệp CSV');
        } finally {
            setIsExporting(false);
        }
    };

    const hasActiveFilters = Boolean(selectedAction || startDate || endDate);

    const formatDateTimeVN = (isoString: string) => {
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return isoString;
            return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + ' (UTC+7)';
        } catch {
            return isoString;
        }
    };

    return (
        <div className="space-y-6 max-w-6xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                        AN NINH & KIỂM TOÁN
                    </span>
                    <h2 className="text-3xl font-extrabold text-slate-900 mt-1">Lịch sử Thao tác (Audit Trail)</h2>
                    <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
                        Theo dõi toàn bộ các thao tác quản trị, thay đổi vòng đời và cấu hình cơ sở trên hệ thống.
                    </p>
                </div>
                <div>
                    <button
                        type="button"
                        onClick={handleExportCsv}
                        disabled={isExporting}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-white border border-slate-200/80 shadow-xs text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        title="Xuất tối đa 1.000 bản ghi theo bộ lọc hiện tại"
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                                <span>Đang xuất CSV...</span>
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4 text-slate-600" />
                                <span>Xuất CSV (≤ 1.000)</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Export Error Alert */}
            {exportError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>{exportError}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setExportError(null)}
                        className="text-rose-500 hover:text-rose-700 font-semibold text-xs ml-4"
                    >
                        Đóng
                    </button>
                </div>
            )}

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px] mr-1">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <span>Bộ lọc:</span>
                </div>

                {/* Action Filter */}
                <div className="flex-1 min-w-[180px]">
                    <select
                        value={selectedAction}
                        onChange={(e) => onActionChange && onActionChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    >
                        <option value="">Tất cả hành động</option>
                        <option value="SUPER_ADMIN_CREATE_SHOP">Tạo quán mới (CREATE_SHOP)</option>
                        <option value="SUPER_ADMIN_UPDATE_SHOP">Cập nhật thông tin quán (UPDATE_SHOP)</option>
                        <option value="SUPER_ADMIN_STATUS_CHANGE">Đổi trạng thái quán (STATUS_CHANGE)</option>
                    </select>
                </div>

                {/* Date Range: From */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] text-slate-400 font-medium">Từ:</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => onStartDateChange && onStartDateChange(e.target.value)}
                        className="bg-transparent text-xs text-slate-800 focus:outline-none"
                    />
                </div>

                {/* Date Range: To */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] text-slate-400 font-medium">Đến:</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => onEndDateChange && onEndDateChange(e.target.value)}
                        className="bg-transparent text-xs text-slate-800 focus:outline-none"
                    />
                </div>

                {/* Reset Filters */}
                {hasActiveFilters && onResetFilters && (
                    <button
                        onClick={onResetFilters}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200/60 transition"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Đặt lại</span>
                    </button>
                )}

                {pagination && (
                    <div className="ml-auto text-slate-400 text-[11px] font-medium">
                        Tổng cộng: <span className="font-bold text-slate-700">{pagination.total}</span> bản ghi
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                <th className="py-3.5 px-6">Hành Động</th>
                                <th className="py-3.5 px-6">Người Thực Hiện</th>
                                <th className="py-3.5 px-6">Quán Áp Dụng</th>
                                <th className="py-3.5 px-6">Thời Gian</th>
                                <th className="py-3.5 px-6 text-right">Chi Tiết Diff</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-slate-400">
                                        Đang tải dữ liệu nhật ký...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-16 text-center text-slate-400">
                                        {hasActiveFilters
                                            ? 'Không tìm thấy bản ghi nhật ký phù hợp với bộ lọc.'
                                            : 'Chưa có bản ghi nhật ký nào.'}
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    // Actor resolution logic
                                    const actorName = log.userName || (log.userId ? `Người dùng (${log.userId.slice(0, 8)}...)` : 'Hệ thống / Tự động');
                                    const actorEmail = log.userEmail || (log.userId ? 'Tài khoản đã xoá hoặc chưa có email' : '—');

                                    return (
                                        <tr
                                            key={log.id}
                                            onClick={() => onSelectLog(log)}
                                            className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                                        >
                                            <td className="py-4 px-6 font-bold text-slate-900">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                        <History className="w-4 h-4" />
                                                    </div>
                                                    <span className="font-mono text-xs text-blue-700">{log.action}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <p className="font-semibold text-slate-800">{actorName}</p>
                                                <p className="text-[11px] text-slate-400 font-mono">{actorEmail}</p>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="font-semibold text-slate-700">
                                                    {log.tenantName || '— Toàn hệ thống —'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-slate-500 font-mono text-[11px]">
                                                {formatDateTimeVN(log.createdAt)}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold group-hover:bg-blue-600 group-hover:text-white transition">
                                                    <span>Xem Diff</span>
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {pagination && pagination.totalPages > 1 && (
                    <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <div>
                            Trang <span className="font-bold text-slate-900">{pagination.page}</span> /{' '}
                            <span className="font-bold text-slate-900">{pagination.totalPages}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onPageChange(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onPageChange(pagination.page + 1)}
                                disabled={pagination.page >= pagination.totalPages}
                                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
