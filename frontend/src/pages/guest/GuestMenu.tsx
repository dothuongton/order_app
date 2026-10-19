import React, { useState, useMemo } from 'react';
import { useGuest } from '../../context/GuestContext.js';
import { MenuItem } from '../../types/index.js';
import { BannerDisplay } from '../../components/BannerDisplay.js';
import { Plus, Minus, X, AlertCircle } from 'lucide-react';

export const GuestMenu: React.FC = () => {
  const { categories, menuItems, addToCart, session, isSessionClosed, tenant, banners, promotions } = useGuest();
  const theme = tenant?.activeThemeConfig || {};
  const layout = theme.layout || tenant?.activeTemplateId || 'classic';
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [note, setNote] = useState<string>('');

  // Available items always appear first; out-of-stock items (Hết món) are pushed to the bottom
  const filteredItems = useMemo(() => {
    const raw = selectedCategory === 'all'
      ? menuItems
      : menuItems.filter(item => item.category_id === selectedCategory);

    return [...raw].sort((a, b) => {
      if (a.is_available === b.is_available) return 0;
      return a.is_available ? -1 : 1;
    });
  }, [selectedCategory, menuItems]);

  const handleOpenCustomize = (item: MenuItem) => {
    if (!item.is_available || !session || isSessionClosed) return;
    setActiveItem(item);
    setQuantity(1);
    setNote('');
  };

  const handleConfirmAdd = () => {
    if (activeItem) {
      addToCart(activeItem, quantity, note.trim() || undefined);
      setActiveItem(null);
    }
  };

  return (
    <div className="pb-28">
      {theme.showBanner !== false && banners.length > 0 && (
        <section aria-label="Thông tin và ưu đãi của quán" className="px-4 pt-4">
          <BannerDisplay
            banners={banners}
            displayMode={theme.bannerDisplayMode || 'stack'}
          />
        </section>
      )}
      {theme.showPromotions !== false && promotions.length > 0 && (
        <section aria-label="Khuyến mãi đang áp dụng" className="px-4 pt-3 space-y-2">
          {promotions.map(promotion => (
            <div key={promotion.id} className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-xs text-orange-800">
              <strong>{promotion.title}</strong>
              {promotion.description && <p className="mt-1">{promotion.description}</p>}
              <p className="mt-1">Ưu đãi tốt nhất được tính khi gửi đơn. Hóa đơn chỉ tính số món được phục vụ.</p>
            </div>
          ))}
        </section>
      )}
      {/* Category Tabs */}
      <div className="sticky top-14 z-20 bg-slate-50/95 backdrop-blur border-b border-slate-200 py-2.5 px-4 overflow-x-auto no-scrollbar flex gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition min-h-[44px] flex items-center ${
            selectedCategory === 'all'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          Tất cả món
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition min-h-[44px] flex items-center ${
              selectedCategory === cat.id
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Menu Items Grid */}
      <div className={layout === 'modern_grid' ? "p-4 grid grid-cols-2 gap-3" : "p-4 space-y-3"}>
        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-sm flex ${layout === 'modern_grid' ? 'flex-col items-stretch' : 'items-center'} gap-3.5 transition ${
              !item.is_available ? 'opacity-60 bg-slate-50' : 'hover:border-orange-200 active:scale-[0.99]'
            }`}
          >
            {/* Image / Placeholder */}
            <div className={`${layout === 'modern_grid' ? 'w-full h-32' : layout === 'compact_list' ? 'w-12 h-12' : 'w-20 h-20'} rounded-xl bg-orange-50 border border-orange-100 flex-shrink-0 flex items-center justify-center overflow-hidden`}>
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">🍲</span>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900 text-base leading-tight truncate">{item.name}</h3>
                {!item.is_available && (
                  <span className="text-[11px] font-semibold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full flex-shrink-0">
                    Hết món
                  </span>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-slate-500 line-clamp-2 mt-1">{item.description}</p>
              )}
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-base font-bold text-orange-600">
                  {Number(item.price).toLocaleString('vi-VN')}đ
                </span>

                {item.is_available && session && !isSessionClosed && (
                  <button
                    onClick={() => handleOpenCustomize(item)}
                    className="min-w-[44px] min-h-[44px] bg-orange-50 hover:bg-orange-100 text-orange-600 active:bg-orange-600 active:text-white rounded-full flex items-center justify-center font-bold transition shadow-sm"
                    aria-label={`Thêm ${item.name}`}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p>Không có món nào trong danh mục này</p>
          </div>
        )}
      </div>

      {/* Customize Item Bottom Sheet */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-t-3xl p-5 shadow-2xl border-t border-slate-100 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{activeItem.name}</h3>
              <button
                onClick={() => setActiveItem(null)}
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4">
              <div className="text-xl font-bold text-orange-600 mb-4">
                {Number(activeItem.price).toLocaleString('vi-VN')}đ
              </div>

              {/* Quantity */}
              <div className="flex items-center justify-between py-2 border-y border-slate-100">
                <span className="font-medium text-slate-700">Số lượng</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-11 h-11 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-lg w-8 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-11 h-11 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Special Note */}
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Ghi chú cho bếp (tuỳ chọn)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Ít cay, không hành, nhiều nước dùng..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  maxLength={150}
                />
              </div>
            </div>

            <button
              onClick={handleConfirmAdd}
              className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold rounded-xl py-3 px-4 shadow-md flex items-center justify-between transition mt-2"
            >
              <span>Thêm vào đơn</span>
              <span>{(Number(activeItem.price) * quantity).toLocaleString('vi-VN')}đ</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
