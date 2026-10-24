import React from 'react';
import { StaffTheme, StaffDensity, getStaffThemeCssVars, contrastRatio, accentTextColor, readableForeground } from '../../lib/theme.js';
import { Store, UtensilsCrossed, LayoutGrid, Bell, Settings, CheckCircle2, Clock } from 'lucide-react';

interface StaffThemePreviewProps {
  theme: StaffTheme;
  density: StaffDensity;
  storeName?: string;
}

export const StaffThemePreview: React.FC<StaffThemePreviewProps> = ({
  theme,
  density,
  storeName = 'Nhà Hàng Phố Cổ'
}) => {
  const cssVars = getStaffThemeCssVars(theme, density);
  const textContrast = contrastRatio(accentTextColor(theme.accentColor), '#ffffff').toFixed(1);
  const fg = readableForeground(theme.accentColor);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold px-1">
        <span>Xem trước giao diện nhân viên & POS</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>WCAG AA ({textContrast}:1)</span>
          </span>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            Chữ nút: {fg === '#ffffff' ? 'Trắng' : 'Đen'}
          </span>
        </div>
      </div>

      {/* Mock Phone / POS Screen Container */}
      <div
        className={`staff-portal bg-[var(--brand-surface-soft)] text-[var(--brand-text)] rounded-2xl border border-slate-300 overflow-hidden shadow-inner flex flex-col ${
          density === 'compact' ? '' : 'density-comfortable'
        }`}
        style={cssVars as React.CSSProperties}
      >
        {/* Mock Top Header */}
        <div className="bg-[var(--brand-accent-dark)] text-white px-3 py-2 flex items-center justify-between gap-2 border-b border-[var(--brand-line)]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[var(--brand-accent)] flex items-center justify-center font-black shrink-0 text-[var(--brand-on-accent)]">
              <Store className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs truncate leading-tight">{storeName}</div>
              <div className="text-[9px] text-slate-300">
                <span>Thu ngân</span>
                <span className="mx-1">•</span>
                <span className="text-[var(--brand-on-accent)] font-bold">Quản lý</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] font-bold px-2 py-1 bg-[var(--brand-accent)] rounded-lg text-[var(--brand-on-accent)]">
            19:30
          </div>
        </div>

        {/* Mock Content Body */}
        <div className="p-3 space-y-2.5">
          {/* Mock Order Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs space-y-2.5 staff-density-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 text-xs sm:text-sm">Bàn A02</span>
                <span className="text-[10px] font-bold bg-[var(--brand-accent-tint)] text-[var(--brand-accent-dark)] px-2 py-0.5 rounded-full border border-[var(--brand-line)]">
                  2 món mới
                </span>
              </div>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>3 phút trước</span>
              </span>
            </div>

            <div className="space-y-1 text-xs border-y border-slate-100 py-1.5">
              <div className="flex justify-between items-center text-slate-800">
                <span>1x Phở bò đặc biệt</span>
                <span className="font-bold">85.000đ</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span>1x Trà đá chanh sả</span>
                <span className="font-bold">15.000đ</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                className="flex-1 py-1.5 px-3 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] text-[var(--brand-on-accent)] font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Nhận làm món</span>
              </button>
              <button
                type="button"
                className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Chi tiết
              </button>
            </div>
          </div>
        </div>

        {/* Mock Bottom Navigation */}
        <div className="bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-sm">
          <div className="flex flex-col items-center justify-center flex-1 py-1 text-slate-400">
            <LayoutGrid className="w-4 h-4" />
            <span className="text-[9px] mt-0.5 font-medium">Bàn</span>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 py-1 text-[var(--brand-accent-text)] bg-[var(--brand-accent-tint)] rounded-lg font-bold">
            <UtensilsCrossed className="w-4 h-4" />
            <span className="text-[9px] mt-0.5">Đơn món</span>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 py-1 text-slate-400">
            <Bell className="w-4 h-4" />
            <span className="text-[9px] mt-0.5 font-medium">Hỗ trợ</span>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 py-1 text-slate-400">
            <Settings className="w-4 h-4" />
            <span className="text-[9px] mt-0.5 font-medium">Thiết lập</span>
          </div>
        </div>
      </div>
    </div>
  );
};
