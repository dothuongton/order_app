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
  isWakeLockActive: boolean;
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => void;
  toggleWakeLock: () => void;
  playOrderSound: (tableName?: string, eventId?: string) => void;
  playAlertSound: (tableName?: string, requestType?: 'CHECKOUT' | 'ASSISTANCE', eventId?: string) => void;
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

// Audio & Speech guard: strictly limit sound/speech to staff routes, never play in superadmin (/admin)
function isSoundAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;
  if (pathname.startsWith('/admin')) return false;
  return pathname.startsWith('/staff');
}

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
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(true);
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

  // Screen Wake Lock API to prevent phone/tablet screen from sleeping
  const [isWakeLockActive, setIsWakeLockActive] = useState<boolean>(false);
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      if (!wakeLockRef.current) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setIsWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
          setIsWakeLockActive(false);
        });
      }
    } catch (err) {
      console.warn('Wake Lock request error:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setIsWakeLockActive(false);
    }
  }, []);

  const toggleWakeLock = useCallback(() => {
    if (isWakeLockActive) {
      releaseWakeLock();
    } else {
      requestWakeLock();
    }
  }, [isWakeLockActive, releaseWakeLock, requestWakeLock]);

  // Unlock audio context safely on user gesture or visibility change
  const unlockAudio = useCallback(() => {
    setIsAudioUnlocked(true);
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended' || (ctx as any).state === 'interrupted') {
        ctx.resume().catch(() => {});
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

    // Unstick SpeechSynthesis on WebKit / Blink if paused
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
    }
  }, []);

  // One-time user gesture listener to unlock audio without hammering CPU on every click
  useEffect(() => {
    let hasUnlocked = false;

    const handleFirstGesture = () => {
      if (hasUnlocked) return;
      hasUnlocked = true;
      unlockAudio();
    };

    const events = ['click', 'touchstart', 'keydown'];
    events.forEach(ev => window.addEventListener(ev, handleFirstGesture, { passive: true, once: true }));

    return () => {
      events.forEach(ev => window.removeEventListener(ev, handleFirstGesture));
    };
  }, [unlockAudio]);

  // Handle screen wake up (visibilitychange & focus) to auto-resume audio context
  useEffect(() => {
    const handleWakeup = () => {
      unlockAudio();
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('focus', handleWakeup);

    // Initial wake lock attempt
    requestWakeLock();

    return () => {
      document.removeEventListener('visibilitychange', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
    };
  }, [unlockAudio, requestWakeLock]);

  // Speech synthesis helper in Vietnamese with robust voice detection & Blink/WebKit unfreeze
  const speakVietnamese = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!isSoundAllowed()) return;
    try {
      // 1. Unfreeze if paused
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      // 2. Clear any pending speech queue
      try {
        window.speechSynthesis.cancel();
      } catch {}

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Find Vietnamese voice if available
      try {
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(v => {
          const lang = (v.lang || '').toLowerCase().replace('_', '-');
          const name = (v.name || '').toLowerCase();
          return lang === 'vi-vn' || lang.startsWith('vi') || name.includes('vietnam') || name.includes('tiếng việt');
        });
        if (viVoice) {
          utterance.voice = viVoice;
        }
      } catch {}

      // Retain reference on window to prevent garbage collection mid-speech
      (window as any).__qr_active_utterance = utterance;
      utterance.onend = () => {
        (window as any).__qr_active_utterance = null;
      };
      utterance.onerror = () => {
        (window as any).__qr_active_utterance = null;
      };

      try {
        window.speechSynthesis.cancel();
      } catch {}

      setTimeout(() => {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utterance);
        } catch {}
      }, 60);
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

  // Synthesis helper: play harmonic bell note
  const playHarmonicNote = useCallback((
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    gainLevel: number
  ) => {
    try {
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
    } catch {}
  }, []);

  // Pure chime tone helpers (Dual HTML5 Audio + WebAudio harmonic notes)
  const playOrderSoundTone = useCallback(() => {
    if (!isSoundAllowed()) return;
    // 1. Play pre-loaded HTML5 Audio element
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
  }, [playHarmonicNote]);

  const playAlertSoundTone = useCallback(() => {
    if (!isSoundAllowed()) return;
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
  }, [playHarmonicNote]);

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
  }, [unlockAudio, speakVietnamese, playAlertSoundTone]);

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
    // Clear all existing toast timers
    timeoutsRef.current.forEach(timer => clearTimeout(timer));
    timeoutsRef.current.clear();

    const id = `toast-${Date.now()}`;
    const newToast: ToastNotification = {
      id,
      title,
      message,
      type,
      duration,
      createdAt: Date.now()
    };

    // Exactly 1 toast on screen at a time - never stack duplicate banners
    setToasts([newToast]);

    if (duration > 0) {
      const timer = setTimeout(() => {
        removeToast(id);
      }, duration);
      timeoutsRef.current.set(id, timer);
    }
  }, [removeToast]);

  // Deduplication cache for events shared between Socket.IO and Service Worker (60s TTL)
  const processedEventsRef = useRef<Map<string, number>>(new Map());

  const shouldProcessEvent = useCallback((eventId?: string): boolean => {
    if (!eventId) return true;
    const now = Date.now();
    for (const [id, timestamp] of processedEventsRef.current.entries()) {
      if (now - timestamp > 60000) {
        processedEventsRef.current.delete(id);
      }
    }
    if (processedEventsRef.current.has(eventId)) {
      return false; // Duplicate dropped
    }
    processedEventsRef.current.set(eventId, now);
    return true;
  }, []);

  // 1. New Order Notification (Dual Chime + Voice)
  const playOrderSound = useCallback((tableName?: string, eventId?: string) => {
    if (!isSoundAllowed()) return;
    if (eventId && !shouldProcessEvent(eventId)) return;
    if (soundMode === 'off') return;

    // 1. ALWAYS play the loud chime tone first (guarantees sound is heard even if TTS is unavailable/slow or screen is off)
    playOrderSoundTone();

    // 2. If 'voice' mode is enabled, speak table name
    if (soundMode === 'voice') {
      const spokenTable = tableName || 'Bàn';
      setTimeout(() => {
        speakVietnamese(`${spokenTable} vừa đặt món`);
      }, 350);
    }
  }, [soundMode, speakVietnamese, playOrderSoundTone, shouldProcessEvent]);

  // 2. Service Request Notification (Dual Chime + Voice)
  const playAlertSound = useCallback((tableName?: string, requestType?: 'CHECKOUT' | 'ASSISTANCE', eventId?: string) => {
    if (!isSoundAllowed()) return;
    if (eventId && !shouldProcessEvent(eventId)) return;
    if (soundMode === 'off') return;

    // 1. ALWAYS play the alert tone first
    playAlertSoundTone();

    // 2. If 'voice' mode is enabled, speak table name & action
    if (soundMode === 'voice') {
      const spokenTable = tableName || 'Bàn';
      const prompt = requestType === 'CHECKOUT'
        ? `${spokenTable} yêu cầu thanh toán`
        : `${spokenTable} yêu cầu hỗ trợ`;
      setTimeout(() => {
        speakVietnamese(prompt);
      }, 350);
    }
  }, [soundMode, speakVietnamese, playAlertSoundTone, shouldProcessEvent]);

  // 3. Success Sound
  const playSuccessSound = useCallback(() => {
    if (!isSoundAllowed()) return;
    if (soundMode === 'off') return;
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      playHarmonicNote(ctx, 587.33, now, 0.3, 0.45);
      playHarmonicNote(ctx, 880.00, now + 0.12, 0.5, 0.5);
    } catch {}
  }, [soundMode, playHarmonicNote]);

  // Listen for push events relayed from Service Worker (when screen is locked / in background)
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_ORDER_EVENT') {
        const payload = event.data.payload || {};
        const data = payload.data || {};
        const eventType = data.type || payload.type;
        const tableName = data.tableName || payload.tableName;
        const requestType = data.requestType || payload.requestType;
        const eventId = data.eventId || payload.eventId || payload.tag;

        if (eventType === 'order.created') {
          playOrderSound(tableName, eventId);
        } else if (eventType === 'service_request.created') {
          playAlertSound(tableName, requestType, eventId);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [playOrderSound, playAlertSound]);

  // Test sound function
  const testSound = useCallback(() => {
    if (!isSoundAllowed()) return;
    unlockAudio();
    if (soundMode === 'voice') {
      playOrderSoundTone();
      setTimeout(() => {
        speakVietnamese('Bàn số 1 vừa đặt món mới');
      }, 350);
      showToast({
        title: '🗣️ Thử chuông & giọng nói tiếng Việt',
        message: 'Đang phát chuông và đọc: "Bàn số 1 vừa đặt món mới"',
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
  }, [unlockAudio, soundMode, speakVietnamese, playOrderSoundTone, showToast]);

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
        isWakeLockActive,
        requestWakeLock,
        releaseWakeLock,
        toggleWakeLock,
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
