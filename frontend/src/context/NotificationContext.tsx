import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bell, CheckCircle2, AlertTriangle, AlertCircle, X, Volume2 } from 'lucide-react';

export interface ToastNotification {
  id: string;
  title: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  createdAt: number;
}

interface NotificationContextType {
  socket: Socket | null;
  soundEnabled: boolean;
  isAudioUnlocked: boolean;
  unlockAudio: () => void;
  toggleSound: () => void;
  playOrderSound: () => void;
  playAlertSound: () => void;
  playSuccessSound: () => void;
  testSound: () => void;
  toasts: ToastNotification[];
  showToast: (toast: {
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
  }) => void;
  removeToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

// Global persistent AudioContext singleton
let globalAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!globalAudioCtx) {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      globalAudioCtx = new AudioCtxClass();
    }
  }
  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('sound_enabled') !== 'false';
  });
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const timeoutsRef = useRef<Map<string, any>>(new Map());

  // Socket connection
  useEffect(() => {
    const socketBase = (import.meta as any).env?.VITE_SOCKET_URL || (import.meta as any).env?.VITE_API_URL || undefined;
    const newSocket = io(socketBase, {
      transports: ['websocket', 'polling'],
      autoConnect: true
    });
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Unlock audio context on user gesture (click or touch)
  const unlockAudio = useCallback(() => {
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => setIsAudioUnlocked(true)).catch(() => {});
      } else if (ctx.state === 'running') {
        setIsAudioUnlocked(true);
      }
    }
  }, []);

  useEffect(() => {
    const handleUserGesture = () => {
      unlockAudio();
    };

    window.addEventListener('click', handleUserGesture, { once: false, passive: true });
    window.addEventListener('touchstart', handleUserGesture, { once: false, passive: true });
    window.addEventListener('keydown', handleUserGesture, { once: false, passive: true });

    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, [unlockAudio]);

  const toggleSound = () => {
    unlockAudio();
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('sound_enabled', String(next));
    if (next) {
      playAlertSound();
      showToast({
        title: 'Đã bật âm thanh thông báo',
        type: 'info',
        duration: 2500
      });
    } else {
      showToast({
        title: 'Đã tắt âm thanh thông báo',
        type: 'warning',
        duration: 2500
      });
    }
  };

  // Toast Management
  const removeToast = useCallback((id: string) => {
    const timer = timeoutsRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutsRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(({
    title,
    message,
    type = 'info',
    duration = 4500
  }: {
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
  }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastNotification = {
      id,
      title,
      message,
      type,
      duration,
      createdAt: Date.now()
    };

    setToasts(prev => [newToast, ...prev].slice(0, 5)); // Keep max 5 visible

    if (duration > 0) {
      const timer = setTimeout(() => {
        removeToast(id);
      }, duration);
      timeoutsRef.current.set(id, timer);
    }
  }, [removeToast]);

  // Synthesis helper: play harmonic bell note
  const playHarmonicNote = (
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    gainLevel: number
  ) => {
    // Fundamental oscillator (sine)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);

    gain1.gain.setValueAtTime(gainLevel, startTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(startTime);
    osc1.stop(startTime + duration);

    // Subtle overtone (triangle) for realistic chime timbre
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    gain2.gain.setValueAtTime(gainLevel * 0.25, startTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(startTime);
    osc2.stop(startTime + duration * 0.7);
  };

  // 1. New Order Sound for Staff: Bright, cheerful, loud 2-phrase ascending chime
  const playOrderSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      // Phrase 1: C5 -> E5 -> G5
      playHarmonicNote(ctx, 523.25, now, 0.45, 0.55);
      playHarmonicNote(ctx, 659.25, now + 0.15, 0.45, 0.55);
      playHarmonicNote(ctx, 783.99, now + 0.30, 0.65, 0.60);

      // Phrase 2 (Repeat with higher emphasis): C5 -> E5 -> C6 (High Bell)
      playHarmonicNote(ctx, 523.25, now + 0.65, 0.45, 0.55);
      playHarmonicNote(ctx, 659.25, now + 0.80, 0.45, 0.55);
      playHarmonicNote(ctx, 1046.50, now + 0.95, 0.80, 0.65);
    } catch {
      // Audio autoplay policy might restrict if not clicked yet
    }
  }, [soundEnabled]);

  // 2. Alert Sound for Service Request / Bill Payment: Distinct high-attention Ding-Dong
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      // Ding-Dong 1
      playHarmonicNote(ctx, 880.00, now, 0.35, 0.65); // A5
      playHarmonicNote(ctx, 587.33, now + 0.20, 0.60, 0.60); // D5

      // Ding-Dong 2
      playHarmonicNote(ctx, 880.00, now + 0.60, 0.35, 0.65); // A5
      playHarmonicNote(ctx, 587.33, now + 0.80, 0.70, 0.60); // D5
    } catch {
      // Audio autoplay policy
    }
  }, [soundEnabled]);

  // 3. Success Sound: Quick pleasant confirmation
  const playSuccessSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      playHarmonicNote(ctx, 587.33, now, 0.3, 0.45);
      playHarmonicNote(ctx, 880.00, now + 0.12, 0.5, 0.5);
    } catch {
      // Audio autoplay policy
    }
  }, [soundEnabled]);

  // Test sound function
  const testSound = useCallback(() => {
    unlockAudio();
    playOrderSound();
    showToast({
      title: '🔊 Thử nghiệm âm thanh chuông',
      message: 'Chuông báo đơn mới đã phát thành công!',
      type: 'info',
      duration: 3500
    });
  }, [unlockAudio, playOrderSound, showToast]);

  return (
    <NotificationContext.Provider
      value={{
        socket,
        soundEnabled,
        isAudioUnlocked,
        unlockAudio,
        toggleSound,
        playOrderSound,
        playAlertSound,
        playSuccessSound,
        testSound,
        toasts,
        showToast,
        removeToast
      }}
    >
      {children}

      {/* FLOATING TOAST NOTIFICATIONS (THÔNG BÁO NỔI) */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-sm px-3.5 z-[9999] pointer-events-none flex flex-col gap-2.5"
        role="region"
        aria-live="polite"
      >
        {toasts.map(toast => {
          const type = toast.type || 'info';

          const getStyle = () => {
            switch (type) {
              case 'success':
                return {
                  bg: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100',
                  icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                };
              case 'warning':
                return {
                  bg: 'bg-amber-950/95 border-amber-500/40 text-amber-100',
                  icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                };
              case 'error':
                return {
                  bg: 'bg-rose-950/95 border-rose-500/40 text-rose-100',
                  icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                };
              case 'info':
              default:
                return {
                  bg: 'bg-slate-900/95 border-orange-500/40 text-slate-100',
                  icon: <Bell className="w-5 h-5 text-orange-400 shrink-0 animate-bounce" />
                };
            }
          };

          const style = getStyle();

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl p-3.5 shadow-2xl backdrop-blur-md border flex items-start gap-3 transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-4 ${style.bg}`}
            >
              <div className="pt-0.5">{style.icon}</div>
              <div className="flex-1 min-w-0 pr-1">
                <h4 className="text-xs font-extrabold text-white leading-snug">{toast.title}</h4>
                {toast.message && (
                  <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed break-words">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition shrink-0 min-h-[32px] min-w-[32px] flex items-center justify-center -mr-1 -mt-1"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within NotificationProvider');
  return context;
};
