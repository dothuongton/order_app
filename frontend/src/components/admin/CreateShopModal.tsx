import React, { useState } from 'react';
import { X, Store, Lock, Eye, EyeOff } from 'lucide-react';
import { CreateShopPayload } from '../../types/admin.js';

interface CreateShopModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payload: CreateShopPayload) => Promise<void>;
}

export const CreateShopModal: React.FC<CreateShopModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [slugTouched, setSlugTouched] = useState(false);
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [ownerFullName, setOwnerFullName] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [ownerPassword, setOwnerPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [linkExistingOwner, setLinkExistingOwner] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const generateSlug = (val: string) => {
        return val
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setName(val);
        if (!slugTouched) {
            setSlug(generateSlug(val));
        }
    };

    const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSlug(e.target.value);
        setSlugTouched(true);
    };

    const resetForm = () => {
        setName('');
        setSlug('');
        setSlugTouched(false);
        setPhone('');
        setAddress('');
        setOwnerFullName('');
        setOwnerEmail('');
        setOwnerPassword('');
        setShowPassword(false);
        setLinkExistingOwner(false);
        setError(null);
    };

    const handleClose = () => {
        if (isSubmitting) return;
        resetForm();
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const trimmedName = name.trim();
        const trimmedSlug = slug.trim();
        const trimmedFullName = ownerFullName.trim();
        const trimmedEmail = ownerEmail.trim();

        if (!trimmedName) {
            return setError('Vui lòng nhập tên quán.');
        }
        if (!trimmedSlug) {
            return setError('Vui lòng nhập slug (đường dẫn quán).');
        }
        if (!trimmedFullName) {
            return setError('Vui lòng nhập họ tên chủ quán.');
        }
        if (!trimmedEmail) {
            return setError('Vui lòng nhập email chủ quán.');
        }
        if (!linkExistingOwner) {
            if (!ownerPassword) {
                return setError('Vui lòng nhập mật khẩu khởi tạo cho chủ quán.');
            }
            if (ownerPassword.length < 8) {
                return setError('Mật khẩu khởi tạo phải từ 8 ký tự trở lên.');
            }
            if (new TextEncoder().encode(ownerPassword).length > 72) {
                return setError('Mật khẩu không được vượt quá 72 ký tự (giới hạn bảo mật Bcrypt).');
            }
        }

        try {
            setIsSubmitting(true);
            await onSubmit({
                name: trimmedName,
                slug: trimmedSlug,
                phone: phone.trim() || undefined,
                address: address.trim() || undefined,
                ownerFullName: trimmedFullName,
                ownerEmail: trimmedEmail,
                ownerPassword: linkExistingOwner ? undefined : ownerPassword,
                linkExistingOwner
            });
            resetForm();
            onClose();
        } catch (err: any) {
            // Keep user-entered metadata intact so user does not need to retype everything; show clear error
            setError(err.message || 'Không thể tạo quán. Vui lòng kiểm tra lại dữ liệu.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <div
                className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-shop-title"
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Store className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 id="create-shop-title" className="text-lg font-bold text-slate-900">
                                Tạo Quán Mới
                            </h3>
                            <p className="text-xs text-slate-500">
                                Khởi tạo quán kèm tài khoản quản lý và cấu hình mẫu
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
                        aria-label="Đóng"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-semibold">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                Tên Quán <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                disabled={isSubmitting}
                                value={name}
                                onChange={handleNameChange}
                                placeholder="VD: Quán Cơm Phố Cổ"
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden font-medium disabled:opacity-60"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                Slug URL <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                disabled={isSubmitting}
                                value={slug}
                                onChange={handleSlugChange}
                                placeholder="quan-com-pho-co"
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden disabled:opacity-60"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Số điện thoại</label>
                            <input
                                type="tel"
                                disabled={isSubmitting}
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="0901234567"
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden font-medium disabled:opacity-60"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Địa chỉ quán</label>
                            <input
                                type="text"
                                disabled={isSubmitting}
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Số 10 Hàng Buồm, Hà Nội"
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden font-medium disabled:opacity-60"
                            />
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Tài khoản Chủ quán (Manager)
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2.5">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    Họ và Tên <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    disabled={isSubmitting}
                                    value={ownerFullName}
                                    onChange={(e) => setOwnerFullName(e.target.value)}
                                    placeholder="Nguyễn Văn A"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden font-medium disabled:opacity-60"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    Email đăng nhập <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    required
                                    disabled={isSubmitting}
                                    value={ownerEmail}
                                    onChange={(e) => setOwnerEmail(e.target.value)}
                                    placeholder="admin@phoco.vn"
                                    autoComplete="username"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden disabled:opacity-60"
                                />
                            </div>
                        </div>

                        {/* Existing account linking toggle (Issue #82) */}
                        <div className="mt-3.5 p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-800">Liên kết tài khoản chủ quán có sẵn</p>
                                <p className="text-[11px] text-slate-400">Nếu email này đã có tài khoản, gán quyền chủ quán và giữ nguyên mật khẩu cũ</p>
                            </div>
                            <input
                                type="checkbox"
                                id="linkExistingOwner"
                                checked={linkExistingOwner}
                                onChange={(e) => setLinkExistingOwner(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500 cursor-pointer"
                            />
                        </div>

                        {!linkExistingOwner ? (
                        <div className="mt-3">
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                Mật khẩu khởi tạo <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    disabled={isSubmitting}
                                    value={ownerPassword}
                                    onChange={(e) => setOwnerPassword(e.target.value)}
                                    placeholder="Nhập mật khẩu (tối thiểu 8 ký tự, tối đa 72 ký tự)"
                                    autoComplete="new-password"
                                    maxLength={72}
                                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden disabled:opacity-60"
                                />
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    disabled={isSubmitting}
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                                Mật khẩu an toàn dành cho tài khoản quản lý quán, tối thiểu 8 ký tự.
                            </p>
                        </div>
                        ) : (
                        <div className="mt-3 p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-800">
                            <span className="font-semibold">Chế độ liên kết:</span> Chủ quán sẽ đăng nhập bằng mật khẩu tài khoản hiện tại của họ.
                        </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={handleClose}
                            className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs rounded-xl transition"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/25 transition active:scale-98"
                        >
                            {isSubmitting ? 'Đang tạo...' : 'Xác Nhận Tạo Quán'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
