import { Platform, type TextStyle } from 'react-native';

// These brand roles mirror the web notebook's tokens.css; platform text still scales normally.
export const colors = {
  ink: '#151d20',
  surface: '#1c2629',
  raised: '#243034',
  sidebar: '#11191c',
  foreground: '#edf1ee',
  muted: '#adbbb6',
  amber: '#f5c66d',
  line: '#344145',
  field: '#151e21',
  controlBorder: '#7f918d',
  selected: '#383c30',
  error: '#ffb6a9',
  errorSurface: '#362a28',
  approved: '#a6cdb8',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, section: 24, page: 32 } as const;
export const radius = { badge: 4, control: 6, panel: 10 } as const;
export const size = { control: 48, content: 720, photo: 220, summary: 120 } as const;
export const typography = {
  brand: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: '700', letterSpacing: -0.6 },
  heading: { fontSize: 20, lineHeight: 27, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 20 },
  reference: {
    fontSize: 12,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
} as const satisfies Record<string, TextStyle>;
