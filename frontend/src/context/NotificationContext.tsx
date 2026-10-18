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

  // HTML5 Audio fallbacks for mobile / iOS
  const orderAudioRef = useRef<HTMLAudioElement | null>(null);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        orderAudioRef.current = new Audio('/bell-order.wav');
        alertAudioRef.current = new Audio('/bell-alert.wav');
        orderAudioRef.current.preload = 'auto';
        alertAudioRef.current.preload = 'auto';
      } catch {}
    }
  }, []);

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

  // Unlock audio context on user gesture (click or touch) with iOS silent buffer trick
  const unlockAudio = useCallback(() => {
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended' || (ctx as any).state === 'interrupted') {
        ctx.resume().then(() => setIsAudioUnlocked(true)).catch(() => {});
      } else if (ctx.state === 'running') {
        setIsAudioUnlocked(true);
      }

      // iOS Safari hardware unlock: play 1-sample silent buffer to activate audio hardware
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch {}
    }

    // Prime HTML5 Audio elements
    try {
      if (orderAudioRef.current) orderAudioRef.current.load();
      if (alertAudioRef.current) alertAudioRef.current.load();
    } catch {}

    // Unstick SpeechSynthesis on iOS WebKit
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();
      } catch {}
    }
  }, []);

  // Global user gesture listeners: touch, click, pointerdown immediately unlock audio
  useEffect(() => {
    const handleUserGesture = () => {
      unlockAudio();
    };

    const events = ['click', 'touchstart', 'touchend', 'pointerdown'];
    events.forEach(ev => window.addEventListener(ev, handleUserGesture, { passive: true }));

    return () => {
      events.forEach(ev => window.removeEventListener(ev, handleUserGesture));
    };
  }, [unlockAudio]);

  // Handle screen wake up (visibilitychange & focus) to auto-resume audio and unfreeze iOS speech
  useEffect(() => {
    const handleWakeup = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const ctx = getOrCreateAudioContext();
        if (ctx && (ctx.state === 'suspended' || (ctx as any).state === 'interrupted')) {
          ctx.resume().catch(() => {});
        }

        // Always unpause and clear stuck speech synthesis on iOS
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
            window.speechSynthesis.cancel();
          } catch {}
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('focus', handleWakeup);

    return () => {
      document.removeEventListener('visibilitychange', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
    };
  }, []);

  // Speech synthesis helper in Vietnamese with WebKit anti-freeze & GC protection
  const speakVietnamese = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      // iOS WebKit unfreeze
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.cancel(); // Clear pending queue

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

      // Store in window to avoid WebKit garbage-collecting the utterance before finish
      (window as any).__qr_active_utterance = utterance;

      utterance.onend = () => {
        (window as any).__qr_active_utterance = null;
      };
      utterance.onerror = () => {
        (window as any).__qr_active_utterance = null;
      };

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

  // Pure chime tone helpers (Dual HTML5 Audio + WebAudio harmonic notes)
  const playOrderSoundTone = () => {
    // 1. Play pre-loaded HTML5 Audio element (works even when WebAudio suspended)
    if (orderAudioRef.current) {
      try {
        orderAudioRef.current.currentTime = 0;
        const p = orderAudioRef.current.play();
        if (p) p.catch(() => {});
      } catch {}
    }

    // 2. Play WebAudio harmonic synthesizer
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended' || (ctx as any).state === 'interrupted') {
        ctx.resume().catch(() => {});
      }

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
    // 1. Play pre-loaded HTML5 Audio element
    if (alertAudioRef.current) {
      try {
        alertAudioRef.current.currentTime = 0;
        const p = alertAudioRef.current.play();
        if (p) p.catch(() => {});
      } catch {}
    }

    // 2. Play WebAudio harmonic synthesizer
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended' || (ctx as any).state === 'interrupted') {
        ctx.resume().catch(() => {});
      }

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
      // Introductory bell chime
      playOrderSoundTone();

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
      // Introductory alert chime
      playAlertSoundTone();

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
