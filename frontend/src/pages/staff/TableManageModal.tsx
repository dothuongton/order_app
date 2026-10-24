import React, { useState } from 'react';
import { request } from '../../api/client.js';
import { StaffTable } from '../../types/index.js';
import { X, Plus, Edit2, Trash2, Check, AlertCircle, Search, Power, Layers } from 'lucide-react';

interface TableManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: StaffTable[];
  onRefresh: () => void;
}

export const TableManageModal: React.FC<TableManageModalProps> = ({
  isOpen,
  onClose,
  tables,
  onRefresh
}) => {
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newCapacity, setNewCapacity] = useState<number>(4);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editTableNumber, setEditTableNumber] = useState('');
  const [editCapacity, setEditCapacity] = useState<number>(4);
  const [editIsEnabled, setEditIsEnabled] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredTables = tables.filter(t =>
    t.table_number.toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' }));

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await request('/staff/tables', {
        method: 'POST',
        body: JSON.stringify({
          table_number: newTableNumber.trim(),
          capacity: Number(newCapacity) || 4
        })
      });
      setSuccessMessage(`Đã thêm "${newTableNumber.trim()}" thành công`);
      setNewTableNumber('');
      setNewCapacity(4);
      setShowAddForm(false);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tạo bàn mới');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (t: StaffTable) => {
    setEditingTableId(t.table_id);
    setEditTableNumber(t.table_number);
    setEditCapacity(t.capacity || 4);
    setEditIsEnabled(t.is_enabled !== false);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSaveEdit = async (tableId: string) => {
    if (!editTableNumber.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await request(`/staff/tables/${tableId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          table_number: editTableNumber.trim(),
          capacity: Number(editCapacity) || 4,
          is_enabled: editIsEnabled
        })
      });
      setSuccessMessage(`Đã cập nhật bàn "${editTableNumber.trim()}"`);
      setEditingTableId(null);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể cập nhật bàn');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleEnable = async (t: StaffTable) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await request(`/staff/tables/${t.table_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_enabled: !t.is_enabled
        })
      });
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể đổi trạng thái bàn');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTable = async (t: StaffTable) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bàn "${t.table_number}" không?`)) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await request(`/staff/tables/${t.table_id}`, {
        method: 'DELETE'
      });
      setSuccessMessage(`Đã xóa bàn "${t.table_number}" thành công`);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể xóa bàn');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Quản lý danh sách bàn</h3>
              <p className="text-xs text-slate-500">Thêm, sửa thông tin hoặc xóa bàn trong quán</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Feedback */}
        <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3 bg-white shrink-0">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-start gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm số bàn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/30 focus:border-[var(--brand-accent)]"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3.5 py-2 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] text-[var(--brand-on-accent)] text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddForm ? 'Đóng form' : 'Thêm bàn mới'}</span>
            </button>
          </div>

          {/* Add Table Form */}
          {showAddForm && (
            <form onSubmit={handleAddTable} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
              <div className="font-bold text-xs text-slate-700">Tạo bàn mới</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Số/Tên bàn *
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Bàn 10, VIP 2..."
                    value={newTableNumber}
                    onChange={(e) => setNewTableNumber(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/30 focus:border-[var(--brand-accent)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Sức chứa (người)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(parseInt(e.target.value, 10) || 4)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/30 focus:border-[var(--brand-accent)]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTableNumber.trim()}
                  className="px-4 py-1.5 bg-[var(--brand-accent)] text-white text-xs font-bold rounded-lg shadow-xs hover:bg-[var(--brand-accent-dark)] disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang tạo...' : 'Lưu bàn'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Tables List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {filteredTables.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              {search ? 'Không tìm thấy bàn nào khớp với từ khóa' : 'Chưa có bàn nào được cấu hình'}
            </div>
          ) : (
            filteredTables.map((t) => {
              const isEditing = editingTableId === t.table_id;
              return (
                <div
                  key={t.table_id}
                  className={`p-3.5 rounded-2xl border transition ${
                    isEditing
                      ? 'bg-amber-50/60 border-amber-300 ring-2 ring-amber-200/50'
                      : t.is_enabled === false
                      ? 'bg-slate-50 border-slate-200 opacity-70'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  {isEditing ? (
                    /* Edit Form */
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                            Số/Tên bàn
                          </label>
                          <input
                            type="text"
                            value={editTableNumber}
                            onChange={(e) => setEditTableNumber(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                            Sức chứa (người)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={editCapacity}
                            onChange={(e) => setEditCapacity(parseInt(e.target.value, 10) || 4)}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={editIsEnabled}
                            onChange={(e) => setEditIsEnabled(e.target.checked)}
                            className="rounded text-[var(--brand-accent)] focus:ring-[var(--brand-accent)]"
                          />
                          <span>Bật hoạt động phục vụ khách</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingTableId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(t.table_id)}
                            disabled={isSubmitting || !editTableNumber.trim()}
                            className="px-4 py-1.5 bg-[var(--brand-accent)] text-white text-xs font-bold rounded-lg shadow-xs hover:bg-[var(--brand-accent-dark)] disabled:opacity-50"
                          >
                            {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Display Row */
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                          t.is_enabled === false
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)]'
                        }`}>
                          {t.table_number.slice(0, 3)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm truncate">
                              Bàn {t.table_number}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              ({t.capacity || 4} chỗ)
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              t.is_enabled === false
                                ? 'bg-slate-100 text-slate-500'
                                : t.active_session_id
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                t.is_enabled === false ? 'bg-slate-400' : t.active_session_id ? 'bg-blue-500' : 'bg-emerald-500'
                              }`} />
                              {t.is_enabled === false ? 'Tắt phục vụ' : t.active_session_id ? 'Đang có khách' : 'Sẵn sàng'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleEnable(t)}
                          disabled={isSubmitting}
                          className={`p-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                            t.is_enabled === false
                              ? 'border-slate-300 text-slate-400 hover:text-emerald-700 hover:border-emerald-300'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                          title={t.is_enabled === false ? 'Bật bàn hoạt động lại' : 'Tắt bàn ngừng phục vụ'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(t)}
                          className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
                          title="Sửa thông tin bàn"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTable(t)}
                          disabled={isSubmitting}
                          className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition cursor-pointer"
                          title="Xóa bàn"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
