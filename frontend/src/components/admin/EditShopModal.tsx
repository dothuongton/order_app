import React, { useState } from 'react';
import { Edit3, X, Loader2 } from 'lucide-react';
import { ShopSummary, UpdateShopPayload } from '../../types/admin.js';

interface EditShopModalProps {
    shop: ShopSummary;
    onClose: () => void;
    onSubmit: (id: string, payload: UpdateShopPayload) => Promise<void>;
}

export const EditShopModal: React.FC<EditShopModalProps> = ({ shop, onClose, onSubmit }) => {
    const [form, setForm] = useState<UpdateShopPayload>({
        name: shop.name,
        slug: shop.slug,
        phone: shop.phone || '',
        address: shop.address || '',
        description: (shop as any).description || ''
    });

    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [clientError, setClientError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setClientError(null);

        if (!form.name?.trim()) {
            setClientError('Tên quán không được để trống');
            return;
        }
        if (form.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
            setClientError('Slug chỉ gồm chữ thường, số và dấu gạch ngang (kebab-case)');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSubmit(shop.id, form);
            onClose();
        } catch (err: any) {
            setClientError(err.message || 'Lỗi cập nhật quán');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                            <Edit3 className="w-4 h-4" />
                        </div>
                        <h3 className="font-extrabold text-white text-base">Chỉnh Sửa Thông Tin Quán</h3>
                    </div>
                    <button onClick={onClose} disabled={isSubmitting} className="text-slate-400 hover:text-white p-1 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {clientError && (
                    <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold">
                        {clientError}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
                    <div>
                        <label className="block text-slate-300 font-semibold mb-1">Tên Quán Ăn *</label>
                        <input
                            type="text"
                            required
                            value={form.name}
                            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 transition"
                        />
                    </div>

                    <div>
                        <label className="block text-slate-300 font-semibold mb-1">Đường Dẫn Slug URL *</label>
                        <input
                            type="text"
                            required
                            value={form.slug}
                            onChange={(e) => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-mono focus:outline-hidden focus:border-indigo-500 transition"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-slate-300 font-semibold mb-1">Số điện thoại</label>
                            <input
                                type="text"
                                value={form.phone || ''}
                                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-300 font-semibold mb-1">Địa chỉ quán</label>
                            <input
                                type="text"
                                value={form.address || ''}
                                onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 transition"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-slate-300 font-semibold mb-1">Mô tả quán</label>
                        <textarea
                            rows={3}
                            value={form.description || ''}
                            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 transition"
                            placeholder="Giới thiệu phong cách, món nổi bật..."
                        />
                    </div>

                    <div className="flex items-center gap-2.5 pt-3 border-t border-slate-800">
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={onClose}
                            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl transition"
                        >
                            Hủy Bỏ
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Đang Lưu...</span>
                                </>
                            ) : (
                                <span>Lưu Thay Đổi</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
