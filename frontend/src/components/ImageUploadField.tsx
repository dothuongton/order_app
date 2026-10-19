import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, Link2 } from 'lucide-react';
import { request } from '../api/client.js';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  aspectRatio?: 'square' | 'video' | 'banner';
  helperText?: string;
}

/**
 * Client-side canvas resizer to quickly shrink raw high-res camera photos (10MB+)
 * down to ~150KB optimized WebP/JPEG in milliseconds before sending over network.
 */
async function compressImage(file: File, maxDimension = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Prefer webp, fallback to jpeg
        try {
          const webpData = canvas.toDataURL('image/webp', quality);
          if (webpData.startsWith('data:image/webp')) {
            resolve(webpData);
            return;
          }
        } catch {
          // fallback
        }
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  value,
  onChange,
  aspectRatio = 'video',
  helperText
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Vui lòng chọn file hình ảnh (JPG, PNG, WEBP)');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      // 1. Client-side canvas compression (instant and preserves bandwidth)
      const compressedBase64 = await compressImage(file);

      // 2. Upload to database-persisted backend endpoint
      const res = await request<{ url: string }>('/cms/upload', {
        method: 'POST',
        body: JSON.stringify({
          data: compressedBase64,
          filename: file.name
        })
      });

      if (res && res.url) {
        onChange(res.url);
      }
    } catch (err: any) {
      console.error('Image upload failed:', err);
      setErrorMsg(err.message || 'Lỗi tải ảnh lên. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
      // Reset input so re-selecting same file triggers change
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const aspectClass =
    aspectRatio === 'square'
      ? 'w-24 h-24 aspect-square max-w-[100px] max-h-[100px]'
      : aspectRatio === 'banner'
      ? 'w-full max-h-36 sm:max-h-40 aspect-[21/9]'
      : 'w-full max-h-36 sm:max-h-40 aspect-[16/9]';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-slate-700 font-semibold text-xs">{label}</label>
        <button
          type="button"
          onClick={() => setShowManualUrl(!showManualUrl)}
          className="text-[11px] text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 transition"
        >
          <Link2 className="w-3 h-3" />
          <span>{showManualUrl ? 'Ẩn nhập URL' : 'Hoặc nhập link URL'}</span>
        </button>
      </div>

      {helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}

      {/* Main Upload / Preview Box */}
      <div className="space-y-2">
        {value ? (
          <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200 flex flex-col sm:flex-row items-center gap-3">
            <div className={`${aspectClass} rounded-xl bg-slate-200 overflow-hidden relative border border-slate-200 shrink-0 flex items-center justify-center`}>
              <img
                src={value}
                alt={label}
                className="w-full h-full max-h-36 sm:max-h-40 object-cover rounded-xl"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="flex-1 w-full flex flex-col justify-between py-1 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Ảnh đã được thiết lập</span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono truncate max-w-[240px] sm:max-w-[280px]">
                {value}
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5 text-orange-600" />
                  <span>Thay ảnh khác</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="py-1.5 px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl font-bold text-xs transition flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Xóa ảnh</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed border-slate-300 hover:border-orange-500 bg-slate-50 hover:bg-orange-50/40 rounded-2xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[110px] space-y-2 ${
              isUploading ? 'opacity-70 pointer-events-none' : ''
            }`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-2 text-orange-600">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs font-bold">Đang tải và tối ưu ảnh...</span>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shadow-xs">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Bấm để tải ảnh từ máy hoặc chụp ảnh
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Hỗ trợ JPG, PNG, WEBP (Tự động nén tối ưu dung lượng)
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Manual URL Input (Collapsible) */}
        {showManualUrl && (
          <div className="pt-1">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://images.unsplash.com/... hoặc /api/v1/public/images/..."
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-mono focus:outline-hidden focus:border-orange-500"
            />
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <p className="text-[11px] text-rose-600 font-semibold">{errorMsg}</p>
        )}
      </div>
    </div>
  );
};
