/** Pure text utilities. No DOM access so they run in the browser, workers and Node tests. */

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
  nonEmptyLines: number;
  bytesUtf8: number;
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

export function countGraphemes(text: string): number {
  if (segmenter) {
    let n = 0;
    for (const _ of segmenter.segment(text)) n++;
    return n;
  }
  return Array.from(text).length;
}

export function textStats(text: string): TextStats {
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/u).length;
  const lines = text === '' ? 0 : text.split(/\r\n|\r|\n/u).length;
  const nonEmptyLines = text.split(/\r\n|\r|\n/u).filter((l) => l.trim() !== '').length;
  return {
    characters: countGraphemes(text),
    charactersNoSpaces: countGraphemes(text.replace(/\s+/gu, '')),
    words,
    lines,
    nonEmptyLines,
    bytesUtf8: new TextEncoder().encode(text).length,
  };
}

export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence' | 'camel' | 'pascal' | 'snake' | 'kebab' | 'constant';

function splitWords(text: string): string[] {
  return text
    // Split camelCase (fooBar) and acronym boundaries (HTTPServer), but not odd casing such as "wORLD".
    .replace(/([\p{Ll}\d])(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

export function convertCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      return text.toLowerCase().replace(/(^|[\s\-_/])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
    case 'sentence':
      return text.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
    case 'camel': {
      const w = splitWords(text).map((x) => x.toLowerCase());
      return w.map((x, i) => (i === 0 ? x : x.charAt(0).toUpperCase() + x.slice(1))).join('');
    }
    case 'pascal':
      return splitWords(text).map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join('');
    case 'snake':
      return splitWords(text).map((x) => x.toLowerCase()).join('_');
    case 'kebab':
      return splitWords(text).map((x) => x.toLowerCase()).join('-');
    case 'constant':
      return splitWords(text).map((x) => x.toUpperCase()).join('_');
  }
}

export interface CleanOptions {
  trimLines: boolean;
  collapseSpaces: boolean;
  removeBlankLines: boolean;
  collapseBlankLines: boolean;
  normalizeLineEndings: boolean;
  stripZeroWidth: boolean;
  tabsToSpaces: boolean;
}

export const defaultCleanOptions: CleanOptions = {
  trimLines: true,
  collapseSpaces: true,
  removeBlankLines: false,
  collapseBlankLines: true,
  normalizeLineEndings: true,
  stripZeroWidth: true,
  tabsToSpaces: false,
};

export function cleanWhitespace(text: string, o: CleanOptions = defaultCleanOptions): string {
  let t = text;
  if (o.normalizeLineEndings) t = t.replace(/\r\n?/gu, '\n');
  if (o.stripZeroWidth) t = t.replace(/[​-‍⁠﻿]/gu, '');
  if (o.tabsToSpaces) t = t.replace(/\t/gu, '  ');
  let lines = t.split('\n');
  if (o.trimLines) lines = lines.map((l) => l.trim());
  if (o.collapseSpaces) lines = lines.map((l) => l.replace(/[ \t ]{2,}/gu, ' '));
  if (o.removeBlankLines) lines = lines.filter((l) => l.trim() !== '');
  else if (o.collapseBlankLines) {
    const out: string[] = [];
    for (const l of lines) {
      if (l === '' && out.length > 0 && out[out.length - 1] === '') continue;
      out.push(l);
    }
    lines = out;
  }
  return lines.join('\n');
}

export function removeDuplicateLines(text: string, opts: { caseSensitive?: boolean; trim?: boolean } = {}): { text: string; removed: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  const lines = text.split(/\r?\n/u);
  for (const line of lines) {
    let key = opts.trim ? line.trim() : line;
    if (!opts.caseSensitive) key = key.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return { text: out.join('\n'), removed: lines.length - out.length };
}

export function removeEmptyLines(text: string): string {
  return text.split(/\r?\n/u).filter((l) => l.trim() !== '').join('\n');
}

export type SortMode = 'asc' | 'desc' | 'length' | 'numeric' | 'natural' | 'reverse' | 'shuffle';

export function sortLines(text: string, mode: SortMode, caseSensitive = false): string {
  const lines = text.split(/\r?\n/u);
  const key = (s: string) => (caseSensitive ? s : s.toLowerCase());
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: caseSensitive ? 'variant' : 'base' });
  switch (mode) {
    case 'asc':
      return [...lines].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)).join('\n');
    case 'desc':
      return [...lines].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0)).join('\n');
    case 'length':
      return [...lines].sort((a, b) => a.length - b.length).join('\n');
    case 'numeric':
      return [...lines].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)).join('\n');
    case 'natural':
      return [...lines].sort((a, b) => coll.compare(a, b)).join('\n');
    case 'reverse':
      return [...lines].reverse().join('\n');
    case 'shuffle': {
      const arr = [...lines];
      const rnd = new Uint32Array(arr.length);
      crypto.getRandomValues(rnd);
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (rnd[i] ?? 0) % (i + 1);
        [arr[i], arr[j]] = [arr[j] as string, arr[i] as string];
      }
      return arr.join('\n');
    }
  }
}

export function reverseText(text: string, by: 'chars' | 'words' | 'lines' = 'chars'): string {
  if (by === 'lines') return text.split(/\r?\n/u).reverse().join('\n');
  if (by === 'words') return text.split(/(\s+)/u).reverse().join('');
  const g = segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
  return g.reverse().join('');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export interface ReplaceResult {
  text: string;
  count: number;
}

/**
 * Find and replace. Literal mode is the default and cannot backtrack catastrophically.
 * Regex mode is rejected when the pattern looks like a nested-quantifier ReDoS shape.
 */
export function findReplace(
  text: string,
  find: string,
  replacement: string,
  opts: { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean } = {},
): ReplaceResult {
  if (find === '') throw new Error('The search pattern is empty.');
  let source = opts.regex ? find : escapeRegExp(find);
  if (opts.regex) assertSafeRegex(find);
  if (opts.wholeWord) source = `\\b(?:${source})\\b`;
  const re = new RegExp(source, `g${opts.caseSensitive ? '' : 'i'}u`);
  let count = 0;
  const out = text.replace(re, (...args) => {
    count++;
    if (!opts.regex) return replacement;
    const groups = args.slice(1, -2) as string[];
    return replacement.replace(/\$(\d+)/gu, (_m, n: string) => groups[Number(n) - 1] ?? '');
  });
  return { text: out, count };
}

/** Heuristic guard against catastrophic backtracking: nested quantifiers such as (a+)+ or (a*)*. */
export function assertSafeRegex(pattern: string): void {
  if (pattern.length > 500) throw new Error('Pattern is longer than 500 characters.');
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/u.test(pattern) || /\([^)]*\|[^)]*\)[+*]\s*[+*]/u.test(pattern)) {
    throw new Error('Pattern contains a nested quantifier that can cause catastrophic backtracking and was rejected.');
  }
  new RegExp(pattern, 'u'); // throws SyntaxError with a readable message on invalid input
}

// ---------- Diff ----------

export type DiffOp = { type: 'equal' | 'add' | 'remove'; text: string };

/** Line diff using Myers-style LCS via DP. Inputs are capped to keep worst-case memory bounded. */
export function diffLines(a: string, b: string, maxLines = 4000): DiffOp[] {
  const A = a === '' ? [] : a.split(/\r?\n/u);
  const B = b === '' ? [] : b.split(/\r?\n/u);
  if (A.length > maxLines || B.length > maxLines) throw new Error(`Diff input is limited to ${maxLines} lines per side.`);
  // Trim common prefix and suffix first; real-world diffs are mostly small.
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = A.slice(start, endA);
  const midB = B.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = midA[i] === midB[j] ? (dp[(i + 1) * w + j + 1] as number) + 1 : Math.max(dp[(i + 1) * w + j] as number, dp[i * w + j + 1] as number);
    }
  }
  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', text: A[i] as string });
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      ops.push({ type: 'equal', text: midA[i] as string });
      i++;
      j++;
    } else if ((dp[(i + 1) * w + j] as number) >= (dp[i * w + j + 1] as number)) {
      ops.push({ type: 'remove', text: midA[i++] as string });
    } else {
      ops.push({ type: 'add', text: midB[j++] as string });
    }
  }
  while (i < n) ops.push({ type: 'remove', text: midA[i++] as string });
  while (j < m) ops.push({ type: 'add', text: midB[j++] as string });
  for (let k = endA; k < A.length; k++) ops.push({ type: 'equal', text: A[k] as string });
  return ops;
}

export function diffSummary(ops: DiffOp[]): { added: number; removed: number; unchanged: number } {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const o of ops) {
    if (o.type === 'add') added++;
    else if (o.type === 'remove') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}

export function toUnifiedDiff(ops: DiffOp[]): string {
  return ops.map((o) => (o.type === 'add' ? '+ ' : o.type === 'remove' ? '- ' : '  ') + o.text).join('\n');
}
