import React, { useState, useEffect, useCallback } from 'react';
import { AdminApi } from '../../api/admin.js';
import {
    AdminTableQrResponse,
    AdminCreateTablePayload,
    AdminUpdateTablePayload,
    AdminDeleteTablePayload,
    AdminTableItem,
    ShopStatus
} from '../../types/admin.js';
import {
    Plus,
    QrCode,
    Edit2,
    Trash2,
    Download,
    X,
    AlertCircle,
    CheckCircle2,
    Users,
    ShieldAlert,
    RefreshCw
} from 'lucide-react';

interface ShopTablesManagerProps {
    shopId: string;
    shopName: string;
    shopStatus: ShopStatus;
    onClose?: () => void;
}



export const ShopTablesManager: React.FC<ShopTablesManagerProps> = ({
    shopId,
    shopName,
    shopStatus,
    onClose
}) => {
    const [tables, setTables] = useState<AdminTableItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal states
    const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
    const [editModalTable, setEditModalTable] = useState<AdminTableItem | null>(null);
    const [deleteModalTable, setDeleteModalTable] = useState<AdminTableItem | null>(null);
    const [qrModalData, setQrModalData] = useState<AdminTableQrResponse | null>(null);

    // Form inputs
    const [createForm, setCreateForm] = useState<{ table_number: string; capacity: number; reason: string }>({
        table_number: '',
        capacity: 4,
        reason: ''
    });
    const [editForm, setEditForm] = useState<{ table_number: string; capacity: number; is_enabled: boolean; reason: string }>({
        table_number: '',
        capacity: 4,
        is_enabled: true,
        reason: ''
    });
    const [deleteReason, setDeleteReason] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [conflictDetails, setConflictDetails] = useState<any | null>(null);

    const isArchived = shopStatus === 'archived';
    const isSuspended = shopStatus === 'suspended';

    const loadTables = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await AdminApi.getShopTables(shopId, { limit: 100 });
            setTables(res.tables || []);
        } catch (err: any) {
            setError(err.message || 'Không thể tải danh sách bàn của quán');
        } finally {
            setLoading(false);
        }
    }, [shopId]);

    useEffect(() => {
        loadTables();
    }, [loadTables]);

    // Handle Create Table
    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createForm.table_number.trim()) {
            setError('Vui lòng nhập số bàn');
            return;
        }
        if (!createForm.reason.trim()) {
            setError('Lý do hỗ trợ là bắt buộc để ghi nhận audit log');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const payload: AdminCreateTablePayload = {
                table_number: createForm.table_number.trim(),
                capacity: Number(createForm.capacity) || 4,
                reason: createForm.reason.trim()
            };
            const res = await AdminApi.createShopTable(shopId, payload);
            setSuccessMessage(res.message || 'Tạo bàn thành công');
            setCreateModalOpen(false);
            setCreateForm({ table_number: '', capacity: 4, reason: '' });
            await loadTables();
        } catch (err: any) {
            setError(err.message || 'Không thể tạo bàn');
        } finally {
            setSubmitting(false);
        }
    };

    // Open Edit Modal
    const openEditModal = (table: AdminTableItem) => {
        setEditModalTable(table);
        setEditForm({
            table_number: table.table_number,
            capacity: table.capacity,
            is_enabled: table.is_enabled,
            reason: ''
        });
        setConflictDetails(null);
        setError(null);
    };

    // Handle Edit Table
    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editModalTable) return;
        if (!editForm.table_number.trim()) {
            setError('Số bàn không được để trống');
            return;
        }
        if (!editForm.reason.trim()) {
            setError('Lý do hỗ trợ là bắt buộc để ghi nhận audit log');
            return;
        }

        setSubmitting(true);
        setError(null);
        setConflictDetails(null);
        try {
            const payload: AdminUpdateTablePayload = {
                table_number: editForm.table_number.trim(),
                capacity: Number(editForm.capacity) || 4,
                is_enabled: editForm.is_enabled,
                expected_updated_at: editModalTable.updated_at,
                reason: editForm.reason.trim()
            };
            const res = await AdminApi.updateShopTable(shopId, editModalTable.id, payload);
            setSuccessMessage(res.message || 'Cập nhật bàn thành công');
            setEditModalTable(null);
            await loadTables();
        } catch (err: any) {
            if (err.status === 409 || err.error === 'CONFLICT') {
                setError('Xung đột dữ liệu: Bàn đã bị cập nhật bởi người khác!');
                if (err.details?.currentTable) {
                    setConflictDetails(err.details.currentTable);
                }
            } else {
                setError(err.message || 'Không thể cập nhật bàn');
            }
        } finally {
            setSubmitting(false);
        }
    };

    // Open Delete Modal
    const openDeleteModal = (table: AdminTableItem) => {
        setDeleteModalTable(table);
        setDeleteReason('');
        setError(null);
    };

    // Handle Delete Table
    const handleDeleteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deleteModalTable) return;
        if (!deleteReason.trim()) {
            setError('Lý do hỗ trợ xóa bàn là bắt buộc');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const payload: AdminDeleteTablePayload = {
                reason: deleteReason.trim()
            };
            const res = await AdminApi.deleteShopTable(shopId, deleteModalTable.id, payload);
            setSuccessMessage(res.message || 'Đã xóa bàn thành công');
            setDeleteModalTable(null);
            await loadTables();
        } catch (err: any) {
            setError(err.message || 'Không thể xóa bàn');
        } finally {
            setSubmitting(false);
        }
    };

    // View QR
    const handleViewQr = async (table: AdminTableItem) => {
        setLoading(true);
        setError(null);
        try {
            const qr = await AdminApi.getShopTableQr(shopId, table.id);
            setQrModalData(qr);
        } catch (err: any) {
            setError(err.message || 'Không thể lấy mã QR bàn');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col h-full">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        Quản lý Bàn & Mã QR
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                            {tables.length} bàn
                        </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Quán: <span className="font-semibold text-slate-800">{shopName}</span>
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={loadTables}
                        disabled={loading}
                        className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                        title="Tải lại"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {!isArchived && !isSuspended && (
                        <button
                            onClick={() => {
                                setCreateForm({ table_number: '', capacity: 4, reason: '' });
                                setCreateModalOpen(true);
                                setError(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                        >
                            <Plus className="w-4 h-4" />
                            Thêm bàn
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Status alerts */}
            {isArchived && (
                <div className="px-5 py-3 bg-slate-100 border-b border-slate-200 flex items-center gap-2 text-xs text-slate-600">
                    <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Quán đã lưu trữ (Archived). Tất cả các thao tác thêm, sửa hoặc xóa bàn bị vô hiệu hóa.</span>
                </div>
            )}
            {isSuspended && (
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Quán đang tạm dừng (Suspended). Không thể tạo bàn mới trong trạng thái này.</span>
                </div>
            )}
            {error && (
                <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                    <div className="flex-1">{error}</div>
                    <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
            {successMessage && (
                <div className="m-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    <div className="flex-1">{successMessage}</div>
                    <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-600">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Table list */}
            <div className="flex-1 overflow-y-auto p-5">
                {loading && tables.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                        Đang tải danh sách bàn...
                    </div>
                ) : tables.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                        Chưa có bàn nào được cấu hình cho quán này.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {tables.map((t) => (
                            <div
                                key={t.id}
                                className={`border rounded-xl p-4 transition ${
                                    t.is_enabled
                                        ? 'bg-white border-slate-200 hover:border-slate-300'
                                        : 'bg-slate-50 border-slate-200 opacity-75'
                                }`}
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-slate-900">Bàn {t.table_number}</h4>
                                            <span
                                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                                    t.is_enabled
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        : 'bg-slate-200 text-slate-600'
                                                }`}
                                            >
                                                {t.is_enabled ? 'Hoạt động' : 'Tắt'}
                                            </span>
                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                {t.readiness === 'READY' ? 'Sẵn sàng' : t.readiness === 'NEEDS_CLEANING' ? 'Cần dọn' : t.readiness}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5" /> Sức chứa: {t.capacity} người
                                        </p>
                                        <p className="text-[11px] font-mono text-slate-400 mt-1">
                                            QR ID: <span className="text-slate-600 select-all">{t.public_qr_id}</span>
                                        </p>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleViewQr(t)}
                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                            title="Xem mã QR"
                                        >
                                            <QrCode className="w-4 h-4" />
                                        </button>
                                        {!isArchived && !isSuspended && (
                                            <>
                                                <button
                                                    onClick={() => openEditModal(t)}
                                                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                                    title="Chỉnh sửa bàn"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => openDeleteModal(t)}
                                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                                    title="Xóa bàn"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal Create Table */}
            {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                            <h4 className="text-sm font-bold text-slate-900">Thêm bàn mới cho quán</h4>
                            <button
                                onClick={() => setCreateModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Số / Tên bàn <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={createForm.table_number}
                                    onChange={(e) => setCreateForm({ ...createForm, table_number: e.target.value })}
                                    placeholder="Ví dụ: B01, VIP-1"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Sức chứa (người)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={createForm.capacity}
                                    onChange={(e) => setCreateForm({ ...createForm, capacity: Number(e.target.value) })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Lý do hỗ trợ kỹ thuật (Audit Log) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={createForm.reason}
                                    onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
                                    placeholder="Ví dụ: Yêu cầu mở rộng khu vực phục vụ của chủ quán"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCreateModalOpen(false)}
                                    className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
                                >
                                    {submitting ? 'Đang tạo...' : 'Tạo bàn'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Edit Table */}
            {editModalTable && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                            <h4 className="text-sm font-bold text-slate-900">
                                Chỉnh sửa bàn {editModalTable.table_number}
                            </h4>
                            <button
                                onClick={() => setEditModalTable(null)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-5 space-y-4 text-xs">
                            {conflictDetails && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-1">
                                    <p className="font-bold">Dữ liệu trên máy chủ hiện tại:</p>
                                    <p>Số bàn: {conflictDetails.table_number}</p>
                                    <p>Sức chứa: {conflictDetails.capacity} người</p>
                                    <p>Trạng thái: {conflictDetails.is_enabled ? 'Hoạt động' : 'Tắt'}</p>
                                    <p className="text-[11px] text-amber-600">
                                        Biểu mẫu của bạn vẫn được giữ nguyên. Vui lòng kiểm tra lại trước khi gửi lại.
                                    </p>
                                </div>
                            )}

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Số / Tên bàn <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editForm.table_number}
                                    onChange={(e) => setEditForm({ ...editForm, table_number: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Sức chứa (người)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={editForm.capacity}
                                    onChange={(e) => setEditForm({ ...editForm, capacity: Number(e.target.value) })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <input
                                    type="checkbox"
                                    id="is_enabled_toggle"
                                    checked={editForm.is_enabled}
                                    onChange={(e) => setEditForm({ ...editForm, is_enabled: e.target.checked })}
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="is_enabled_toggle" className="font-semibold text-slate-700">
                                    Bật hoạt động bàn
                                </label>
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Lý do hỗ trợ kỹ thuật (Audit Log) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editForm.reason}
                                    onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                                    placeholder="Ví dụ: Đổi tên bàn theo sơ đồ mới của quán"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditModalTable(null)}
                                    className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
                                >
                                    {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Delete Table */}
            {deleteModalTable && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-rose-50">
                            <h4 className="text-sm font-bold text-rose-900">
                                Xác nhận xóa bàn {deleteModalTable.table_number}
                            </h4>
                            <button
                                onClick={() => setDeleteModalTable(null)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleDeleteSubmit} className="p-5 space-y-4 text-xs">
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                                <p className="font-bold flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4 text-amber-600" />
                                    Bảo vệ lịch sử kế toán (DATA-01)
                                </p>
                                <p className="text-[11px] text-amber-800 leading-relaxed">
                                    Nếu bàn này đã có lịch sử đơn hàng hoặc hóa đơn, hệ thống sẽ từ chối xóa vĩnh viễn để bảo toàn sổ sách tài chính. Bạn có thể chuyển sang "Ngừng phục vụ" thay vì xóa.
                                </p>
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Lý do xóa bàn (Audit Log) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                    placeholder="Ví dụ: Bàn tạo nhầm khi setup cơ sở"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                                />
                            </div>

                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDeleteModalTable(null)}
                                    className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
                                >
                                    {submitting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal QR Code */}
            {qrModalData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden text-center">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                            <h4 className="text-sm font-bold text-slate-900">
                                Mã QR Bàn {qrModalData.tableNumber}
                            </h4>
                            <button
                                onClick={() => setQrModalData(null)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-white p-3 rounded-2xl border border-slate-200 inline-block shadow-xs">
                                <img
                                    src={qrModalData.dataUrl}
                                    alt={`QR Bàn ${qrModalData.tableNumber}`}
                                    className="w-56 h-56 mx-auto"
                                />
                            </div>

                            <div>
                                <p className="text-xs font-mono text-slate-500 select-all">
                                    {qrModalData.publicQrId}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-1 break-all select-all">
                                    {qrModalData.qrUrl}
                                </p>
                            </div>

                            <div className="pt-2">
                                <a
                                    href={qrModalData.dataUrl}
                                    download={`qr-ban-${qrModalData.tableNumber}.png`}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-sm transition"
                                >
                                    <Download className="w-4 h-4" />
                                    Tải ảnh mã QR
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
