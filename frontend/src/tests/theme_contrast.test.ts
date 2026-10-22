import { describe, it, expect } from 'vitest';
import {
  isHexColor,
  normalizeStaffTheme,
  luminance,
  contrastRatio,
  readableForeground,
  accentTextColor,
  getStaffThemeCssVars,
  THEME_PRESETS,
  DEFAULT_STAFF_THEME
} from '../lib/theme.js';

describe('Staff Theme Contrast & Math Algorithm (WCAG Spec)', () => {
  it('validates hex colors properly', () => {
    expect(isHexColor('#ea580c')).toBe(true);
    expect(isHexColor('#244f3c')).toBe(true);
    expect(isHexColor('#FFFFFF')).toBe(true);
    expect(isHexColor('ea580c')).toBe(false);
    expect(isHexColor('#ea580')).toBe(false);
    expect(isHexColor('#ea580c11')).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });

  it('normalizes theme settings with fallback to Xanh lá GAERU defaults', () => {
    expect(DEFAULT_STAFF_THEME).toEqual({
      accentColor: '#244f3c',
      textColor: '#27382e'
    });
    expect(normalizeStaffTheme(null)).toEqual(DEFAULT_STAFF_THEME);
    expect(normalizeStaffTheme({})).toEqual(DEFAULT_STAFF_THEME);
    expect(normalizeStaffTheme({ accentColor: '#1F4F93', textColor: '#263449' })).toEqual({
      accentColor: '#1f4f93',
      textColor: '#263449'
    });
  });

  it('computes readableForeground choosing white or black with higher contrast ratio', () => {
    for (const preset of THEME_PRESETS) {
      const fg = readableForeground(preset.settings.accentColor);
      const ratioWhite = contrastRatio(preset.settings.accentColor, '#ffffff');
      const ratioBlack = contrastRatio(preset.settings.accentColor, '#000000');
      if (ratioWhite >= ratioBlack) {
        expect(fg).toBe('#ffffff');
      } else {
        expect(fg).toBe('#000000');
      }
    }
  });

  it('ensures accentTextColor produces contrast ratio >= 4.5:1 on white for all 5 presets', () => {
    for (const preset of THEME_PRESETS) {
      const textCol = accentTextColor(preset.settings.accentColor);
      const ratio = contrastRatio(textCol, '#ffffff');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ensures accentTextColor produces contrast ratio >= 4.5:1 on white for difficult light colors (#f5c542, #7dd956, #f472b6)', () => {
    const toughColors = ['#f5c542', '#7dd956', '#f472b6', '#ffffff', '#ffff00', '#00ffff'];
    for (const c of toughColors) {
      const textCol = accentTextColor(c);
      const ratio = contrastRatio(textCol, '#ffffff');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('generates complete CSS variables for compact and comfortable density', () => {
    const compactVars = getStaffThemeCssVars(
      { accentColor: '#244f3c', textColor: '#27382e' },
      'compact'
    );
    expect(compactVars['--brand-accent']).toBe('#244f3c');
    expect(compactVars['--brand-text']).toBe('#27382e');
    expect(compactVars['--brand-on-accent']).toBe('#ffffff');
    expect(compactVars['--staff-font-scale']).toBe('0.9375');
    expect(compactVars['--staff-radius']).toBe('12px');
    expect(compactVars['--staff-card-pad']).toBe('12px');
    expect(compactVars['--staff-row-gap']).toBe('8px');

    const comfortableVars = getStaffThemeCssVars(
      { accentColor: '#244f3c', textColor: '#27382e' },
      'comfortable'
    );
    expect(comfortableVars['--staff-font-scale']).toBe('1');
    expect(comfortableVars['--staff-radius']).toBe('24px');
    expect(comfortableVars['--staff-card-pad']).toBe('16px');
    expect(comfortableVars['--staff-row-gap']).toBe('12px');
  });
});
