import React, { useState, useEffect } from 'react';
import { request } from '../../api/client.js';
import { ShopDetail, CmsTemplate } from '../../types/cms.js';
import {
    Store, Plus, Search, ShieldCheck, LogOut, CheckCircle,
    XCircle, Clock, AlertTriangle, Layers, FileText, TrendingUp,
    Building2, RefreshCw, Smartphone, ExternalLink, ChevronRight
} from 'lucide-react';

interface AdminDashboardProps {
    user: any;
    onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'shops' | 'templates' | 'stats' | 'logs'>('shops');
    const [shops, setShops] = useState<ShopDetail[]>([]);
    const [templates, setTemplates] = useState<CmsTemplate[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    
    // Modal states
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [createForm, setCreateForm] = useState({
        name: '',
        slug: '',
        phone: '',
        address: '',
        ownerEmail: '',
        ownerFullName: '',
        ownerPassword: ''
    });
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const token = localStorage.getItem('admin_token') || '';

    // Fetch initial data
    const loadData = async () => {
        setLoading(true);
        try {
            const [statsData, shopsData, templatesData, logsData] = await Promise.all([
                request<any>('/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
                request<{ shops: ShopDetail[] }>(`/admin/shops?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`, { headers: { Authorization: `Bearer ${token}` } }),
                request<{ templates: CmsTemplate[] }>('/admin/templates', { headers: { Authorization: `Bearer ${token}` } }),
                request<{ logs: any[] }>('/admin/audit-logs?limit=30', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            setStats(statsData);
            setShops(shopsData.shops || []);
            setTemplates(templatesData.templates || []);
            setAuditLogs(logsData.logs || []);
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi tải dữ liệu hệ thống' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [searchQuery, statusFilter]);

    // Create shop handler
    const handleCreateShop = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setActionMsg(null);

        try {
            await request('/admin/shops', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify(createForm)
            });

            setActionMsg({ type: 'success', text: `Tạo quán "${createForm.name}" thành công!` });
            setShowCreateModal(false);
            setCreateForm({
                name: '',
                slug: '',
                phone: '',
                address: '',
                ownerEmail: '',
                ownerFullName: '',
                ownerPassword: ''
            });
            loadData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi tạo quán mới' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Toggle shop suspension
    const handleToggleStatus = async (shop: ShopDetail) => {
        const nextStatus = shop.status === 'suspended' ? 'active' : 'suspended';
        const confirmMsg = shop.status === 'suspended'
            ? `Mở khóa hoạt động cho quán "${shop.name}"?`
            : `Tạm dừng quán "${shop.name}"? Quán sẽ bị chặn nhận đơn mới cho đến khi mở lại.`;

        if (!window.confirm(confirmMsg)) return;

        try {
            await request(`/admin/shops/${shop.id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: nextStatus })
            });

            setActionMsg({ type: 'success', text: `Đã ${nextStatus === 'active' ? 'kích hoạt' : 'tạm dừng'} quán thành công` });
            loadData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi cập nhật trạng thái quán' });
        }
    };

    // Auto-generate slug from name
    const handleNameChange = (val: string) => {
        const generatedSlug = val
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
        setCreateForm(prev => ({ ...prev, name: val, slug: generatedSlug }));
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            {/* Top Navigation */}
            <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-indigo-600/30">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base font-black tracking-tight text-white">QR Order Platform CMS</h1>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                SUPER ADMIN
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400">Quản trị toàn bộ Quán, Template & Doanh thu</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-200">{user?.fullName || 'Super Administrator'}</div>
                        <div className="text-[10px] text-slate-400">{user?.email || 'superadmin@qrorder.vn'}</div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                        title="Đăng xuất"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Notification alert banner */}
            {actionMsg && (
                <div className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-between transition ${
                    actionMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-200 border-b border-emerald-500/30' : 'bg-rose-500/20 text-rose-200 border-b border-rose-500/30'
                }`}>
                    <span>{actionMsg.text}</span>
                    <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-white text-xs">Đóng</button>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
                {/* Metrics Cards */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                                Tổng Số Quán
                            </span>
                            <div className="text-2xl font-black text-white">{stats.totalShops}</div>
                            <span className="text-[10px] text-emerald-400 font-semibold">{stats.activeShops} quán hoạt động</span>
                        </div>

                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                Quán Tạm Dừng
                            </span>
                            <div className="text-2xl font-black text-amber-400">{stats.suspendedShops}</div>
                            <span className="text-[10px] text-slate-400">Đang bị khóa tạo đơn</span>
                        </div>

                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                                Doanh Thu Đã Chốt
                            </span>
                            <div className="text-2xl font-black text-emerald-400">
                                {stats.totalRevenue.toLocaleString('vi-VN')}đ
                            </div>
                            <span className="text-[10px] text-slate-400">{stats.totalSettlements} lượt xác nhận thu</span>
                        </div>

                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-orange-400" />
                                Tổng Lượt Đặt Món
                            </span>
                            <div className="text-2xl font-black text-white">{stats.totalOrders}</div>
                            <span className="text-[10px] text-slate-400">Lần gọi món qua QR</span>
                        </div>
                    </div>
                )}

                {/* Tabs Bar */}
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <button
                        onClick={() => setActiveTab('shops')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                            activeTab === 'shops' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                    >
                        <Building2 className="w-4 h-4" />
                        <span>Danh Sách Quán ({shops.length})</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('templates')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                            activeTab === 'templates' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                    >
                        <Layers className="w-4 h-4" />
                        <span>Mẫu Giao Diện ({templates.length})</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                            activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                    >
                        <FileText className="w-4 h-4" />
                        <span>Nhật Ký Kiểm Toán</span>
                    </button>
                </div>

                {/* TAB 1: SHOPS LIST */}
                {activeTab === 'shops' && (
                    <div className="space-y-4">
                        {/* Action Bar */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-1">
                                <div className="relative flex-1 max-w-sm">
                                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Tìm theo tên quán, slug, email chủ quán..."
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-indigo-500 transition"
                                    />
                                </div>

                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-hidden focus:border-indigo-500"
                                >
                                    <option value="all">Tất cả trạng thái</option>
                                    <option value="active">Đang hoạt động</option>
                                    <option value="suspended">Tạm dừng (Khóa)</option>
                                </select>
                            </div>

                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 min-h-[40px]"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Tạo Quán Mới</span>
                            </button>
                        </div>

                        {/* Shops Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {shops.map((shop) => (
                                <div
                                    key={shop.id}
                                    className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-lg hover:border-slate-700 transition"
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-extrabold text-sm text-white">{shop.name}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                    shop.status === 'active'
                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                }`}>
                                                    {shop.status === 'active' ? 'HOẠT ĐỘNG' : 'TẠM DỪNG'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-mono mt-0.5">slug: /{shop.slug}</p>
                                        </div>
                                    </div>

                                    {/* Shop Metadata */}
                                    <div className="p-3 bg-slate-950/60 rounded-xl space-y-1.5 text-xs text-slate-300 border border-slate-850">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 text-[11px]">Chủ quán:</span>
                                            <span className="font-semibold">{shop.owner?.fullName || 'Chưa gán'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 text-[11px]">Email:</span>
                                            <span className="font-mono text-[11px] text-indigo-300">{shop.owner?.email || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 text-[11px]">Template:</span>
                                            <span className="capitalize font-semibold text-slate-200">{shop.activeTemplateId} (v{shop.activePublishedVersion})</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 text-[11px]">Quy mô:</span>
                                            <span>{shop.tableCount || 0} bàn • {shop.orderCount || 0} đơn</span>
                                        </div>
                                        <div className="flex justify-between pt-1 border-t border-slate-800">
                                            <span className="text-slate-500 text-[11px]">Doanh thu:</span>
                                            <span className="font-extrabold text-emerald-400">{(shop.totalRevenue || 0).toLocaleString('vi-VN')}đ</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            onClick={() => handleToggleStatus(shop)}
                                            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                                                shop.status === 'active'
                                                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            }`}
                                        >
                                            {shop.status === 'active' ? (
                                                <>
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    <span>Khóa Quán</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                    <span>Mở Khóa</span>
                                                </>
                                            )}
                                        </button>

                                        <a
                                            href={`/staff`}
                                            className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl transition flex items-center gap-1 text-xs font-semibold"
                                            title="Đến cổng nhân viên"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB 2: TEMPLATES REGISTRY */}
                {activeTab === 'templates' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {templates.map(tpl => (
                            <div key={tpl.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                                <div className="h-32 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center p-4">
                                    <Layers className="w-10 h-10 text-indigo-400" />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-extrabold text-sm text-white">{tpl.name}</h3>
                                        <span className="text-[10px] font-mono text-slate-400">id: {tpl.id}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">{tpl.description}</p>
                                </div>
                                <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px]">
                                    <div className="text-slate-400 font-semibold">Các khối mặc định:</div>
                                    <div className="flex flex-wrap gap-1">
                                        {tpl.defaultBlocks.map((b, idx) => (
                                            <span key={idx} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded-md text-[10px]">
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* TAB 3: AUDIT LOGS */}
                {activeTab === 'logs' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="p-4 border-b border-slate-800 font-extrabold text-sm text-white">
                            Nhật Ký Thao Tác Hệ Thống & Super Admin
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider">
                                    <tr>
                                        <th className="p-3.5">Thời Gian</th>
                                        <th className="p-3.5">Người Thực Hiện</th>
                                        <th className="p-3.5">Hành Động</th>
                                        <th className="p-3.5">Quán / Mục Tiêu</th>
                                        <th className="p-3.5">Chi Tiết</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 text-slate-300">
                                    {auditLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-slate-850 transition">
                                            <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                                                {new Date(log.created_at).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="p-3.5 font-semibold text-white">
                                                {log.user_name || log.user_email || 'Hệ thống'}
                                            </td>
                                            <td className="p-3.5">
                                                <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono">
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="p-3.5">{log.tenant_name || log.resource_id}</td>
                                            <td className="p-3.5 font-mono text-[10px] text-slate-400 max-w-xs truncate">
                                                {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* CREATE SHOP MODAL */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                            <h3 className="font-extrabold text-white text-base">Khởi Tạo Quán Mới</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>

                        <form onSubmit={handleCreateShop} className="space-y-3.5 text-xs">
                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Tên Quán Ăn / Shop *</label>
                                <input
                                    type="text"
                                    required
                                    value={createForm.name}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    placeholder="Ví dụ: Bếp Cơm Niêu Sài Gòn"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Định danh Slug (URL) *</label>
                                <input
                                    type="text"
                                    required
                                    value={createForm.slug}
                                    onChange={(e) => setCreateForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                    placeholder="bep-com-nieu"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-mono focus:outline-hidden focus:border-indigo-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Số điện thoại</label>
                                    <input
                                        type="text"
                                        value={createForm.phone}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))}
                                        placeholder="0901234567"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Địa chỉ quán</label>
                                    <input
                                        type="text"
                                        value={createForm.address}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, address: e.target.value }))}
                                        placeholder="123 Nguyễn Huệ, Q1"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-800">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 block mb-2">
                                    Tài Khoản Chủ Quán (Owner)
                                </span>

                                <div className="space-y-2.5">
                                    <div>
                                        <label className="block text-slate-300 font-semibold mb-1">Họ Tên Chủ Quán *</label>
                                        <input
                                            type="text"
                                            required
                                            value={createForm.ownerFullName}
                                            onChange={(e) => setCreateForm(prev => ({ ...prev, ownerFullName: e.target.value }))}
                                            placeholder="Nguyễn Văn A"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-slate-300 font-semibold mb-1">Email Đăng Nhập Chủ Quán *</label>
                                        <input
                                            type="email"
                                            required
                                            value={createForm.ownerEmail}
                                            onChange={(e) => setCreateForm(prev => ({ ...prev, ownerEmail: e.target.value }))}
                                            placeholder="owner@quanan.vn"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-slate-300 font-semibold mb-1">Mật khẩu khởi tạo</label>
                                        <input
                                            type="text"
                                            value={createForm.ownerPassword}
                                            onChange={(e) => setCreateForm(prev => ({ ...prev, ownerPassword: e.target.value }))}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 font-mono"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl transition"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition"
                                >
                                    {isSubmitting ? 'Đang tạo...' : 'Xác Nhận Tạo Quán'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
