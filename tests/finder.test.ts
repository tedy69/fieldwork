import { expect, it } from 'vitest';
import { fuzzyMatch } from '../apps/web/src/components/kokonutui/action-search-bar';

it.each([
  ['Gate inspection', 'gate'],
  ['Gate inspection', 'gti'],
  ['North pump station', 'nps'],
  ['FW-001 Gate inspection', 'fw001'],
  ['Pintu 東京', '東京'],
])('finds saved text %s with %s', (text, query) => {
  expect(fuzzyMatch(text, query)).not.toBeNull();
});

it('ignores query case and spacing without changing the source text', () => {
  expect(fuzzyMatch('Gate inspection', ' G A T E ')?.matches).toEqual([0, 1, 2, 3]);
});

it('ranks contiguous words above scattered character matches', () => {
  expect(fuzzyMatch('Gate inspection', 'gate')!.score).toBeGreaterThan(
    fuzzyMatch('Great activity test entries', 'gate')!.score,
  );
});

it('returns no match for missing characters and a neutral match for an empty query', () => {
  expect(fuzzyMatch('Gate inspection', 'zzzz')).toBeNull();
  expect(fuzzyMatch('Gate inspection', '')).toEqual({ score: 0, matches: [] });
});
