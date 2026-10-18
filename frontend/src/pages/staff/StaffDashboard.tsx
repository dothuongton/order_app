import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useNotification } from '../../context/NotificationContext.js';
import { request } from '../../api/client.js';
import { StaffTable, ServiceRequest } from '../../types/index.js';
import { TableDetailModal } from './TableDetailModal.js';
import { QRModal } from '../../components/QRModal.js';
import { StaffReports } from './StaffReports.js';
import { StaffMenuManage } from './StaffMenuManage.js';
import {
  Store, Volume2, VolumeX, LogOut, LayoutGrid, UtensilsCrossed,
  Bell, BarChart2, Plus, QrCode, CheckCircle2, Clock, Check,
  CreditCard, Sparkles, RefreshCw
} from 'lucide-react';

export const StaffDashboard: React.FC = () => {
  const { user, currentTenant, logout, hasPermission } = useAuth();
  const { socket, soundEnabled, toggleSound, playOrderSound, playAlertSound } = useNotification();

  const [activeTab, setActiveTab] = useState<'tables' | 'orders' | 'requests' | 'reports' | 'menu'>('tables');
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [openRequests, setOpenRequests] = useState<ServiceRequest[]>([]);
  const [selectedTable, setSelectedTable] = useState<StaffTable | null>(null);
  const [selectedQrTableId, setSelectedQrTableId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await request<{ tables: StaffTable[]; openRequests: ServiceRequest[] }>('/staff/dashboard/snapshot');
      setTables(data.tables || []);
      setOpenRequests(data.openRequests || []);
    } catch (err) {
      console.error('Failed to fetch dashboard', err);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Connect to staff socket room
  useEffect(() => {
    if (!socket || !currentTenant?.id) return;

    socket.emit('join_staff_room', currentTenant.id);

    const handleOrderCreated = () => {
      playOrderSound();
      fetchDashboard();
    };

    const handleServiceRequestCreated = (payload: any) => {
      playAlertSound();
      fetchDashboard();
    };

    const handleUpdate = () => {
      fetchDashboard();
    };

    socket.on('order.created', handleOrderCreated);
    socket.on('order.updated', handleUpdate);
    socket.on('service_request.created', handleServiceRequestCreated);
    socket.on('service_request.updated', handleUpdate);
    socket.on('table.updated', handleUpdate);

    // Polling sync fallback every 15s (section 12.1)
    const interval = setInterval(fetchDashboard, 15000);

    return () => {
      socket.off('order.created', handleOrderCreated);
      socket.off('order.updated', handleUpdate);
      socket.off('service_request.created', handleServiceRequestCreated);
      socket.off('service_request.updated', handleUpdate);
      socket.off('table.updated', handleUpdate);
      clearInterval(interval);
    };
  }, [socket, currentTenant?.id, playOrderSound, playAlertSound, fetchDashboard]);

  // Quick Open Session (F01)
  const handleQuickOpenSession = async (tableId: string) => {
    try {
      await request(`/staff/tables/${tableId}/open`, { method: 'POST' });
      fetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Lỗi mở phiên');
    }
  };

  // Quick Service Request Actions
  const handleAcceptRequest = async (id: string) => {
    try {
      await request(`/staff/service-requests/${id}/accept`, { method: 'POST' });
      fetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Lỗi tiếp nhận');
    }
  };

  const handleCompleteRequest = async (id: string) => {
    try {
      await request(`/staff/service-requests/${id}/complete`, { method: 'POST' });
      fetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Lỗi hoàn tất');
    }
  };

  const pendingOrdersCount = tables.reduce((sum, t) => sum + (t.counts?.pending || 0), 0);
  const checkoutRequestsCount = openRequests.filter(r => r.type === 'CHECKOUT').length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col max-w-lg mx-auto shadow-2xl pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 py-3 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center font-black">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm leading-tight">{currentTenant?.name || 'Nhà Hàng'}</h1>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>{user?.fullName}</span>
              <span className="w-1 h-1 rounded-full bg-slate-500"></span>
              <span className="capitalize text-orange-400 font-semibold">{currentTenant?.role}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Audio Chime Toggle Button */}
          <button
            onClick={toggleSound}
            className={`p-2 rounded-xl transition min-h-[44px] min-w-[44px] flex items-center justify-center ${
              soundEnabled ? 'text-orange-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-800'
            }`}
            title={soundEnabled ? 'Âm thanh: Đang bật' : 'Âm thanh: Đang tắt'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center transition"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4 flex-1">
        {/* TAB 1: Tables Overview */}
        {activeTab === 'tables' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 text-lg">Danh sách bàn</h2>
                <p className="text-xs text-slate-500">Trạng thái thời gian thực của các bàn phục vụ</p>
              </div>
              <button
                onClick={fetchDashboard}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-white min-h-[44px] min-w-[44px] flex items-center justify-center transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Tables Grid */}
            <div className="grid grid-cols-2 gap-3">
              {tables.map((table) => {
                const isServing = !!table.active_session_id;
                const isNeedsCleaning = table.readiness === 'NEEDS_CLEANING';
                const hasPending = (table.counts?.pending || 0) > 0;
                const hasCheckout = table.hasCheckout;

                return (
                  <div
                    key={table.table_id}
                    className={`bg-white rounded-2xl p-3.5 border transition shadow-xs flex flex-col justify-between min-h-[145px] ${
                      hasCheckout
                        ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-400/50 animate-pulse-attention'
                        : isServing
                        ? 'border-blue-200 hover:border-blue-300'
                        : isNeedsCleaning
                        ? 'border-purple-200 bg-purple-50/30'
                        : 'border-slate-200'
                    }`}
                  >
                    <div>
                      {/* Table Number & Status Pill */}
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900 text-lg">Bàn {table.table_number}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          hasCheckout ? 'bg-amber-500 text-white' :
                          isServing ? 'bg-blue-100 text-blue-800' :
                          isNeedsCleaning ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {table.displayStatus}
                        </span>
                      </div>

                      {/* Counts / Session info */}
                      {isServing ? (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs">
                            {hasPending ? (
                              <span className="font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-md text-[11px]">
                                {table.counts.pending} món chờ
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">
                                {table.counts.served + table.counts.accepted} món
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-slate-400">
                          {isNeedsCleaning ? 'Cần dọn bàn' : 'Bàn trống'}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 mt-2">
                      <button
                        onClick={() => setSelectedTable(table)}
                        className="flex-1 py-1.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl transition min-h-[36px]"
                      >
                        {isServing ? 'Xem đơn' : 'Chi tiết'}
                      </button>

                      {!isServing && table.readiness === 'READY' && hasPermission('session.open') && (
                        <button
                          onClick={() => handleQuickOpenSession(table.table_id)}
                          className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs min-h-[36px]"
                          title="Mở phiên bàn"
                        >
                          Mở
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedQrTableId(table.table_id)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 min-h-[36px] min-w-[36px] flex items-center justify-center border border-slate-200"
                        title="Xem mã QR"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: Orders / Kitchen Feed */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-extrabold text-slate-900 text-lg">Hàng đợi món gọi</h2>
              <p className="text-xs text-slate-500">Danh sách các món khách vừa gọi từ mọi bàn</p>
            </div>

            {tables.filter(t => t.active_session_id && (t.counts.pending > 0 || t.counts.accepted > 0)).length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-6">
                <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <h3 className="font-bold text-slate-800">Không có món nào đang chờ</h3>
                <p className="text-xs text-slate-400 mt-1">Khi khách gọi món, các món sẽ xuất hiện ngay tại đây</p>
              </div>
            ) : (
              tables
                .filter(t => t.active_session_id && (t.counts.pending > 0 || t.counts.accepted > 0))
                .map((table) => (
                  <div key={table.table_id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900">Bàn {table.table_number}</span>
                        {table.counts.pending > 0 && (
                          <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                            {table.counts.pending} món chờ tiếp nhận
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedTable(table)}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700"
                      >
                        Xử lý chi tiết &rarr;
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Đang phục vụ ({table.counts.accepted + table.counts.served} món đã duyệt)</span>
                      <button
                        onClick={() => setSelectedTable(table)}
                        className="px-3 py-1.5 bg-orange-50 text-orange-700 font-bold rounded-xl"
                      >
                        Mở đơn bàn
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* TAB 3: Service Requests Feed */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-extrabold text-slate-900 text-lg">Yêu cầu hỗ trợ & Thanh toán</h2>
              <p className="text-xs text-slate-500">Khách gọi nhân viên hoặc yêu cầu thanh toán</p>
            </div>

            {openRequests.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-6">
                <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <h3 className="font-bold text-slate-800">Không có yêu cầu nào</h3>
                <p className="text-xs text-slate-400 mt-1">Khi khách bấm gọi hoặc xin thanh toán sẽ hiện tại đây</p>
              </div>
            ) : (
              openRequests.map((req) => (
                <div
                  key={req.id}
                  className={`bg-white rounded-2xl p-4 border shadow-sm space-y-3 ${
                    req.type === 'CHECKOUT' ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-base">Bàn {req.table_number}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          req.type === 'CHECKOUT' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                        }`}>
                          {req.type === 'CHECKOUT' ? 'Yêu cầu thanh toán' : 'Gọi hỗ trợ'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-1">
                        Gửi lúc {new Date(req.created_at).toLocaleTimeString('vi-VN')}
                      </span>
                    </div>

                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      req.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {req.status === 'PENDING' ? 'Chưa nhận' : `Đã nhận (${req.accepted_by_name || 'NV'})`}
                    </span>
                  </div>

                  {req.note && (
                    <p className="text-xs text-slate-600 italic bg-white p-2 rounded-xl border border-slate-100">
                      Ghi chú: {req.note}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    {req.status === 'PENDING' && (
                      <button
                        onClick={() => handleAcceptRequest(req.id)}
                        className="flex-1 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs min-h-[44px]"
                      >
                        Tiếp nhận
                      </button>
                    )}

                    {req.type === 'ASSISTANCE' && (
                      <button
                        onClick={() => handleCompleteRequest(req.id)}
                        className="flex-1 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-xs min-h-[44px]"
                      >
                        Đã hỗ trợ xong
                      </button>
                    )}

                    {req.type === 'CHECKOUT' && (
                      <button
                        onClick={() => {
                          const table = tables.find(t => t.table_id === req.table_id);
                          if (table) setSelectedTable(table);
                        }}
                        className="flex-1 py-2 bg-orange-600 text-white font-bold text-xs rounded-xl shadow-xs min-h-[44px]"
                      >
                        Mở tổng bill bàn để thu tiền
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: Reports & Analytics */}
        {activeTab === 'reports' && <StaffReports />}

        {/* TAB 5: Menu Management */}
        {activeTab === 'menu' && <StaffMenuManage />}
      </main>

      {/* Staff Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-2 py-2 max-w-lg mx-auto flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('tables')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
            activeTab === 'tables' ? 'text-orange-600 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[11px] mt-1">Bàn</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative ${
            activeTab === 'orders' ? 'text-orange-600 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <UtensilsCrossed className="w-5 h-5" />
          <span className="text-[11px] mt-1">Đơn món</span>
          {pendingOrdersCount > 0 && (
            <span className="absolute top-1.5 right-6 px-1.5 py-0.2 bg-orange-600 text-white rounded-full text-[9px] font-black">
              {pendingOrdersCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition relative ${
            activeTab === 'requests' ? 'text-orange-600 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <Bell className="w-5 h-5" />
          <span className="text-[11px] mt-1">Hỗ trợ</span>
          {openRequests.length > 0 && (
            <span className="absolute top-1.5 right-6 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
            activeTab === 'reports' ? 'text-orange-600 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <BarChart2 className="w-5 h-5" />
          <span className="text-[11px] mt-1">Báo cáo</span>
        </button>

        <button
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl transition ${
            activeTab === 'menu' ? 'text-orange-600 font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <Store className="w-5 h-5" />
          <span className="text-[11px] mt-1">Menu</span>
        </button>
      </nav>

      {/* Table Detail Modal */}
      <TableDetailModal
        table={selectedTable}
        onClose={() => setSelectedTable(null)}
        onRefresh={fetchDashboard}
      />

      {/* QR Code Modal */}
      <QRModal
        tableId={selectedQrTableId}
        onClose={() => setSelectedQrTableId(null)}
      />
    </div>
  );
};
