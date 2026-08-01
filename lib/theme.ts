export type ThemeName = 'slate' | 'midnight' | 'ember' | 'forest' | 'rose';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceHover: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  accent: string;
  accentSoft: string;
}

export interface Theme {
  name: ThemeName;
  label: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const THEMES: Theme[] = [
  {
    name: 'slate',
    label: 'Slate',
    light: {
      bg: '#f8fafc',
      surface: '#ffffff',
      surfaceHover: '#f1f5f9',
      text: '#0f172a',
      textSecondary: '#64748b',
      textMuted: '#94a3b8',
      border: '#e2e8f0',
      accent: '#3B82F6',
      accentSoft: 'rgba(59,130,246,0.1)',
    },
    dark: {
      bg: '#0f172a',
      surface: '#1e293b',
      surfaceHover: '#334155',
      text: '#ffffff',
      textSecondary: '#94a3b8',
      textMuted: '#475569',
      border: '#334155',
      accent: '#3B82F6',
      accentSoft: 'rgba(59,130,246,0.15)',
    },
  },
  {
    name: 'midnight',
    label: 'Midnight',
    light: {
      bg: '#f5f3ff',
      surface: '#ffffff',
      surfaceHover: '#ede9fe',
      text: '#1e1b4b',
      textSecondary: '#6d6a94',
      textMuted: '#a5a2c4',
      border: '#e4e0f4',
      accent: '#7C3AED',
      accentSoft: 'rgba(124,58,237,0.1)',
    },
    dark: {
      bg: '#0c0a1d',
      surface: '#1a1636',
      surfaceHover: '#2a2450',
      text: '#f0eeff',
      textSecondary: '#a5a2c4',
      textMuted: '#5c5885',
      border: '#2a2450',
      accent: '#8B5CF6',
      accentSoft: 'rgba(139,92,246,0.15)',
    },
  },
  {
    name: 'ember',
    label: 'Ember',
    light: {
      bg: '#faf6f1',
      surface: '#ffffff',
      surfaceHover: '#f5ede4',
      text: '#1c1412',
      textSecondary: '#78716c',
      textMuted: '#a8a29e',
      border: '#e7e0d8',
      accent: '#EA580C',
      accentSoft: 'rgba(234,88,12,0.1)',
    },
    dark: {
      bg: '#1c1412',
      surface: '#292018',
      surfaceHover: '#3d3028',
      text: '#faf5f0',
      textSecondary: '#b0a89e',
      textMuted: '#6b5f55',
      border: '#3d3028',
      accent: '#F97316',
      accentSoft: 'rgba(249,115,22,0.15)',
    },
  },
  {
    name: 'forest',
    label: 'Forest',
    light: {
      bg: '#f0faf4',
      surface: '#ffffff',
      surfaceHover: '#e4f5ec',
      text: '#0a1612',
      textSecondary: '#4d7c6a',
      textMuted: '#86b3a0',
      border: '#d4ede0',
      accent: '#059669',
      accentSoft: 'rgba(5,150,105,0.1)',
    },
    dark: {
      bg: '#0a1612',
      surface: '#142420',
      surfaceHover: '#1e3830',
      text: '#ecfdf5',
      textSecondary: '#86b3a0',
      textMuted: '#3d6455',
      border: '#1e3830',
      accent: '#10B981',
      accentSoft: 'rgba(16,185,129,0.15)',
    },
  },
  {
    name: 'rose',
    label: 'Ros\u00e9',
    light: {
      bg: '#fdf2f8',
      surface: '#ffffff',
      surfaceHover: '#fce7f3',
      text: '#1a0f16',
      textSecondary: '#9d6b8a',
      textMuted: '#c9a3ba',
      border: '#f3dcea',
      accent: '#DB2777',
      accentSoft: 'rgba(219,39,119,0.1)',
    },
    dark: {
      bg: '#1a0f16',
      surface: '#2a1a24',
      surfaceHover: '#3d2836',
      text: '#fdf2f8',
      textSecondary: '#c9a3ba',
      textMuted: '#6b4560',
      border: '#3d2836',
      accent: '#EC4899',
      accentSoft: 'rgba(236,72,153,0.15)',
    },
  },
];

export function resolveColors(
  theme: Theme,
  mode: ThemeMode,
  systemScheme: 'light' | 'dark' | null,
): ThemeColors {
  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  return isDark ? theme.dark : theme.light;
}
