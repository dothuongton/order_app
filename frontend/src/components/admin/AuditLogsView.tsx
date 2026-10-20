import React, { useState } from 'react';
import { FileText, ChevronLeft, ChevronRight, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { AuditLogItem, PaginationMeta } from '../../types/admin.js';
import { EmptyState } from './EmptyState.js';

interface AuditLogsViewProps {
    logs: AuditLogItem[];
    pagination: PaginationMeta;
    loading: boolean;
    actionFilter: string;
    onActionFilterChange: (val: string) => void;
    onPageChange: (newPage: number) => void;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
    logs,
    pagination,
    loading,
    actionFilter,
    onActionFilterChange,
    onPageChange
}) => {
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    const toggleExpand = (id: string) => {
        setExpandedLogId(prev => prev === id ? null : id);
    };

    const renderActionBadge = (action: string) => {
        if (action === 'SUPER_ADMIN_CREATE_SHOP') {
            return <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono">TẠO QUÁN MỚI</span>;
        }
        if (action === 'SUPER_ADMIN_STATUS_CHANGE') {
            return <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono">ĐỔI VÒNG ĐỜI</span>;
        }
        if (action === 'SUPER_ADMIN_UPDATE_SHOP') {
            return <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono">CẬP NHẬT QUÁN</span>;
        }
        return <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-mono">{action}</span>;
    };

    return (
        <div className="space-y-4">
            {/* Filter toolbar */}
            <div className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-300">Lọc theo hành động:</span>
                    <select
                        value={actionFilter}
                        onChange={(e) => onActionFilterChange(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                    >
                        <option value="">Tất cả hành động</option>
                        <option value="SUPER_ADMIN_CREATE_SHOP">Khởi tạo quán mới</option>
                        <option value="SUPER_ADMIN_STATUS_CHANGE">Thay đổi vòng đời quán</option>
                        <option value="SUPER_ADMIN_UPDATE_SHOP">Cập nhật thông tin quán</option>
                    </select>
                </div>

                <div className="text-xs text-slate-400 font-medium">
                    Tổng cộng: <strong>{pagination.total}</strong> bản ghi
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-4 animate-pulse">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-10 bg-slate-800/60 rounded-xl" />
                    ))}
                </div>
            ) : logs.length === 0 ? (
                <EmptyState
                    icon={FileText}
                    title="Chưa có nhật ký kiểm toán nào"
                    description={actionFilter ? 'Không tìm thấy nhật ký phù hợp với bộ lọc hiện tại.' : 'Các thao tác quản trị nền tảng sẽ được ghi nhận tự động tại đây.'}
                />
            ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
                                <tr>
                                    <th className="p-3.5">Thời Gian</th>
                                    <th className="p-3.5">Người Thực Hiện</th>
                                    <th className="p-3.5">Hành Động</th>
                                    <th className="p-3.5">Mục Tiêu / Quán</th>
                                    <th className="p-3.5">Chi Tiết Thay Đổi</th>
                                    <th className="p-3.5 w-12 text-center"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 text-slate-300">
                                {logs.map(log => {
                                    const isExpanded = expandedLogId === log.id;
                                    return (
                                        <React.Fragment key={log.id}>
                                            <tr className="hover:bg-slate-850/60 transition cursor-pointer" onClick={() => toggleExpand(log.id)}>
                                                <td className="p-3.5 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                                                    {new Date(log.createdAt).toLocaleString('vi-VN')}
                                                </td>
                                                <td className="p-3.5 font-semibold text-white whitespace-nowrap">
                                                    <div>{log.userName || log.userEmail || 'Super Admin'}</div>
                                                    {log.userEmail && <div className="text-[10px] text-slate-500 font-mono">{log.userEmail}</div>}
                                                </td>
                                                <td className="p-3.5 whitespace-nowrap">
                                                    {renderActionBadge(log.action)}
                                                </td>
                                                <td className="p-3.5 font-medium text-slate-200 whitespace-nowrap">
                                                    {log.tenantName || log.resourceId}
                                                </td>
                                                <td className="p-3.5 font-mono text-[10px] text-slate-400 max-w-xs truncate">
                                                    {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                                                </td>
                                                <td className="p-3.5 text-center text-slate-500">
                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </td>
                                            </tr>

                                            {/* Expanded Row for JSON Inspection */}
                                            {isExpanded && (
                                                <tr className="bg-slate-950/80">
                                                    <td colSpan={6} className="p-4 border-t border-slate-850">
                                                        <div className="space-y-1">
                                                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                                                Dữ Liệu Chi Tiết (Audit Diff):
                                                            </div>
                                                            <pre className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-[11px] font-mono text-indigo-300 overflow-x-auto max-h-60">
                                                                {JSON.stringify(log.details, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
                    <div>
                        Trang <strong>{pagination.page}</strong> / <strong>{pagination.totalPages}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onPageChange(pagination.page - 1)}
                            disabled={pagination.page <= 1}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-white">
                            {pagination.page} / {pagination.totalPages}
                        </div>

                        <button
                            onClick={() => onPageChange(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
