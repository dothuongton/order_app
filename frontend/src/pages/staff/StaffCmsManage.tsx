import React, { useState, useEffect } from 'react';
import { request } from '../../api/client.js';
import { CmsThemeConfig, Banner, Promotion, CmsPublishedVersion } from '../../types/cms.js';
import { MobilePreviewModal } from '../../components/cms/MobilePreviewModal.js';
import { ImageUploadField } from '../../components/ImageUploadField.js';
import { useAuth } from '../../context/AuthContext.js';
import {
    Palette, Image as ImageIcon, Tag, History, Smartphone,
    Save, Send, RotateCcw, Plus, Trash2, Edit3, Check,
    AlertCircle, CheckCircle, Eye, ChevronRight
} from 'lucide-react';

export const StaffCmsManage: React.FC = () => {
    const { updateCurrentTenant } = useAuth();
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
    const [editingPromo, setEditingPromo] = useState<(Omit<Partial<Promotion>, 'discountValue' | 'minOrderAmount' | 'maxDiscountAmount'> & {
        discountValue?: number | string;
        minOrderAmount?: number | string;
        maxDiscountAmount?: number | string;
    }) | null>(null);

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
            const [profileRes, draftRes, bannersRes, promosRes, versionsRes, categoriesRes, menuRes] = await Promise.all([
                request<{ profile: any }>('/cms/profile'),
                request<{ draft: any }>('/cms/draft'),
                request<{ banners: Banner[] }>('/cms/banners'),
                request<{ promotions: Promotion[] }>('/cms/promotions'),
                request<{ versions: CmsPublishedVersion[] }>('/cms/versions'),
                request<any>('/staff/menu/categories'),
                request<any>('/staff/menu/items')
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
            setCategories(categoriesRes.categories || []);
            setMenuItems(menuRes.items || []);
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi tải dữ liệu CMS' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCmsData();
    }, []);

    const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

    // Direct Save Shop Profile
    const handleSaveShopProfile = async () => {
        if (!shopProfile) return;
        setIsSavingProfile(true);
        setActionMsg(null);
        try {
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

            if (shopProfile) {
                updateCurrentTenant({
                    name: shopProfile.name,
                    logoUrl: shopProfile.logoUrl,
                    coverUrl: shopProfile.coverUrl,
                    description: shopProfile.description,
                    phone: shopProfile.phone,
                    address: shopProfile.address,
                    openingHours: shopProfile.openingHours
                });
            }

            setActionMsg({ type: 'success', text: 'Cập nhật và lưu thông tin quán thành công!' });
            loadCmsData();
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi lưu thông tin quán' });
        } finally {
            setIsSavingProfile(false);
        }
    };

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

                updateCurrentTenant({
                    name: shopProfile.name,
                    logoUrl: shopProfile.logoUrl,
                    coverUrl: shopProfile.coverUrl,
                    description: shopProfile.description,
                    phone: shopProfile.phone,
                    address: shopProfile.address,
                    openingHours: shopProfile.openingHours
                });
            }

            setActionMsg({ type: 'success', text: 'Đã lưu bản nháp CMS thành công' });
            return true;
        } catch (err: any) {
            setActionMsg({ type: 'error', text: err.message || 'Lỗi lưu bản nháp' });
            return false;
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
            if (!await handleSaveDraft()) return;
            setIsSaving(true);

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
                    body: JSON.stringify(Object.fromEntries(Object.entries(editingBanner).filter(([key, value]) => ['title','description','imageUrl','ctaLink','sortOrder','isActive','startTime','endTime'].includes(key) && value != null)))
                });
                setActionMsg({ type: 'success', text: 'Cập nhật banner thành công' });
            } else {
                await request('/cms/banners', {
                    method: 'POST',
                    body: JSON.stringify(Object.fromEntries(Object.entries(editingBanner).filter(([key, value]) => ['title','description','imageUrl','ctaLink','sortOrder','isActive','startTime','endTime'].includes(key) && value != null)))
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
        if (!editingPromo) return;

        if (!editingPromo.title?.trim()) {
            setActionMsg({ type: 'error', text: 'Vui lòng nhập tên chương trình khuyến mãi' });
            return;
        }

        const rawDiscountStr = String(editingPromo.discountValue ?? '').trim();
        if (rawDiscountStr === '') {
            setActionMsg({ type: 'error', text: 'Vui lòng nhập mức giảm giá' });
            return;
        }

        if (!/^\d+$/.test(rawDiscountStr) || !Number.isSafeInteger(Number(rawDiscountStr)) || Number(rawDiscountStr) <= 0 || Number(rawDiscountStr) > 1000000000) {
            setActionMsg({ type: 'error', text: 'Mức giảm giá phải là số nguyên lớn hơn 0 và không vượt quá 1.000.000.000đ' });
            return;
        }

        const parsedDiscount = parseInt(rawDiscountStr, 10);
        if (editingPromo.discountType === 'PERCENT' && parsedDiscount > 100) {
            setActionMsg({ type: 'error', text: 'Tỷ lệ giảm phần trăm không được vượt quá 100%' });
            return;
        }

        const rawMinOrderStr = String(editingPromo.minOrderAmount ?? '').trim();
        let minOrder = 0;
        if (rawMinOrderStr !== '') {
            if (!/^\d+$/.test(rawMinOrderStr) || !Number.isSafeInteger(Number(rawMinOrderStr)) || Number(rawMinOrderStr) < 0 || Number(rawMinOrderStr) > 1000000000) {
                setActionMsg({ type: 'error', text: 'Đơn tối thiểu phải là số nguyên không âm hợp lệ (tối đa 1.000.000.000đ)' });
                return;
            }
            minOrder = parseInt(rawMinOrderStr, 10);
        }

        let maxDisc: number | null = null;
        const rawMaxDiscStr = String(editingPromo.maxDiscountAmount ?? '').trim();
        if (rawMaxDiscStr !== '') {
            if (rawMaxDiscStr === '0') {
                setActionMsg({ type: 'error', text: 'Mức giảm tối đa phải là số nguyên lớn hơn 0 (hoặc để trống nếu không giới hạn)' });
                return;
            }
            if (!/^\d+$/.test(rawMaxDiscStr) || !Number.isSafeInteger(Number(rawMaxDiscStr)) || Number(rawMaxDiscStr) <= 0 || Number(rawMaxDiscStr) > 1000000000) {
                setActionMsg({ type: 'error', text: 'Mức giảm tối đa phải là số nguyên lớn hơn 0 và không vượt quá 1.000.000.000đ' });
                return;
            }
            maxDisc = parseInt(rawMaxDiscStr, 10);
        }

        const payload: Record<string, any> = {
            code: editingPromo.code !== undefined ? (editingPromo.code?.trim() || null) : null,
            title: editingPromo.title.trim(),
            description: editingPromo.description !== undefined ? (editingPromo.description?.trim() || null) : null,
            discountType: editingPromo.discountType || 'PERCENT',
            discountValue: parsedDiscount,
            minOrderAmount: minOrder,
            maxDiscountAmount: maxDisc,
            priority: editingPromo.priority ?? 1,
            isActive: editingPromo.isActive ?? true
        };
        if (editingPromo.maxRedemptions) {
            payload.maxRedemptions = editingPromo.maxRedemptions;
        }
        if (editingPromo.startTime) {
            payload.startTime = editingPromo.startTime;
        }
        if (editingPromo.endTime) {
            payload.endTime = editingPromo.endTime;
        }

        try {
            if (editingPromo.id) {
                await request(`/cms/promotions/${editingPromo.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                });
                setActionMsg({ type: 'success', text: 'Cập nhật khuyến mãi thành công' });
            } else {
                await request('/cms/promotions', {
                    method: 'POST',
                    body: JSON.stringify(payload)
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
        <div className="space-y-4">
            {/* Action Feedback Banner */}
            {actionMsg && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                    actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                    <span>{actionMsg.text}</span>
                    <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
                </div>
            )}

            {/* Top Toolbar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="font-black text-base text-slate-900">Thiết Lập Quán & Giao Diện</h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-50 text-orange-600 border border-orange-200">
                            v{shopProfile?.activePublishedVersion || 1}
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Chỉnh sửa nhận diện, banner, khuyến mãi và giao diện khách</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowPreview(true)}
                        className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                    >
                        <Smartphone className="w-4 h-4" />
                        <span>Xem Trước Mobile</span>
                    </button>

                    <button
                        onClick={handleSaveDraft}
                        disabled={isSaving}
                        className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Đang lưu...' : 'Lưu Nháp'}</span>
                    </button>

                    <button
                        onClick={() => setShowPublishModal(true)}
                        className="py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
                    >
                        <Send className="w-4 h-4" />
                        <span>Xuất Bản Ngay</span>
                    </button>
                </div>
            </div>

            {/* Sub-tabs Navigation */}
            <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-2xl overflow-x-auto scrollbar-none">
                <button
                    onClick={() => setSubTab('branding')}
                    className={`px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-2 shrink-0 ${
                        subTab === 'branding' ? 'bg-white text-orange-600 font-extrabold shadow-xs' : 'text-slate-600 hover:text-slate-900 font-semibold'
                    }`}
                >
                    <Palette className="w-4 h-4" />
                    <span>Nhận Diện & Giao Diện</span>
                </button>

                <button
                    onClick={() => setSubTab('banners')}
                    className={`px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-2 shrink-0 ${
                        subTab === 'banners' ? 'bg-white text-orange-600 font-extrabold shadow-xs' : 'text-slate-600 hover:text-slate-900 font-semibold'
                    }`}
                >
                    <ImageIcon className="w-4 h-4" />
                    <span>Quản Lý Banners ({banners.length})</span>
                </button>

                <button
                    onClick={() => setSubTab('promotions')}
                    className={`px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-2 shrink-0 ${
                        subTab === 'promotions' ? 'bg-white text-orange-600 font-extrabold shadow-xs' : 'text-slate-600 hover:text-slate-900 font-semibold'
                    }`}
                >
                    <Tag className="w-4 h-4" />
                    <span>Khuyến Mãi & Giảm Giá ({promotions.length})</span>
                </button>

                <button
                    onClick={() => setSubTab('history')}
                    className={`px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-2 shrink-0 ${
                        subTab === 'history' ? 'bg-white text-orange-600 font-extrabold shadow-xs' : 'text-slate-600 hover:text-slate-900 font-semibold'
                    }`}
                >
                    <History className="w-4 h-4" />
                    <span>Lịch Sử Xuất Bản ({versions.length})</span>
                </button>
            </div>

            {/* TAB 1: BRANDING & THEME */}
            {subTab === 'branding' && shopProfile && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Left: General Information */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                        <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                            <span>Thông Tin Nhận Diện Quán</span>
                        </h3>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">Tên Quán Ăn</label>
                                <input
                                    type="text"
                                    value={shopProfile.name || ''}
                                    onChange={(e) => setShopProfile({ ...shopProfile, name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">Mô Tả Ngắn</label>
                                <textarea
                                    rows={2}
                                    value={shopProfile.description || ''}
                                    onChange={(e) => setShopProfile({ ...shopProfile, description: e.target.value })}
                                    placeholder="Đặc sản trà sữa & ăn vặt đường phố..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Số Điện Thoại</label>
                                    <input
                                        type="text"
                                        value={shopProfile.phone || ''}
                                        onChange={(e) => setShopProfile({ ...shopProfile, phone: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Giờ Mở Cửa</label>
                                    <input
                                        type="text"
                                        value={shopProfile.openingHours || ''}
                                        onChange={(e) => setShopProfile({ ...shopProfile, openingHours: e.target.value })}
                                        placeholder="08:00 - 22:30"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">Địa Chỉ</label>
                                <input
                                    type="text"
                                    value={shopProfile.address || ''}
                                    onChange={(e) => setShopProfile({ ...shopProfile, address: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                                <ImageUploadField
                                    label="Logo Quán"
                                    value={shopProfile.logoUrl || ''}
                                    onChange={(url) => setShopProfile({ ...shopProfile, logoUrl: url })}
                                    aspectRatio="square"
                                    helperText="Ảnh vuông 1:1 góc hóa đơn và menu"
                                />
                                <ImageUploadField
                                    label="Ảnh Bìa Quán"
                                    value={shopProfile.coverUrl || ''}
                                    onChange={(url) => setShopProfile({ ...shopProfile, coverUrl: url })}
                                    aspectRatio="banner"
                                    helperText="Ảnh bìa ngang đầu trang khách"
                                />
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleSaveShopProfile}
                                    disabled={isSavingProfile}
                                    className="w-full sm:w-auto py-2.5 px-5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Save className="w-4 h-4" />
                                    <span>{isSavingProfile ? 'Đang lưu thông tin...' : 'Lưu Thông Tin Quán'}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Theme Tokens & Layout */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                        <h3 className="font-extrabold text-sm text-slate-900">Theme & Bố Cục Giao Diện</h3>

                        <div className="space-y-4 text-xs">
                            {/* Color Swatches */}
                            <div>
                                <label className="block text-slate-700 font-semibold mb-2">Màu Chủ Đạo Của Quán</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {COLOR_PRESETS.map((p) => (
                                        <button
                                            key={p.hex}
                                            type="button"
                                            onClick={() => setDraftTheme({ ...draftTheme, primaryColor: p.hex })}
                                            className={`p-2 rounded-xl border flex items-center gap-2 transition ${
                                                draftTheme.primaryColor === p.hex
                                                    ? 'border-orange-500 bg-orange-50 shadow-xs'
                                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                                            }`}
                                        >
                                            <span className="w-5 h-5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: p.hex }} />
                                            <span className="text-[11px] font-semibold truncate text-slate-800">{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Layout Template Selector */}
                            <div>
                                <label className="block text-slate-700 font-semibold mb-2">Mẫu Bố Cục Storefront</label>
                                <div className="grid grid-cols-3 gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftTemplateId('classic');
                                            setDraftTheme({ ...draftTheme, layout: 'classic' });
                                        }}
                                        className={`p-3 rounded-xl border text-center transition ${
                                            draftTemplateId === 'classic'
                                                ? 'border-orange-500 bg-orange-50 text-orange-600 font-black shadow-xs'
                                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">Classic</div>
                                        <div className="text-[10px] mt-0.5 text-slate-500">Truyền thống</div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftTemplateId('modern_grid');
                                            setDraftTheme({ ...draftTheme, layout: 'modern_grid' });
                                        }}
                                        className={`p-3 rounded-xl border text-center transition ${
                                            draftTemplateId === 'modern_grid'
                                                ? 'border-orange-500 bg-orange-50 text-orange-600 font-black shadow-xs'
                                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">Modern Grid</div>
                                        <div className="text-[10px] mt-0.5 text-slate-500">Lưới 2 cột</div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftTemplateId('compact_list');
                                            setDraftTheme({ ...draftTheme, layout: 'compact_list' });
                                        }}
                                        className={`p-3 rounded-xl border text-center transition ${
                                            draftTemplateId === 'compact_list'
                                                ? 'border-orange-500 bg-orange-50 text-orange-600 font-black shadow-xs'
                                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">Compact</div>
                                        <div className="text-[10px] mt-0.5 text-slate-500">Siêu gọn nhẹ</div>
                                    </button>
                                </div>
                            </div>

                            {/* Block Toggles */}
                            <div className="space-y-2 pt-2 border-t border-slate-200">
                                <label className="block text-slate-700 font-semibold mb-1">Hiển Thị Các Khối (Block Toggles)</label>
                                
                                <label className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                                    <span className="text-xs font-medium text-slate-800">Bật Banner Quảng Cáo & Sự Kiện</span>
                                    <input
                                        type="checkbox"
                                        checked={draftTheme.showBanner}
                                        onChange={(e) => setDraftTheme({ ...draftTheme, showBanner: e.target.checked })}
                                        className="w-4 h-4 accent-orange-600 rounded-sm"
                                    />
                                </label>

                                {draftTheme.showBanner && (
                                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                                        <div className="text-xs font-bold text-slate-800">Kiểu hiển thị Banner:</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setDraftTheme({ ...draftTheme, bannerDisplayMode: 'slide' })}
                                                className={`p-2.5 rounded-xl border text-left transition ${
                                                    draftTheme.bannerDisplayMode === 'slide'
                                                        ? 'border-orange-500 bg-orange-50 text-orange-600 font-bold shadow-xs'
                                                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                                                }`}
                                            >
                                                <div className="text-xs font-bold">🎠 Slide trình chiếu</div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">Trượt ngang tự động, có chấm chuyển</div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDraftTheme({ ...draftTheme, bannerDisplayMode: 'stack' })}
                                                className={`p-2.5 rounded-xl border text-left transition ${
                                                    (draftTheme.bannerDisplayMode || 'stack') === 'stack'
                                                        ? 'border-orange-500 bg-orange-50 text-orange-600 font-bold shadow-xs'
                                                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                                                }`}
                                            >
                                                <div className="text-xs font-bold">🖼️ Ảnh đơn lẻ</div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">Xếp dọc từng tấm như hiện tại</div>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <label className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                                    <span className="text-xs font-medium text-slate-800">Bật Bảng Thông Báo Khuyến Mãi</span>
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
                    {/* Banner Display Mode Switcher */}
                    <div className="p-3.5 bg-white border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                        <div>
                            <h4 className="text-xs font-bold text-slate-800">Kiểu hiển thị trên thực đơn của khách:</h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                {draftTheme.bannerDisplayMode === 'slide'
                                    ? 'Đang chọn: Trình chiếu Slide trượt ngang tự động'
                                    : 'Đang chọn: Ảnh đơn lẻ từng tấm xếp dọc (mặc định)'}
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
                            <button
                                type="button"
                                onClick={() => setDraftTheme({ ...draftTheme, bannerDisplayMode: 'slide' })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                    draftTheme.bannerDisplayMode === 'slide'
                                        ? 'bg-white text-orange-600 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span>🎠</span>
                                <span>Slide trình chiếu</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setDraftTheme({ ...draftTheme, bannerDisplayMode: 'stack' })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                    (draftTheme.bannerDisplayMode || 'stack') === 'stack'
                                        ? 'bg-white text-orange-600 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span>🖼️</span>
                                <span>Ảnh đơn lẻ</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <h3 className="font-extrabold text-sm text-slate-900">Danh Sách Banner ({banners.length})</h3>
                        <button
                            onClick={() => {
                                setEditingBanner({ title: '', imageUrl: '', sortOrder: banners.length + 1, isActive: true });
                                setShowBannerModal(true);
                            }}
                            className="py-2 px-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Thêm Banner Mới</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {banners.map((b) => (
                            <div key={b.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-3 p-3.5">
                                <div className="aspect-16/9 rounded-xl bg-slate-100 overflow-hidden relative">
                                    <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
                                    <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                        b.isActive ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-700 text-white'
                                    }`}>
                                        {b.isActive ? 'BẬT' : 'TẮT'}
                                    </span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-slate-900 truncate">{b.title}</h4>
                                    {b.description && <p className="text-[11px] text-slate-500 line-clamp-1">{b.description}</p>}
                                    {b.ctaLink && <p className="text-[10px] text-orange-600 font-mono mt-0.5 font-semibold">CTA: {b.ctaLink}</p>}
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                                    <span className="text-[11px] text-slate-500 font-semibold">Thứ tự: {b.sortOrder}</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingBanner(b);
                                                setShowBannerModal(true);
                                            }}
                                            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteBanner(b.id)}
                                            className="p-1.5 text-rose-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
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
                            <h3 className="font-extrabold text-sm text-slate-900">Chương Trình Khuyến Mãi ({promotions.length})</h3>
                            <p className="text-[11px] text-slate-500">Nguyên tắc: Tự động chọn ưu đãi tốt nhất (không cộng dồn)</p>
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
                            className="py-2 px-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Tạo Khuyến Mãi Mới</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {promotions.map((p) => (
                            <div key={p.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            {p.code && (
                                                <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-600 font-mono text-[11px] font-black border border-orange-200">
                                                    {p.code}
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                p.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {p.isActive ? 'ĐANG CHẠY' : 'TẠM TẮT'}
                                            </span>
                                        </div>
                                        <h4 className="font-extrabold text-sm text-slate-900 mt-1.5">{p.title}</h4>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-700 border border-slate-200">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500 text-[11px]">Mức giảm:</span>
                                        <span className="font-extrabold text-orange-600">
                                            {p.discountType === 'PERCENT' ? `${p.discountValue}%` : `${p.discountValue.toLocaleString('vi-VN')}đ`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500 text-[11px]">Đơn tối thiểu:</span>
                                        <span className="font-medium text-slate-800">{p.minOrderAmount ? `${p.minOrderAmount.toLocaleString('vi-VN')}đ` : 'Không giới hạn'}</span>
                                    </div>
                                    {p.maxDiscountAmount && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-500 text-[11px]">Giảm tối đa:</span>
                                            <span className="font-medium text-slate-800">{p.maxDiscountAmount.toLocaleString('vi-VN')}đ</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between pt-1 border-t border-slate-200">
                                        <span className="text-slate-500 text-[11px]">Lượt dùng:</span>
                                        <span className="font-medium text-slate-800">{p.currentRedemptions} {p.maxRedemptions ? `/ ${p.maxRedemptions}` : 'lượt'}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                                    <button
                                        onClick={() => {
                                            setEditingPromo(p);
                                            setShowPromoModal(true);
                                        }}
                                        className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeletePromo(p.id)}
                                        className="p-1.5 text-rose-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
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
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <div className="p-4 border-b border-slate-100 font-extrabold text-sm text-slate-900">
                        Lịch Sử Các Phiên Bản Đã Xuất Bản
                    </div>
                    <div className="divide-y divide-slate-100">
                        {versions.map((ver) => (
                            <div key={ver.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-black text-sm border border-orange-200">
                                        v{ver.version}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-extrabold text-sm text-slate-900">{ver.changelog}</h4>
                                            {shopProfile?.activePublishedVersion === ver.version && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    ĐANG ÁP DỤNG
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                            Mẫu: {ver.templateId} • Xuất bản lúc: {new Date(ver.publishedAt).toLocaleString('vi-VN')}
                                        </p>
                                    </div>
                                </div>

                                {shopProfile?.activePublishedVersion !== ver.version && (
                                    <button
                                        onClick={() => handleRollback(ver.version)}
                                        className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
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
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h3 className="font-extrabold text-slate-900 text-base">Xác Nhận Xuất Bản</h3>
                            <button onClick={() => setShowPublishModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
                        </div>
                        <p className="text-xs text-slate-500">
                            Giao diện Storefront cho toàn bộ khách quét mã QR sẽ được cập nhật ngay lập tức theo bản nháp này.
                        </p>
                        <div>
                            <label className="block text-slate-700 font-semibold text-xs mb-1">Ghi chú thay đổi (Changelog)</label>
                            <input
                                type="text"
                                value={publishChangelog}
                                onChange={(e) => setPublishChangelog(e.target.value)}
                                placeholder="Cập nhật nhận diện, thêm banner..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                            />
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowPublishModal(false)}
                                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={handlePublish}
                                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs shadow-md"
                            >
                                {isSaving ? 'Đang xuất bản...' : 'Xuất Bản Ngay'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BANNER EDIT MODAL */}
            {showBannerModal && editingBanner && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl max-h-[88dvh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
                        {/* Sticky Header */}
                        <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                                {editingBanner.id ? 'Sửa Banner' : 'Thêm Banner Mới'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowBannerModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition text-sm"
                                title="Đóng"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <form onSubmit={handleSaveBanner} className="p-4 sm:p-5 pt-3 overflow-y-auto flex-1 space-y-3.5 text-xs">
                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">Tiêu Đề Banner *</label>
                                <input
                                    type="text"
                                    required
                                    value={editingBanner.title || ''}
                                    onChange={(e) => setEditingBanner({ ...editingBanner, title: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">Mô Tả Phụ</label>
                                <input
                                    type="text"
                                    value={editingBanner.description || ''}
                                    onChange={(e) => setEditingBanner({ ...editingBanner, description: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                />
                            </div>

                            <ImageUploadField
                                label="Hình Ảnh Banner *"
                                value={editingBanner.imageUrl || ''}
                                onChange={(url) => setEditingBanner({ ...editingBanner, imageUrl: url })}
                                aspectRatio="banner"
                                helperText="Tải ảnh banner tỷ lệ ngang 16:9 hoặc 21:9"
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Thứ Tự Hiển Thị</label>
                                    <input
                                        type="number"
                                        value={editingBanner.sortOrder || 1}
                                        onChange={(e) => setEditingBanner({ ...editingBanner, sortOrder: parseInt(e.target.value, 10) })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Trạng Thái</label>
                                    <select
                                        value={editingBanner.isActive ? 'true' : 'false'}
                                        onChange={(e) => setEditingBanner({ ...editingBanner, isActive: e.target.value === 'true' })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
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
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
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
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl max-h-[88dvh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
                        {/* Sticky Header */}
                        <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                                {editingPromo.id ? 'Sửa Chương Trình Khuyến Mãi' : 'Tạo Khuyến Mãi Mới'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowPromoModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition text-sm"
                                title="Đóng"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <form onSubmit={handleSavePromo} noValidate className="p-4 sm:p-5 pt-3 overflow-y-auto flex-1 space-y-3.5 text-xs">
                            {actionMsg?.type === 'error' && (
                                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-semibold text-xs">
                                    {actionMsg.text}
                                </div>
                            )}
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Mã Code (Tùy chọn)</label>
                                    <input
                                        type="text"
                                        value={editingPromo.code || ''}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, code: e.target.value.toUpperCase() })}
                                        placeholder="GIAM10"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-orange-600 font-mono font-bold focus:bg-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-slate-700 font-semibold mb-1">Tiêu Đề Khuyến Mãi *</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingPromo.title || ''}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, title: e.target.value })}
                                        placeholder="Giảm 10% Cho Đơn Từ 50K"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Loại Giảm Giá</label>
                                    <select
                                        value={editingPromo.discountType || 'PERCENT'}
                                        onChange={(e) => setEditingPromo({ ...editingPromo, discountType: e.target.value as any })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                    >
                                        <option value="PERCENT">Phần trăm (%)</option>
                                        <option value="FIXED_AMOUNT">Số tiền cố định (đ)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">
                                        {editingPromo.discountType === 'PERCENT' ? 'Giá Trị Giảm (%) *' : 'Số Tiền Giảm (đ) *'}
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min={1}
                                        step={1}
                                        value={editingPromo.discountValue !== undefined && editingPromo.discountValue !== null && editingPromo.discountValue !== '' ? editingPromo.discountValue : ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '' || /^\d+$/.test(val)) {
                                                setEditingPromo({ ...editingPromo, discountValue: val });
                                            }
                                        }}
                                        onBlur={(e) => {
                                            const val = String(editingPromo.discountValue ?? '').trim();
                                            if (val !== '' && /^\d+$/.test(val)) {
                                                if (Number.isSafeInteger(Number(val)) && Number(val) <= 1000000000) {
                                                    setEditingPromo(prev => prev ? { ...prev, discountValue: parseInt(val, 10) } : null);
                                                }
                                            }
                                        }}
                                        placeholder={editingPromo.discountType === 'PERCENT' ? '10' : '20000'}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500 font-bold"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-slate-700 font-semibold text-xs">Đơn Tối Thiểu (đ)</label>
                                        <span className="text-[10px] text-slate-400">0: Không yêu cầu</span>
                                    </div>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={editingPromo.minOrderAmount !== undefined && editingPromo.minOrderAmount !== null && editingPromo.minOrderAmount !== '' ? editingPromo.minOrderAmount : ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '' || /^\d+$/.test(val)) {
                                                setEditingPromo({ ...editingPromo, minOrderAmount: val });
                                            }
                                        }}
                                        onBlur={(e) => {
                                            const val = String(editingPromo.minOrderAmount ?? '').trim();
                                            if (val === '') {
                                                setEditingPromo(prev => prev ? { ...prev, minOrderAmount: 0 } : null);
                                            } else if (/^\d+$/.test(val)) {
                                                if (Number.isSafeInteger(Number(val)) && Number(val) <= 1000000000) {
                                                    setEditingPromo(prev => prev ? { ...prev, minOrderAmount: parseInt(val, 10) } : null);
                                                }
                                            }
                                        }}
                                        placeholder="0"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1 text-xs">Giảm Tối Đa (nếu là %)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={editingPromo.maxDiscountAmount !== undefined && editingPromo.maxDiscountAmount !== null && editingPromo.maxDiscountAmount !== '' ? editingPromo.maxDiscountAmount : ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '' || /^\d+$/.test(val)) {
                                                setEditingPromo({ ...editingPromo, maxDiscountAmount: val === '' ? '' : val });
                                            }
                                        }}
                                        onBlur={(e) => {
                                            const val = String(editingPromo.maxDiscountAmount ?? '').trim();
                                            if (val === '') {
                                                setEditingPromo(prev => prev ? { ...prev, maxDiscountAmount: '' } : null);
                                            } else if (/^\d+$/.test(val)) {
                                                if (Number.isSafeInteger(Number(val)) && Number(val) <= 1000000000) {
                                                    setEditingPromo(prev => prev ? { ...prev, maxDiscountAmount: parseInt(val, 10) } : null);
                                                }
                                            }
                                        }}
                                        placeholder="Để trống nếu không giới hạn"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:bg-white focus:outline-hidden focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPromoModal(false)}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
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
                shopProfile={shopProfile}
                themeConfig={draftTheme}
                banners={banners}
                promotions={promotions}
                categories={categories}
                menuItems={menuItems}
            />
        </div>
    );
};
