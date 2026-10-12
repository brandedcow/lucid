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
  /** Chip backgrounds and the accent text used on emotion chips (Dream log and Dream entry). */
  emotionChipBg: '#2B2118',
  emotionChipText: '#F0B27A',
  tagChipBg: '#232A3A',
  /** Red text for the Draft label. 5.96:1 against `surface`, 6.51:1 against `background`. */
  draft: '#F26D6D',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Diameter of the round icon buttons in the add-entry top bar (the check and the "..." menu). */
export const iconCircle = 40;

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
} as const;
