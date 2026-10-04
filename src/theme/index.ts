import { Platform } from 'react-native';

export const colors = {
  background: '#0D1017',
  surface: '#161A23',
  border: '#2A3040',
  text: '#F5F2EC',
  muted: '#7C859B',
  faint: '#5A6379',
  accent: '#E8A464',
  accentDark: '#1A1209',
  transcriptMid: '#E8B070',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
} as const;
