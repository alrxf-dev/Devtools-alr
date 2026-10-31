/** Encoding and number-system helpers. Pure functions; throw Error with readable messages on bad input. */

const utf8Enc = new TextEncoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  let s = b64.trim().replace(/^data:[^,]*;base64,/iu, '').replace(/\s+/gu, '');
  // Accept base64url too.
  s = s.replace(/-/gu, '+').replace(/_/gu, '/');
  if (s === '') return new Uint8Array(0);
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(s)) throw new Error('Input contains characters that are not valid Base64.');
  while (s.length % 4 !== 0) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeBase64(text: string, urlSafe = false): string {
  const b = bytesToBase64(utf8Enc.encode(text));
  return urlSafe ? b.replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '') : b;
}

export function decodeBase64(b64: string): string {
  const bytes = base64ToBytes(b64);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The decoded bytes are not valid UTF-8 text. The input may be binary data; use the file tools instead.');
  }
}

export function urlEncode(text: string, mode: 'component' | 'full' = 'component'): string {
  try {
    return mode === 'component' ? encodeURIComponent(text) : encodeURI(text);
  } catch {
    throw new Error('Input contains an unpaired surrogate and cannot be URL-encoded.');
  }
}

export function urlDecode(text: string, plusAsSpace = false): string {
  try {
    return decodeURIComponent(plusAsSpace ? text.replace(/\+/gu, ' ') : text);
  } catch {
    throw new Error('Input contains an invalid percent-encoded sequence (for example a stray "%").');
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', euro: '€', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', trade: '™',
};

export function htmlEncode(text: string, opts: { nonAscii?: boolean } = {}): string {
  let out = text.replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  if (opts.nonAscii) out = out.replace(/[^\x00-\x7F]/gu, (c) => `&#${c.codePointAt(0)};`);
  return out;
}

export function htmlDecode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/giu, (m, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const cp = parseInt(body.slice(2), 16);
      return validCodePoint(cp) ? String.fromCodePoint(cp) : m;
    }
    if (body.startsWith('#')) {
      const cp = parseInt(body.slice(1), 10);
      return validCodePoint(cp) ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

function validCodePoint(cp: number): boolean {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
}

export function textToHex(text: string, sep = ' '): string {
  return Array.from(utf8Enc.encode(text), (b) => b.toString(16).padStart(2, '0')).join(sep);
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/0x/giu, '').replace(/[\s,:-]+/gu, '');
  if (clean === '') return new Uint8Array(0);
  if (!/^[0-9a-fA-F]+$/u.test(clean)) throw new Error('Hex input may only contain 0-9, a-f and separators (space, comma, colon, dash).');
  if (clean.length % 2 !== 0) throw new Error('Hex input has an odd number of digits; each byte needs two.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function hexToText(hex: string): string {
  const bytes = hexToBytes(hex);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The bytes are not valid UTF-8 text.');
  }
}

export function textToBinary(text: string, sep = ' '): string {
  return Array.from(utf8Enc.encode(text), (b) => b.toString(2).padStart(8, '0')).join(sep);
}

export function binaryToText(bin: string): string {
  const clean = bin.replace(/[\s,]+/gu, '');
  if (clean === '') return '';
  if (!/^[01]+$/u.test(clean)) throw new Error('Binary input may only contain 0 and 1 (and whitespace).');
  if (clean.length % 8 !== 0) throw new Error(`Binary input length (${clean.length}) is not a multiple of 8 bits.`);
  const out = new Uint8Array(clean.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 8, i * 8 + 8), 2);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(out);
  } catch {
    throw new Error('The bits do not form valid UTF-8 text.');
  }
}

export interface Utf8Report {
  valid: boolean;
  byteLength: number;
  hasBom: boolean;
  firstErrorOffset: number | null;
  message: string;
}

export function validateUtf8(bytes: Uint8Array): Utf8Report {
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { valid: true, byteLength: bytes.length, hasBom, firstErrorOffset: null, message: 'Valid UTF-8.' };
  } catch {
    // Locate the first invalid sequence by manual scan.
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i] as number;
      let need = 0;
      if (b < 0x80) need = 0;
      else if (b >= 0xc2 && b <= 0xdf) need = 1;
      else if (b >= 0xe0 && b <= 0xef) need = 2;
      else if (b >= 0xf0 && b <= 0xf4) need = 3;
      else break;
      let ok = true;
      for (let k = 1; k <= need; k++) if (((bytes[i + k] ?? 0) & 0xc0) !== 0x80) ok = false;
      if (!ok) break;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(i, i + need + 1));
      } catch {
        break;
      }
      i += need + 1;
    }
    return { valid: false, byteLength: bytes.length, hasBom, firstErrorOffset: i, message: `Invalid UTF-8 sequence at byte offset ${i}.` };
  }
}

// ---------- Unicode ----------

export interface CodePointInfo {
  char: string;
  codePoint: string;
  decimal: number;
  utf8: string;
  utf16: string;
  category: string;
  name?: string;
}

function category(cp: number): string {
  const c = String.fromCodePoint(cp);
  if (/\p{Lu}/u.test(c)) return 'Letter, uppercase';
  if (/\p{Ll}/u.test(c)) return 'Letter, lowercase';
  if (/\p{L}/u.test(c)) return 'Letter, other';
  if (/\p{Nd}/u.test(c)) return 'Number, decimal digit';
  if (/\p{N}/u.test(c)) return 'Number, other';
  if (/\p{M}/u.test(c)) return 'Mark (combining)';
  if (/\p{Zs}/u.test(c)) return 'Separator, space';
  if (/\p{P}/u.test(c)) return 'Punctuation';
  if (/\p{S}/u.test(c)) return 'Symbol';
  if (/\p{Cc}/u.test(c)) return 'Control';
  if (/\p{Cf}/u.test(c)) return 'Format (invisible)';
  if (/\p{Co}/u.test(c)) return 'Private use';
  return 'Other';
}

export function inspectUnicode(text: string, limit = 2000): CodePointInfo[] {
  const out: CodePointInfo[] = [];
  for (const ch of text) {
    if (out.length >= limit) break;
    const cp = ch.codePointAt(0) as number;
    const u8 = Array.from(utf8Enc.encode(ch), (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const u16: string[] = [];
    for (let i = 0; i < ch.length; i++) u16.push(ch.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase());
    out.push({ char: ch, codePoint: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'), decimal: cp, utf8: u8, utf16: u16.join(' '), category: category(cp) });
  }
  return out;
}

// ---------- Number base conversion (BigInt, arbitrary size) ----------

export type Base = 2 | 8 | 10 | 16;

export function parseInBase(input: string, base: Base): bigint {
  let s = input.trim().replace(/[_\s]/gu, '').toLowerCase();
  let neg = false;
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  }
  const prefix = { 2: '0b', 8: '0o', 10: '', 16: '0x' }[base];
  if (prefix && s.startsWith(prefix)) s = s.slice(prefix.length);
  const digits = '0123456789abcdef'.slice(0, base);
  if (s === '') throw new Error('No digits were entered.');
  let n = 0n;
  const b = BigInt(base);
  for (const ch of s) {
    const d = digits.indexOf(ch);
    if (d < 0) throw new Error(`"${ch}" is not a valid base-${base} digit.`);
    n = n * b + BigInt(d);
  }
  return neg ? -n : n;
}

export function convertBase(input: string, from: Base): { binary: string; octal: string; decimal: string; hex: string } {
  const n = parseInBase(input, from);
  return { binary: n.toString(2), octal: n.toString(8), decimal: n.toString(10), hex: n.toString(16).toUpperCase() };
}

// ---------- Time ----------

export interface TimestampInfo {
  unit: 'seconds' | 'milliseconds';
  iso: string;
  utc: string;
  local: string;
  relative: string;
}

export function parseUnixTimestamp(input: string, now = Date.now()): TimestampInfo {
  const s = input.trim();
  if (!/^-?\d+(\.\d+)?$/u.test(s)) throw new Error('A Unix timestamp must be a number such as 1700000000 or 1700000000000.');
  const num = Number(s);
  // Heuristic: values with abs >= 1e11 are treated as milliseconds (year 5138 in seconds vs 1973 in ms).
  const unit = Math.abs(num) >= 1e11 ? 'milliseconds' : 'seconds';
  const ms = unit === 'seconds' ? num * 1000 : num;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) throw new Error('Timestamp is outside the range JavaScript dates can represent.');
  const diff = Math.round((ms - now) / 1000);
  const abs = Math.abs(diff);
  const parts: [number, string][] = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
  let rel = 'now';
  for (const [sec, name] of parts) {
    if (abs >= sec) {
      const v = Math.floor(abs / sec);
      rel = diff < 0 ? `${v} ${name}${v > 1 ? 's' : ''} ago` : `in ${v} ${name}${v > 1 ? 's' : ''}`;
      break;
    }
  }
  return { unit, iso: d.toISOString(), utc: d.toUTCString(), local: d.toString(), relative: rel };
}

export function dateToUnix(input: string): { seconds: number; milliseconds: number; iso: string } {
  const d = new Date(input.trim());
  if (input.trim() === '' || Number.isNaN(d.getTime())) throw new Error('That date could not be parsed. Use an ISO 8601 form such as 2026-10-28T12:00:00Z.');
  return { seconds: Math.floor(d.getTime() / 1000), milliseconds: d.getTime(), iso: d.toISOString() };
}

export function formatDate(input: string, tz: 'UTC' | 'local' = 'UTC'): Record<string, string> {
  const d = new Date(input.trim());
  if (input.trim() === '' || Number.isNaN(d.getTime())) throw new Error('That date could not be parsed. Use an ISO 8601 form such as 2026-10-28T12:00:00Z.');
  const u = tz === 'UTC';
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  const Y = u ? d.getUTCFullYear() : d.getFullYear();
  const M = (u ? d.getUTCMonth() : d.getMonth()) + 1;
  const D = u ? d.getUTCDate() : d.getDate();
  const h = u ? d.getUTCHours() : d.getHours();
  const mi = u ? d.getUTCMinutes() : d.getMinutes();
  const s = u ? d.getUTCSeconds() : d.getSeconds();
  return {
    'ISO 8601': d.toISOString(),
    'YYYY-MM-DD': `${p(Y, 4)}-${p(M)}-${p(D)}`,
    'YYYY-MM-DD HH:mm:ss': `${p(Y, 4)}-${p(M)}-${p(D)} ${p(h)}:${p(mi)}:${p(s)}`,
    'DD/MM/YYYY': `${p(D)}/${p(M)}/${p(Y, 4)}`,
    'MM/DD/YYYY': `${p(M)}/${p(D)}/${p(Y, 4)}`,
    'RFC 2822': d.toUTCString(),
    'Unix seconds': String(Math.floor(d.getTime() / 1000)),
    'Unix milliseconds': String(d.getTime()),
  };
}
