import { expect, it } from 'vitest';
import { parseCoordinateInputs } from '../apps/web/src/coordinate-input';

it('keeps a blank pair optional and retains zero, negative, and precise coordinates', () => {
  expect(parseCoordinateInputs('', '   ')).toBeUndefined();
  expect(parseCoordinateInputs('0', '0')).toEqual({ latitude: 0, longitude: 0 });
  expect(parseCoordinateInputs(' -6.200001 ', '106.816667')).toEqual({
    latitude: -6.200001,
    longitude: 106.816667,
  });
});
it.each([
  ['0', ''],
  ['', '0'],
  ['91', '0'],
  ['0', '-181'],
  ['bad', '0'],
  ['Infinity', '0'],
])('rejects incomplete or invalid coordinate entry %j, %j', (latitude, longitude) => {
  expect(() => parseCoordinateInputs(latitude, longitude)).toThrow();
});
