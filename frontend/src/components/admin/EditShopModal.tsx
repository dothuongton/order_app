import React, { useState, useEffect, useRef } from 'react';
import { X, Edit3 } from 'lucide-react';
import { ShopDetail, ShopSummary, UpdateShopPayload } from '../../types/admin.js';

interface EditShopModalProps {
    shop: ShopDetail | ShopSummary;
    onClose: () => void;
    onSubmit: (id: string, payload: UpdateShopPayload) => Promise<void>;
}

export const EditShopModal: React.FC<EditShopModalProps> = ({ shop, onClose, onSubmit }) => {
    const [name, setName] = useState(shop.name);
    const [phone, setPhone] = useState(shop.phone || '');
    const [address, setAddress] = useState(shop.address || '');
    const [description, setDescription] = useState((shop as ShopDetail).description || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    // ESC key closes modal (Issue #88)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSubmitting) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, isSubmitting]);

    // Auto-focus on open
    useEffect(() => {
        const timer = setTimeout(() => nameInputRef.current?.focus(), 60);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim()) return setError('Tên quán không được để trống.');

        try {
            setIsSubmitting(true);
            await onSubmit(shop.id, {
                name: name.trim(),
                phone: phone.trim() || null,
                address: address.trim() || null,
                description: description.trim() || null
            });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Cập nhật thất bại. Vui lòng thử lại.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <div
                className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-shop-title"
            >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Edit3 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 id="edit-shop-title" className="text-base font-bold text-slate-900">Chỉnh Sửa Thông Tin Quán</h3>
                            <p className="text-xs text-slate-400 font-mono">ID: {shop.id}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                    {error && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tên Quán</label>
                        <input
                            ref={nameInputRef}
                            id="edit-shop-name"
                            type="text"
                            required
                            disabled={isSubmitting}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden font-medium disabled:opacity-60"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Số điện thoại</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Địa chỉ</label>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden font-medium"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả / Giới thiệu</label>
                        <textarea
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden font-medium"
                        />
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/25 transition active:scale-98"
                        >
                            {isSubmitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
