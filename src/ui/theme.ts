import { Platform } from 'react-native';

export const colors = {
  background: '#FFF7E8',
  surface: '#FFFCF5',
  surfaceMuted: '#F2E9D8',
  ink: '#102A43',
  inkStrong: '#081F33',
  muted: '#5D7083',
  border: '#DDD4C5',
  coral: '#E86F61',
  coralSoft: '#F7C8BE',
  success: '#205C3B',
  successSoft: '#BFE3C0',
  danger: '#A73535',
  dangerSoft: '#F8D8D2',
  white: '#FFFFFF',
  board: '#0B2235',
  boardRail: '#49667B',
  boardCell: '#FFF4DE',
  boardCellBorder: '#C9B99F',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  jumbo: 40,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const motion = {
  immediate: 0,
  quick: 150,
  standard: 260,
  splash: 900,
  solariStagger: 72,
} as const;

export const typography = {
  displayFamily: Platform.select({ android: 'serif', default: 'Georgia', ios: 'Georgia', web: 'Georgia' }),
  bodyFamily: Platform.select({ android: 'sans-serif', default: undefined, ios: 'System', web: 'system-ui' }),
  displayLarge: { fontSize: 40, lineHeight: 46, fontWeight: '700' as const },
  displayMedium: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const },
  title: { fontSize: 24, lineHeight: 31, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '800' as const },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '900' as const, letterSpacing: 1.8 },
} as const;

export const minimumTouchTarget = 48;

export const shadows = {
  card: {
    shadowColor: colors.inkStrong,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 3,
  },
} as const;
