import React, { useState, useMemo } from 'react';
import { useGuest } from '../../context/GuestContext.js';
import { MenuItem } from '../../types/index.js';
import { BannerDisplay } from '../../components/BannerDisplay.js';
import { Plus, Minus, X, AlertCircle, Tag, Sparkles, Search } from 'lucide-react';

const normalizeSearch = (str: string) => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
};

export const GuestMenu: React.FC = () => {
  const { categories, menuItems, addToCart, session, isSessionClosed, tenant, banners, promotions, canOrder } = useGuest();
  const theme = tenant?.activeThemeConfig || {};
  const layout = theme.layout || tenant?.activeTemplateId || 'classic';
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [selectedGroupOptions, setSelectedGroupOptions] = useState<Record<string, any>>({});
  const [selectedOptionItems, setSelectedOptionItems] = useState<Record<string, any[]>>({});
  const [quantity, setQuantity] = useState<number>(1);
  const [note, setNote] = useState<string>('');

  // Available items always appear first; out-of-stock items (Hết món) are pushed to the bottom
  const filteredItems = useMemo(() => {
    let raw = selectedCategory === 'all'
      ? menuItems
      : menuItems.filter(item => item.category_id === selectedCategory);

    if (searchQuery.trim()) {
      const q = normalizeSearch(searchQuery.trim());
      raw = raw.filter(item =>
        normalizeSearch(item.name).includes(q) ||
        (item.description && normalizeSearch(item.description).includes(q))
      );
    }

    return [...raw].sort((a, b) => {
      if (a.is_available === b.is_available) return 0;
      return a.is_available ? -1 : 1;
    });
  }, [selectedCategory, menuItems, searchQuery]);

  const handleOpenCustomize = (item: MenuItem) => {
    if (!item.is_available || !session || isSessionClosed) return;
    setActiveItem(item);
    setSelectedVariant(null);
    setSelectedGroupOptions({});

    const optGroups = item.option_groups || (item as any).optionGroups;
    if (optGroups && optGroups.length > 0) {
      const initial: Record<string, any[]> = {};
      optGroups.forEach((g: any) => {
        if (g.selection_mode === 'SINGLE') {
          const defaultOpt = g.options?.find((o: any) => o.is_default) || (g.min_selections > 0 && g.options?.length > 0 ? g.options[0] : null);
          initial[g.id] = defaultOpt ? [defaultOpt] : [];
        } else {
          const defaultOpts = g.options?.filter((o: any) => o.is_default) || [];
          initial[g.id] = defaultOpts;
        }
      });
      setSelectedOptionItems(initial);
    } else {
      setSelectedOptionItems({});
      const initialGroups: Record<string, any> = {};
      if (item.variant_groups && item.variant_groups.length > 0) {
        item.variant_groups.forEach(g => {
          if (g.options && g.options.length > 0) {
            initialGroups[g.name] = g.options[0];
          }
        });
      }
      setSelectedGroupOptions(initialGroups);
    }

    setQuantity(1);
    setNote('');
  };

  const handleConfirmAdd = () => {
    if (!activeItem) return;
    const optGroups = activeItem.option_groups || (activeItem as any).optionGroups;

    if (optGroups && optGroups.length > 0) {
      const allSelectedOptions = optGroups.flatMap((g: any) => selectedOptionItems[g.id] || []);
      const optionIds = allSelectedOptions.map((o: any) => o.id).filter(Boolean);
      const variantName = allSelectedOptions.map((o: any) => o.name).join(', ');
      const priceAdj = optGroups.reduce((sum: number, g: any) => {
        if (g.pricing_mode !== 'ADDITIVE') return sum;
        const chosen = selectedOptionItems[g.id] || [];
        return sum + chosen.reduce((s: number, o: any) => s + (Math.max(0, Number(o.price_delta) || 0)), 0);
      }, 0);

      addToCart(activeItem, quantity, note.trim() || undefined, {
        optionIds,
        name: variantName,
        price_adjustment: priceAdj
      });
    } else if (activeItem.variant_groups && activeItem.variant_groups.length > 0) {
      const selectedList = Object.values(selectedGroupOptions).filter(Boolean);
      const variantName = selectedList.map(o => o.name).join(', ');
      const priceAdj = selectedList.reduce((sum, o) => sum + (Number(o.price_adjustment) || 0), 0);
      const variantIds = selectedList.map(o => o.id).filter(Boolean);
      addToCart(activeItem, quantity, note.trim() || undefined, {
        variantIds,
        name: variantName,
        price_adjustment: priceAdj
      });
    } else {
      addToCart(activeItem, quantity, note.trim() || undefined, selectedVariant || undefined);
    }

    setActiveItem(null);
    setSelectedVariant(null);
    setSelectedGroupOptions({});
    setSelectedOptionItems({});
  };

  return (
    <div className="pb-28">
      {tenant?.coverUrl && (
        <div className="w-full h-32 sm:h-40 overflow-hidden relative border-b border-slate-200">
          <img
            src={tenant.coverUrl}
            alt={tenant.name || 'Ảnh bìa quán'}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
          {tenant.description && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent flex items-end p-3.5">
              <p className="text-white text-xs font-semibold line-clamp-1 drop-shadow-sm">{tenant.description}</p>
            </div>
          )}
        </div>
      )}

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
          {promotions.map(promotion => {
            const discType = promotion.discountType || promotion.discount_type;
            const discVal = Number(promotion.discountValue || promotion.discount_value || 0);
            const minOrder = Number(promotion.minOrderAmount || promotion.min_order_amount || 0);
            const maxDisc = promotion.maxDiscountAmount || promotion.max_discount_amount;

            return (
              <div key={promotion.id} className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/80 rounded-2xl p-3.5 text-xs text-orange-950 shadow-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-orange-900">
                    <Tag className="w-4 h-4 text-orange-600 shrink-0" />
                    <span>{promotion.title}</span>
                  </div>
                  {promotion.code && (
                    <span className="font-mono text-[11px] font-extrabold px-2 py-0.5 bg-orange-200/80 text-orange-900 rounded-md shrink-0">
                      {promotion.code}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold text-orange-800">
                  <span className="bg-white/80 px-2 py-0.5 rounded-md border border-orange-200/60">
                    {discType === 'PERCENT'
                      ? `Giảm ${discVal}%${maxDisc ? ` (tối đa ${Number(maxDisc).toLocaleString('vi-VN')}đ)` : ''}`
                      : `Giảm ${discVal.toLocaleString('vi-VN')}đ`}
                  </span>
                  {minOrder > 0 && (
                    <span className="bg-white/80 px-2 py-0.5 rounded-md border border-orange-200/60">
                      Đơn từ {minOrder.toLocaleString('vi-VN')}đ
                    </span>
                  )}
                </div>

                {promotion.description && (
                  <p className="text-[11px] text-orange-800/80 leading-relaxed">{promotion.description}</p>
                )}
              </div>
            );
          })}
        </section>
      )}
      {/* Search Bar & Category Tabs */}
      <div className="sticky top-14 z-20 bg-slate-50/95 backdrop-blur border-b border-slate-200 px-4 pt-3 pb-2.5 space-y-2">
        {/* Item Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm kiếm món ăn, đồ uống..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200/90 rounded-2xl pl-10 pr-9 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-full cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="overflow-x-auto no-scrollbar flex gap-2 pt-0.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition min-h-[40px] flex items-center ${
              selectedCategory === 'all'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Tất cả món
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition min-h-[40px] flex items-center ${
                selectedCategory === cat.id
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State when no items found */}
      {filteredItems.length === 0 && (
        <div className="p-8 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-700">Không tìm thấy món nào</p>
          <p className="text-xs text-slate-400">
            {searchQuery ? `Không có kết quả phù hợp với từ khóa "${searchQuery}"` : 'Danh mục này hiện chưa có món'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs font-bold text-teal-700 hover:underline pt-1 cursor-pointer"
            >
              Xóa tìm kiếm
            </button>
          )}
        </div>
      )}

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
                <div>
                  <span className="text-base font-bold text-orange-600">
                    {Number(item.price).toLocaleString('vi-VN')}đ
                  </span>
                  {((item.variant_groups && item.variant_groups.length > 0) || (item.variants && item.variants.length > 0)) && (
                    <span className="block text-[10px] text-orange-700 font-semibold mt-0.5">
                      {item.variant_groups && item.variant_groups.length > 0
                        ? `${item.variant_groups.length} nhóm tùy chọn`
                        : `${item.variants!.length} tùy chọn`}
                    </span>
                  )}
                </div>

                {item.is_available && session && !isSessionClosed && canOrder && (
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
      {activeItem && (() => {
        const optGroups = activeItem.option_groups || (activeItem as any).optionGroups;
        const hasOptionGroups = !!(optGroups && optGroups.length > 0);
        const hasVariantGroups = !hasOptionGroups && !!(activeItem.variant_groups && activeItem.variant_groups.length > 0);

        let optionGroupAdj = 0;
        const allSelectedOptionNames: string[] = [];
        if (hasOptionGroups) {
          optGroups.forEach((g: any) => {
            const chosen = selectedOptionItems[g.id] || [];
            chosen.forEach((o: any) => {
              allSelectedOptionNames.push(o.name);
              if (g.pricing_mode === 'ADDITIVE') {
                optionGroupAdj += Math.max(0, Number(o.price_delta) || 0);
              }
            });
          });
        }

        const selectedList = Object.values(selectedGroupOptions).filter(Boolean);
        const groupAdj = selectedList.reduce((sum, o) => sum + (Number(o.price_adjustment) || 0), 0);
        const currentPrice = Number(activeItem.price) + (
          hasOptionGroups ? optionGroupAdj :
          hasVariantGroups ? groupAdj :
          (selectedVariant ? Number(selectedVariant.price_adjustment || 0) : 0)
        );

        // Validation for required option groups
        const missingRequiredGroups = hasOptionGroups ? optGroups.filter((g: any) => {
          const chosen = selectedOptionItems[g.id] || [];
          return (g.min_selections || 0) > 0 && chosen.length < g.min_selections;
        }) : [];
        const canSubmit = missingRequiredGroups.length === 0;

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-t-3xl p-5 shadow-2xl border-t border-slate-100 animate-slide-up max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{activeItem.name}</h3>
                  {hasOptionGroups ? (
                    allSelectedOptionNames.length > 0 && (
                      <span className="inline-block mt-0.5 text-xs text-orange-600 font-semibold">
                        Đã chọn: {allSelectedOptionNames.join(' • ')}
                      </span>
                    )
                  ) : hasVariantGroups ? (
                    selectedList.length > 0 && (
                      <span className="inline-block mt-0.5 text-xs text-orange-600 font-semibold">
                        Đã chọn: {selectedList.map(o => o.name).join(' • ')}
                      </span>
                    )
                  ) : (
                    selectedVariant && (
                      <span className="inline-block mt-0.5 text-xs text-orange-600 font-semibold">
                        Biến thể đã chọn: {selectedVariant.name}
                      </span>
                    )
                  )}
                </div>
                <button
                  onClick={() => { setActiveItem(null); setSelectedVariant(null); setSelectedGroupOptions({}); setSelectedOptionItems({}); }}
                  className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4">
                <div className="text-xl font-bold text-orange-600 mb-4">
                  {currentPrice.toLocaleString('vi-VN')}đ
                </div>

                {/* Option Groups Selector */}
                {hasOptionGroups ? (
                  <div className="space-y-4 mb-4">
                    {optGroups.map((group: any) => {
                      const chosen = selectedOptionItems[group.id] || [];
                      const isSingle = group.selection_mode === 'SINGLE';
                      const isFree = group.pricing_mode === 'FREE';

                      const toggleOption = (opt: any) => {
                        setSelectedOptionItems(prev => {
                          const currentChosen = prev[group.id] || [];
                          if (isSingle) {
                            if (group.min_selections > 0) {
                              return { ...prev, [group.id]: [opt] };
                            } else {
                              const isAlready = currentChosen.some((c: any) => c.id === opt.id);
                              return { ...prev, [group.id]: isAlready ? [] : [opt] };
                            }
                          } else {
                            const isAlready = currentChosen.some((c: any) => c.id === opt.id);
                            if (isAlready) {
                              return { ...prev, [group.id]: currentChosen.filter((c: any) => c.id !== opt.id) };
                            } else {
                              if (group.max_selections > 0 && currentChosen.length >= group.max_selections) {
                                return prev;
                              }
                              return { ...prev, [group.id]: [...currentChosen, opt] };
                            }
                          }
                        });
                      };

                      return (
                        <div key={group.id} className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                {group.name}
                              </label>
                              {group.min_selections > 0 ? (
                                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                                  Bắt buộc
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">
                                  Tùy chọn
                                </span>
                              )}
                              {isFree && (
                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                                  Miễn phí
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {isSingle
                                ? 'Chọn 1'
                                : group.max_selections > 0
                                  ? `Tối đa ${group.max_selections}`
                                  : 'Chọn nhiều'}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {group.options?.map((opt: any) => {
                              const isSelected = chosen.some((c: any) => c.id === opt.id);
                              const priceDelta = Number(opt.price_delta) || 0;
                              const hasPriceDelta = !isFree && priceDelta > 0;

                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => toggleOption(opt)}
                                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                                    isSelected
                                      ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  <span>{opt.name}</span>
                                  {hasPriceDelta && (
                                    <span className={isSelected ? 'text-orange-200 text-[10px]' : 'text-slate-400 text-[10px]'}>
                                      (+{priceDelta.toLocaleString('vi-VN')}đ)
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : hasVariantGroups ? (
                  <div className="space-y-4 mb-4">
                    {activeItem.variant_groups!.map((group, gIdx) => (
                      <div key={group.name || gIdx} className="bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                            {group.name}
                          </label>
                          <span className="text-[11px] text-slate-400 font-medium">Chọn 1</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.options.map((opt, optIdx) => {
                            const isSelected = selectedGroupOptions[group.name]?.id === opt.id ||
                              (!opt.id && selectedGroupOptions[group.name]?.name === opt.name);
                            return (
                              <button
                                key={opt.id || optIdx}
                                type="button"
                                onClick={() => setSelectedGroupOptions(prev => ({ ...prev, [group.name]: opt }))}
                                className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                                  isSelected
                                    ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <span>{opt.name}</span>
                                {Number(opt.price_adjustment) > 0 && (
                                  <span className={isSelected ? 'text-orange-200 text-[10px]' : 'text-slate-400 text-[10px]'}>
                                    +{Number(opt.price_adjustment).toLocaleString('vi-VN')}đ
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Legacy Flat Variants Selector */
                  activeItem.variants && activeItem.variants.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Tùy chọn biến thể (chọn 1)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedVariant(null)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                            selectedVariant === null
                              ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>Mặc định</span>
                        </button>
                        {activeItem.variants.map((v, idx) => {
                          const isSelected = selectedVariant?.id === v.id || (!selectedVariant?.id && selectedVariant?.name === v.name);
                          const priceAdj = Number(v.price_adjustment) || 0;
                          return (
                            <button
                              key={v.id || idx}
                              type="button"
                              onClick={() => setSelectedVariant(v)}
                              className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                                isSelected
                                  ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span>{v.name}</span>
                              {priceAdj > 0 && (
                                <span className={isSelected ? 'text-orange-200 text-[10px]' : 'text-slate-400 text-[10px]'}>
                                  +{priceAdj.toLocaleString('vi-VN')}đ
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}

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

              {missingRequiredGroups.length > 0 && (
                <div className="p-2.5 mb-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Vui lòng chọn: {missingRequiredGroups.map((g: any) => g.name).join(', ')}</span>
                </div>
              )}

              <button
                onClick={handleConfirmAdd}
                disabled={!canSubmit}
                className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-40 text-white font-bold rounded-xl py-3 px-4 shadow-md flex items-center justify-between transition mt-2 cursor-pointer"
              >
                <span>Thêm vào đơn</span>
                <span>{(currentPrice * quantity).toLocaleString('vi-VN')}đ</span>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
