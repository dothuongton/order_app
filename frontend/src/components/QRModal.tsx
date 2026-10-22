import React, { useEffect, useState } from 'react';
import { request } from '../api/client.js';
import { QrCode, X, ExternalLink, Download } from 'lucide-react';

interface QRModalProps {
  tableId: string | null;
  onClose: () => void;
}

export const QRModal: React.FC<QRModalProps> = ({ tableId, onClose }) => {
  const [data, setData] = useState<{ tableNumber: string; publicQrId: string; qrUrl: string; dataUrl: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tableId) return;
    const fetchQR = async () => {
      setIsLoading(true);
      try {
        const res = await request<any>(`/staff/tables/${tableId}/qr-code`);
        setData(res);
      } catch (err) {
        console.error('Failed to load QR code', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQR();
  }, [tableId]);

  if (!tableId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-scale-in staff-density-modal">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-orange-600" />
            <h3 className="font-extrabold text-slate-900 text-base">Mã QR Bàn {data?.tableNumber || '--'}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="p-3 bg-white border-2 border-slate-100 rounded-2xl shadow-inner inline-block">
              <img src={data.dataUrl} alt={`Mã QR Bàn ${data.tableNumber}`} className="w-56 h-56 mx-auto rounded-lg" />
            </div>

            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Khách dùng camera điện thoại quét mã QR này để mở trang gọi món trực tiếp.
            </p>

            <div className="flex gap-2 pt-2">
              <a
                href={data.qrUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 px-3 bg-[var(--brand-accent-tint)] hover:bg-[var(--brand-accent-strong)] text-[var(--brand-accent-dark)] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition min-h-[44px]"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Mở thử trang khách</span>
              </a>
              <a
                href={data.dataUrl}
                download={`QR_Ban_${data.tableNumber}.png`}
                className="py-2.5 px-4 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-dark)] text-[var(--brand-on-accent)] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                <span>Tải ảnh</span>
              </a>
            </div>
          </div>
        ) : (
          <p className="text-xs text-rose-500 py-6">Không tải được mã QR</p>
        )}
      </div>
    </div>
  );
};
