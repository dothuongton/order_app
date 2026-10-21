import React, { useState, useEffect, useCallback } from 'react';
import { AdminApi } from '../../api/admin.js';
import {
    PlatformStats,
    ShopSummary,
    ShopDetail,
    PaginationMeta,
    AuditLogItem,
    SystemRole,
    CreateShopPayload,
    UpdateShopPayload,
    ShopStatus
} from '../../types/admin.js';
import { AdminSidebar, AdminTab } from '../../components/admin/AdminSidebar.js';
import { AdminTopHeader } from '../../components/admin/AdminTopHeader.js';
import { DashboardHeroBanner } from '../../components/admin/DashboardHeroBanner.js';
import { DashboardStatsCards } from '../../components/admin/DashboardStatsCards.js';
import { RecentActivityTimeline } from '../../components/admin/RecentActivityTimeline.js';
import { ShopListTable } from '../../components/admin/ShopListTable.js';
import { useAdminShopList } from '../../hooks/admin/useAdminShopList.js';
import { useAdminNavigation } from '../../hooks/admin/useAdminNavigation.js';
import { RolesView } from '../../components/admin/RolesView.js';
import { AuditLogsView } from '../../components/admin/AuditLogsView.js';
import { AdminRightDrawer, RightDrawerContent } from '../../components/admin/AdminRightDrawer.js';
import { useAdminShopDrawer } from '../../hooks/admin/useAdminShopDrawer.js';
import { CreateShopModal } from '../../components/admin/CreateShopModal.js';
import { EditShopModal } from '../../components/admin/EditShopModal.js';
import { LifecycleConfirmModal } from '../../components/admin/LifecycleConfirmModal.js';
import { Store, ChevronRight, CheckCircle2, TrendingUp, DollarSign, Layers } from 'lucide-react';

interface AdminDashboardProps {
    user: any;
    onLogout: () => void;
}

// Initial Default Roles Data (matching Image 1)
const INITIAL_SYSTEM_ROLES: SystemRole[] = [
    {
        id: 'role-superadmin',
        name: 'Quản trị viên',
        code: 'superadmin',
        description: 'Toàn quyền truy cập quản trị hệ thống, người dùng và toàn bộ dữ liệu nền tảng.',
        userCount: 0,
        color: 'blue',
        permissionGroups: [
            {
                id: 'shops',
                title: 'Quản lý Nhà hàng & Bàn ăn',
                icon: 'store',
                permissions: [
                    { id: 'view_shops', label: 'Xem danh sách quán', enabled: true },
                    { id: 'create_shop', label: 'Thêm/Sửa quán', enabled: true },
                    { id: 'archive_shop', label: 'Xóa/Lưu trữ quán', enabled: true },
                    { id: 'manage_menu', label: 'Quản lý thực đơn & danh mục món', enabled: true }
                ]
            },
            {
                id: 'users',
                title: 'Quản lý Người dùng',
                icon: 'users',
                permissions: [
                    { id: 'view_users', label: 'Xem danh sách người dùng', enabled: true },
                    { id: 'assign_roles', label: 'Phân quyền người dùng', enabled: true },
                    { id: 'delete_users', label: 'Xóa người dùng', enabled: true }
                ]
            },
            {
                id: 'system',
                title: 'Hệ thống & Báo cáo',
                icon: 'system',
                permissions: [
                    { id: 'view_audit', label: 'Xem nhật ký kiểm toán (Audit Logs)', enabled: true },
                    { id: 'export_reports', label: 'Xuất dữ liệu & báo cáo đối soát', enabled: true }
                ]
            }
        ]
    },
    {
        id: 'role-manager',
        name: 'Quản lý quán',
        code: 'admin',
        description: 'Quản lý thực đơn, bàn ăn, chương trình ưu đãi và xem báo cáo trong phạm vi quán.',
        userCount: 0,
        color: 'indigo',
        permissionGroups: [
            {
                id: 'shops',
                title: 'Quản lý Nhà hàng & Bàn ăn',
                icon: 'store',
                permissions: [
                    { id: 'view_shops', label: 'Xem thông tin cơ sở quán', enabled: true },
                    { id: 'create_shop', label: 'Thêm/Sửa quán', enabled: false },
                    { id: 'archive_shop', label: 'Xóa/Lưu trữ quán', enabled: false },
                    { id: 'manage_menu', label: 'Quản lý thực đơn & danh mục món', enabled: true }
                ]
            },
            {
                id: 'users',
                title: 'Quản lý Người dùng',
                icon: 'users',
                permissions: [
                    { id: 'view_users', label: 'Xem danh sách nhân viên cơ sở', enabled: true },
                    { id: 'assign_roles', label: 'Phân quyền người dùng', enabled: false },
                    { id: 'delete_users', label: 'Xóa người dùng', enabled: false }
                ]
            },
            {
                id: 'system',
                title: 'Hệ thống & Báo cáo',
                icon: 'system',
                permissions: [
                    { id: 'view_audit', label: 'Xem nhật ký kiểm toán (Audit Logs)', enabled: false },
                    { id: 'export_reports', label: 'Xuất dữ liệu doanh thu nội bộ quán', enabled: true }
                ]
            }
        ]
    },
    {
        id: 'role-cashier',
        name: 'Thu ngân',
        code: 'cashier',
        description: 'Tiếp nhận gọi món, in hóa đơn tạm tính và thực hiện tất toán bàn ăn.',
        userCount: 0,
        color: 'emerald',
        permissionGroups: [
            {
                id: 'shops',
                title: 'Quản lý Nhà hàng & Bàn ăn',
                icon: 'store',
                permissions: [
                    { id: 'view_shops', label: 'Xem bàn ăn & sơ đồ phục vụ', enabled: true },
                    { id: 'create_shop', label: 'Thêm/Sửa quán', enabled: false },
                    { id: 'archive_shop', label: 'Xóa/Lưu trữ quán', enabled: false },
                    { id: 'manage_menu', label: 'Cập nhật món hết / còn hàng', enabled: true }
                ]
            },
            {
                id: 'users',
                title: 'Quản lý Người dùng',
                icon: 'users',
                permissions: [
                    { id: 'view_users', label: 'Xem danh sách người dùng', enabled: false },
                    { id: 'assign_roles', label: 'Phân quyền người dùng', enabled: false },
                    { id: 'delete_users', label: 'Xóa người dùng', enabled: false }
                ]
            },
            {
                id: 'system',
                title: 'Hệ thống & Báo cáo',
                icon: 'system',
                permissions: [
                    { id: 'view_audit', label: 'Xem nhật ký kiểm toán (Audit Logs)', enabled: false },
                    { id: 'export_reports', label: 'In biên lai & chốt ca thu ngân', enabled: true }
                ]
            }
        ]
    },
    {
        id: 'role-waiter',
        name: 'Nhân viên phục vụ',
        code: 'waiter',
        description: 'Mở bàn ăn, quét mã QR hỗ trợ khách và cập nhật tiến trình chế biến món ăn.',
        userCount: 0,
        color: 'amber',
        permissionGroups: [
            {
                id: 'shops',
                title: 'Quản lý Nhà hàng & Bàn ăn',
                icon: 'store',
                permissions: [
                    { id: 'view_shops', label: 'Xem bàn ăn & sơ đồ phục vụ', enabled: true },
                    { id: 'create_shop', label: 'Thêm/Sửa quán', enabled: false },
                    { id: 'archive_shop', label: 'Xóa/Lưu trữ quán', enabled: false },
                    { id: 'manage_menu', label: 'Xem thực đơn món ăn', enabled: true }
                ]
            },
            {
                id: 'users',
                title: 'Quản lý Người dùng',
                icon: 'users',
                permissions: [
                    { id: 'view_users', label: 'Xem danh sách người dùng', enabled: false },
                    { id: 'assign_roles', label: 'Phân quyền người dùng', enabled: false },
                    { id: 'delete_users', label: 'Xóa người dùng', enabled: false }
                ]
            },
            {
                id: 'system',
                title: 'Hệ thống & Báo cáo',
                icon: 'system',
                permissions: [
                    { id: 'view_audit', label: 'Xem nhật ký kiểm toán (Audit Logs)', enabled: false },
                    { id: 'export_reports', label: 'Xuất dữ liệu & báo cáo đối soát', enabled: false }
                ]
            }
        ]
    }
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    // Navigation & Deep-Link State (Issue #87)
    const {
        activeTab,
        selectedShopId,
        setActiveTab,
        openShopDetail,
        closeShopDetail
    } = useAdminNavigation();
    const [auditPage, setAuditPage] = useState(1);
    const [auditAction, setAuditAction] = useState<string>('');
    const [auditStartDate, setAuditStartDate] = useState<string>('');
    const [auditEndDate, setAuditEndDate] = useState<string>('');

    // Centralized Stable Shops List State (Issue #86)
    const {
        shops,
        pagination,
        isLoading: loadingShops,
        error: shopsError,
        page,
        searchQuery,
        status: shopStatus,
        sortBy: shopSortBy,
        sortOrder: shopSortOrder,
        setPage,
        setSearchQuery,
        setStatus: setShopStatus,
        setSort: setShopSort,
        clearSearch: clearShopSearch,
        reload: reloadShops
    } = useAdminShopList({ initialLimit: 10 });

    // Data States
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
    const [auditPagination, setAuditPagination] = useState<PaginationMeta | null>(null);
    const [roles, setRoles] = useState<SystemRole[]>(INITIAL_SYSTEM_ROLES);

    // UI Loading & Toast States
    const [loadingStats, setLoadingStats] = useState(true);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Drawer & Modals States (guarantees race-condition resilience & generation isolation)
    const {
        isDrawerOpen,
        drawerContent,
        openShopDetail: openShopDetailDrawer,
        openShopDetailById,
        openShopDetailDirectly,
        openRolePermissions,
        openAuditDetail,
        closeDrawer,
        invalidateSelection,
        setDrawerContent,
        setIsDrawerOpen
    } = useAdminShopDrawer();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingShop, setEditingShop] = useState<ShopDetail | ShopSummary | null>(null);
    const [lifecycleTarget, setLifecycleTarget] = useState<{
        shop: ShopSummary;
        targetStatus: ShopStatus;
    } | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    // 1. Fetch Stats
    const loadStats = useCallback(async () => {
        try {
            setLoadingStats(true);
            const data = await AdminApi.getStats();
            setStats(data);
        } catch {
            setStats(null);
        } finally {
            setLoadingStats(false);
        }
    }, []);

    // 3. Fetch Audit Logs
    const loadAuditLogs = useCallback(async () => {
        try {
            setLoadingLogs(true);
            const data = await AdminApi.getAuditLogs({
                page: auditPage,
                limit: 15,
                action: auditAction || undefined,
                startDate: auditStartDate || undefined,
                endDate: auditEndDate || undefined
            });
            setAuditLogs(data.logs || []);
            setAuditPagination(data.pagination || null);
        } catch {
            setAuditLogs([]);
        } finally {
            setLoadingLogs(false);
        }
    }, [auditPage, auditAction, auditStartDate, auditEndDate]);

    // Initial Load
    useEffect(() => {
        loadStats();
        loadAuditLogs();
    }, [loadStats, loadAuditLogs]);



    // Handler: Search Submission from Header
    const handleSearchSubmit = () => {
        setPage(1);
        if (activeTab !== 'shops') {
            setActiveTab('shops');
        }
        reloadShops();
    };

    // Handler: Open Drawer for Role Permissions (Image 1)
    const handleOpenRolePermissions = (role: SystemRole) => {
        openRolePermissions(role);
    };

    // Handler: Save Role Permissions (Issue #81: No-op / Read-only until backend RBAC #38/#48)
    const handleSaveRolePermissions = (_roleId: string, _updatedGroups: any[]) => {
        // Read-only: no false success toast without backend persistence
    };

    // Deep-link effect (Issue #87 & #110 review): load shop detail from URL parameter
    // Coordinated across navigation, tab switching, drawer close, popstate, and unmount
    useEffect(() => {
        // 1. If no shop is selected in URL
        if (!selectedShopId) {
            invalidateSelection();
            if (drawerContent?.type === 'shop-detail') {
                closeDrawer();
            }
            return () => {
                invalidateSelection();
            };
        }

        // 2. If tab is not 'shops', shop detail drawer should not open
        if (activeTab !== 'shops') {
            invalidateSelection();
            if (drawerContent?.type === 'shop-detail') {
                closeDrawer();
            }
            return () => {
                invalidateSelection();
            };
        }

        // 3. Early return if drawer already displays this shop (prevents parallel fetch with fix #105)
        if (drawerContent?.type === 'shop-detail' && drawerContent.shop.id === selectedShopId) {
            invalidateSelection();
            return () => {
                invalidateSelection();
            };
        }

        // 4. Fetch detail by ID with strict generation and selection guards
        let isCancelled = false;
        openShopDetailById(selectedShopId, AdminApi.getShopDetail)
            .catch(() => {
                if (!isCancelled) {
                    showToast('Không tìm thấy cơ sở quán theo liên kết hoặc đã bị xoá.');
                    closeShopDetail();
                }
            });

        return () => {
            isCancelled = true;
            invalidateSelection();
        };
    }, [selectedShopId, activeTab, closeDrawer, closeShopDetail, invalidateSelection, openShopDetailById]);

    // Handler: Open Drawer for Shop Detail
    const handleOpenShopDetail = (shop: ShopSummary) => {
        openShopDetailDrawer(shop, AdminApi.getShopDetail);
        openShopDetail(shop.id);
    };

    // Handler: Open Drawer for Audit Log Diff
    const handleOpenAuditDetail = (log: AuditLogItem) => {
        openAuditDetail(log);
    };

    // Handler: Create Shop
    const handleCreateShop = async (payload: CreateShopPayload) => {
        await AdminApi.createShop(payload);
        showToast(`Đã tạo thành công quán "${payload.name}"!`);
        loadStats();
        reloadShops();
        loadAuditLogs();
    };

    // Handler: Edit Shop Metadata
    const handleEditShop = async (id: string, payload: UpdateShopPayload) => {
        await AdminApi.updateShop(id, payload);
        showToast('Đã cập nhật thông tin quán thành công!');
        if (drawerContent?.type === 'shop-detail' && drawerContent.shop.id === id) {
            closeDrawer();
            closeShopDetail();
        }
        reloadShops();
        loadAuditLogs();
    };

    // Handler: Request Lifecycle Status Change (Opens confirm modal)
    const handleRequestLifecycleChange = (
        shop: ShopDetail | ShopSummary,
        targetStatus: ShopStatus
    ) => {
        setLifecycleTarget({ shop, targetStatus });
    };

    // Handler: Confirm Lifecycle Status Change
    const handleConfirmLifecycle = async (shopId: string, targetStatus: ShopStatus) => {
        await AdminApi.updateShop(shopId, { status: targetStatus });
        showToast(
            targetStatus === 'archived'
                ? 'Đã lưu trữ quán thành công (Bảo toàn lịch sử hóa đơn)!'
                : `Đã chuyển trạng thái quán sang "${targetStatus}"!`
        );
        closeDrawer();
        closeShopDetail();
        loadStats();
        reloadShops();
        loadAuditLogs();
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-row font-sans antialiased">
            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* 1. Left Sidebar (Fixed - matching Image 1 & Image 2) */}
            <AdminSidebar
                activeTab={activeTab}
                onTabChange={(tab) => {
                    setActiveTab(tab);
                    setPage(1);
                }}
                onCreateShopClick={() => setIsCreateModalOpen(true)}
                onLogout={onLogout}
            />

            {/* 2. Main Canvas */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Header Search Bar */}
                <AdminTopHeader
                    searchValue={searchQuery}
                    onSearchChange={(val) => {
                        setSearchQuery(val);
                        setPage(1);
                    }}
                    onSearchSubmit={handleSearchSubmit}
                    adminName={user?.fullName || 'Super Admin'}
                    adminEmail={user?.email || 'superadmin@qrorder.vn'}
                />

                {/* Main Content Workspace */}
                <main className="flex-1 p-8 overflow-y-auto">
                    {/* =========================================================================
                        TAB 1: DASHBOARD (Matching Image 2)
                       ========================================================================= */}
                    {activeTab === 'dashboard' && (
                        <div className="max-w-6xl space-y-8">
                            {/* Welcome Banner */}
                            <DashboardHeroBanner
                                totalShops={stats?.totalShops || 0}
                                activeShops={stats?.activeShops || 0}
                                suspendedShops={stats?.suspendedShops || 0}
                                onViewShops={() => setActiveTab('shops')}
                                onCreateShop={() => setIsCreateModalOpen(true)}
                            />

                            {/* Stat Cards Grid */}
                            <DashboardStatsCards stats={stats} isLoading={loadingStats} />

                            {/* Two-Column Grid (Image 2 style) */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                {/* Left Column (2/3 width): Quick Shop List */}
                                <div className="lg:col-span-2 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-base font-bold text-slate-900">
                                            Danh sách quán hoạt động
                                        </h3>
                                        <button
                                            onClick={() => setActiveTab('shops')}
                                            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            Xem tất cả ({stats?.totalShops || shops.length})
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {loadingShops ? (
                                            [1, 2, 3].map((i) => (
                                                <div
                                                    key={i}
                                                    className="h-20 bg-white rounded-3xl border border-slate-200/80 animate-pulse"
                                                />
                                            ))
                                        ) : shops.length === 0 ? (
                                            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center">
                                                <Store className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                                <p className="text-xs font-bold text-slate-700">Chưa có quán nào</p>
                                                <button
                                                    onClick={() => setIsCreateModalOpen(true)}
                                                    className="mt-3 px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl"
                                                >
                                                    + Tạo quán ngay
                                                </button>
                                            </div>
                                        ) : (
                                            shops.slice(0, 5).map((shop) => (
                                                <div
                                                    key={shop.id}
                                                    onClick={() => handleOpenShopDetail(shop)}
                                                    className="bg-white rounded-3xl p-4.5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-blue-200 transition-all flex items-center justify-between cursor-pointer group"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition">
                                                            {shop.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition">
                                                                    {shop.name}
                                                                </h4>
                                                                {shop.status === 'active' && (
                                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-slate-400 mt-0.5">
                                                                /{shop.slug} • {shop.tableCount || 0} bàn phục vụ
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right hidden sm:block">
                                                            <p className="text-xs font-bold text-slate-900">
                                                                {(shop.totalRevenue || 0).toLocaleString('vi-VN')} đ
                                                            </p>
                                                            <p className="text-[10px] text-slate-400">Doanh thu chốt</p>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-400 flex items-center justify-center transition">
                                                            <ChevronRight className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Right Column (1/3 width): Activity Timeline (Image 2 style) */}
                                <div className="h-[480px]">
                                    <RecentActivityTimeline
                                        logs={auditLogs}
                                        isLoading={loadingLogs}
                                        onSelectLog={handleOpenAuditDetail}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* =========================================================================
                        TAB 2: QUẢN LÝ QUÁN (SHOPS LIST)
                       ========================================================================= */}
                    {activeTab === 'shops' && (
                        <div className="max-w-6xl space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                                        QUẢN TRỊ NỀN TẢNG
                                    </span>
                                    <h2 className="text-3xl font-extrabold text-slate-900 mt-1">Quản lý Quán</h2>
                                    <p className="text-slate-500 text-sm mt-1">
                                        Theo dõi danh sách các cơ sở quán, cấu hình chủ sở hữu và vòng đời hoạt động.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-blue-500/25 transition active:scale-98"
                                >
                                    + Tạo Quán Mới
                                </button>
                            </div>

                            <ShopListTable
                                shops={shops}
                                pagination={pagination}
                                currentStatus={shopStatus}
                                onStatusChange={setShopStatus}
                                onPageChange={setPage}
                                onSelectShop={handleOpenShopDetail}
                                onCreateShopClick={() => setIsCreateModalOpen(true)}
                                isLoading={loadingShops}
                                error={shopsError}
                                onRetry={reloadShops}
                                sortBy={shopSortBy}
                                sortOrder={shopSortOrder}
                                onSortChange={setShopSort}
                                searchQuery={searchQuery}
                                onClearSearch={clearShopSearch}
                            />
                        </div>
                    )}

                    {/* =========================================================================
                        TAB 3: PHÂN QUYỀN (ROLES & PERMISSIONS - Matching Image 1)
                       ========================================================================= */}
                    {activeTab === 'roles' && (
                        <RolesView roles={roles} onSelectRole={handleOpenRolePermissions} />
                    )}

                    {/* =========================================================================
                        TAB 4: NHẬT KÝ THAO TÁC (AUDIT TRAIL)
                       ========================================================================= */}
                    {activeTab === 'audit' && (
                        <AuditLogsView
                            logs={auditLogs}
                            pagination={auditPagination}
                            onPageChange={(p) => setAuditPage(p)}
                            onSelectLog={handleOpenAuditDetail}
                            isLoading={loadingLogs}
                            selectedAction={auditAction}
                            onActionChange={(act) => {
                                setAuditAction(act);
                                setAuditPage(1);
                            }}
                            startDate={auditStartDate}
                            onStartDateChange={(d) => {
                                setAuditStartDate(d);
                                setAuditPage(1);
                            }}
                            endDate={auditEndDate}
                            onEndDateChange={(d) => {
                                setAuditEndDate(d);
                                setAuditPage(1);
                            }}
                            onResetFilters={() => {
                                setAuditAction('');
                                setAuditStartDate('');
                                setAuditEndDate('');
                                setAuditPage(1);
                            }}
                        />
                    )}

                    {/* =========================================================================
                        TAB 5: ANALYTICS / BÁO CÁO
                       ========================================================================= */}
                    {activeTab === 'analytics' && (
                        <div className="max-w-6xl space-y-6">
                            <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                                    THỐNG KÊ KINH DOANH
                                </span>
                                <h2 className="text-3xl font-extrabold text-slate-900 mt-1">Báo cáo & Phân tích</h2>
                                <p className="text-slate-500 text-sm mt-1">
                                    Số liệu doanh thu, số lượt thanh toán và hiệu suất tăng trưởng toàn nền tảng.
                                </p>
                            </div>

                            <DashboardStatsCards stats={stats} isLoading={loadingStats} />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                                            <TrendingUp className="w-5 h-5" />
                                        </div>
                                        <h4 className="text-base font-bold text-slate-900">Hiệu suất Đặt món</h4>
                                    </div>
                                    <div className="text-3xl font-black text-slate-900 mt-2">
                                        {stats?.totalOrders || 0}{' '}
                                        <span className="text-xs font-normal text-slate-400">lượt gọi món</span>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Tổng số phiên bàn và lượt gọi món tích lũy được ghi nhận an toàn trên cơ sở dữ liệu.
                                    </p>
                                </div>

                                <div className="p-6 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                                            <Layers className="w-5 h-5" />
                                        </div>
                                        <h4 className="text-base font-bold text-slate-900">Phiên Tất toán</h4>
                                    </div>
                                    <div className="text-3xl font-black text-slate-900 mt-2">
                                        {stats?.totalSettlements || 0}{' '}
                                        <span className="text-xs font-normal text-slate-400">hóa đơn hoàn tất</span>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Số lượng hóa đơn đã đóng phiên và thanh toán thành công, hoàn toàn đối soát được với sổ cái.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* 3. Right Slide-Over Panel (Thanh Bar bên phải - Core Feature) */}
            <AdminRightDrawer
                isOpen={isDrawerOpen}
                content={drawerContent}
                onClose={() => {
                    closeDrawer();
                    closeShopDetail();
                }}
                onSavePermissions={handleSaveRolePermissions}
                onEditShop={(shop) => {
                    closeDrawer();
                    closeShopDetail();
                    setEditingShop(shop);
                }}
                onToggleShopStatus={handleRequestLifecycleChange}
            />

            {/* 4. Modals */}
            <CreateShopModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSubmit={handleCreateShop}
            />

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
