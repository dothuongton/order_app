import React, { useState } from 'react';
import { usePush, PushPermissionState } from '../../context/PushContext.js';
import {
  Bell, BellOff, BellRing, Smartphone, CheckCircle, AlertTriangle,
  X, Share2, PlusSquare, ArrowRight, RefreshCw, Send, ShieldAlert
} from 'lucide-react';

interface PushSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PushSettingsModal: React.FC<PushSettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    state,
    isSubscribed,
    isLoading,
    errorMessage,
    subscribe,
    unsubscribe,
    sendTestPush,
    refreshStatus
  } = usePush();

  const [testSent, setTestSent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    setActionError(null);
    try {
      await subscribe();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi đăng ký nhận thông báo');
    }
  };

  const handleUnsubscribe = async () => {
    setActionError(null);
    try {
      await unsubscribe();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi tắt thông báo');
    }
  };

  const handleSendTest = async () => {
    setActionError(null);
    try {
      await sendTestPush();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Lỗi gửi thông báo thử');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-100 max-h-[88dvh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
        {/* Sticky Header */}
        <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Thông báo Web Push (iOS / PWA)</h3>
              <p className="text-[11px] text-slate-400">Nhận chuông báo khi khóa màn hình iPhone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition text-sm"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 pt-3 overflow-y-auto flex-1 space-y-4">
          {/* Global Error Banner */}
          {(errorMessage || actionError) && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMessage || actionError}</span>
            </div>
          )}

        {/* Status Card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
            Trạng thái hiện tại
          </span>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {state === 'granted' && isSubscribed ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-xs font-black text-emerald-800">Đã bật thông báo đẩy</span>
                </>
              ) : state === 'server_disabled' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className="text-xs font-black text-amber-800">Máy chủ chưa kích hoạt</span>
                </>
              ) : state === 'key_mismatch' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                  <span className="text-xs font-black text-amber-800">Cần cập nhật khóa</span>
                </>
              ) : state === 'http_insecure' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <span className="text-xs font-black text-rose-800">Cần kết nối qua HTTPS</span>
                </>
              ) : state === 'ios_need_install' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className="text-xs font-black text-amber-800">Cần cài vào Màn hình chính</span>
                </>
              ) : state === 'sync_error' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                  <span className="text-xs font-black text-amber-800">Lỗi đồng bộ máy chủ</span>
                </>
              ) : state === 'denied' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <span className="text-xs font-black text-rose-800">Bị chặn trong Cài đặt máy</span>
                </>
              ) : state === 'unsupported' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                  <span className="text-xs font-black text-slate-600">Thiết bị không hỗ trợ</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                  <span className="text-xs font-black text-slate-700">Chưa bật thông báo</span>
                </>
              )}
            </div>

            <button
              onClick={refreshStatus}
              className="text-slate-400 hover:text-slate-700 text-[11px] flex items-center gap-1 font-semibold transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Kiểm tra lại</span>
            </button>
          </div>
        </div>

        {/* Content by State */}
        {state === 'server_disabled' ? (
          /* Case -1: Server push unconfigured or disabled */
          <div className="space-y-3 bg-amber-50/80 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Máy chủ chưa kích hoạt Web Push (VAPID)</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Hệ thống thông báo đẩy trên máy chủ quán chưa được cài đặt cặp khóa VAPID. Quản trị viên cần khai báo biến môi trường <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">VAPID_PUBLIC_KEY</code> và <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">VAPID_PRIVATE_KEY</code> trên Render.
            </p>
            <div className="p-2.5 bg-white/80 border border-amber-200/60 rounded-xl text-[11px] text-slate-600">
              💡 Khi đang mở ứng dụng, chuông báo và giọng nói tiếng Việt vẫn hoạt động bình thường qua kết nối Socket trực tiếp.
            </div>
          </div>
        ) : state === 'key_mismatch' ? (
          /* Case -0.5: Key mismatch / rotation */
          <div className="space-y-3 bg-amber-50/80 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              <span>Khóa thông báo máy chủ đã thay đổi</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Cặp khóa VAPID trên máy chủ đã được cập nhật. Vui lòng bấm nút bên dưới để cập nhật lại kết nối cho thiết bị này.
            </p>
            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 min-h-[46px] mt-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{isLoading ? 'Đang cập nhật...' : 'Cập nhật và kết nối lại ngay'}</span>
            </button>
          </div>
        ) : state === 'http_insecure' ? (
          /* Case 0: Insecure HTTP on mobile */
          <div className="space-y-3 bg-rose-50 border border-rose-200 p-4 rounded-2xl text-xs text-rose-900">
            <div className="flex items-center gap-2 font-bold text-rose-950">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Yêu cầu HTTPS để nhận chuông khi khóa iPhone</span>
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              Apple yêu cầu Web App phải chạy qua giao thức <strong>HTTPS (SSL)</strong> để kích hoạt tính năng nhận thông báo khi khóa máy hoặc chuyển ứng dụng nền.
            </p>
            <div className="bg-white/80 p-2.5 rounded-xl border border-rose-200/80 space-y-1">
              <p className="font-bold text-slate-800 text-[11px]">💡 Cách tạo link HTTPS trên máy tính để thử iPhone:</p>
              <p className="text-[11px] text-orange-600 font-mono bg-slate-100 p-1.5 rounded-lg select-all">
                npm run tunnel
              </p>
              <p className="text-[10px] text-slate-500">
                Chạy lệnh trên ở terminal để nhận đường link HTTPS (Cloudflare Tunnel) miễn phí, sau đó mở trên iPhone và thêm vào Màn hình chính.
              </p>
            </div>
          </div>
        ) : state === 'ios_need_install' ? (
          /* Case 1: iOS Safari browser tab - requires Add to Home Screen */
          <div className="space-y-3 bg-amber-50/70 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <Smartphone className="w-4 h-4 text-amber-600" />
              <span>Hướng dẫn cài đặt trên iPhone (iOS 16.4+)</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Apple yêu cầu Web App phải được thêm vào <strong>Màn hình chính</strong> để có thể nhận thông báo khi khóa máy hoặc chuyển ứng dụng nền:
            </p>

            <ol className="space-y-2 text-[11px] text-amber-900 font-medium list-decimal list-inside pl-1">
              <li>
                Chạm vào biểu tượng <strong>Chia sẻ (Share ⎋)</strong> ở thanh dưới Safari.
              </li>
              <li>
                Cuộn xuống chọn <strong>"Thêm vào Màn hình chính" (Add to Home Screen)</strong>.
              </li>
              <li>
                Mở ứng dụng từ <strong>icon ngoài Màn hình chính</strong> và nhấn <strong>Bật thông báo</strong>.
              </li>
            </ol>

            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 min-h-[46px] mt-3"
            >
              <Bell className="w-4 h-4" />
              <span>{isLoading ? 'Đang kích hoạt...' : '👉 Nhấn để Bật quyền thông báo ngay'}</span>
            </button>
          </div>
        ) : state === 'denied' ? (
          /* Case 2: Permission denied in iOS / browser */
          <div className="space-y-3 bg-rose-50 border border-rose-200 p-4 rounded-2xl text-xs text-rose-900">
            <div className="flex items-center gap-2 font-bold text-rose-950">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Quyền thông báo đang bị chặn</span>
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              Bạn hoặc iOS đã chặn quyền thông báo cho ứng dụng này. Để mở lại:
            </p>
            <ol className="space-y-1.5 text-[11px] text-rose-900 font-medium list-decimal list-inside pl-1">
              <li>Vào <strong>Cài đặt (Settings) trên iPhone</strong>.</li>
              <li>Chọn mục <strong>Thông báo (Notifications)</strong>.</li>
              <li>Tìm tên ứng dụng <strong>"QR Order"</strong> và gạt <strong>Cho phép thông báo</strong>.</li>
            </ol>
          </div>
        ) : state === 'unsupported' ? (
          /* Case 3: Unsupported browser/device */
          <div className="space-y-2 bg-slate-100 p-3.5 rounded-2xl text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Trình duyệt không hỗ trợ Push API</p>
            <p className="text-[11px] text-slate-500">
              Vui lòng sử dụng Safari trên iOS 16.4+ (đã cài ra Home Screen), Chrome hoặc Edge trên Android/máy tính để nhận thông báo đẩy.
            </p>
          </div>
        ) : state === 'granted' && isSubscribed ? (
          /* Case 4: Granted & Subscribed */
          <div className="space-y-3">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Thiết bị sẵn sàng nhận thông báo</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                Khi có <strong>đơn món mới</strong>, <strong>khách gọi hỗ trợ</strong> hoặc <strong>yêu cầu thanh toán</strong>, iPhone của bạn sẽ nhận được thông báo ngay cả khi đang khóa màn hình.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleSendTest}
                disabled={isLoading}
                className="w-full py-2.5 px-3 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 min-h-[42px]"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Đang gửi...' : 'Gửi thử 1 thông báo tới máy này'}</span>
              </button>

              {testSent && (
                <p className="text-center text-[11px] text-emerald-600 font-semibold animate-pulse">
                  ✓ Đã gửi lệnh push! Hãy khóa màn hình hoặc chuyển tab để kiểm tra thông báo.
                </p>
              )}

              <button
                onClick={handleUnsubscribe}
                disabled={isLoading}
                className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition min-h-[38px]"
              >
                Tắt thông báo trên thiết bị này
              </button>
            </div>
          </div>
        ) : (
          /* Case 5: Default (Not yet granted) */
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-1">
              <p className="font-bold text-blue-950">Lợi ích khi bật Web Push:</p>
              <ul className="text-[11px] text-blue-800 space-y-1 list-disc list-inside">
                <li>Nhận thông báo khi iPhone khóa màn hình.</li>
                <li>Không bỏ lỡ khách gọi tính tiền hoặc món mới.</li>
                <li>Nhấn thông báo để mở ngay bàn tương ứng.</li>
              </ul>
            </div>

            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 min-h-[46px]"
            >
              <Bell className="w-4 h-4" />
              <span>{isLoading ? 'Đang đăng ký...' : 'Bật thông báo Web Push ngay'}</span>
            </button>
          </div>
        )}

        {/* Footer Note */}
        <p className="text-[10px] text-slate-400 text-center leading-normal pt-1 border-t border-slate-100">
          * Âm thanh thông báo khi khóa máy do cài đặt Thông báo của iOS quyết định. Khi ứng dụng đang mở, chuông và giọng nói tiếng Việt vẫn hoạt động bình thường.
        </p>
        </div>
      </div>
    </div>
  );
};
