import { expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { invitationLink, invitationTokenFromHash } from '../apps/web/src/invitation-link';

it('keeps the invitation secret in a fragment on the current web origin', () => {
  const token = randomBytes(32).toString('base64url');
  const url = new URL(invitationLink('https://fieldwork.example', token));
  expect(url.origin).toBe('https://fieldwork.example');
  expect(url.pathname).toBe('/');
  expect(url.search).toBe('');
  expect(invitationTokenFromHash(url.hash)).toBe(token);
  expect(new URL(invitationLink('http://127.0.0.1:4173', token)).origin).toBe(
    'http://127.0.0.1:4173',
  );
});
it.each(['', '#main', '#somewhere'])(
  'leaves ordinary fragment %s outside the invitation flow',
  (hash) => {
    expect(invitationTokenFromHash(hash)).toBeNull();
  },
);
it.each([
  '#invite',
  '#invite=short',
  '#invite=%E0%A4%A',
  `#invite=${'x'.repeat(43)}&invite=${'y'.repeat(43)}`,
  `#invite=${'x'.repeat(43)}&redirect=https://untrusted.example`,
])('rejects an incomplete or ambiguous invitation fragment %s', (hash) => {
  expect(invitationTokenFromHash(hash)).toBe('');
});
it.each([
  'https://fieldwork.example/path',
  'https://person:secret@fieldwork.example',
  'ftp://fieldwork.example',
  'javascript:alert(1)',
])('rejects unsupported invitation origin %s', (origin) => {
  expect(() => invitationLink(origin, randomBytes(32).toString('base64url'))).toThrow();
});
