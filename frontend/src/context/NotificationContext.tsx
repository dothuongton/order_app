import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bell, CheckCircle2, AlertTriangle, AlertCircle, X, Volume2, Mic, VolumeX } from 'lucide-react';

export type SoundMode = 'voice' | 'chime' | 'off';

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
  soundMode: SoundMode;
  setSoundMode: (mode: SoundMode) => void;
  cycleSoundMode: () => void;
  isAudioUnlocked: boolean;
  unlockAudio: () => void;
  toggleSound: () => void;
  playOrderSound: (tableName?: string) => void;
  playAlertSound: (tableName?: string, requestType?: 'CHECKOUT' | 'ASSISTANCE') => void;
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
  
  // soundMode: 'voice' (default - nói tiếng Việt + chuông), 'chime' (chỉ chuông), 'off' (tắt)
  const [soundMode, setSoundModeState] = useState<SoundMode>(() => {
    const saved = localStorage.getItem('sound_mode') as SoundMode;
    if (saved === 'voice' || saved === 'chime' || saved === 'off') {
      return saved;
    }
    // Fallback legacy sound_enabled
    const legacyEnabled = localStorage.getItem('sound_enabled');
    if (legacyEnabled === 'false') return 'off';
    return 'voice'; // Default to voice as requested by user
  });

  const soundEnabled = soundMode !== 'off';
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const timeoutsRef = useRef<Map<string, any>>(new Map());

  // Socket connection
  useEffect(() => {
    let socketBase = (import.meta as any).env?.VITE_SOCKET_URL;
    if (!socketBase) {
      const apiUrl = (import.meta as any).env?.VITE_API_URL;
      if (apiUrl && typeof apiUrl === 'string' && apiUrl.startsWith('http')) {
        try {
          socketBase = new URL(apiUrl).origin;
        } catch {
          socketBase = undefined;
        }
      } else {
        socketBase = undefined;
      }
    }

    const newSocket = io(socketBase, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      timeout: 10000,
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

  // Speech synthesis helper in Vietnamese
  const speakVietnamese = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel(); // Stop ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find(v => v.lang === 'vi-VN' || v.lang.startsWith('vi'));
      if (viVoice) {
        utterance.voice = viVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis unavailable', e);
    }
  }, []);

  // Ensure voices are loaded
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Sound Mode Management
  const setSoundMode = useCallback((mode: SoundMode) => {
    unlockAudio();
    setSoundModeState(mode);
    localStorage.setItem('sound_mode', mode);
    localStorage.setItem('sound_enabled', String(mode !== 'off'));

    if (mode === 'voice') {
      speakVietnamese('Đã bật thông báo giọng nói tiếng Việt');
      showToast({
        title: '🗣️ Chế độ âm thanh: Giọng nói',
        message: 'Hệ thống sẽ đọc tên bàn khi khách đặt món hoặc gọi phục vụ',
        type: 'info',
        duration: 3000
      });
    } else if (mode === 'chime') {
      playAlertSoundTone();
      showToast({
        title: '🔔 Chế độ âm thanh: Chỉ chuông',
        message: 'Hệ thống sẽ phát chuông báo mặc định',
        type: 'info',
        duration: 3000
      });
    } else {
      showToast({
        title: '🔇 Đã tắt âm thanh thông báo',
        type: 'warning',
        duration: 2500
      });
    }
  }, [unlockAudio, speakVietnamese]);

  const cycleSoundMode = useCallback(() => {
    if (soundMode === 'voice') {
      setSoundMode('chime');
    } else if (soundMode === 'chime') {
      setSoundMode('off');
    } else {
      setSoundMode('voice');
    }
  }, [soundMode, setSoundMode]);

  const toggleSound = useCallback(() => {
    if (soundMode === 'off') {
      setSoundMode('voice');
    } else {
      setSoundMode('off');
    }
  }, [soundMode, setSoundMode]);

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

    setToasts(prev => [newToast, ...prev].slice(0, 5));

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

  // Pure chime tone helpers
  const playOrderSoundTone = () => {
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      playHarmonicNote(ctx, 523.25, now, 0.45, 0.55);
      playHarmonicNote(ctx, 659.25, now + 0.15, 0.45, 0.55);
      playHarmonicNote(ctx, 783.99, now + 0.30, 0.65, 0.60);

      playHarmonicNote(ctx, 523.25, now + 0.65, 0.45, 0.55);
      playHarmonicNote(ctx, 659.25, now + 0.80, 0.45, 0.55);
      playHarmonicNote(ctx, 1046.50, now + 0.95, 0.80, 0.65);
    } catch {}
  };

  const playAlertSoundTone = () => {
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      playHarmonicNote(ctx, 880.00, now, 0.35, 0.65);
      playHarmonicNote(ctx, 587.33, now + 0.20, 0.60, 0.60);

      playHarmonicNote(ctx, 880.00, now + 0.60, 0.35, 0.65);
      playHarmonicNote(ctx, 587.33, now + 0.80, 0.70, 0.60);
    } catch {}
  };

  // 1. New Order Notification (Voice or Chime)
  const playOrderSound = useCallback((tableName?: string) => {
    if (soundMode === 'off') return;

    if (soundMode === 'voice') {
      // Short introductory bell chime
      try {
        const ctx = getOrCreateAudioContext();
        if (ctx) {
          if (ctx.state === 'suspended') ctx.resume();
          playHarmonicNote(ctx, 659.25, ctx.currentTime, 0.3, 0.5);
          playHarmonicNote(ctx, 783.99, ctx.currentTime + 0.15, 0.4, 0.5);
        }
      } catch {}

      // Speech text in Vietnamese
      const spokenTable = tableName || 'Bàn';
      speakVietnamese(`${spokenTable} vừa đặt món`);
    } else {
      // Default Chime only
      playOrderSoundTone();
    }
  }, [soundMode, speakVietnamese]);

  // 2. Service Request Notification (Voice or Chime)
  const playAlertSound = useCallback((tableName?: string, requestType?: 'CHECKOUT' | 'ASSISTANCE') => {
    if (soundMode === 'off') return;

    if (soundMode === 'voice') {
      try {
        const ctx = getOrCreateAudioContext();
        if (ctx) {
          if (ctx.state === 'suspended') ctx.resume();
          playHarmonicNote(ctx, 880.00, ctx.currentTime, 0.3, 0.55);
          playHarmonicNote(ctx, 587.33, ctx.currentTime + 0.15, 0.4, 0.55);
        }
      } catch {}

      const spokenTable = tableName || 'Bàn';
      if (requestType === 'CHECKOUT') {
        speakVietnamese(`${spokenTable} yêu cầu thanh toán`);
      } else {
        speakVietnamese(`${spokenTable} yêu cầu hỗ trợ`);
      }
    } else {
      // Default Chime only
      playAlertSoundTone();
    }
  }, [soundMode, speakVietnamese]);

  // 3. Success Sound
  const playSuccessSound = useCallback(() => {
    if (soundMode === 'off') return;
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      playHarmonicNote(ctx, 587.33, now, 0.3, 0.45);
      playHarmonicNote(ctx, 880.00, now + 0.12, 0.5, 0.5);
    } catch {}
  }, [soundMode]);

  // Test sound function
  const testSound = useCallback(() => {
    unlockAudio();
    if (soundMode === 'voice') {
      playOrderSound('Bàn số 1');
      showToast({
        title: '🗣️ Thử giọng nói tiếng Việt',
        message: 'Đang phát: "Bàn số 1 vừa đặt món"',
        type: 'info',
        duration: 3500
      });
    } else if (soundMode === 'chime') {
      playOrderSoundTone();
      showToast({
        title: '🔔 Thử chuông báo mặc định',
        message: 'Chuông báo nhà hàng đã phát thành công',
        type: 'info',
        duration: 3500
      });
    } else {
      showToast({
        title: '🔇 Âm thanh đang tắt',
        message: 'Hãy bấm nút chuông trên thanh menu để bật',
        type: 'warning',
        duration: 3000
      });
    }
  }, [unlockAudio, soundMode, playOrderSound, showToast]);

  return (
    <NotificationContext.Provider
      value={{
        socket,
        soundEnabled,
        soundMode,
        setSoundMode,
        cycleSoundMode,
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
