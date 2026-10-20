import React, { useState } from 'react';
import { Store, X, KeyRound, User, Mail, Phone, MapPin, Loader2 } from 'lucide-react';
import { CreateShopPayload } from '../../types/admin.js';

interface CreateShopModalProps {
    onClose: () => void;
    onSubmit: (payload: CreateShopPayload) => Promise<void>;
}

export const CreateShopModal: React.FC<CreateShopModalProps> = ({ onClose, onSubmit }) => {
    const [form, setForm] = useState<CreateShopPayload>({
        name: '',
        slug: '',
        phone: '',
        address: '',
        ownerFullName: '',
        ownerEmail: '',
        ownerPassword: ''
    });

    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [clientError, setClientError] = useState<string | null>(null);

    // Auto-generate slug from name
    const handleNameChange = (val: string) => {
        const generatedSlug = val
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
        setForm(prev => ({ ...prev, name: val, slug: generatedSlug }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setClientError(null);

        // Client validations
        if (!form.name.trim()) {
            setClientError('Tên quán không được để trống');
            return;
        }
        if (!form.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
            setClientError('Slug chỉ gồm chữ thường, số và dấu gạch ngang (kebab-case)');
            return;
        }
        if (!form.ownerFullName.trim()) {
            setClientError('Họ tên chủ quán không được để trống');
            return;
        }
        if (!form.ownerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)) {
            setClientError('Email chủ quán không đúng định dạng');
            return;
        }
        if (!form.ownerPassword || form.ownerPassword.length < 8) {
            setClientError('Mật khẩu khởi tạo tối thiểu 8 ký tự');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSubmit(form);
            // Clear password from memory on success
            setForm(prev => ({ ...prev, ownerPassword: '' }));
        } catch (err: any) {
            setClientError(err.message || 'Lỗi khi tạo quán');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                            <Store className="w-4 h-4" />
                        </div>
                        <h3 className="font-extrabold text-white text-base">Khởi Tạo Quán Mới</h3>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-slate-400 hover:text-white p-1 rounded-lg transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Inline Error Alert */}
                {clientError && (
                    <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold">
                        {clientError}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                    {/* Shop Information Section */}
                    <div className="space-y-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Thông Tin Cơ Bản
                        </span>

                        <div>
                            <label className="block text-slate-300 font-semibold mb-1">Tên Quán Ăn / Shop *</label>
                            <input
                                type="text"
                                required
                                value={form.name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="Ví dụ: Bếp Cơm Niêu Sài Gòn"
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
                                placeholder="bep-com-nieu-sai-gon"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-mono focus:outline-hidden focus:border-indigo-500 transition"
                            />
                            <span className="text-[10px] text-slate-500 mt-1 block">Khách hàng sẽ quét mã hoặc truy cập qua link /{form.slug || 'slug'}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Số điện thoại</label>
                                <input
                                    type="text"
                                    value={form.phone || ''}
                                    onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                                    placeholder="0901234567"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 transition"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-300 font-semibold mb-1">Địa chỉ quán</label>
                                <input
                                    type="text"
                                    value={form.address || ''}
                                    onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                                    placeholder="123 Nguyễn Huệ, Q.1"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 transition"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Owner Account Section */}
                    <div className="space-y-3 pt-3 border-t border-slate-800">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 block">
                            Tài Khoản Chủ Quán (Owner)
                        </span>

                        <div>
                            <label className="block text-slate-300 font-semibold mb-1">Họ Tên Chủ Quán *</label>
                            <input
                                type="text"
                                required
                                value={form.ownerFullName}
                                onChange={(e) => setForm(prev => ({ ...prev, ownerFullName: e.target.value }))}
                                placeholder="Nguyễn Văn A"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-300 font-semibold mb-1">Email Đăng Nhập *</label>
                            <input
                                type="email"
                                required
                                value={form.ownerEmail}
                                onChange={(e) => setForm(prev => ({ ...prev, ownerEmail: e.target.value }))}
                                placeholder="owner@quanan.vn"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-300 font-semibold mb-1">Mật Khẩu Khởi Tạo * (Tối thiểu 8 ký tự)</label>
                            <input
                                type="text"
                                required
                                minLength={8}
                                value={form.ownerPassword}
                                onChange={(e) => setForm(prev => ({ ...prev, ownerPassword: e.target.value }))}
                                placeholder="Password123!"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-hidden focus:border-indigo-500 font-mono transition"
                            />
                        </div>
                    </div>

                    {/* Form Action Buttons */}
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
                                    <span>Đang Khởi Tạo...</span>
                                </>
                            ) : (
                                <span>Xác Nhận Tạo Quán</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
