import React, { useEffect, useState } from 'react';
import { request } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { ToggleLeft, ToggleRight, Search, Check, AlertCircle } from 'lucide-react';

export const StaffMenuManage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const res = await request<{ items: any[] }>('/staff/menu/items');
      setItems(res.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleToggle = async (itemId: string, currentStatus: boolean) => {
    if (!hasPermission('menu.manage')) {
      alert('Bạn không có quyền quản lý menu');
      return;
    }
    try {
      await request(`/staff/menu/items/${itemId}/toggle-available`, {
        method: 'PUT',
        body: JSON.stringify({ isAvailable: !currentStatus })
      });
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, is_available: !currentStatus } : i));
      setMsg(`Đã chuyển trạng thái món sang ${!currentStatus ? 'Còn món' : 'Hết món'}`);
      setTimeout(() => setMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Lỗi cập nhật');
    }
  };

  const filtered = items
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.is_available === b.is_available) return a.name.localeCompare(b.name);
      return a.is_available ? -1 : 1;
    });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-extrabold text-slate-900 text-lg">Quản lý thực đơn</h3>
        <p className="text-xs text-slate-500">Bật/tắt trạng thái Còn món hoặc Hết món</p>
      </div>

      {msg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
          {msg}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm món ăn..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Items List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-xs">
        {filtered.map(item => (
          <div key={item.id} className="p-3.5 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-slate-900 text-sm truncate">{item.name}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-orange-600 font-bold">{Number(item.price).toLocaleString('vi-VN')}đ</span>
                <span className="text-[11px] text-slate-400">• {item.category_name}</span>
              </div>
            </div>

            <button
              onClick={() => handleToggle(item.id, item.is_available)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 min-h-[44px] transition ${
                item.is_available
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              {item.is_available ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Còn món</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>Hết món</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
