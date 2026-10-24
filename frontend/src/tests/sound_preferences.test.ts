import { describe, expect, it } from 'vitest';
import { readSoundMode, writeSoundMode } from '../lib/sound-preferences.js';

describe('sound preferences', () => {
  it('reads the saved local preference before the cookie bootstrap', () => {
    expect(readSoundMode((key) => key === 'sound_mode' ? 'chime' : null, 'sound_mode=off')).toBe('chime');
  });

  it('uses the cookie when local storage is empty or unavailable', () => {
    expect(readSoundMode(() => null, 'other=value; sound_mode=off')).toBe('off');
    expect(readSoundMode(() => { throw new Error('storage unavailable'); }, 'sound_mode=chime')).toBe('chime');
  });

  it('preserves the legacy disabled setting and defaults invalid values to voice', () => {
    expect(readSoundMode((key) => key === 'sound_enabled' ? 'false' : 'invalid', '')).toBe('off');
    expect(readSoundMode(() => 'invalid', 'sound_mode=invalid')).toBe('voice');
  });

  it('writes local and cookie preferences with install-safe cookie attributes', () => {
    const values = new Map<string, string>();
    const cookie = writeSoundMode('voice', (key, value) => values.set(key, value), true);

    expect(values.get('sound_mode')).toBe('voice');
    expect(values.get('sound_enabled')).toBe('true');
    expect(cookie).toContain('Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  });
});
