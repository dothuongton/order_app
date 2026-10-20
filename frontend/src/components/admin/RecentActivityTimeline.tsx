import React from 'react';
import { FileText, MessageSquare, CheckCircle, Store, AlertCircle } from 'lucide-react';
import { AuditLogItem } from '../../types/admin.js';

interface RecentActivityTimelineProps {
    logs: AuditLogItem[];
    isLoading?: boolean;
    onSelectLog?: (log: AuditLogItem) => void;
}

export const RecentActivityTimeline: React.FC<RecentActivityTimelineProps> = ({
    logs,
    isLoading = false,
    onSelectLog
}) => {
    const getActionInfo = (action: string) => {
        switch (action) {
            case 'SUPER_ADMIN_CREATE_SHOP':
                return {
                    title: 'Tạo quán mới',
                    icon: Store,
                    bgColor: 'bg-blue-100 text-blue-700'
                };
            case 'SUPER_ADMIN_UPDATE_SHOP':
                return {
                    title: 'Cập nhật quán',
                    icon: FileText,
                    bgColor: 'bg-indigo-100 text-indigo-700'
                };
            case 'SUPER_ADMIN_STATUS_CHANGE':
                return {
                    title: 'Đổi trạng thái',
                    icon: AlertCircle,
                    bgColor: 'bg-amber-100 text-amber-700'
                };
            default:
                return {
                    title: 'Thao tác hệ thống',
                    icon: CheckCircle,
                    bgColor: 'bg-emerald-100 text-emerald-700'
                };
        }
    };

    const formatDateTimeVN = (isoString: string) => {
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return isoString;
            return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + ' (UTC+7)';
        } catch {
            return isoString;
        }
    };

    const formatRelativeTime = (isoString: string) => {
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return isoString;
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            if (diffMs <= 0) return 'Vừa xong';
            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins < 1) return 'Vừa xong';
            if (diffMins < 60) return `${diffMins} phút trước`;
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${diffHours} giờ trước`;
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays === 1) return 'Hôm qua';
            if (diffDays < 30) return `${diffDays} ngày trước`;
            return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        } catch {
            return isoString;
        }
    };

    return (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs h-full flex flex-col">
            <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-900">Hoạt động gần đây</h3>
                <span className="text-xs text-slate-400">Nhật ký</span>
            </div>

            {isLoading ? (
                <div className="space-y-4 flex-1">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : logs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                        <MessageSquare className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-slate-400 font-medium">Chưa có hoạt động nào được ghi nhận</p>
                </div>
            ) : (
                <div className="relative space-y-4 flex-1 overflow-y-auto pr-1">
                    {/* Vertical connector line */}
                    <div className="absolute left-4 top-3 bottom-3 w-0.5 bg-slate-100 -z-0" />

                    {logs.slice(0, 6).map((log) => {
                        const info = getActionInfo(log.action);
                        const Icon = info.icon;
                        const time = formatRelativeTime(log.createdAt);

                        return (
                            <div
                                key={log.id}
                                onClick={() => onSelectLog && onSelectLog(log)}
                                className="relative flex items-start gap-3.5 p-3 rounded-2xl hover:bg-slate-50 transition cursor-pointer group"
                            >
                                <div
                                    className={`relative z-10 w-8 h-8 rounded-full ${info.bgColor} flex items-center justify-center shrink-0 shadow-xs`}
                                >
                                    <Icon className="w-4 h-4" />
                                </div>

                                <div className="flex-1 min-w-0" title={formatDateTimeVN(log.createdAt)}>
                                    <div className="flex items-center justify-between gap-1">
                                        <p className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600 transition">
                                            {info.title}
                                        </p>
                                        <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                            {time}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                        {log.tenantName ? `Quán: ${log.tenantName}` : log.resourceType}
                                        {log.userName ? ` bởi ${log.userName}` : (log.userId ? ` bởi Người dùng (${log.userId.slice(0, 8)}...)` : ' bởi Hệ thống')}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
