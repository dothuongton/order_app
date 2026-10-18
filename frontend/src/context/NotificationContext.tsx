import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface NotificationContextType {
  socket: Socket | null;
  soundEnabled: boolean;
  toggleSound: () => void;
  playOrderSound: () => void;
  playAlertSound: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('sound_enabled') !== 'false';
  });

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

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('sound_enabled', String(next));
    if (next) {
      playAlertSound();
    }
  };

  // Beep using Web Audio API
  const playSoundEffect = (freq1: number, freq2: number, duration: number) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq1, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq2, audioCtx.currentTime + duration);

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch {
      // Audio context might be restricted before first gesture
    }
  };

  const playOrderSound = () => {
    playSoundEffect(523.25, 659.25, 0.4); // C5 to E5 chime
  };

  const playAlertSound = () => {
    playSoundEffect(880, 440, 0.5); // A5 down to A4 alert
  };

  return (
    <NotificationContext.Provider value={{ socket, soundEnabled, toggleSound, playOrderSound, playAlertSound }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within NotificationProvider');
  return context;
};
