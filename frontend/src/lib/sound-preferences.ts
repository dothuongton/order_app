export type SoundMode = 'voice' | 'chime' | 'off';

const isSoundMode = (value: string | null): value is SoundMode =>
  value === 'voice' || value === 'chime' || value === 'off';

export function readSoundMode(
  getItem: (key: string) => string | null,
  cookie: string
): SoundMode {
  try {
    const saved = getItem('sound_mode');
    if (isSoundMode(saved)) return saved;

    const legacyEnabled = getItem('sound_enabled');
    if (legacyEnabled === 'false') return 'off';
  } catch {
    // Continue with the cookie bootstrap if local storage is unavailable.
  }

  const cookieMode = cookie.match(/(?:^|;\s*)sound_mode=(voice|chime|off)(?:;|$)/)?.[1] ?? null;
  return isSoundMode(cookieMode) ? cookieMode : 'voice';
}

export function writeSoundMode(
  mode: SoundMode,
  setItem: (key: string, value: string) => void,
  isSecure: boolean
): string {
  try {
    setItem('sound_mode', mode);
    setItem('sound_enabled', String(mode !== 'off'));
  } catch {
    // The cookie also supports WebKit's Safari-to-Home-Screen app bootstrap.
  }

  return `sound_mode=${mode}; Max-Age=31536000; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}`;
}
