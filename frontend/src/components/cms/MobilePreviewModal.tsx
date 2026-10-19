import React from 'react';
import { X, Smartphone, ArrowLeft, ShoppingBag } from 'lucide-react';
import { CmsThemeConfig, Banner, Promotion } from '../../types/cms.js';

interface MobilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    shopName: string;
    themeConfig: CmsThemeConfig;
    banners: Banner[];
    promotions: Promotion[];
    categories: any[];
    menuItems: any[];
}

export const MobilePreviewModal: React.FC<MobilePreviewModalProps> = ({
    isOpen,
    onClose,
    shopName,
    themeConfig,
    banners,
    promotions,
    categories,
    menuItems
}) => {
    if (!isOpen) return null;

    const primaryColor = themeConfig.primaryColor || '#ea580c';
    const activeBanners = banners.filter(b => b.isActive);
    const activePromos = promotions.filter(p => p.isActive);

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
            <div className="relative flex flex-col items-center">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute -top-10 right-0 sm:-right-10 text-white hover:text-slate-300 p-2 bg-slate-800/80 rounded-full transition"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* iPhone Device Mockup Frame */}
                <div className="w-[360px] sm:w-[390px] h-[720px] bg-slate-900 rounded-[50px] p-3 shadow-2xl border-4 border-slate-700 relative overflow-hidden flex flex-col">
                    {/* iPhone Dynamic Island / Notch */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-30"></div>

                    {/* Mobile Screen Inside */}
                    <div className="flex-1 bg-slate-950 rounded-[40px] overflow-y-auto text-slate-100 flex flex-col relative pt-7 font-sans">
                        {/* Header */}
                        <div
                            className="px-4 py-3 sticky top-0 z-20 backdrop-blur-md border-b border-white/10 flex items-center justify-between"
                            style={{ backgroundColor: `${primaryColor}22` }}
                        >
                            <div>
                                <h4 className="font-extrabold text-sm text-white">{shopName}</h4>
                                <span className="text-[10px] text-slate-400">Xem trước giao diện (Bàn mẫu A01)</span>
                            </div>
                            <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-xs"
                                style={{ backgroundColor: primaryColor }}
                            >
                                <ShoppingBag className="w-4 h-4" />
                            </div>
                        </div>

                        {/* Storefront Content based on layout */}
                        <div className="p-3 space-y-3.5">
                            {/* Banners Carousel if enabled */}
                            {themeConfig.showBanner && activeBanners.length > 0 && (
                                <div className="space-y-1">
                                    <div className="relative rounded-2xl overflow-hidden aspect-16/9 bg-slate-900 border border-white/10">
                                        <img
                                            src={activeBanners[0].imageUrl}
                                            alt={activeBanners[0].title}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 flex flex-col justify-end">
                                            <span className="text-white font-bold text-xs">{activeBanners[0].title}</span>
                                            {activeBanners[0].description && (
                                                <span className="text-slate-300 text-[10px] line-clamp-1">{activeBanners[0].description}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
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
