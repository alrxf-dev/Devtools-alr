/// <reference lib="webworker" />
// Runs a user-supplied regular expression. The page terminates this worker if it takes too long, which is the
// only reliable defence against catastrophic backtracking (the JS engine cannot be interrupted from inside).

export interface RegexRequest { pattern: string; flags: string; text: string; replacement: string; maxMatches: number }
export interface RegexMatch { index: number; text: string; groups: (string | null)[]; named: Record<string, string | null> }
export interface RegexResponse { ok: true; matches: RegexMatch[]; truncated: boolean; replaced: string | null; ms: number }

self.onmessage = (e: MessageEvent<RegexRequest>) => {
  const { pattern, flags, text, replacement, maxMatches } = e.data;
  try {
    const t0 = performance.now();
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    const matches: RegexMatch[] = [];
    let truncated = false;
    for (const m of text.matchAll(re)) {
      if (matches.length >= maxMatches) {
        truncated = true;
        break;
      }
      matches.push({ index: m.index ?? 0, text: m[0], groups: m.slice(1).map((g) => g ?? null), named: Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, v ?? null])) });
    }
    const replaced = replacement !== '' ? text.replace(re, replacement) : null;
    self.postMessage({ ok: true, matches, truncated, replaced, ms: performance.now() - t0 } satisfies RegexResponse);
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'Invalid pattern.' });
  }
};
