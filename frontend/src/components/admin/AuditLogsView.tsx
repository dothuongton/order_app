import React from 'react';
import { History, ChevronRight, Shield, FileText, AlertCircle, ChevronLeft } from 'lucide-react';
import { AuditLogItem, PaginationMeta } from '../../types/admin.js';

interface AuditLogsViewProps {
    logs: AuditLogItem[];
    pagination: PaginationMeta | null;
    onPageChange: (page: number) => void;
    onSelectLog: (log: AuditLogItem) => void;
    isLoading?: boolean;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
    logs,
    pagination,
    onPageChange,
    onSelectLog,
    isLoading = false
}) => {
    return (
        <div className="space-y-6 max-w-6xl">
            {/* Header */}
            <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    AN NINH & BẢO MẬT
                </span>
                <h2 className="text-3xl font-extrabold text-slate-900 mt-1">Lịch sử Thao tác (Audit Trail)</h2>
                <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
                    Theo dõi toàn bộ các hành động nhạy cảm của Super Admin trên hệ thống theo chuẩn bất biến (Append-only ledger).
                </p>
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
                                        Chưa có bản ghi nhật ký nào.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
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
                                            <p className="font-semibold text-slate-800">{log.userName || 'Super Admin'}</p>
                                            <p className="text-[11px] text-slate-400 font-mono">{log.userEmail || 'Hệ thống'}</p>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className="font-semibold text-slate-700">
                                                {log.tenantName || '— Toàn hệ thống —'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-slate-500">
                                            {new Date(log.createdAt).toLocaleString('vi-VN')}
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold group-hover:bg-blue-600 group-hover:text-white transition">
                                                <span>Xem Diff</span>
                                                <ChevronRight className="w-3.5 h-3.5" />
                                            </div>
                                        </td>
                                    </tr>
                                ))
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
