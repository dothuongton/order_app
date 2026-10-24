export type StaffTheme = {
  accentColor: string;
  textColor: string;
};

export type StaffDensity = 'compact' | 'comfortable';

export const DEFAULT_STAFF_THEME: Readonly<StaffTheme> = {
  accentColor: '#244f3c',
  textColor: '#27382e',
};

export const THEME_PRESETS: ReadonlyArray<{ name: string; settings: StaffTheme }> = [
  { name: 'Xanh lá GAERU', settings: { accentColor: '#244f3c', textColor: '#27382e' } },
  { name: 'Cam GAERU', settings: { accentColor: '#ea580c', textColor: '#2f2a26' } },
  { name: 'Xanh dương', settings: { accentColor: '#1f4f93', textColor: '#263449' } },
  { name: 'Nâu đất', settings: { accentColor: '#995035', textColor: '#3f3028' } },
  { name: 'Tím', settings: { accentColor: '#65428f', textColor: '#352d43' } },
];

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);
}

export function isStaffTheme(value: unknown): value is StaffTheme {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<StaffTheme>;
  return isHexColor(candidate.accentColor) && isHexColor(candidate.textColor);
}

/** Only accepted hex colors reach style variables or shared configuration. */
export function normalizeStaffTheme(value: unknown): StaffTheme {
  if (!isStaffTheme(value)) return { ...DEFAULT_STAFF_THEME };
  return {
    accentColor: value.accentColor.toLowerCase(),
    textColor: value.textColor.toLowerCase(),
  };
}

export function luminance(color: string): number {
  const safe = isHexColor(color) ? color : DEFAULT_STAFF_THEME.accentColor;
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(safe.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(colorA: string, colorB: string): number {
  const a = luminance(colorA), b = luminance(colorB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Select the more readable neutral for a button filled with the accent. */
export function readableForeground(color: string): '#ffffff' | '#000000' {
  return contrastRatio(color, '#ffffff') >= contrastRatio(color, '#000000') ? '#ffffff' : '#000000';
}

/** Keep brand text readable on a light surface without changing button fills. */
export function accentTextColor(accentColor: string): string {
  const color = isHexColor(accentColor) ? accentColor.toLowerCase() : DEFAULT_STAFF_THEME.accentColor;
  if (contrastRatio(color, '#ffffff') >= 4.5) return color;
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const shade = (fraction: number) => '#' + channels.map(channel => Math.round(channel * fraction).toString(16).padStart(2, '0')).join('');
  let passing = 0, failing = 1, result = '#000000';
  // Search the closest darker shade. Test the rounded output so the final hex
  // still meets the threshold after converting back to eight-bit channels.
  for (let step = 0; step < 18; step++) {
    const fraction = (passing + failing) / 2;
    const candidate = shade(fraction);
    if (contrastRatio(candidate, '#ffffff') >= 4.5) {
      passing = fraction;
      result = candidate;
    } else {
      failing = fraction;
    }
  }
  return result;
}

export function getStaffThemeCssVars(
  themeInput?: unknown,
  densityInput?: StaffDensity
): Record<string, string> {
  const theme = normalizeStaffTheme(themeInput);
  const onAccent = readableForeground(theme.accentColor);
  const accentText = accentTextColor(theme.accentColor);
  const isCompact = densityInput === 'compact';

  return {
    '--brand-accent': theme.accentColor,
    '--brand-text': theme.textColor,
    '--brand-on-accent': onAccent,
    '--brand-accent-text': accentText,
    '--brand-accent-dark': `color-mix(in srgb, ${theme.accentColor} 82%, #000)`,
    '--brand-surface-soft': `color-mix(in srgb, ${theme.accentColor} 5%, #fff)`,
    '--brand-accent-tint': `color-mix(in srgb, ${theme.accentColor} 10%, #fff)`,
    '--brand-accent-strong': `color-mix(in srgb, ${theme.accentColor} 18%, #fff)`,
    '--brand-line': `color-mix(in srgb, ${theme.textColor} 16%, #fff)`,
    '--brand-muted': `color-mix(in srgb, ${theme.textColor} 76%, #fff)`,
    '--staff-font-scale': isCompact ? '0.9375' : '1',
    '--staff-radius': isCompact ? '12px' : '24px',
    '--staff-card-pad': isCompact ? '12px' : '16px',
    '--staff-row-gap': isCompact ? '8px' : '12px',
  };
}
