import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface BannerItem {
  id?: string;
  title: string;
  description?: string;
  image_url?: string;
  imageUrl?: string;
  cta_link?: string;
  ctaLink?: string;
  isActive?: boolean;
  is_active?: boolean;
}

interface BannerDisplayProps {
  banners: BannerItem[];
  displayMode?: 'slide' | 'stack';
  className?: string;
}

export const BannerDisplay: React.FC<BannerDisplayProps> = ({
  banners,
  displayMode = 'stack',
  className = ''
}) => {
  const activeBanners = banners.filter(
    b => b.isActive !== false && b.is_active !== false
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Auto-advance slide every 4.5 seconds
  useEffect(() => {
    if (displayMode !== 'slide' || activeBanners.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % activeBanners.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [displayMode, activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex(prev => (prev + 1) % activeBanners.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 40) {
      // Swiped left -> next
      handleNext();
    } else if (diff < -40) {
      // Swiped right -> prev
      handlePrev();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const renderBannerContent = (banner: BannerItem) => {
    const img = banner.image_url || banner.imageUrl;
    const cta = banner.cta_link || banner.ctaLink;
    const hasCta = cta && /^(https?:\/\/|\/(?!\/))/.test(cta);

    if (img) {
      const content = (
        <div className="relative w-full h-full">
          <img
            src={img}
            alt={banner.title || 'Banner'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {hasCta && (
            <div className="absolute bottom-3 right-3 z-10">
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition active:scale-95 shadow-xs">
                <span>Xem chi tiết</span>
                <span aria-hidden="true">&rarr;</span>
              </span>
            </div>
          )}
        </div>
      );

      if (hasCta) {
        return (
          <a
            href={cta}
            target={cta.startsWith('http') ? '_blank' : undefined}
            rel={cta.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="block w-full h-full cursor-pointer"
          >
            {content}
          </a>
        );
      }

      return content;
    }

    // Fallback when no image is uploaded
    return (
      <div className="relative w-full h-full bg-gradient-to-br from-orange-600 via-amber-600 to-orange-700 p-4 flex flex-col justify-end">
        <h2 className="font-extrabold text-white text-sm sm:text-base leading-snug">
          {banner.title}
        </h2>
        {banner.description && (
          <p className="mt-1 text-xs text-slate-100 line-clamp-2">
            {banner.description}
          </p>
        )}
        {hasCta && (
          <div className="mt-2.5">
            <a
              href={cta}
              target={cta.startsWith('http') ? '_blank' : undefined}
              rel={cta.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-orange-700 font-bold text-xs transition active:scale-95"
            >
              <span>Xem chi tiết</span>
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        )}
      </div>
    );
  };

  // 1. CAROUSEL / SLIDE MODE
  if (displayMode === 'slide' && activeBanners.length > 1) {
    return (
      <div
        className={`relative rounded-2xl overflow-hidden aspect-[16/9] w-full bg-slate-100 border border-slate-200/60 select-none group ${className}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slides Track */}
        <div
          className="flex w-full h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {activeBanners.map((banner, idx) => (
            <div key={banner.id || idx} className="w-full h-full shrink-0">
              {renderBannerContent(banner)}
            </div>
          ))}
        </div>

        {/* Prev / Next Arrows */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Banner trước"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-xs transition sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Banner kế tiếp"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-xs transition sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Pagination Dots */}
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10 pointer-events-auto">
          {activeBanners.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Chuyển tới banner ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                currentIndex === idx
                  ? 'w-5 bg-white'
                  : 'w-1.5 bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  // 2. STACK MODE (Single / Stacked Images)
  return (
    <div className={`space-y-3 ${className}`}>
      {activeBanners.map((banner, idx) => (
        <article
          key={banner.id || idx}
          className="relative rounded-2xl overflow-hidden aspect-[16/9] w-full bg-slate-100 border border-slate-200/60"
        >
          {renderBannerContent(banner)}
        </article>
      ))}
    </div>
  );
};
