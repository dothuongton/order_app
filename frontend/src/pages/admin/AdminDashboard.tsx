import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldCheck, LogOut, Building2, Layers, FileText, CheckCircle, AlertCircle
} from 'lucide-react';
import { AdminApi } from '../../api/admin.js';
import {
    PlatformStats,
    ShopSummary,
    ShopDetail,
    ShopStatus,
    AdminTemplate,
    AuditLogItem,
    PaginationMeta,
    CreateShopPayload,
    UpdateShopPayload
} from '../../types/admin.js';
import { DashboardStatsCards } from '../../components/admin/DashboardStatsCards.js';
import { ShopListTable } from '../../components/admin/ShopListTable.js';
import { ShopDetailModal } from '../../components/admin/ShopDetailModal.js';
import { CreateShopModal } from '../../components/admin/CreateShopModal.js';
import { EditShopModal } from '../../components/admin/EditShopModal.js';
import { LifecycleConfirmModal } from '../../components/admin/LifecycleConfirmModal.js';
import { AuditLogsView } from '../../components/admin/AuditLogsView.js';

interface AdminDashboardProps {
    user: any;
    onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    // Tab Navigation
    const [activeTab, setActiveTab] = useState<'shops' | 'templates' | 'logs'>('shops');

    // Data States
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [shops, setShops] = useState<ShopSummary[]>([]);
    const [templates, setTemplates] = useState<AdminTemplate[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

    // Loading & Pagination States
    const [loading, setLoading] = useState<boolean>(true);
    const [shopsPagination, setShopsPagination] = useState<PaginationMeta>({ page: 1, limit: 12, total: 0, totalPages: 1 });
    const [logsPagination, setLogsPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });

    // Filter & Search States
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'created_at' | 'name' | 'revenue' | 'orders'>('created_at');
    const [actionFilter, setActionFilter] = useState<string>('');

    // Modal States
    const [selectedDetailShop, setSelectedDetailShop] = useState<ShopDetail | ShopSummary | null>(null);
    const [editingShop, setEditingShop] = useState<ShopSummary | null>(null);
    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [lifecycleTarget, setLifecycleTarget] = useState<{ shop: ShopSummary; targetStatus: ShopStatus } | null>(null);

    // Notification Banner
    const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Fetch Stats
    const loadStats = useCallback(async () => {
        try {
            const data = await AdminApi.getStats();
            setStats(data);
        } catch (err: any) {
            setActionMsg({ type: 'error', text: 'Không thể tải số liệu thống kê nền tảng' });
        }
    }, []);

    // Fetch Shops
    const loadShops = useCallback(async (page: number = 1) => {
        setLoading(true);
        try {
            const data = await AdminApi.getShops({
                page,
                limit: shopsPagination.limit,
                search: searchQuery,
                status: statusFilter,
                sortBy
            });
            setShops(data.shops || []);
            setShopsPagination(data.pagination || { page: 1, limit: 12, total: 0, totalPages: 1 });
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi tải danh sách quán' });
        } finally {
            setLoading(false);
        }
    }, [searchQuery, statusFilter, sortBy, shopsPagination.limit]);

    // Fetch Templates
    const loadTemplates = useCallback(async () => {
        try {
            const data = await AdminApi.getTemplates();
            setTemplates(data);
        } catch (err: any) {
            setActionMsg({ type: 'error', text: 'Không thể tải danh mục mẫu giao diện' });
        }
    }, []);

    // Fetch Audit Logs
    const loadLogs = useCallback(async (page: number = 1) => {
        try {
            const data = await AdminApi.getAuditLogs({
                page,
                limit: logsPagination.limit,
                action: actionFilter
            });
            setAuditLogs(data.logs || []);
            setLogsPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
        } catch (err: any) {
            setActionMsg({ type: 'error', text: 'Không thể tải nhật ký kiểm toán' });
        }
    }, [actionFilter, logsPagination.limit]);

    // Initial load
    useEffect(() => {
        loadStats();
        loadTemplates();
    }, [loadStats, loadTemplates]);

    // Shops search/filter effect
    useEffect(() => {
        const timer = setTimeout(() => {
            loadShops(1);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchQuery, statusFilter, sortBy, loadShops]);

    // Audit logs filter effect
    useEffect(() => {
        if (activeTab === 'logs') {
            loadLogs(1);
        }
    }, [activeTab, actionFilter, loadLogs]);

    // Handler: View Detail
    const handleViewDetail = async (shop: ShopSummary) => {
        try {
            const fullDetail = await AdminApi.getShopDetail(shop.id);
            setSelectedDetailShop(fullDetail);
        } catch {
            setSelectedDetailShop(shop);
        }
    };

    // Handler: Create Shop
    const handleCreateShop = async (payload: CreateShopPayload) => {
        const result = await AdminApi.createShop(payload);
        setActionMsg({ type: 'success', text: `Tạo quán "${payload.name}" thành công!` });
        setShowCreateModal(false);
        loadShops(1);
        loadStats();
    };

    // Handler: Edit Shop
    const handleEditShop = async (shopId: string, payload: UpdateShopPayload) => {
        await AdminApi.updateShop(shopId, payload);
        setActionMsg({ type: 'success', text: 'Cập nhật thông tin quán thành công!' });
        setEditingShop(null);
        loadShops(shopsPagination.page);
        loadStats();
    };

    // Handler: Toggle / Transition Status
    const handleToggleStatusClick = (shop: ShopSummary) => {
        const nextStatus: ShopStatus = shop.status === 'suspended' ? 'active' : 'suspended';
        setLifecycleTarget({ shop, targetStatus: nextStatus });
    };

    const handleConfirmLifecycle = async (shopId: string, status: ShopStatus) => {
        await AdminApi.updateShop(shopId, { status });
        const label = status === 'active' ? 'kích hoạt' : status === 'suspended' ? 'tạm dừng' : 'lưu trữ';
        setActionMsg({ type: 'success', text: `Đã ${label} quán thành công!` });
        loadShops(shopsPagination.page);
        loadStats();
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            {/* Top Navigation Bar */}
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
                        <p className="text-[11px] text-slate-400">Quản trị Nhà hàng, Kho Giao diện & Doanh thu Nền tảng</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-200">{user?.fullName || 'Super Administrator'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{user?.email || 'superadmin@qrorder.vn'}</div>
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

            {/* Action Alert Banner */}
            {actionMsg && (
                <div className={`px-4 sm:px-8 py-2.5 text-xs font-semibold flex items-center justify-between transition ${
                    actionMsg.type === 'success'
                        ? 'bg-emerald-500/20 text-emerald-200 border-b border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-200 border-b border-rose-500/30'
                }`}>
                    <div className="flex items-center gap-2">
                        {actionMsg.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                        <span>{actionMsg.text}</span>
                    </div>
                    <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
                {/* Platform Overview Metrics */}
                <DashboardStatsCards stats={stats} loading={!stats} />

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <button
                        onClick={() => setActiveTab('shops')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                            activeTab === 'shops' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                    >
                        <Building2 className="w-4 h-4" />
                        <span>Danh Sách Quán ({stats?.totalShops || shops.length})</span>
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

                {/* TAB 1: SHOPS MANAGEMENT */}
                {activeTab === 'shops' && (
                    <ShopListTable
                        shops={shops}
                        pagination={shopsPagination}
                        loading={loading}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        statusFilter={statusFilter}
                        onStatusFilterChange={setStatusFilter}
                        sortBy={sortBy}
                        onSortByChange={setSortBy}
                        onPageChange={(page) => loadShops(page)}
                        onCreateClick={() => setShowCreateModal(true)}
                        onViewDetail={handleViewDetail}
                        onEditShop={(shop) => setEditingShop(shop)}
                        onToggleStatus={handleToggleStatusClick}
                    />
                )}

                {/* TAB 2: TEMPLATES REGISTRY */}
                {activeTab === 'templates' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {templates.map(tpl => (
                            <div key={tpl.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-lg hover:border-slate-700 transition">
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
                    <AuditLogsView
                        logs={auditLogs}
                        pagination={logsPagination}
                        loading={false}
                        actionFilter={actionFilter}
                        onActionFilterChange={setActionFilter}
                        onPageChange={(page) => loadLogs(page)}
                    />
                )}
            </main>

            {/* MODALS */}
            {selectedDetailShop && (
                <ShopDetailModal
                    shop={selectedDetailShop}
                    onClose={() => setSelectedDetailShop(null)}
                    onEdit={(shop) => {
                        setSelectedDetailShop(null);
                        setEditingShop(shop);
                    }}
                    onToggleStatus={(shop) => {
                        setSelectedDetailShop(null);
                        handleToggleStatusClick(shop);
                    }}
                />
            )}

            {showCreateModal && (
                <CreateShopModal
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreateShop}
                />
            )}

            {editingShop && (
                <EditShopModal
                    shop={editingShop}
                    onClose={() => setEditingShop(null)}
                    onSubmit={handleEditShop}
                />
            )}

            {lifecycleTarget && (
                <LifecycleConfirmModal
                    shop={lifecycleTarget.shop}
                    targetStatus={lifecycleTarget.targetStatus}
                    onClose={() => setLifecycleTarget(null)}
                    onConfirm={handleConfirmLifecycle}
                />
            )}
        </div>
    );
};
