import { Platform, type TextStyle } from 'react-native';

// These brand roles mirror the web notebook's tokens.css; platform text still scales normally.
export const colors = {
  ink: '#f5f4ef',
  surface: '#ffffff',
  raised: '#eeefe9',
  sidebar: '#e9ece4',
  foreground: '#202b23',
  muted: '#58635a',
  amber: '#915014',
  line: '#d5d9cf',
  field: '#fcfcf9',
  controlBorder: '#899486',
  selected: '#fbefd9',
  error: '#a1362a',
  errorSurface: '#fdf0ed',
  approved: '#326347',
  approvedSurface: '#edf5ee',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, section: 24, page: 32 } as const;
export const radius = { badge: 5, control: 8, panel: 14 } as const;
export const size = {
  control: 48,
  content: 720,
  photo: 220,
  summary: 120,
} as const;
export const typography = {
  brand: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: '600', letterSpacing: -0.8 },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '600' },
  record: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 20 },
  reference: {
    fontSize: 12,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
} as const satisfies Record<string, TextStyle>;
