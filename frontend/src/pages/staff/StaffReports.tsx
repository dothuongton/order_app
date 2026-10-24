import React, { useEffect, useState } from 'react';
import { request } from '../../api/client.js';
import { BarChart3, TrendingUp, Utensils, CheckCircle, RefreshCw, Receipt, ChevronRight } from 'lucide-react';
import { ReceiptDetailModal } from './ReceiptDetailModal.js';

export const StaffReports: React.FC = () => {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSessionForReceipt, setSelectedSessionForReceipt] = useState<any | null>(null);

  const fetchReports = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await request<any>('/staff/reports/summary');
      setData(res);
    } catch (err: any) {
      console.error('Failed to load reports', err);
      setError(err.message || 'Lỗi khi tải dữ liệu báo cáo');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 10000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !data) {
    return <div className="p-8 text-center text-slate-400">Đang tải báo cáo...</div>;
  }

  const metrics = data?.metrics || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-slate-900 text-lg">Báo cáo & Ghi nhận</h3>
          <p className="text-xs text-slate-500">Số liệu thủ công đã được nhân viên xác nhận</p>
        </div>
        <button
          onClick={fetchReports}
          className="p-2 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Số phiên xác nhận
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            {metrics.confirmedSessionsCount || 0}
          </span>
          <span className="text-[10px] text-slate-400">Chỉ tính phiên kết thúc F10</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Giá trị trung bình
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            {(metrics.averageOrderValue || 0).toLocaleString('vi-VN')}đ
          </span>
          <span className="text-[10px] text-slate-400">Trung bình / phiên</span>
        </div>
      </div>

      {/* Main Revenue Card */}
      <div className="bg-gradient-to-br from-[var(--brand-accent)] to-[var(--brand-accent-dark)] text-white p-5 rounded-3xl shadow-lg space-y-1.5">
        <span className="text-xs font-semibold opacity-90 uppercase tracking-wider">
          {metrics.label || 'Tổng bill đã được nhân viên xác nhận thanh toán'}
        </span>
        <div className="text-3xl font-black">
          {(metrics.totalConfirmedAmount || 0).toLocaleString('vi-VN')}đ
        </div>
        <p className="text-[11px] opacity-80 pt-1 border-t border-white/20">
          * Ghi nhận thủ công từ các lượt phục vụ đã hoàn tất. Quán xử lý đối soát tiền mặt & ngân hàng ngoài hệ thống.
        </p>
      </div>

      {/* Recent Settled Sessions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <h4 className="font-bold text-sm text-slate-900">Phiên đã thanh toán gần đây</h4>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Bấm vào để xem hóa đơn</span>
        </div>

        <div className="divide-y divide-slate-100">
          {(data?.recentSettledSessions || []).map((s: any, idx: number) => {
            const isReleased0d = s.bill_status === 'CANCELLED' || Number(s.confirmed_amount) === 0;
            return (
              <div
                key={idx}
                onClick={() => setSelectedSessionForReceipt(s)}
                className="py-3 px-3 -mx-2 rounded-xl hover:bg-[var(--brand-accent-tint)] active:bg-[var(--brand-accent-strong)] cursor-pointer flex items-center justify-between text-xs transition border border-transparent hover:border-[var(--brand-line)] group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black transition ${
                    isReleased0d
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent-text)] group-hover:bg-[var(--brand-accent)] group-hover:text-white'
                  }`}>
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">Bàn {s.table_number}</span>
                      <span className="text-[10px] text-slate-400">#{s.session_id.slice(0, 6)}</span>
                      {s.close_reason && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          Đã giải phóng: {s.close_reason}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 block text-[11px]">
                      {s.confirmed_by_name} • {new Date(s.confirmed_at).toLocaleTimeString('vi-VN')} ({new Date(s.confirmed_at).toLocaleDateString('vi-VN')})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`font-extrabold text-sm transition ${
                    isReleased0d
                      ? 'text-slate-500'
                      : 'text-emerald-700 group-hover:text-[var(--brand-accent-text)]'
                  }`}>
                    {Number(s.confirmed_amount).toLocaleString('vi-VN')}đ
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[var(--brand-accent-text)] transition" />
                </div>
              </div>
            );
          })}

          {(!data?.recentSettledSessions || data.recentSettledSessions.length === 0) && (
            <p className="text-xs text-slate-400 py-3 text-center">Chưa có phiên nào được thanh toán</p>
          )}
        </div>
      </div>

      {/* Top Served Dishes */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Utensils className="w-4 h-4 text-[var(--brand-accent-text)]" />
          <h4 className="font-bold text-sm text-slate-900">Món được phục vụ nhiều nhất</h4>
        </div>

        <div className="divide-y divide-slate-100">
          {(data?.topServedItems || []).map((dish: any, idx: number) => (
            <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800">{dish.item_name}</span>
              <div className="text-right">
                <span className="font-bold text-slate-900">{dish.total_served} phần</span>
                <span className="text-slate-400 block text-[11px]">{Number(dish.total_amount).toLocaleString('vi-VN')}đ</span>
              </div>
            </div>
          ))}

          {(!data?.topServedItems || data.topServedItems.length === 0) && (
            <p className="text-xs text-slate-400 py-3 text-center">Chưa có dữ liệu món đã phục vụ</p>
          )}
        </div>
      </div>

      {/* Receipt Detail Modal */}
      {selectedSessionForReceipt && (
        <ReceiptDetailModal
          session={selectedSessionForReceipt}
          onClose={() => setSelectedSessionForReceipt(null)}
        />
      )}
    </div>
  );
};
