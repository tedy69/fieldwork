import { expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  invitationLink,
  invitationTokenFromHash,
  passwordResetLink,
  passwordResetTokenFromHash,
} from '../apps/web/src/invitation-link';

it('isolates reset fragments from invitations and ordinary navigation', () => {
  const token = randomBytes(32).toString('base64url');
  const url = new URL(passwordResetLink('https://fieldwork.example', token));
  expect(url.search).toBe('');
  expect(passwordResetTokenFromHash(url.hash)).toBe(token);
  expect(invitationTokenFromHash(url.hash)).toBeNull();
  expect(passwordResetTokenFromHash('#main')).toBeNull();
  expect(passwordResetTokenFromHash('#invite=' + token)).toBeNull();
  for (const hash of [
    '#reset',
    '#reset=short',
    `#reset=${token}&reset=${token}`,
    `#reset=${token}&invite=${token}`,
    `#reset=${token}&redirect=https://untrusted.example`,
  ])
    expect(passwordResetTokenFromHash(hash)).toBe('');
  expect(invitationTokenFromHash(`#reset=${token}&invite=${token}`)).toBe('');
  expect(() => passwordResetLink('https://user:secret@fieldwork.example', token)).toThrow();
});

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
