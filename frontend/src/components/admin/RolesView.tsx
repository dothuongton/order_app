import React from 'react';
import { Shield, UserCheck, CreditCard, Utensils, ChevronRight, Lock } from 'lucide-react';
import { SystemRole } from '../../types/admin.js';

interface RolesViewProps {
    roles: SystemRole[];
    onSelectRole: (role: SystemRole) => void;
}

export const RolesView: React.FC<RolesViewProps> = ({ roles, onSelectRole }) => {
    const getRoleIcon = (code: string) => {
        switch (code) {
            case 'superadmin':
                return { icon: Shield, bg: 'bg-blue-50 text-blue-600' };
            case 'admin':
                return { icon: UserCheck, bg: 'bg-indigo-50 text-indigo-600' };
            case 'cashier':
                return { icon: CreditCard, bg: 'bg-emerald-50 text-emerald-600' };
            case 'waiter':
            default:
                return { icon: Utensils, bg: 'bg-amber-50 text-amber-600' };
        }
    };

    return (
        <div className="space-y-6 max-w-6xl">
            {/* Header section (matching image 1) */}
            <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    QUẢN TRỊ HỆ THỐNG
                </span>
                <h2 className="text-3xl font-extrabold text-slate-900 mt-1">Phân quyền</h2>
                <p className="text-slate-500 text-sm mt-1.5 max-w-2xl leading-relaxed">
                    Thiết lập và quản lý mức độ truy cập cho từng nhóm người dùng trong hệ thống gọi món và quản trị quán.
                </p>
            </div>

            {/* List of system roles */}
            <div className="pt-2">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                        Danh sách Vai trò Hệ thống
                    </h3>
                    <span className="text-xs text-slate-400">Nhấp vào vai trò để tùy chỉnh quyền hạn</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {roles.map((role) => {
                        const { icon: Icon, bg } = getRoleIcon(role.code);
                        return (
                            <div
                                key={role.id}
                                onClick={() => onSelectRole(role)}
                                className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-blue-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group"
                            >
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center`}>
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 group-hover:text-blue-600 transition flex items-center gap-1">
                                            Chỉnh sửa
                                            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                                        </span>
                                    </div>

                                    <h4 className="text-base font-bold text-slate-900 mt-5 group-hover:text-blue-600 transition">
                                        {role.name}
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                                        {role.description}
                                    </p>
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-semibold text-slate-600">{role.userCount} tài khoản</span>
                                    <span className="font-mono text-[10px] uppercase bg-slate-100 px-2 py-0.5 rounded-md text-slate-500 font-semibold">
                                        {role.code}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Note banner */}
            <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-start gap-3.5">
                <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 leading-relaxed">
                    <p className="font-bold text-slate-800">Cơ chế kiểm soát truy cập phân tầng (RBAC):</p>
                    <p className="mt-0.5">
                        Super Admin có quyền quản trị toàn bộ các quán và nền tảng. Quản lý quán, Thu ngân và Phục vụ được phân lập phạm vi theo đúng <span className="font-mono text-blue-700">tenant_id</span> của từng cơ sở, tuyệt đối không truy cập chéo dữ liệu của quán khác.
                    </p>
                </div>
            </div>
        </div>
    );
};
