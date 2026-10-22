import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart3,
    Calendar,
    Store,
    DollarSign,
    ShoppingBag,
    TrendingUp,
    Receipt,
    Tag,
    AlertCircle,
    Loader2
} from 'lucide-react';
import { AdminApi } from '../../api/admin.js';
import { AdminAnalyticsResponse, ShopSummary } from '../../types/admin.js';

interface AnalyticsViewProps {
    shops?: ShopSummary[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ shops = [] }) => {
    // Quick date presets
    const [preset, setPreset] = useState<'7days' | '30days' | 'today' | 'custom'>('7days');
    const [selectedShopId, setSelectedShopId] = useState<string>('all');

    // Calculate dates based on preset
    const { fromDate, toDate } = useMemo(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (preset === 'today') {
            return { fromDate: todayStr, toDate: todayStr };
        }

        if (preset === '30days') {
            const d = new Date();
            d.setDate(d.getDate() - 29);
            const fromY = d.getFullYear();
            const fromM = String(d.getMonth() + 1).padStart(2, '0');
            const fromD = String(d.getDate()).padStart(2, '0');
            return { fromDate: `${fromY}-${fromM}-${fromD}`, toDate: todayStr };
        }

        if (preset === '7days') {
            const d = new Date();
            d.setDate(d.getDate() - 6);
            const fromY = d.getFullYear();
            const fromM = String(d.getMonth() + 1).padStart(2, '0');
            const fromD = String(d.getDate()).padStart(2, '0');
            return { fromDate: `${fromY}-${fromM}-${fromD}`, toDate: todayStr };
        }

        return { fromDate: '', toDate: '' };
    }, [preset]);

    const [customFrom, setCustomFrom] = useState<string>('');
    const [customTo, setCustomTo] = useState<string>('');

    const effectiveFrom = preset === 'custom' ? customFrom : fromDate;
    const effectiveTo = preset === 'custom' ? customTo : toDate;

    const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Validate dates before request
    const isDateRangeInvalid = useMemo(() => {
        if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
            return true;
        }
        return false;
    }, [effectiveFrom, effectiveTo]);

    useEffect(() => {
        if (isDateRangeInvalid) {
            setError('Khoảng thời gian không hợp lệ: ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError(null);

        const params: { tenantId?: string; from?: string; to?: string } = {};
        if (selectedShopId !== 'all') params.tenantId = selectedShopId;
        if (effectiveFrom) params.from = effectiveFrom;
        if (effectiveTo) params.to = effectiveTo;

        AdminApi.getAnalytics(params)
            .then(res => {
                if (isMounted) {
                    setData(res);
                    setLoading(false);
                }
            })
            .catch(err => {
                if (isMounted) {
                    setError(err.message || 'Không thể tải dữ liệu phân tích.');
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [selectedShopId, effectiveFrom, effectiveTo, isDateRangeInvalid]);

    const formatVnd = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    // Calculate max value for visual CSS bar chart
    const maxDailyRevenue = useMemo(() => {
        if (!data || data.dailyBreakdown.length === 0) return 0;
        return Math.max(...data.dailyBreakdown.map(d => d.netAmount), 1);
    }, [data]);

    return (
        <div className="max-w-6xl space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                        HỆ THỐNG PHÂN TÍCH DOANH THU
                    </span>
                    <h2 className="text-3xl font-extrabold text-slate-900 mt-1">Analytics Kinh Doanh</h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Dữ liệu đối soát thực tế từ read-model doanh thu theo ngày và từng quán.
                    </p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Shop selector */}
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-xs text-sm">
                        <Store className="w-4 h-4 text-slate-400" />
                        <select
                            aria-label="Chọn quán để phân tích"
                            value={selectedShopId}
                            onChange={(e) => setSelectedShopId(e.target.value)}
                            className="bg-transparent text-slate-700 font-medium focus:outline-hidden cursor-pointer"
                        >
                            <option value="all">Toàn nền tảng (Tất cả quán)</option>
                            {shops.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Preset buttons */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-2xl text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setPreset('today')}
                            className={`px-3 py-1.5 rounded-xl transition-all ${preset === 'today' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Hôm nay
                        </button>
                        <button
                            type="button"
                            onClick={() => setPreset('7days')}
                            className={`px-3 py-1.5 rounded-xl transition-all ${preset === '7days' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            7 ngày qua
                        </button>
                        <button
                            type="button"
                            onClick={() => setPreset('30days')}
                            className={`px-3 py-1.5 rounded-xl transition-all ${preset === '30days' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            30 ngày qua
                        </button>
                        <button
                            type="button"
                            onClick={() => setPreset('custom')}
                            className={`px-3 py-1.5 rounded-xl transition-all ${preset === 'custom' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Tuỳ chọn
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom Date Range Pickers (if custom preset) */}
            {preset === 'custom' && (
                <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex flex-wrap items-center gap-4 text-sm shadow-xs">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-700">Từ ngày:</span>
                        <input
                            type="date"
                            value={customFrom}
                            onChange={(e) => setCustomFrom(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-700">Đến ngày:</span>
                        <input
                            type="date"
                            value={customTo}
                            onChange={(e) => setCustomTo(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                        />
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Loading State */}
            {loading ? (
                <div className="p-12 bg-white rounded-3xl border border-slate-200/80 flex flex-col items-center justify-center space-y-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-slate-500 text-sm font-medium">Đang truy vấn số liệu analytics...</p>
                </div>
            ) : data ? (
                <div className="space-y-6">
                    {/* Summary KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* Net Revenue */}
                        <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
                            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                                Doanh thu thực nhận
                            </div>
                            <div className="text-2xl font-black text-slate-900">
                                {formatVnd(data.summary.totalNetAmount)}
                            </div>
                            <p className="text-xs text-slate-400">Doanh thu sau chiết khấu</p>
                        </div>

                        {/* Gross Revenue */}
                        <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
                            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                <Receipt className="w-4 h-4 text-blue-600" />
                                Doanh thu gộp
                            </div>
                            <div className="text-2xl font-black text-slate-900">
                                {formatVnd(data.summary.totalGrossAmount)}
                            </div>
                            <p className="text-xs text-slate-400">Giá niêm yết trước giảm giá</p>
                        </div>

                        {/* Total Discount */}
                        <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
                            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                <Tag className="w-4 h-4 text-amber-600" />
                                Tổng giảm giá
                            </div>
                            <div className="text-2xl font-black text-slate-900">
                                {formatVnd(data.summary.totalDiscountAmount)}
                            </div>
                            <p className="text-xs text-slate-400">Khuyến mãi & ưu đãi áp dụng</p>
                        </div>

                        {/* Confirmed Sessions */}
                        <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
                            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                <TrendingUp className="w-4 h-4 text-indigo-600" />
                                Lượt thanh toán
                            </div>
                            <div className="text-2xl font-black text-slate-900">
                                {data.summary.totalConfirmedSessions.toLocaleString('vi-VN')}
                            </div>
                            <p className="text-xs text-slate-400">Số phiên bàn chốt hoá đơn</p>
                        </div>

                        {/* Order Items */}
                        <div className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
                            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                <ShoppingBag className="w-4 h-4 text-purple-600" />
                                Số món phục vụ
                            </div>
                            <div className="text-2xl font-black text-slate-900">
                                {data.summary.totalOrderItems.toLocaleString('vi-VN')}
                            </div>
                            <p className="text-xs text-slate-400">Tổng số lượng món ăn đã gọi</p>
                        </div>
                    </div>

                    {/* Zero-data check */}
                    {data.dailyBreakdown.length === 0 ? (
                        <div className="p-12 bg-white rounded-3xl border border-slate-200/80 text-center space-y-3">
                            <BarChart3 className="w-12 h-12 text-slate-300 mx-auto" />
                            <h4 className="text-base font-bold text-slate-800">Chưa có dữ liệu kinh doanh</h4>
                            <p className="text-slate-500 text-sm max-w-md mx-auto">
                                Không có giao dịch thanh toán hoặc bản ghi doanh thu nào trong khoảng thời gian đã chọn.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Visual Trend Bars (CSS-based, no external chart lib) */}
                            <div className="p-6 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                                            <BarChart3 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-base font-bold text-slate-900">Biểu đồ Doanh thu theo Ngày</h4>
                                            <p className="text-xs text-slate-400">Tỷ lệ doanh thu ròng mỗi ngày trong khoảng thời gian lọc</p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">
                                        {data.dailyBreakdown.length} ngày ghi nhận
                                    </span>
                                </div>

                                <div className="space-y-3 pt-2">
                                    {data.dailyBreakdown.map(item => {
                                        const pct = Math.max(4, Math.round((item.netAmount / maxDailyRevenue) * 100));
                                        return (
                                            <div key={item.date} className="space-y-1">
                                                <div className="flex justify-between text-xs text-slate-600 font-medium">
                                                    <span>{item.date}</span>
                                                    <span className="font-bold text-slate-900">
                                                        {formatVnd(item.netAmount)} ({item.confirmedSessionsCount} lượt)
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                                    <div
                                                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Daily Breakdown Table */}
                            <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-xs">
                                <div className="p-6 border-b border-slate-100">
                                    <h4 className="text-base font-bold text-slate-900">Chi tiết Doanh thu theo Ngày</h4>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-600">
                                        <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-100">
                                            <tr>
                                                <th className="py-3 px-6">Ngày</th>
                                                <th className="py-3 px-6 text-right">Lượt thanh toán</th>
                                                <th className="py-3 px-6 text-right">Doanh thu gộp</th>
                                                <th className="py-3 px-6 text-right">Giảm giá</th>
                                                <th className="py-3 px-6 text-right">Doanh thu thực nhận</th>
                                                <th className="py-3 px-6 text-right">Món phục vụ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {data.dailyBreakdown.map((row) => (
                                                <tr key={row.date} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="py-3 px-6 font-semibold text-slate-900">{row.date}</td>
                                                    <td className="py-3 px-6 text-right font-medium">{row.confirmedSessionsCount}</td>
                                                    <td className="py-3 px-6 text-right font-medium">{formatVnd(row.grossAmount)}</td>
                                                    <td className="py-3 px-6 text-right text-amber-600 font-medium">-{formatVnd(row.discountAmount)}</td>
                                                    <td className="py-3 px-6 text-right font-bold text-emerald-600">{formatVnd(row.netAmount)}</td>
                                                    <td className="py-3 px-6 text-right font-medium">{row.orderItemsCount}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Top Shops Leaderboard (only if viewing all shops) */}
                            {selectedShopId === 'all' && data.topShops.length > 0 && (
                                <div className="p-6 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                                    <h4 className="text-base font-bold text-slate-900">Top Quán Doanh Thu Cao Nhất</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {data.topShops.map((shop, idx) => (
                                            <div key={shop.tenantId} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                                                        #{idx + 1}
                                                    </span>
                                                    <span className="text-xs text-slate-500 font-medium">
                                                        {shop.confirmedSessions} lượt chốt
                                                    </span>
                                                </div>
                                                <div className="font-bold text-slate-900 truncate" title={shop.shopName}>
                                                    {shop.shopName}
                                                </div>
                                                <div className="text-base font-extrabold text-emerald-600">
                                                    {formatVnd(shop.netRevenue)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ) : null}
        </div>
    );
};
