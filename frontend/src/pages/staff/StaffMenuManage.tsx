import React, { useEffect, useState } from 'react';
import { request } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { ImageUploadField } from '../../components/ImageUploadField.js';
import {
  Search, Check, AlertCircle, Plus, Edit3, Trash2, X,
  Utensils, Image as ImageIcon, Loader2, GripVertical, HelpCircle
} from 'lucide-react';

export interface MenuItemVariantOptionData {
  id?: string;
  name: string;
  price_adjustment: number;
  is_available?: boolean;
}

export interface MenuItemVariantGroupData {
  name: string;
  options: MenuItemVariantOptionData[];
}

interface MenuItemData {
  id?: string;
  name: string;
  category_id: string;
  category_name?: string;
  price: number;
  description?: string;
  image_url?: string;
  is_available: boolean;
  variants?: MenuItemVariantOptionData[];
  variant_groups?: MenuItemVariantGroupData[];
}

interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
}

const SUGGESTED_GROUP_NAMES = [
  'Kích cỡ',
  'Lượng đường',
  'Lượng đá',
  'Mức cay',
  'Topping',
  'Hương vị'
];

export const StaffMenuManage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('menu.manage');

  const [items, setItems] = useState<MenuItemData[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemData | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete State
  const [deletingItem, setDeletingItem] = useState<MenuItemData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMenuData = async () => {
    setIsLoading(true);
    try {
      const [itemsRes, catsRes] = await Promise.all([
        request<{ items: MenuItemData[] }>('/staff/menu/items'),
        request<{ categories: MenuCategory[] }>('/staff/menu/categories')
      ]);
      setItems(itemsRes.items || []);
      setCategories(catsRes.categories || []);
    } catch (err: any) {
      console.error(err);
      setMsg({ type: 'error', text: err.message || 'Lỗi tải dữ liệu thực đơn' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuData();
  }, []);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const handleToggle = async (itemId: string, currentStatus: boolean) => {
    if (!canManage) {
      alert('Bạn không có quyền quản lý thực đơn');
      return;
    }
    try {
      await request(`/staff/menu/items/${itemId}/toggle-available`, {
        method: 'PUT',
        body: JSON.stringify({ isAvailable: !currentStatus })
      });
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, is_available: !currentStatus } : i));
      showNotification(`Đã chuyển sang ${!currentStatus ? 'Còn món' : 'Hết món'}`);
    } catch (err: any) {
      showNotification(err.message || 'Lỗi cập nhật', 'error');
    }
  };

  const handleOpenAdd = () => {
    if (!canManage) {
      alert('Bạn không có quyền quản lý thực đơn');
      return;
    }
    setEditingItem({
      name: '',
      category_id: categories[0]?.id || '',
      price: 0,
      description: '',
      image_url: '',
      is_available: true,
      variant_groups: []
    });
    setShowItemModal(true);
  };

  const handleOpenEdit = (item: MenuItemData) => {
    if (!canManage) {
      alert('Bạn không có quyền quản lý thực đơn');
      return;
    }
    let initialGroups: MenuItemVariantGroupData[] = [];
    if (item.variant_groups && item.variant_groups.length > 0) {
      initialGroups = item.variant_groups.map(g => ({
        name: g.name,
        options: (g.options || []).map(o => ({ ...o }))
      }));
    } else if (item.variants && item.variants.length > 0) {
      const map = new Map<string, MenuItemVariantOptionData[]>();
      for (const v of item.variants) {
        const gName = (v as any).group_name || 'Biến thể';
        if (!map.has(gName)) map.set(gName, []);
        map.get(gName)!.push({ ...v });
      }
      initialGroups = Array.from(map.entries()).map(([name, options]) => ({
        name,
        options
      }));
    }

    setEditingItem({
      ...item,
      variant_groups: initialGroups
    });
    setShowItemModal(true);
  };

  const handleAddGroup = () => {
    if (!editingItem) return;
    const current = editingItem.variant_groups || [];
    if (current.length >= 3) {
      alert('Một sản phẩm chỉ có tối đa 3 dạng biến thể');
      return;
    }
    const usedNames = current.map(g => g.name);
    const nextName = SUGGESTED_GROUP_NAMES.find(n => !usedNames.includes(n)) || `Biến thể ${current.length + 1}`;
    setEditingItem({
      ...editingItem,
      variant_groups: [
        ...current,
        {
          name: nextName,
          options: [{ name: '', price_adjustment: 0, is_available: true }]
        }
      ]
    });
  };

  const handleRemoveGroup = (gIdx: number) => {
    if (!editingItem) return;
    const current = (editingItem.variant_groups || []).filter((_, i) => i !== gIdx);
    setEditingItem({ ...editingItem, variant_groups: current });
  };

  const handleUpdateGroupName = (gIdx: number, name: string) => {
    if (!editingItem) return;
    const current = [...(editingItem.variant_groups || [])];
    current[gIdx] = { ...current[gIdx], name };
    setEditingItem({ ...editingItem, variant_groups: current });
  };

  const handleAddOption = (gIdx: number) => {
    if (!editingItem) return;
    const current = [...(editingItem.variant_groups || [])];
    const group = current[gIdx];
    if (!group) return;
    current[gIdx] = {
      ...group,
      options: [
        ...group.options,
        { name: '', price_adjustment: 0, is_available: true }
      ]
    };
    setEditingItem({ ...editingItem, variant_groups: current });
  };

  const handleUpdateOption = (gIdx: number, oIdx: number, field: string, value: any) => {
    if (!editingItem) return;
    const current = [...(editingItem.variant_groups || [])];
    const group = current[gIdx];
    if (!group) return;
    const options = [...group.options];
    options[oIdx] = { ...options[oIdx], [field]: value };
    current[gIdx] = { ...group, options };
    setEditingItem({ ...editingItem, variant_groups: current });
  };

  const handleRemoveOption = (gIdx: number, oIdx: number) => {
    if (!editingItem) return;
    const current = [...(editingItem.variant_groups || [])];
    const group = current[gIdx];
    if (!group) return;
    current[gIdx] = {
      ...group,
      options: group.options.filter((_, i) => i !== oIdx)
    };
    setEditingItem({ ...editingItem, variant_groups: current });
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!editingItem.name.trim()) {
      alert('Vui lòng nhập tên món');
      return;
    }
    if (!editingItem.category_id) {
      alert('Vui lòng chọn danh mục cho món');
      return;
    }
    if (editingItem.price < 0 || isNaN(editingItem.price)) {
      alert('Giá món không hợp lệ');
      return;
    }

    // Filter and sanitize variant groups:
    const filteredGroups = (editingItem.variant_groups || [])
      .map(g => ({
        name: g.name.trim(),
        options: (g.options || [])
          .filter(o => o.name.trim().length > 0)
          .map(o => ({
            id: o.id,
            name: o.name.trim(),
            price_adjustment: Math.max(0, parseInt(String(o.price_adjustment), 10) || 0),
            is_available: o.is_available !== false
          }))
      }))
      .filter(g => g.name.length > 0 && g.options.length > 0);

    if (filteredGroups.length > 3) {
      alert('Một sản phẩm chỉ có tối đa 3 dạng biến thể');
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem.id) {
        // Update
        const res = await request<{ item: MenuItemData }>(`/staff/menu/items/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: editingItem.name.trim(),
            category_id: editingItem.category_id,
            price: Number(editingItem.price),
            description: editingItem.description?.trim() || null,
            image_url: editingItem.image_url?.trim() || null,
            is_available: editingItem.is_available,
            variant_groups: filteredGroups
          })
        });
        showNotification(`Đã cập nhật món "${res?.item?.name || editingItem.name}"`);
      } else {
        // Create
        const res = await request<{ item: MenuItemData }>('/staff/menu/items', {
          method: 'POST',
          body: JSON.stringify({
            name: editingItem.name.trim(),
            category_id: editingItem.category_id,
            price: Number(editingItem.price),
            description: editingItem.description?.trim() || null,
            image_url: editingItem.image_url?.trim() || null,
            is_available: editingItem.is_available,
            variant_groups: filteredGroups
          })
        });
        showNotification(`Đã thêm món "${res?.item?.name || editingItem.name}" thành công`);
      }
      setShowItemModal(false);
      setEditingItem(null);
      await fetchMenuData();
    } catch (err: any) {
      showNotification(err.message || 'Lỗi lưu thông tin món ăn', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deletingItem?.id) return;
    setIsDeleting(true);
    try {
      await request(`/staff/menu/items/${deletingItem.id}`, {
        method: 'DELETE'
      });
      showNotification(`Đã xóa món "${deletingItem.name}" thành công`);
      setDeletingItem(null);
      await fetchMenuData();
    } catch (err: any) {
      showNotification(err.message || 'Lỗi xóa món ăn', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = items
    .filter(i => {
      const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategoryFilter === 'all' || i.category_id === selectedCategoryFilter;
      return matchSearch && matchCat;
    })
    .sort((a, b) => {
      if (a.is_available === b.is_available) return a.name.localeCompare(b.name);
      return a.is_available ? -1 : 1;
    });

  return (
    <div className="space-y-4">
      {/* Header with Title and Add Button */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-slate-900 text-lg">Quản lý thực đơn</h3>
          <p className="text-xs text-slate-500">Thêm mới, chỉnh sửa giá, ảnh và quản lý trạng thái món ăn</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 shrink-0 cursor-pointer min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm món</span>
          </button>
        )}
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold border flex items-center justify-between ${
            msg.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Search and Category Filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm món ăn theo tên..."
            className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            <button
              type="button"
              onClick={() => setSelectedCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap ${
                selectedCategoryFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Tất cả ({items.length})
            </button>
            {categories.map((c) => {
              const count = items.filter(i => i.category_id === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(c.id)}
                  className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap ${
                    selectedCategoryFilter === c.id
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {c.name} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <Utensils className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">Không tìm thấy món ăn nào</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition">
              {/* Thumbnail + Details */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/70 overflow-hidden shrink-0 flex items-center justify-center relative">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&auto=format&fit=crop&q=80';
                      }}
                    />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-300" />
                  )}
                  {!item.is_available && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-[9px] font-black text-white px-1">HẾT</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-slate-900 text-sm truncate">{item.name}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-orange-600 font-extrabold">
                      {Number(item.price).toLocaleString('vi-VN')}đ
                    </span>
                    <span className="text-[11px] text-slate-400 truncate">
                      • {item.category_name || categories.find(c => c.id === item.category_id)?.name || 'Món'}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {item.description}
                    </p>
                  )}
                  {item.variant_groups && item.variant_groups.length > 0 ? (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      {item.variant_groups.map((g, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-medium bg-orange-50/80 text-orange-800 px-2 py-0.5 rounded-md border border-orange-200/60"
                        >
                          <strong className="text-orange-950 font-bold">{g.name}:</strong> {g.options.map(o => o.name).join(', ')}
                        </span>
                      ))}
                    </div>
                  ) : (item.variants && item.variants.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {item.variants.map((v, idx) => (
                        <span
                          key={v.id || idx}
                          className="text-[10px] font-medium bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md border border-orange-200/70"
                        >
                          {v.name} {Number(v.price_adjustment) > 0 ? `(+${Number(v.price_adjustment).toLocaleString('vi-VN')}đ)` : ''}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Toggle Availability */}
                <button
                  type="button"
                  onClick={() => handleToggle(item.id!, item.is_available)}
                  className={`px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 min-h-[38px] transition cursor-pointer ${
                    item.is_available
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                  }`}
                  title={item.is_available ? 'Bấm để báo hết món' : 'Bấm để báo còn món'}
                >
                  {item.is_available ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Còn món</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Hết món</span>
                    </>
                  )}
                </button>

                {/* Edit Button */}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(item)}
                    className="w-9 h-9 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center transition cursor-pointer"
                    title="Chỉnh sửa món"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}

                {/* Delete Button */}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setDeletingItem(item)}
                    className="w-9 h-9 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-200/80 flex items-center justify-center transition cursor-pointer"
                    title="Xóa món"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE / EDIT MENU ITEM MODAL */}
      {showItemModal && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden animate-slide-up">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
              <h3 className="font-extrabold text-slate-900 text-base">
                {editingItem.id ? 'Chỉnh Sửa Món Ăn' : 'Thêm Món Ăn Mới'}
              </h3>
              <button
                type="button"
                onClick={() => { setShowItemModal(false); setEditingItem(null); }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition text-sm cursor-pointer"
                title="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveItem} className="p-4 sm:p-5 pt-3 overflow-y-auto flex-1 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Tên Món Ăn *</label>
                <input
                  type="text"
                  required
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="Ví dụ: Phở Bò Tái Nạm, Trà Đào Cam Sả..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Danh Mục *</label>
                  <select
                    value={editingItem.category_id}
                    onChange={(e) => setEditingItem({ ...editingItem, category_id: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500 text-xs"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Giá Bán (VNĐ) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={editingItem.price}
                    onChange={(e) => setEditingItem({ ...editingItem, price: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-orange-500 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Mô Tả Món Ăn</label>
                <textarea
                  rows={2}
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Nguyên liệu, hương vị đặc trưng, ghi chú định lượng..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500 text-xs"
                />
              </div>

              {/* Image Upload with Preview & Direct Upload */}
              <ImageUploadField
                label="Hình Ảnh Món Ăn"
                value={editingItem.image_url || ''}
                onChange={(url) => setEditingItem({ ...editingItem, image_url: url })}
                aspectRatio="square"
                helperText="Chụp hoặc tải ảnh món ăn từ máy (tự nén nhẹ ~150KB) hoặc nhập liên kết ảnh"
              />

              {/* Product Variant Groups (Max 3 Groups) */}
              <div className="space-y-3.5 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                      <span>Dạng biến thể món ăn</span>
                      <span className="text-orange-700 bg-orange-100 font-extrabold px-1.5 py-0.5 rounded text-[10px]">
                        {(editingItem.variant_groups || []).length}/3 dạng
                      </span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Tối đa 3 dạng biến thể (vd: Kích cỡ, Lượng đường, Lượng đá...). Mỗi dạng có nhiều tùy chọn.
                    </p>
                  </div>
                  {(editingItem.variant_groups || []).length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddGroup}
                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm biến thể</span>
                    </button>
                  )}
                </div>

                {(editingItem.variant_groups || []).length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-4 text-center">
                    <p className="text-xs text-slate-600 font-medium">Chưa có dạng biến thể nào</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Món sẽ phục vụ theo định lượng & công thức gốc duy nhất</p>
                    <button
                      type="button"
                      onClick={handleAddGroup}
                      className="mt-2 text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm dạng biến thể (vd: Kích cỡ, Đường, Đá)</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {editingItem.variant_groups!.map((group, gIdx) => (
                      <div key={gIdx} className="bg-slate-50 rounded-2xl border border-slate-200/90 p-3.5 space-y-3 shadow-xs">
                        {/* Group Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                          <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                            <GripVertical className="w-4 h-4 text-slate-400" />
                            <span>Biến thể</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveGroup(gIdx)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Xóa dạng biến thể này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Tên biến thể */}
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <label className="text-slate-800 font-bold text-xs">
                              <span className="text-rose-500 mr-0.5">*</span>Tên biến thể
                            </label>
                            <span title="Tên thuộc tính như Kích cỡ, Lượng đường, Topping..." className="text-slate-400 cursor-help">
                              <HelpCircle className="w-3 h-3" />
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <input
                                type="text"
                                value={group.name}
                                onChange={(e) => handleUpdateGroupName(gIdx, e.target.value)}
                                placeholder="Chọn hoặc nhập biến thể"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-semibold focus:outline-none focus:border-orange-500"
                              />
                            </div>
                            <select
                              value={SUGGESTED_GROUP_NAMES.includes(group.name) ? group.name : ''}
                              onChange={(e) => {
                                if (e.target.value) handleUpdateGroupName(gIdx, e.target.value);
                              }}
                              className="w-32 bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-600 font-medium focus:outline-none focus:border-orange-500"
                            >
                              <option value="">Gợi ý mẫu...</option>
                              {SUGGESTED_GROUP_NAMES.map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Tùy chọn */}
                        <div>
                          <label className="block text-slate-800 font-bold text-xs mb-1.5">
                            <span className="text-rose-500 mr-0.5">*</span>Tùy chọn
                          </label>

                          <div className="space-y-2">
                            {group.options.map((option, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
                                <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                                <div className="flex-1 relative">
                                  <input
                                    type="text"
                                    value={option.name}
                                    maxLength={50}
                                    onChange={(e) => handleUpdateOption(gIdx, oIdx, 'name', e.target.value)}
                                    placeholder="Nhập một tùy chọn (vd: Size M, 50% đường)"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-2.5 pr-12 py-1.5 text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                                    {option.name.length}/50
                                  </span>
                                </div>

                                <div className="w-28 shrink-0">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min={0}
                                      step={1000}
                                      placeholder="+0đ"
                                      value={option.price_adjustment}
                                      onChange={(e) => handleUpdateOption(gIdx, oIdx, 'price_adjustment', Math.max(0, parseInt(e.target.value) || 0))}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-6 py-1.5 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-orange-500"
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                                      đ
                                    </span>
                                  </div>
                                </div>

                                {group.options.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOption(gIdx, oIdx)}
                                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 cursor-pointer"
                                    title="Xóa tùy chọn này"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => handleAddOption(gIdx)}
                              className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1 py-1 px-1 cursor-pointer transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm lựa chọn</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Danh sách biến thể (Summary table) */}
                {(editingItem.variant_groups || []).some(g => g.options.some(o => o.name.trim().length > 0)) && (
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                    <h5 className="font-bold text-slate-800 text-xs">Danh sách biến thể</h5>
                    <div className="space-y-2">
                      {editingItem.variant_groups!.filter(g => g.name.trim().length > 0).map((g, gIdx) => (
                        <div key={gIdx} className="bg-white p-2.5 rounded-xl border border-slate-200/80 text-xs">
                          <span className="font-bold text-slate-900 mr-2">{g.name}:</span>
                          <span className="text-slate-600">
                            {g.options.filter(o => o.name.trim().length > 0).map(o => (
                              `${o.name} (${Number(o.price_adjustment) > 0 ? `+${Number(o.price_adjustment).toLocaleString('vi-VN')}đ` : '+0đ'})`
                            )).join('  •  ') || 'Chưa có tùy chọn'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Availability Toggle */}
              <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                <div>
                  <span className="font-bold text-slate-800 block text-xs">Trạng thái phục vụ</span>
                  <span className="text-[11px] text-slate-500">
                    {editingItem.is_available ? 'Đang bật: Khách có thể đặt món này' : 'Đang tắt: Khách sẽ thấy báo Hết món'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editingItem.is_available}
                  onChange={(e) => setEditingItem({ ...editingItem, is_available: e.target.checked })}
                  className="w-4 h-4 accent-orange-600 rounded-sm cursor-pointer"
                />
              </label>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowItemModal(false); setEditingItem(null); }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>{editingItem.id ? 'Lưu Thay Đổi' : 'Tạo Món Ăn'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-slide-up">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Xác Nhận Xóa Món</span>
              </h3>
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa món <strong className="text-slate-900">"{deletingItem.name}"</strong>?
              Thao tác này sẽ gỡ món khỏi thực đơn hiện tại của quán.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteItem}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <span>Xóa Món</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
