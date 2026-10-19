import React, { useState, useEffect } from 'react';
import { request } from '../../api/client.js';
import { CmsThemeConfig, Banner, Promotion, CmsPublishedVersion } from '../../types/cms.js';
import { MobilePreviewModal } from '../../components/cms/MobilePreviewModal.js';
import {
    Palette, Image as ImageIcon, Tag, History, Smartphone,
    Save, Send, RotateCcw, Plus, Trash2, Edit3, Check,
    AlertCircle, CheckCircle, Eye, ChevronRight
} from 'lucide-react';

export const StaffCmsManage: React.FC = () => {
    const [subTab, setSubTab] = useState<'branding' | 'banners' | 'promotions' | 'history'>('branding');
    const [loading, setLoading] = useState<boolean>(true);
    const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Profile & Draft state
    const [shopProfile, setShopProfile] = useState<any>(null);
    const [draftTheme, setDraftTheme] = useState<CmsThemeConfig>({
        primaryColor: '#ea580c',
        fontFamily: 'Inter',
        layout: 'classic',
        showBanner: true,
        showPromotions: true,
        blockOrder: ['header', 'banners', 'promotions', 'categories', 'product_grid', 'cart_footer']
    });
    const [draftTemplateId, setDraftTemplateId] = useState<string>('classic');

    // Banners & Promos & History
    const [banners, setBanners] = useState<Banner[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [versions, setVersions] = useState<CmsPublishedVersion[]>([]);
    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);

    // Preview state
    const [showPreview, setShowPreview] = useState<boolean>(false);

    // Banner Modal state
    const [showBannerModal, setShowBannerModal] = useState<boolean>(false);
    const [editingBanner, setEditingBanner] = useState<Partial<Banner> | null>(null);

    // Promo Modal state
    const [showPromoModal, setShowPromoModal] = useState<boolean>(false);
    const [editingPromo, setEditingPromo] = useState<Partial<Promotion> | null>(null);

    // Publish Changelog Modal
    const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
    const [publishChangelog, setPublishChangelog] = useState<string>('Cập nhật giao diện mới');
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Color Swatches
    const COLOR_PRESETS = [
        { label: 'Cam Phố Cổ', hex: '#ea580c' },
        { label: 'Xanh Ngọc Lục Bảo', hex: '#059669' },
        { label: 'Đỏ Ruby Quý Phái', hex: '#dc2626' },
        { label: 'Xanh Biển Tươi Mát', hex: '#2563eb' },
        { label: 'Tím Trà Sữa Taro', hex: '#7c3aed' },
        { label: 'Vàng Hổ Phách', hex: '#d97706' }
    ];

    // Load data from backend
    const loadCmsData = async () => {
        setLoading(true);
        try {
            const [profileRes, draftRes, bannersRes, promosRes, versionsRes, snapshotRes] = await Promise.all([
                request<{ profile: any }>('/cms/profile'),
                request<{ draft: any }>('/cms/draft'),
                request<{ banners: Banner[] }>('/cms/banners'),
                request<{ promotions: Promotion[] }>('/cms/promotions'),
                request<{ versions: CmsPublishedVersion[] }>('/cms/versions'),
                request<any>('/staff/dashboard/snapshot')
            ]);

            setShopProfile(profileRes.profile);
            if (draftRes.draft) {
                setDraftTemplateId(draftRes.draft.templateId || 'classic');
                if (draftRes.draft.themeConfig) {
                    setDraftTheme(draftRes.draft.themeConfig);
                }
            }
            setBanners(bannersRes.banners || []);
            setPromotions(promosRes.promotions || []);
            setVersions(versionsRes.versions || []);
            setCategories(snapshotRes.categories || []);
            setMenuItems(snapshotRes.menuItems || []);
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi tải dữ liệu CMS' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCmsData();
    }, []);

    // Save Draft
    const handleSaveDraft = async () => {
        setIsSaving(true);
        setActionMsg(null);
        try {
            await request('/cms/draft', {
                method: 'PUT',
                body: JSON.stringify({
                    templateId: draftTemplateId,
                    themeConfig: draftTheme,
                    contentConfig: { bannerIds: banners.filter(b => b.isActive).map(b => b.id) }
                })
            });

            // Also update shop profile details
            if (shopProfile) {
                await request('/cms/profile', {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name: shopProfile.name,
                        description: shopProfile.description,
                        phone: shopProfile.phone,
                        address: shopProfile.address,
                        openingHours: shopProfile.openingHours,
                        logoUrl: shopProfile.logoUrl,
                        coverUrl: shopProfile.coverUrl
                    })
                });
            }

            setActionMsg({ type: 'success', text: 'Đã lưu bản nháp CMS thành công' });
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi lưu bản nháp' });
        } finally {
            setIsSaving(false);
        }
    };

    // Publish Draft
    const handlePublish = async () => {
        setIsSaving(true);
        setActionMsg(null);
        try {
            // First save draft
            await handleSaveDraft();

            // Then publish
            const res = await request<any>('/cms/publish', {
                method: 'POST',
                body: JSON.stringify({ changelog: publishChangelog })
            });

            setShowPublishModal(false);
            setActionMsg({ type: 'success', text: res.message || 'Xuất bản giao diện thành công!' });
            loadCmsData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi xuất bản giao diện' });
        } finally {
            setIsSaving(false);
        }
    };

    // Rollback Version
    const handleRollback = async (ver: number) => {
        if (!window.confirm(`Bạn có chắc muốn khôi phục về phiên bản v${ver}? Cấu hình nháp hiện tại sẽ được cập nhật lại theo phiên bản này.`)) return;

        try {
            const res = await request<any>('/cms/rollback', {
                method: 'POST',
                body: JSON.stringify({ version: ver })
            });
            setActionMsg({ type: 'success', text: res.message || `Đã khôi phục về phiên bản v${ver}` });
            loadCmsData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi khôi phục phiên bản' });
        }
    };

    // Banner Save handler
    const handleSaveBanner = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingBanner?.title || !editingBanner?.imageUrl) return;

        try {
            if (editingBanner.id) {
                await request(`/cms/banners/${editingBanner.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(editingBanner)
                });
                setActionMsg({ type: 'success', text: 'Cập nhật banner thành công' });
            } else {
                await request('/cms/banners', {
                    method: 'POST',
                    body: JSON.stringify(editingBanner)
                });
                setActionMsg({ type: 'success', text: 'Tạo banner mới thành công' });
            }
            setShowBannerModal(false);
            setEditingBanner(null);
            loadCmsData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi lưu banner' });
        }
    };

    // Banner Delete handler
    const handleDeleteBanner = async (id: string) => {
        if (!window.confirm('Xóa banner này?')) return;
        try {
            await request(`/cms/banners/${id}`, { method: 'DELETE' });
            setActionMsg({ type: 'success', text: 'Đã xóa banner' });
            loadCmsData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi xóa banner' });
        }
    };

    // Promo Save handler
    const handleSavePromo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPromo?.title || !editingPromo?.discountValue) return;

        try {
            if (editingPromo.id) {
                await request(`/cms/promotions/${editingPromo.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(editingPromo)
                });
                setActionMsg({ type: 'success', text: 'Cập nhật khuyến mãi thành công' });
            } else {
                await request('/cms/promotions', {
                    method: 'POST',
                    body: JSON.stringify(editingPromo)
                });
                setActionMsg({ type: 'success', text: 'Tạo khuyến mãi mới thành công' });
            }
            setShowPromoModal(false);
            setEditingPromo(null);
            loadCmsData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi lưu khuyến mãi' });
        }
    };

    // Promo Delete handler
    const handleDeletePromo = async (id: string) => {
        if (!window.confirm('Xóa chương trình khuyến mãi này?')) return;
        try {
            await request(`/cms/promotions/${id}`, { method: 'DELETE' });
            setActionMsg({ type: 'success', text: 'Đã xóa chương trình khuyến mãi' });
            loadCmsData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi xóa khuyến mãi' });
        }
    };

    if (loading) {
        return (
            <div className="p-8 text-center text-slate-400">
                <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <span>Đang tải cấu hình CMS...</span>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Action Feedback Banner */}
            {actionMsg && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                    actionMsg.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                }`}>
                    <span>{actionMsg.text}</span>
                    <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-white">✕</button>
                </div>
            )}

            {/* Top Toolbar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-lg">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="font-black text-base text-white">Quản Trị CMS & Giao Diện Quán</h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            v{shopProfile?.activePublishedVersion || 1}
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-400">Chỉnh sửa nhận diện, banner, khuyến mãi và xuất bản giao diện khách</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowPreview(true)}
                        className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-indigo-300 border border-indigo-500/30 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                    >
                        <Smartphone className="w-4 h-4" />
                        <span>Xem Trước Mobile</span>
                    </button>

                    <button
                        onClick={handleSaveDraft}
                        disabled={isSaving}
                        className="py-2 px-3.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Đang lưu...' : 'Lưu Nháp'}</span>
                    </button>

                    <button
                        onClick={() => setShowPublishModal(true)}
                        className="py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5"
                    >
                        <Send className="w-4 h-4" />
                        <span>Xuất Bản Ngay</span>
                    </button>
                </div>
            </div>

            {/* Sub-tabs Navigation */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto scrollbar-none">
                <button
                    onClick={() => setSubTab('branding')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                        subTab === 'branding' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                >
                    <Palette className="w-4 h-4" />
                    <span>Nhận Diện & Giao Diện</span>
                </button>

                <button
                    onClick={() => setSubTab('banners')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                        subTab === 'banners' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                >
                    <ImageIcon className="w-4 h-4" />
                    <span>Quản Lý Banners ({banners.length})</span>
                </button>

                <button
                    onClick={() => setSubTab('promotions')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                        subTab === 'promotions' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                >
                    <Tag className="w-4 h-4" />
                    <span>Khuyến Mãi & Giảm Giá ({promotions.length})</span>
                </button>

                <button
                    onClick={() => setSubTab('history')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                        subTab === 'history' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                >
                    <History className="w-4 h-4" />
                    <span>Lịch Sử Xuất Bản ({versions.length})</span>
                </button>
            </div>

            {/* TAB 1: BRANDING & THEME */}
            {subTab === 'branding' && shopProfile && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Left: General Information */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                            <span>Thông Tin Nhận Diện Quán</span>
                        </h3>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Tên Quán Ăn</label>
                                <input
                                    type="text"
                                    value={shopProfile.name || ''}
                                    onChange={(e) => setShopProfile({ ...shopProfile, name: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Mô Tả Ngắn</label>
                                <textarea
                                    rows={2}
                                    value={shopProfile.description || ''}
                                    onChange={(e) => setShopProfile({ ...shopProfile, description: e.target.value })}
                                    placeholder="Đặc sản trà sữa & ăn vặt đường phố..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Số Điện Thoại</label>
                                    <input
                                        type="text"
                                        value={shopProfile.phone || ''}
                                        onChange={(e) => setShopProfile({ ...shopProfile, phone: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Giờ Mở Cửa</label>
                                    <input
                                        type="text"
                                        value={shopProfile.openingHours || ''}
                                        onChange={(e) => setShopProfile({ ...shopProfile, openingHours: e.target.value })}
                                        placeholder="08:00 - 22:30"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Địa Chỉ</label>
                                <input
                                    type="text"
                                    value={shopProfile.address || ''}
                                    onChange={(e) => setShopProfile({ ...shopProfile, address: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Logo URL</label>
                                    <input
                                        type="text"
                                        value={shopProfile.logoUrl || ''}
                                        onChange={(e) => setShopProfile({ ...shopProfile, logoUrl: e.target.value })}
                                        placeholder="https://..."
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-[11px] font-mono focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Ảnh Bìa URL</label>
                                    <input
                                        type="text"
                                        value={shopProfile.coverUrl || ''}
                                        onChange={(e) => setShopProfile({ ...shopProfile, coverUrl: e.target.value })}
                                        placeholder="https://..."
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-[11px] font-mono focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Theme Tokens & Layout */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <h3 className="font-extrabold text-sm text-white">Theme & Bố Cục Giao Diện</h3>

                        <div className="space-y-4 text-xs">
                            {/* Color Swatches */}
                            <div>
                                <label className="block text-slate-300 font-semibold mb-2">Màu Chủ Đạo Của Quán</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {COLOR_PRESETS.map((p) => (
                                        <button
                                            key={p.hex}
                                            type="button"
                                            onClick={() => setDraftTheme({ ...draftTheme, primaryColor: p.hex })}
                                            className={`p-2 rounded-xl border flex items-center gap-2 transition ${
                                                draftTheme.primaryColor === p.hex
                                                    ? 'border-white bg-slate-800'
                                                    : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                                            }`}
                                        >
                                            <span className="w-5 h-5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: p.hex }} />
                                            <span className="text-[11px] font-semibold truncate text-slate-200">{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Layout Template Selector */}
                            <div>
                                <label className="block text-slate-300 font-semibold mb-2">Mẫu Bố Cục Storefront</label>
                                <div className="grid grid-cols-3 gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftTemplateId('classic');
                                            setDraftTheme({ ...draftTheme, layout: 'classic' });
                                        }}
                                        className={`p-3 rounded-xl border text-center transition ${
                                            draftTemplateId === 'classic'
                                                ? 'border-orange-500 bg-orange-500/10 text-orange-400 font-black'
                                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">Classic</div>
                                        <div className="text-[10px] mt-0.5">Truyền thống</div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftTemplateId('modern_grid');
                                            setDraftTheme({ ...draftTheme, layout: 'modern_grid' });
                                        }}
                                        className={`p-3 rounded-xl border text-center transition ${
                                            draftTemplateId === 'modern_grid'
                                                ? 'border-orange-500 bg-orange-500/10 text-orange-400 font-black'
                                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">Modern Grid</div>
                                        <div className="text-[10px] mt-0.5">Lưới 2 cột</div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftTemplateId('compact_list');
                                            setDraftTheme({ ...draftTheme, layout: 'compact_list' });
                                        }}
                                        className={`p-3 rounded-xl border text-center transition ${
                                            draftTemplateId === 'compact_list'
                                                ? 'border-orange-500 bg-orange-500/10 text-orange-400 font-black'
                                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">Compact</div>
                                        <div className="text-[10px] mt-0.5">Siêu gọn nhẹ</div>
                                    </button>
                                </div>
                            </div>

                            {/* Block Toggles */}
                            <div className="space-y-2 pt-2 border-t border-slate-800">
                                <label className="block text-slate-300 font-semibold mb-1">Hiển Thị Các Khối (Block Toggles)</label>
                                
                                <label className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                                    <span className="text-xs font-medium text-slate-300">Bật Banner Quảng Cáo & Sự Kiện</span>
                                    <input
                                        type="checkbox"
                                        checked={draftTheme.showBanner}
                                        onChange={(e) => setDraftTheme({ ...draftTheme, showBanner: e.target.checked })}
                                        className="w-4 h-4 accent-orange-600 rounded-sm"
                                    />
                                </label>

                                <label className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer">
                                    <span className="text-xs font-medium text-slate-300">Bật Bảng Thông Báo Khuyến Mãi</span>
                                    <input
                                        type="checkbox"
                                        checked={draftTheme.showPromotions}
                                        onChange={(e) => setDraftTheme({ ...draftTheme, showPromotions: e.target.checked })}
                                        className="w-4 h-4 accent-orange-600 rounded-sm"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: BANNERS MANAGEMENT */}
            {subTab === 'banners' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-extrabold text-sm text-white">Danh Sách Banner ({banners.length})</h3>
                        <button
                            onClick={() => {
                                setEditingBanner({ title: '', imageUrl: '', sortOrder: banners.length + 1, isActive: true });
                                setShowBannerModal(true);
                            }}
                            className="py-2 px-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Thêm Banner Mới</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {banners.map((b) => (
                            <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg space-y-3 p-3">
                                <div className="aspect-16/9 rounded-xl bg-slate-950 overflow-hidden relative">
                                    <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
                                    <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                        b.isActive ? 'bg-emerald-500/80 text-white' : 'bg-slate-800/80 text-slate-400'
                                    }`}>
                                        {b.isActive ? 'BẬT' : 'TẮT'}
                                    </span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-white truncate">{b.title}</h4>
                                    {b.description && <p className="text-[11px] text-slate-400 line-clamp-1">{b.description}</p>}
                                    {b.ctaLink && <p className="text-[10px] text-orange-400 font-mono mt-0.5">CTA: {b.ctaLink}</p>}
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                                    <span className="text-[11px] text-slate-500 font-semibold">Thứ tự: {b.sortOrder}</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingBanner(b);
                                                setShowBannerModal(true);
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteBanner(b.id)}
                                            className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-500/20 transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB 3: PROMOTIONS MANAGEMENT */}
            {subTab === 'promotions' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-extrabold text-sm text-white">Chương Trình Khuyến Mãi ({promotions.length})</h3>
                            <p className="text-[11px] text-slate-400">Nguyên tắc: Tự động chọn ưu đãi tốt nhất (không cộng dồn)</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingPromo({
                                    code: '',
                                    title: '',
                                    discountType: 'PERCENT',
                                    discountValue: 10,
                                    minOrderAmount: 0,
                                    priority: 1,
                                    isActive: true
                                });
                                setShowPromoModal(true);
                            }}
                            className="py-2 px-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Tạo Khuyến Mãi Mới</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {promotions.map((p) => (
                            <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            {p.code && (
                                                <span className="px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-mono text-[11px] font-black border border-orange-500/30">
                                                    {p.code}
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                p.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                                            }`}>
                                                {p.isActive ? 'ĐANG CHẠY' : 'TẠM TẮT'}
                                            </span>
                                        </div>
                                        <h4 className="font-extrabold text-sm text-white mt-1.5">{p.title}</h4>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-950/60 rounded-xl space-y-1.5 text-xs text-slate-300 border border-slate-850">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500 text-[11px]">Mức giảm:</span>
                                        <span className="font-extrabold text-orange-400">
                                            {p.discountType === 'PERCENT' ? `${p.discountValue}%` : `${p.discountValue.toLocaleString('vi-VN')}đ`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500 text-[11px]">Đơn tối thiểu:</span>
                                        <span>{p.minOrderAmount ? `${p.minOrderAmount.toLocaleString('vi-VN')}đ` : 'Không giới hạn'}</span>
                                    </div>
                                    {p.maxDiscountAmount && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 text-[11px]">Giảm tối đa:</span>
                                            <span>{p.maxDiscountAmount.toLocaleString('vi-VN')}đ</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between pt-1 border-t border-slate-800">
                                        <span className="text-slate-500 text-[11px]">Lượt dùng:</span>
                                        <span>{p.currentRedemptions} {p.maxRedemptions ? `/ ${p.maxRedemptions}` : 'lượt'}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
                                    <button
                                        onClick={() => {
                                            setEditingPromo(p);
                                            setShowPromoModal(true);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeletePromo(p.id)}
                                        className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-500/20 transition"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB 4: PUBLISHED VERSIONS & ROLLBACK */}
            {subTab === 'history' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-slate-800 font-extrabold text-sm text-white">
                        Lịch Sử Các Phiên Bản Đã Xuất Bản
                    </div>
                    <div className="divide-y divide-slate-800">
                        {versions.map((ver) => (
                            <div key={ver.id} className="p-4 flex items-center justify-between hover:bg-slate-850 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 text-orange-400 flex items-center justify-center font-black text-sm border border-slate-700">
                                        v{ver.version}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-extrabold text-sm text-white">{ver.changelog}</h4>
                                            {shopProfile?.activePublishedVersion === ver.version && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                    ĐANG ÁP DỤNG
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                            Mẫu: {ver.templateId} • Xuất bản lúc: {new Date(ver.publishedAt).toLocaleString('vi-VN')}
                                        </p>
                                    </div>
                                </div>

                                {shopProfile?.activePublishedVersion !== ver.version && (
                                    <button
                                        onClick={() => handleRollback(ver.version)}
                                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>Khôi Phục Bản Này</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* PUBLISH CHANGELOG MODAL */}
            {showPublishModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
                        <h3 className="font-extrabold text-white text-base">Xác Nhận Xuất Bản</h3>
                        <p className="text-xs text-slate-400">
                            Giao diện Storefront cho toàn bộ khách quét mã QR sẽ được cập nhật ngay lập tức theo bản nháp này.
                        </p>
                        <div>
                            <label className="block text-slate-300 font-semibold text-xs mb-1">Ghi chú thay đổi (Changelog)</label>
                            <input
                                type="text"
                                value={publishChangelog}
                                onChange={(e) => setPublishChangelog(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-hidden focus:border-orange-500"
                            />
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowPublishModal(false)}
                                className="flex-1 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={handlePublish}
                                className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs shadow-md"
                            >
                                {isSaving ? 'Đang xuất bản...' : 'Xuất Bản Ngay'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BANNER EDIT MODAL */}
            {showBannerModal && editingBanner && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                            <h3 className="font-extrabold text-white text-sm">
                                {editingBanner.id ? 'Sửa Banner' : 'Thêm Banner Mới'}
                            </h3>
                            <button onClick={() => setShowBannerModal(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>

                        <form onSubmit={handleSaveBanner} className="space-y-3 text-xs">
                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Tiêu Đề Banner *</label>
                                <input
                                    type="text"
                                    required
                                    value={editingBanner.title || ''}
                                    onChange={(e) => setEditingBanner({ ...editingBanner, title: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Mô Tả Phụ</label>
                                <input
                                    type="text"
                                    value={editingBanner.description || ''}
                                    onChange={(e) => setEditingBanner({ ...editingBanner, description: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Đường Dẫn Ảnh (Image URL) *</label>
                                <input
                                    type="text"
                                    required
                                    value={editingBanner.imageUrl || ''}
                                    onChange={(e) => setEditingBanner({ ...editingBanner, imageUrl: e.target.value })}
                                    placeholder="https://images.unsplash.com/..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono text-[11px] focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Thứ Tự Hiển Thị</label>
                                    <input
                                        type="number"
                                        value={editingBanner.sortOrder || 1}
                                        onChange={(e) => setEditingBanner({ ...editingBanner, sortOrder: parseInt(e.target.value, 10) })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Trạng Thái</label>
                                    <select
                                        value={editingBanner.isActive ? 'true' : 'false'}
                                        onChange={(e) => setEditingBanner({ ...editingBanner, isActive: e.target.value === 'true' })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                    >
                                        <option value="true">Bật hiển thị</option>
                                        <option value="false">Tạm ẩn</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowBannerModal(false)}
                                    className="flex-1 py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-md"
                                >
                                    Lưu Banner
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PROMOTION EDIT MODAL */}
            {showPromoModal && editingPromo && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                            <h3 className="font-extrabold text-white text-sm">
                                {editingPromo.id ? 'Sửa Chương Trình Khuyến Mãi' : 'Tạo Khuyến Mãi Mới'}
                            </h3>
                            <button onClick={() => setShowPromoModal(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>

                        <form onSubmit={handleSavePromo} className="space-y-3 text-xs">
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Mã Code (Tùy chọn)</label>
                                    <input
                                        type="text"
                                        value={editingPromo.code || ''}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, code: e.target.value.toUpperCase() })}
                                        placeholder="GIAM10"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-orange-400 font-mono font-bold focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-slate-300 font-semibold mb-1">Tiêu Đề Khuyến Mãi *</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingPromo.title || ''}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, title: e.target.value })}
                                        placeholder="Giảm 10% Cho Đơn Từ 50K"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Loại Giảm Giá</label>
                                    <select
                                        value={editingPromo.discountType || 'PERCENT'}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, discountType: e.target.value as any })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                    >
                                        <option value="PERCENT">Phần trăm (%)</option>
                                        <option value="FIXED_AMOUNT">Số tiền cố định (đ)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">
                                        {editingPromo.discountType === 'PERCENT' ? 'Giá Trị Giảm (%)' : 'Số Tiền Giảm (đ)'}
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        value={editingPromo.discountValue || ''}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, discountValue: parseInt(e.target.value, 10) })}
                                        placeholder={editingPromo.discountType === 'PERCENT' ? '10' : '20000'}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500 font-bold"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Đơn Tối Thiểu (đ)</label>
                                    <input
                                        type="number"
                                        value={editingPromo.minOrderAmount || 0}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, minOrderAmount: parseInt(e.target.value, 10) })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-300 font-semibold mb-1">Giảm Tối Đa (nếu là %)</label>
                                    <input
                                        type="number"
                                        value={editingPromo.maxDiscountAmount || ''}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, maxDiscountAmount: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                                        placeholder="Để trống nếu không giới hạn"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPromoModal(false)}
                                    className="flex-1 py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-md"
                                >
                                    Lưu Khuyến Mãi
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MOBILE LIVE PREVIEW MODAL */}
            <MobilePreviewModal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                shopName={shopProfile?.name || 'Tên Quán'}
                themeConfig={draftTheme}
                banners={banners}
                promotions={promotions}
                categories={categories}
                menuItems={menuItems}
            />
        </div>
    );
};
