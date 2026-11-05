import { expect, test } from 'vitest';
import { savedLocale } from '@fieldwork/strings';

test('chooses the device language until a supported preference is saved', () => {
  expect(savedLocale(null, 'id-ID')).toBe('id');
  expect(savedLocale(null, 'in_ID')).toBe('id');
  expect(savedLocale('unsupported', 'id')).toBe('id');
  expect(savedLocale(null, 'ja-JP')).toBe('en');
  expect(savedLocale('en', 'id-ID')).toBe('en');
  expect(savedLocale('id', 'en-US')).toBe('id');
});
