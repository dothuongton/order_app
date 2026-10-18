import React, { useEffect, useState } from 'react';
import { request } from '../../api/client.js';
import { BarChart3, TrendingUp, Utensils, CheckCircle, RefreshCw } from 'lucide-react';

export const StaffReports: React.FC = () => {
  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const res = await request<any>('/staff/reports/summary');
      setData(res);
    } catch (err) {
      console.error('Failed to load reports', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
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
      <div className="bg-gradient-to-br from-orange-600 to-amber-600 text-white p-5 rounded-3xl shadow-lg space-y-1.5">
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

      {/* Top Served Dishes */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Utensils className="w-4 h-4 text-orange-600" />
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

      {/* Recent Settled Sessions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <h4 className="font-bold text-sm text-slate-900">Phiên đã thanh toán gần đây</h4>
        </div>

        <div className="divide-y divide-slate-100">
          {(data?.recentSettledSessions || []).map((s: any, idx: number) => (
            <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-slate-900">Bàn {s.table_number}</span>
                <span className="text-slate-400 block text-[11px]">
                  Xác nhận bởi {s.confirmed_by_name} • {new Date(s.confirmed_at).toLocaleTimeString('vi-VN')}
                </span>
              </div>
              <span className="font-extrabold text-sm text-emerald-700">
                {Number(s.confirmed_amount).toLocaleString('vi-VN')}đ
              </span>
            </div>
          ))}

          {(!data?.recentSettledSessions || data.recentSettledSessions.length === 0) && (
            <p className="text-xs text-slate-400 py-3 text-center">Chưa có phiên nào được thanh toán</p>
          )}
        </div>
      </div>
    </div>
  );
};
