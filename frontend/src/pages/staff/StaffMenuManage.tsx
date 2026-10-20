import React, { useEffect, useState } from 'react';
import { request } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { ImageUploadField } from '../../components/ImageUploadField.js';
import {
  Search, Check, AlertCircle, Plus, Edit3, Trash2, X,
  Utensils, Image as ImageIcon, Loader2, HelpCircle,
  ArrowUp, ArrowDown, Sliders, CheckCircle2,
  FolderTree, FolderPlus, Info
} from 'lucide-react';

export interface FormOption {
  id?: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  is_available: boolean;
}

export interface FormOptionGroup {
  id?: string;
  name: string;
  selection_mode: 'SINGLE' | 'MULTIPLE';
  min_selections: number;
  max_selections: number;
  pricing_mode: 'FREE' | 'ADDITIVE';
  options: FormOption[];
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
  sort_order?: number;
  option_groups?: FormOptionGroup[];
  variant_groups?: any[];
  variants?: any[];
}

interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active?: boolean;
  item_count?: number;
}

const SUGGESTED_GROUP_NAMES = [
  'Kích cỡ',
  'Lượng đường',
  'Lượng đá',
  'Mức cay',
  'Topping',
  'Hương vị',
  'Đóng gói',
  'Loại sốt'
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

  // Reorder mode state
  const [isReordering, setIsReordering] = useState(false);

  // Modal State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    id?: string;
    name: string;
    category_id: string;
    price: number;
    description?: string;
    image_url?: string;
    is_available: boolean;
    sort_order?: number;
    option_groups: FormOptionGroup[];
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete State
  const [deletingItem, setDeletingItem] = useState<MenuItemData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Category Management State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [catActionLoading, setCatActionLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<MenuCategory | null>(null);

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

  // Synchronize category selection in open form with current categories (R2 / Issue #100)
  useEffect(() => {
    setEditingItem(prev => {
      if (!prev) return null;
      if (categories.length === 0) {
        return prev.category_id ? { ...prev, category_id: '' } : prev;
      }
      const categoryStillValid = categories.some(c => c.id === prev.category_id);
      if (!categoryStillValid) {
        // Fallback to the first available category if category_id was empty or deleted
        return { ...prev, category_id: categories[0].id };
      }
      return prev;
    });
  }, [categories]);

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
      showNotification(err.message || 'Lỗi cập nhật trạng thái', 'error');
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
      option_groups: []
    });
    setShowItemModal(true);
  };

  const handleOpenEdit = (item: MenuItemData) => {
    if (!canManage) {
      alert('Bạn không có quyền quản lý thực đơn');
      return;
    }
    let groups: FormOptionGroup[] = [];

    if (item.option_groups && item.option_groups.length > 0) {
      groups = item.option_groups.map(g => ({
        id: g.id,
        name: g.name,
        selection_mode: g.selection_mode || (g as any).selectionMode || 'SINGLE',
        min_selections: g.min_selections !== undefined ? g.min_selections : ((g as any).minSelections !== undefined ? (g as any).minSelections : 0),
        max_selections: g.max_selections !== undefined ? g.max_selections : ((g as any).maxSelections !== undefined ? (g as any).maxSelections : 1),
        pricing_mode: g.pricing_mode || (g as any).pricingMode || 'ADDITIVE',
        options: (g.options || []).map(o => ({
          id: o.id,
          name: o.name,
          price_delta: o.price_delta !== undefined ? o.price_delta : ((o as any).priceDelta !== undefined ? (o as any).priceDelta : 0),
          is_default: Boolean(o.is_default ?? (o as any).isDefault ?? false),
          is_available: o.is_available !== undefined ? o.is_available : ((o as any).isAvailable !== undefined ? (o as any).isAvailable : true)
        }))
      }));
    } else if (item.variant_groups && item.variant_groups.length > 0) {
      groups = item.variant_groups.map(g => ({
        name: g.name,
        selection_mode: 'SINGLE',
        min_selections: 0,
        max_selections: 1,
        pricing_mode: 'ADDITIVE',
        options: (g.options || []).map((o: any) => ({
          id: o.id,
          name: o.name,
          price_delta: o.price_adjustment || 0,
          is_default: false,
          is_available: o.is_available !== false
        }))
      }));
    } else if (item.variants && item.variants.length > 0) {
      const map = new Map<string, any[]>();
      for (const v of item.variants) {
        const gName = (v as any).group_name || 'Biến thể';
        if (!map.has(gName)) map.set(gName, []);
        map.get(gName)!.push(v);
      }
      groups = Array.from(map.entries()).map(([name, opts]) => ({
        name,
        selection_mode: 'SINGLE',
        min_selections: 0,
        max_selections: 1,
        pricing_mode: 'ADDITIVE',
        options: opts.map((o: any) => ({
          id: o.id,
          name: o.name,
          price_delta: o.price_adjustment || 0,
          is_default: false,
          is_available: o.is_available !== false
        }))
      }));
    }

    setEditingItem({
      id: item.id,
      name: item.name,
      category_id: item.category_id,
      price: item.price,
      description: item.description || '',
      image_url: item.image_url || '',
      is_available: item.is_available,
      sort_order: item.sort_order,
      option_groups: groups
    });
    setShowItemModal(true);
  };

  const handleAddGroup = () => {
    if (!editingItem) return;
    const current = editingItem.option_groups || [];
    if (current.length >= 10) {
      alert('Một sản phẩm chỉ có tối đa 10 nhóm lựa chọn');
      return;
    }
    const usedNames = current.map(g => g.name);
    const nextName = SUGGESTED_GROUP_NAMES.find(n => !usedNames.includes(n)) || `Tùy chọn ${current.length + 1}`;
    setEditingItem({
      ...editingItem,
      option_groups: [
        ...current,
        {
          name: nextName,
          selection_mode: 'SINGLE',
          min_selections: 0,
          max_selections: 1,
          pricing_mode: 'ADDITIVE',
          options: [{ name: '', price_delta: 0, is_default: false, is_available: true }]
        }
      ]
    });
  };

  const handleRemoveGroup = (gIdx: number) => {
    if (!editingItem) return;
    const current = (editingItem.option_groups || []).filter((_, i) => i !== gIdx);
    setEditingItem({ ...editingItem, option_groups: current });
  };

  const handleUpdateGroup = (gIdx: number, updates: Partial<FormOptionGroup>) => {
    if (!editingItem) return;
    const current = [...editingItem.option_groups];
    const group = current[gIdx];
    if (!group) return;

    let updated = { ...group, ...updates };

    // If changing to SINGLE, max_selections must be 1
    if (updates.selection_mode === 'SINGLE') {
      updated.max_selections = 1;
    }

    // If changing to FREE, force all options price_delta to 0
    if (updates.pricing_mode === 'FREE') {
      updated.options = updated.options.map(o => ({ ...o, price_delta: 0 }));
    }

    current[gIdx] = updated;
    setEditingItem({ ...editingItem, option_groups: current });
  };

  const handleAddOption = (gIdx: number) => {
    if (!editingItem) return;
    const current = [...editingItem.option_groups];
    const group = current[gIdx];
    if (!group) return;
    if (group.options.length >= 30) {
      alert('Mỗi nhóm tối đa 30 lựa chọn');
      return;
    }
    current[gIdx] = {
      ...group,
      options: [
        ...group.options,
        { name: '', price_delta: 0, is_default: false, is_available: true }
      ]
    };
    setEditingItem({ ...editingItem, option_groups: current });
  };

  const handleUpdateOption = (gIdx: number, oIdx: number, updates: Partial<FormOption>) => {
    if (!editingItem) return;
    const current = [...editingItem.option_groups];
    const group = current[gIdx];
    if (!group) return;

    const options = [...group.options];

    // If setting is_default to true on a SINGLE mode group, unset for all others in group
    if (updates.is_default === true && group.selection_mode === 'SINGLE') {
      for (let i = 0; i < options.length; i++) {
        options[i] = { ...options[i], is_default: i === oIdx };
      }
    } else {
      options[oIdx] = { ...options[oIdx], ...updates };
    }

    current[gIdx] = { ...group, options };
    setEditingItem({ ...editingItem, option_groups: current });
  };

  const handleRemoveOption = (gIdx: number, oIdx: number) => {
    if (!editingItem) return;
    const current = [...editingItem.option_groups];
    const group = current[gIdx];
    if (!group) return;
    current[gIdx] = {
      ...group,
      options: group.options.filter((_, i) => i !== oIdx)
    };
    setEditingItem({ ...editingItem, option_groups: current });
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

    // Clean groups
    const filteredGroups = (editingItem.option_groups || [])
      .map(g => ({
        id: g.id,
        name: g.name.trim(),
        selection_mode: g.selection_mode,
        min_selections: g.min_selections || 0,
        max_selections: g.selection_mode === 'SINGLE' ? 1 : Math.max(1, g.max_selections || 1),
        pricing_mode: g.pricing_mode,
        options: (g.options || [])
          .filter(o => o.name.trim().length > 0)
          .map(o => ({
            id: o.id,
            name: o.name.trim(),
            price_delta: g.pricing_mode === 'FREE' ? 0 : Math.max(0, parseInt(String(o.price_delta), 10) || 0),
            is_default: Boolean(o.is_default),
            is_available: o.is_available !== false
          }))
      }))
      .filter(g => g.name.length > 0 && g.options.length > 0);

    if (filteredGroups.length > 10) {
      alert('Một sản phẩm chỉ có tối đa 10 nhóm lựa chọn');
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
            option_groups: filteredGroups
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
            option_groups: filteredGroups
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

  // Category management handlers
  const handleCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canManage) {
      alert('Bạn không có quyền quản lý thực đơn');
      return;
    }
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCatError('Vui lòng nhập tên danh mục');
      return;
    }
    setCatActionLoading(true);
    setCatError(null);
    try {
      const res = await request<{ category: MenuCategory }>('/staff/menu/categories', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed })
      });
      setNewCategoryName('');
      showNotification(`Đã tạo danh mục "${res.category?.name || trimmed}" thành công`);

      // If item creation/edit modal is open and has no selected category, bind the newly created category
      if (res.category?.id) {
        setEditingItem(prev => {
          if (!prev) return null;
          if (!prev.category_id) {
            return { ...prev, category_id: res.category.id };
          }
          return prev;
        });
      }

      await fetchMenuData();
    } catch (err: any) {
      const msg = err.code === 'CATEGORY_NAME_EXISTS'
        ? 'Tên danh mục đã tồn tại trong quán'
        : (err.message || 'Lỗi tạo danh mục');
      setCatError(msg);
      showNotification(msg, 'error');
    } finally {
      setCatActionLoading(false);
    }
  };

  const handleUpdateCategory = async (id: string, name: string) => {
    if (!canManage) {
      alert('Bạn không có quyền quản lý thực đơn');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setCatError('Tên danh mục không được để trống');
      return;
    }
    setCatActionLoading(true);
    setCatError(null);
    try {
      const res = await request<{ category: MenuCategory }>(`/staff/menu/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed })
      });
      setEditingCatId(null);
      setEditingCatName('');
      showNotification(`Đã đổi tên danh mục thành "${res.category?.name || trimmed}"`);
      await fetchMenuData();
    } catch (err: any) {
      const msg = err.code === 'CATEGORY_NAME_EXISTS'
        ? 'Tên danh mục đã tồn tại trong quán'
        : (err.message || 'Lỗi đổi tên danh mục');
      setCatError(msg);
      showNotification(msg, 'error');
    } finally {
      setCatActionLoading(false);
    }
  };

  const handleDeleteCategory = async (cat: MenuCategory) => {
    if (!canManage) {
      alert('Bạn không có quyền quản lý thực đơn');
      return;
    }
    const count = cat.item_count ?? items.filter(i => i.category_id === cat.id).length;
    if (count > 0) {
      setCatError(`Không thể xóa danh mục "${cat.name}" vì đang có ${count} món ăn. Vui lòng chuyển hoặc xóa hết các món trong danh mục trước.`);
      return;
    }
    setCatActionLoading(true);
    setCatError(null);
    try {
      await request(`/staff/menu/categories/${cat.id}`, {
        method: 'DELETE'
      });
      showNotification(`Đã xóa danh mục "${cat.name}" thành công`);
      if (selectedCategoryFilter === cat.id) {
        setSelectedCategoryFilter('all');
      }
      setDeletingCategory(null);
      await fetchMenuData();
    } catch (err: any) {
      const msg = err.code === 'CATEGORY_NOT_EMPTY'
        ? 'Không thể xóa danh mục vì đang chứa món ăn.'
        : (err.message || 'Lỗi xóa danh mục');
      setCatError(msg);
      showNotification(msg, 'error');
    } finally {
      setCatActionLoading(false);
    }
  };

  // Reorder items within category
  const handleMoveItem = async (catId: string, itemIndex: number, direction: 'up' | 'down') => {
    const catItems = items.filter(i => i.category_id === catId);
    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
    if (targetIndex < 0 || targetIndex >= catItems.length) return;

    const reordered = [...catItems];
    const [moved] = reordered.splice(itemIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const updatedItemIds = reordered.map(i => i.id!);

    // Optimistic UI update
    setItems(prev => {
      const others = prev.filter(i => i.category_id !== catId);
      return [...others, ...reordered];
    });

    try {
      await request('/staff/menu/reorder', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: catId,
          itemIds: updatedItemIds
        })
      });
      showNotification('Đã lưu thứ tự món mới');
    } catch (err: any) {
      showNotification(err.message || 'Lỗi sắp xếp món', 'error');
      fetchMenuData(); // rollback
    }
  };

  const filtered = items
    .filter(i => {
      const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategoryFilter === 'all' || i.category_id === selectedCategoryFilter;
      return matchSearch && matchCat;
    });

  const activeCategory = categories.find(c => c.id === selectedCategoryFilter);

  return (
    <div className="space-y-4">
      {/* Header with Title and Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-slate-900 text-lg">Quản lý thực đơn</h3>
          <p className="text-xs text-slate-500">Thêm mới, sửa giá, ảnh, nhóm lựa chọn và sắp xếp thứ tự món</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCategoryFilter !== 'all' && canManage && (
            <button
              type="button"
              onClick={() => setIsReordering(!isReordering)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 min-h-[44px] cursor-pointer ${
                isReordering
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Bật/tắt chế độ đổi thứ tự món"
            >
              <Sliders className="w-4 h-4" />
              <span>{isReordering ? 'Xong sắp xếp' : 'Sắp xếp món'}</span>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => { setCatError(null); setShowCategoryModal(true); }}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer min-h-[44px]"
              title="Quản lý danh mục món ăn"
            >
              <FolderTree className="w-4 h-4 text-orange-600" />
              <span>Danh mục món</span>
            </button>
          )}

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
        {categories.length > 0 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            <button
              type="button"
              onClick={() => { setSelectedCategoryFilter('all'); setIsReordering(false); }}
              className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer ${
                selectedCategoryFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Tất cả ({items.length})
            </button>
            {categories.map((c) => {
              const count = c.item_count ?? items.filter(i => i.category_id === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(c.id)}
                  className={`px-3 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer ${
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
        ) : (
          <div className="p-3.5 bg-orange-50/70 border border-orange-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-orange-950">
              <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
              <span>Quán chưa có danh mục món nào. Hãy tạo danh mục trước khi thêm món ăn.</span>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => { setCatError(null); setShowCategoryModal(true); }}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer min-h-[36px]"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Tạo danh mục ngay</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Reordering helper banner */}
      {isReordering && activeCategory && (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-900 flex items-center justify-between">
          <span>Dùng nút ▲ / ▼ để sắp xếp thứ tự hiển thị món trong danh mục <strong>"{activeCategory.name}"</strong>.</span>
          <button
            onClick={() => setIsReordering(false)}
            className="text-xs font-bold text-orange-700 hover:text-orange-900 underline ml-2"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Items List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <Utensils className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">Không tìm thấy món ăn nào</p>
          </div>
        ) : (
          filtered.map((item, idx) => {
            const catItems = items.filter(i => i.category_id === item.category_id);
            const itemIndexInCat = catItems.findIndex(i => i.id === item.id);

            return (
              <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition">
                {/* Reorder Buttons (Visible when filtering a specific category or in reorder mode) */}
                {selectedCategoryFilter !== 'all' && canManage && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={itemIndexInCat <= 0}
                      onClick={() => handleMoveItem(item.category_id, itemIndexInCat, 'up')}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-orange-100 text-slate-600 hover:text-orange-700 disabled:opacity-20 disabled:hover:bg-slate-100 disabled:hover:text-slate-600 flex items-center justify-center transition cursor-pointer"
                      title="Di chuyển lên trên"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={itemIndexInCat >= catItems.length - 1}
                      onClick={() => handleMoveItem(item.category_id, itemIndexInCat, 'down')}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-orange-100 text-slate-600 hover:text-orange-700 disabled:opacity-20 disabled:hover:bg-slate-100 disabled:hover:text-slate-600 flex items-center justify-center transition cursor-pointer"
                      title="Di chuyển xuống dưới"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

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

                    {/* Option Groups Tags */}
                    {item.option_groups && item.option_groups.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        {item.option_groups.map((g, gIdx) => (
                          <span
                            key={gIdx}
                            className="text-[10px] font-medium bg-orange-50/80 text-orange-900 px-2 py-0.5 rounded-md border border-orange-200/60"
                          >
                            <strong className="font-bold text-orange-950">{g.name}</strong>
                            <span className="text-slate-500 text-[9px] ml-1">
                              ({g.selection_mode === 'MULTIPLE' ? 'Chọn nhiều' : 'Chọn 1'} • {g.pricing_mode === 'FREE' ? 'Free' : '+Phụ thu'})
                            </span>
                            : {g.options.map(o => o.name).join(', ')}
                          </span>
                        ))}
                      </div>
                    ) : (item.variant_groups && item.variant_groups.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        {item.variant_groups.map((g, gIdx) => (
                          <span
                            key={gIdx}
                            className="text-[10px] font-medium bg-orange-50/80 text-orange-800 px-2 py-0.5 rounded-md border border-orange-200/60"
                          >
                            <strong className="text-orange-950 font-bold">{g.name}:</strong> {g.options.map((o: any) => o.name).join(', ')}
                          </span>
                        ))}
                      </div>
                    ) : null)}
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
            );
          })
        )}
      </div>

      {/* CREATE / EDIT MENU ITEM MODAL */}
      {showItemModal && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden animate-slide-up">
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
            <form onSubmit={handleSaveItem} className="p-4 sm:p-5 pt-3 overflow-y-auto flex-1 space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Tên Món Ăn *</label>
                <input
                  type="text"
                  required
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="Ví dụ: Phở Bò Tái Nạm, Trà Sữa Hoàng Gia..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-700 font-bold">Danh Mục *</label>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => { setCatError(null); setShowCategoryModal(true); }}
                        className="text-[11px] font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <FolderPlus className="w-3 h-3" />
                        <span>Quản lý danh mục</span>
                      </button>
                    )}
                  </div>
                  {categories.length === 0 ? (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between">
                      <span>Quán chưa có danh mục nào.</span>
                      <button
                        type="button"
                        onClick={() => { setCatError(null); setShowCategoryModal(true); }}
                        className="font-bold underline text-amber-950 ml-2 cursor-pointer"
                      >
                        Tạo ngay
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editingItem.category_id}
                      onChange={(e) => setEditingItem({ ...editingItem, category_id: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500 text-xs"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Giá Gốc (VNĐ) *</label>
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
                  placeholder="Nguyên liệu, hương vị đặc trưng, định lượng..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500 text-xs"
                />
              </div>

              {/* Image Upload with Preview & Direct Upload */}
              <ImageUploadField
                label="Hình Ảnh Món Ăn"
                value={editingItem.image_url || ''}
                onChange={(url) => setEditingItem({ ...editingItem, image_url: url })}
                aspectRatio="square"
                helperText="Chụp hoặc tải ảnh món ăn từ máy (tự nén ~150KB) hoặc nhập liên kết ảnh"
              />

              {/* Product Option Groups (Up to 10 groups, OPT-01) */}
              <div className="space-y-3.5 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                      <span>Nhóm lựa chọn / Biến thể</span>
                      <span className="text-orange-700 bg-orange-100 font-extrabold px-1.5 py-0.5 rounded text-[10px]">
                        {(editingItem.option_groups || []).length}/10 nhóm
                      </span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Hỗ trợ chọn 1 / chọn nhiều, bắt buộc / tùy chọn, miễn phí / có phụ thu.
                    </p>
                  </div>

                  {(editingItem.option_groups || []).length < 10 && (
                    <button
                      type="button"
                      onClick={handleAddGroup}
                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1 shadow-xs cursor-pointer min-h-[36px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm nhóm lựa chọn</span>
                    </button>
                  )}
                </div>

                {(editingItem.option_groups || []).length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-4 text-center">
                    <p className="text-xs text-slate-600 font-medium">Chưa có nhóm lựa chọn nào</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Món sẽ phục vụ theo định lượng & công thức gốc duy nhất</p>
                    <button
                      type="button"
                      onClick={handleAddGroup}
                      className="mt-2 text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm nhóm (vd: Kích cỡ, Đường, Đá, Topping)</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {editingItem.option_groups!.map((group, gIdx) => (
                      <div key={gIdx} className="bg-slate-50 rounded-2xl border border-slate-200/90 p-3.5 space-y-3 shadow-xs">
                        {/* Group Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                          <span className="text-slate-800 font-extrabold text-xs">
                            Nhóm #{gIdx + 1}: {group.name || 'Chưa đặt tên'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveGroup(gIdx)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Xóa nhóm này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Group Name & Sample Suggestion */}
                        <div>
                          <label className="block text-slate-700 font-bold text-xs mb-1">
                            Tên nhóm *
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={group.name}
                              onChange={(e) => handleUpdateGroup(gIdx, { name: e.target.value })}
                              placeholder="Ví dụ: Kích cỡ, Độ ngọt, Lượng đá, Topping..."
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-semibold focus:outline-none focus:border-orange-500"
                            />
                            <select
                              value={SUGGESTED_GROUP_NAMES.includes(group.name) ? group.name : ''}
                              onChange={(e) => {
                                if (e.target.value) handleUpdateGroup(gIdx, { name: e.target.value });
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

                        {/* Rules: Selection Mode, Pricing Mode, Min/Max */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-2.5 bg-white rounded-xl border border-slate-200/80">
                          {/* Selection Mode */}
                          <div>
                            <label className="block text-slate-600 font-bold text-[11px] mb-1">Quy tắc chọn</label>
                            <select
                              value={group.selection_mode}
                              onChange={(e) => handleUpdateGroup(gIdx, { selection_mode: e.target.value as any })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-semibold focus:outline-none"
                            >
                              <option value="SINGLE">Chọn 1 duy nhất (Radio)</option>
                              <option value="MULTIPLE">Chọn nhiều (Checkbox)</option>
                            </select>
                          </div>

                          {/* Pricing Mode */}
                          <div>
                            <label className="block text-slate-600 font-bold text-[11px] mb-1">Cách tính giá</label>
                            <select
                              value={group.pricing_mode}
                              onChange={(e) => handleUpdateGroup(gIdx, { pricing_mode: e.target.value as any })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-semibold focus:outline-none"
                            >
                              <option value="ADDITIVE">Có phụ thu tiền (+đ)</option>
                              <option value="FREE">Miễn phí (0đ)</option>
                            </select>
                          </div>

                          {/* Mandatory / Optional */}
                          <div>
                            <label className="block text-slate-600 font-bold text-[11px] mb-1">
                              {group.selection_mode === 'SINGLE' ? 'Bắt buộc chọn?' : 'Tối đa lựa chọn'}
                            </label>
                            {group.selection_mode === 'SINGLE' ? (
                              <select
                                value={group.min_selections > 0 ? 'REQUIRED' : 'OPTIONAL'}
                                onChange={(e) => handleUpdateGroup(gIdx, { min_selections: e.target.value === 'REQUIRED' ? 1 : 0 })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-semibold focus:outline-none"
                              >
                                <option value="OPTIONAL">Không bắt buộc</option>
                                <option value="REQUIRED">Bắt buộc phải chọn 1</option>
                              </select>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={30}
                                  value={group.max_selections}
                                  onChange={(e) => handleUpdateGroup(gIdx, { max_selections: Math.max(1, parseInt(e.target.value) || 1) })}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-semibold focus:outline-none"
                                />
                                <span className="text-[11px] text-slate-400 shrink-0">món</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Options list */}
                        <div>
                          <label className="block text-slate-700 font-bold text-xs mb-1.5">
                            Danh sách lựa chọn
                          </label>

                          <div className="space-y-2">
                            {group.options.map((option, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
                                {/* Default toggle */}
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOption(gIdx, oIdx, { is_default: !option.is_default })}
                                  className={`p-1.5 rounded-lg border text-[11px] font-bold shrink-0 transition cursor-pointer ${
                                    option.is_default
                                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                                  }`}
                                  title={option.is_default ? 'Lựa chọn mặc định' : 'Bấm để đặt làm mặc định'}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>

                                {/* Option Name */}
                                <div className="flex-1">
                                  <input
                                    type="text"
                                    value={option.name}
                                    maxLength={100}
                                    onChange={(e) => handleUpdateOption(gIdx, oIdx, { name: e.target.value })}
                                    placeholder="Tên lựa chọn (vd: Size L, 50% đường, Trân châu)"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500"
                                  />
                                </div>

                                {/* Option Price Delta */}
                                <div className="w-28 shrink-0">
                                  {group.pricing_mode === 'FREE' ? (
                                    <span className="block text-center py-1.5 px-2 bg-emerald-50 text-emerald-700 font-bold text-[11px] rounded-lg border border-emerald-200">
                                      0đ (Free)
                                    </span>
                                  ) : (
                                    <div className="relative">
                                      <input
                                        type="number"
                                        min={0}
                                        step={1000}
                                        placeholder="+0đ"
                                        value={option.price_delta}
                                        onChange={(e) => handleUpdateOption(gIdx, oIdx, { price_delta: Math.max(0, parseInt(e.target.value) || 0) })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-6 py-1.5 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-orange-500"
                                      />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                                        đ
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {group.options.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOption(gIdx, oIdx)}
                                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 cursor-pointer"
                                    title="Xóa lựa chọn này"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => handleAddOption(gIdx)}
                              className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1 py-1 px-1 cursor-pointer transition min-h-[32px]"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm lựa chọn trong nhóm này</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
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
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer min-h-[44px]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
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
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
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
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs min-h-[44px]"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteItem}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px]"
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
      {/* CATEGORY MANAGEMENT MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden animate-slide-up">
            {/* Header */}
            <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center">
                  <FolderTree className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Quản lý danh mục món</h3>
                  <p className="text-[11px] text-slate-500">Phân loại món ăn theo nhóm trong thực đơn của quán</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowCategoryModal(false); setCatError(null); setEditingCatId(null); }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition text-sm cursor-pointer"
                title="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 pt-3 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Category policy notification banner */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start gap-2.5 text-slate-600">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  Để đảm bảo an toàn thực đơn, <strong>chỉ có thể xóa danh mục khi không có món ăn nào</strong>. Nếu danh mục đang có món, bạn cần xóa hoặc chuyển các món sang danh mục khác trước.
                </div>
              </div>

              {/* Error banner */}
              {catError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-semibold flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{catError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCatError(null)}
                    className="text-rose-400 hover:text-rose-600 font-bold ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Add New Category Form */}
              {canManage && (
                <form onSubmit={handleCreateCategory} className="space-y-2">
                  <label className="block text-slate-800 font-bold">Thêm danh mục mới</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ví dụ: Món khai vị, Đồ uống, Tráng miệng..."
                      maxLength={255}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-500 text-xs min-h-[40px]"
                    />
                    <button
                      type="submit"
                      disabled={catActionLoading || !newCategoryName.trim()}
                      className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer min-h-[40px]"
                    >
                      {catActionLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>Thêm</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Category List */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-800 font-bold">Danh sách danh mục ({categories.length})</label>
                </div>

                {categories.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 space-y-1.5 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <FolderTree className="w-7 h-7 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold">Chưa có danh mục nào</p>
                    <p className="text-[11px] text-slate-400">Hãy thêm danh mục đầu tiên để phân loại thực đơn</p>
                  </div>
                ) : (
                  <div className="border border-slate-200/80 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-white">
                    {categories.map((c) => {
                      const count = c.item_count ?? items.filter(i => i.category_id === c.id).length;
                      const isEditing = editingCatId === c.id;

                      return (
                        <div key={c.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition">
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                autoFocus
                                value={editingCatName}
                                onChange={(e) => setEditingCatName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateCategory(c.id, editingCatName);
                                  if (e.key === 'Escape') setEditingCatId(null);
                                }}
                                maxLength={255}
                                className="flex-1 bg-white border border-orange-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-bold focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={catActionLoading}
                                onClick={() => handleUpdateCategory(c.id, editingCatName)}
                                className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition cursor-pointer"
                                title="Lưu tên"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCatId(null)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer"
                                title="Hủy"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span className="font-bold text-slate-900 text-xs truncate">{c.name}</span>
                                {count > 0 ? (
                                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                                    {count} món
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full shrink-0">
                                    Trống (0 món)
                                  </span>
                                )}
                              </div>

                              {canManage && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCatId(c.id);
                                      setEditingCatName(c.name);
                                      setCatError(null);
                                    }}
                                    className="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
                                    title="Sửa tên danh mục"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (count > 0) {
                                        setCatError(`Không thể xóa danh mục "${c.name}" vì đang có ${count} món ăn. Vui lòng chuyển hoặc xóa hết các món trước.`);
                                      } else {
                                        setCatError(null);
                                        setDeletingCategory(c);
                                      }
                                    }}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
                                      count > 0
                                        ? 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'
                                        : 'text-rose-500 hover:text-rose-700 hover:bg-rose-50'
                                    }`}
                                    title={count > 0 ? `Không thể xóa (đang có ${count} món)` : 'Xóa danh mục rỗng'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-white">
              <button
                type="button"
                onClick={() => { setShowCategoryModal(false); setCatError(null); setEditingCatId(null); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer min-h-[40px]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CATEGORY CONFIRMATION MODAL */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-slide-up">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Xác Nhận Xóa Danh Mục</span>
              </h3>
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa danh mục rỗng <strong className="text-slate-900">"{deletingCategory.name}"</strong>?
              Thao tác này sẽ gỡ bỏ danh mục khỏi danh sách của quán.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs min-h-[44px]"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={catActionLoading}
                onClick={() => handleDeleteCategory(deletingCategory)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px]"
              >
                {catActionLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <span>Xóa Danh Mục</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
