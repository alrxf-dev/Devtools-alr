import { browserStorage } from './storage';

export type Theme = 'day' | 'night';
const KEY = 'alrect.theme';
const COLOR: Record<Theme, string> = { day: '#0d1b36', night: '#060b1c' };

/** Saved choice wins. First visit: day between 06:00 and 17:59 local time, night otherwise. */
export function initialTheme(now: Date = new Date()): Theme {
  const saved = browserStorage().getItem(KEY);
  if (saved === 'day' || saved === 'night') return saved;
  const h = now.getHours();
  return h >= 6 && h < 18 ? 'day' : 'night';
}

export function applyTheme(t: Theme, persist = false): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR[t]);
  if (persist) browserStorage().setItem(KEY, t);
}
