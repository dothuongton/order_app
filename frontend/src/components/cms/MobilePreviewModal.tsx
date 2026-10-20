import React from 'react';
import { X, Smartphone, ArrowLeft, ShoppingBag } from 'lucide-react';
import { CmsThemeConfig, Banner, Promotion } from '../../types/cms.js';
import { BannerDisplay } from '../BannerDisplay.js';

interface MobilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    shopName: string;
    themeConfig: CmsThemeConfig;
    banners: Banner[];
    promotions: Promotion[];
    categories: any[];
    menuItems: any[];
    shopProfile?: {
        name?: string;
        logoUrl?: string;
        coverUrl?: string;
        description?: string;
        phone?: string;
        address?: string;
        openingHours?: string;
    } | null;
}

export const MobilePreviewModal: React.FC<MobilePreviewModalProps> = ({
    isOpen,
    onClose,
    shopName,
    themeConfig,
    banners,
    promotions,
    categories,
    menuItems,
    shopProfile
}) => {
    // Listen for Escape key to close
    React.useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const displayName = shopProfile?.name || shopName || 'Tên Quán';
    const primaryColor = themeConfig.primaryColor || '#ea580c';
    const showBanner = themeConfig.showBanner !== false;
    const activeBanners = banners.filter(b => b.isActive !== false && (b as any).is_active !== false);
    const activePromos = promotions.filter(p => p.isActive !== false && (p as any).is_active !== false);

    return (
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
        >
            {/* Single Floating Close Button (Top Right) */}
            <button
                type="button"
                onClick={onClose}
                className="fixed top-3 right-3 sm:top-5 sm:right-5 z-60 w-11 h-11 bg-slate-800/90 hover:bg-slate-700 text-white rounded-full flex items-center justify-center shadow-2xl border border-white/20 transition cursor-pointer active:scale-95"
                title="Đóng xem trước (Esc)"
                aria-label="Đóng xem trước"
            >
                <X className="w-6 h-6" />
            </button>

            <div className="relative flex flex-col items-center my-auto">
                {/* iPhone Device Mockup Frame */}
                <div className="w-[360px] sm:w-[390px] h-[700px] sm:h-[720px] max-h-[85dvh] sm:max-h-[88vh] bg-slate-900 rounded-[50px] p-3 shadow-2xl border-4 border-slate-700 relative overflow-hidden flex flex-col">
                    {/* iPhone Dynamic Island / Notch */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-30"></div>

                    {/* Mobile Screen Inside */}
                    <div className="flex-1 bg-slate-950 rounded-[40px] overflow-y-auto text-slate-100 flex flex-col relative pt-7 font-sans">
                        {/* Header */}
                        <div
                            className="px-4 py-3 sticky top-0 z-20 backdrop-blur-md border-b border-white/10 flex items-center justify-between"
                            style={{ backgroundColor: `${primaryColor}22` }}
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                {shopProfile?.logoUrl ? (
                                    <img
                                        src={shopProfile.logoUrl}
                                        alt={displayName}
                                        className="w-8 h-8 rounded-lg object-cover border border-white/20 shrink-0"
                                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div
                                        className="w-8 h-8 rounded-lg text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs"
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        {displayName[0] || '🍜'}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <h4 className="font-extrabold text-xs text-white truncate">{displayName}</h4>
                                    <span className="text-[10px] text-slate-400 block truncate">Bàn A01 • Xem trước</span>
                                </div>
                            </div>
                        </div>

                        {/* Cover Image & Shop Description */}
                        {shopProfile?.coverUrl && (
                            <div className="w-full h-28 relative shrink-0 border-b border-white/10 overflow-hidden">
                                <img
                                    src={shopProfile.coverUrl}
                                    alt={displayName}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                {shopProfile?.description && (
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex items-end p-2.5">
                                        <p className="text-white text-[11px] font-medium line-clamp-1 drop-shadow-sm">
                                            {shopProfile.description}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Storefront Content based on layout */}
                        <div className="p-3 space-y-3.5">
                            {/* Contact & Hours strip if present */}
                            {(shopProfile?.address || shopProfile?.phone || shopProfile?.openingHours) && (
                                <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-[10px] text-slate-300 space-y-0.5">
                                    {shopProfile.address && (
                                        <div className="truncate text-slate-400">📍 {shopProfile.address}</div>
                                    )}
                                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                        {shopProfile.phone && <span>📞 {shopProfile.phone}</span>}
                                        {shopProfile.openingHours && <span>⏰ {shopProfile.openingHours}</span>}
                                    </div>
                                </div>
                            )}

                            {/* Banners if enabled */}
                            {showBanner && activeBanners.length > 0 && (
                                <BannerDisplay
                                    banners={activeBanners}
                                    displayMode={themeConfig.bannerDisplayMode || 'stack'}
                                />
                            )}

                            {/* Promotions Banner if enabled */}
                            {themeConfig.showPromotions && activePromos.length > 0 && (
                                <div
                                    className="p-2.5 rounded-xl border flex items-center gap-2 text-xs"
                                    style={{
                                        backgroundColor: `${primaryColor}15`,
                                        borderColor: `${primaryColor}40`,
                                        color: primaryColor
                                    }}
                                >
                                    <span className="px-1.5 py-0.5 rounded-md bg-white text-slate-950 font-black text-[10px] shrink-0">
                                        ƯU ĐÃI
                                    </span>
                                    <span className="font-bold text-[11px] truncate">
                                        {activePromos[0].title}
                                    </span>
                                </div>
                            )}

                            {/* Categories bar */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
                                <button
                                    className="px-3 py-1 rounded-full text-[11px] font-bold text-white shrink-0"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    Tất cả
                                </button>
                                {categories.slice(0, 3).map(c => (
                                    <button
                                        key={c.id}
                                        className="px-3 py-1 rounded-full text-[11px] font-medium bg-slate-900 text-slate-400 shrink-0 border border-slate-800"
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>

                            {/* Products Grid based on layout */}
                            {themeConfig.layout === 'modern_grid' ? (
                                <div className="grid grid-cols-2 gap-2.5">
                                    {menuItems.slice(0, 4).map(item => (
                                        <div key={item.id} className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden p-2 space-y-1.5">
                                            <div className="h-24 bg-slate-800 rounded-lg overflow-hidden relative">
                                                {item.image_url ? (
                                                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-bold">Món</div>
                                                )}
                                            </div>
                                            <div className="text-[11px] font-bold text-white truncate">{item.name}</div>
                                            <div className="flex items-center justify-between pt-1">
                                                <span className="text-[11px] font-black" style={{ color: primaryColor }}>
                                                    {parseInt(item.price, 10).toLocaleString('vi-VN')}đ
                                                </span>
                                                <button
                                                    className="w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold"
                                                    style={{ backgroundColor: primaryColor }}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                /* Classic / Compact List */
                                <div className="space-y-2">
                                    {menuItems.slice(0, 4).map(item => (
                                        <div key={item.id} className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 flex items-center gap-2.5">
                                            <div className="w-14 h-14 bg-slate-800 rounded-lg shrink-0 overflow-hidden">
                                                {item.image_url ? (
                                                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">Món</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold text-white truncate">{item.name}</div>
                                                <div className="text-[10px] text-slate-400 line-clamp-1">{item.description}</div>
                                                <div className="text-xs font-black mt-1" style={{ color: primaryColor }}>
                                                    {parseInt(item.price, 10).toLocaleString('vi-VN')}đ
                                                </div>
                                            </div>
                                            <button
                                                className="px-2.5 py-1 rounded-lg text-white text-xs font-bold"
                                                style={{ backgroundColor: primaryColor }}
                                            >
                                                +
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bottom Cart Bar Mockup */}
                        <div className="sticky bottom-0 left-0 right-0 p-3 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 mt-auto">
                            <button
                                className="w-full py-2.5 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-between shadow-lg"
                                style={{ backgroundColor: primaryColor }}
                            >
                                <span>Giỏ hàng (2 món)</span>
                                <span>55.000đ →</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="text-center text-xs text-slate-400 mt-2">
                    Mô phỏng kích thước iPhone thật (390px) • Áp dụng cấu hình nháp tức thì
                </div>
            </div>
        </div>
    );
};
