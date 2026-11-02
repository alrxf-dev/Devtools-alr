import { test } from 'node:test';
import assert from 'node:assert/strict';

// theme.ts reads window.localStorage through browserStorage(); without a window it falls back to memory storage.
const { initialTheme } = await import('../../src/app/theme');
const at = (h: number) => new Date(2026, 0, 1, h, 0, 0);

test('first visit: day from 06:00 to 17:59, night otherwise', () => {
  assert.equal(initialTheme(at(5)), 'night');
  assert.equal(initialTheme(at(6)), 'day');
  assert.equal(initialTheme(at(12)), 'day');
  assert.equal(initialTheme(at(17)), 'day');
  assert.equal(initialTheme(at(18)), 'night');
  assert.equal(initialTheme(at(23)), 'night');
});
