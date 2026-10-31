/** Security-oriented helpers. Educational and defensive: nothing here is a guarantee of safety. */
import { bytesToBase64 } from './encoding';

// ---------- secure random ----------

const ALPHABETS = {
  hex: '0123456789abcdef',
  base62: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  base32: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
} as const;

/** Uniform random integer in [0, max) using rejection sampling over crypto.getRandomValues (no modulo bias). */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new Error('max must be an integer between 1 and 2^32.');
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while ((buf[0] as number) >= limit);
  return (buf[0] as number) % max;
}

export type TokenFormat = 'hex' | 'base64url' | 'base62' | 'base32' | 'digits';

export function generateToken(bytesOrLen: number, format: TokenFormat = 'hex'): { token: string; bits: number } {
  if (!Number.isInteger(bytesOrLen) || bytesOrLen < 1 || bytesOrLen > 1024) throw new Error('Length must be between 1 and 1024.');
  if (format === 'hex') {
    const b = crypto.getRandomValues(new Uint8Array(bytesOrLen));
    return { token: Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''), bits: bytesOrLen * 8 };
  }
  if (format === 'base64url') {
    const b = crypto.getRandomValues(new Uint8Array(bytesOrLen));
    return { token: bytesToBase64(b).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, ''), bits: bytesOrLen * 8 };
  }
  const alphabet = format === 'base62' ? ALPHABETS.base62 : format === 'base32' ? ALPHABETS.base32 : ALPHABETS.digits;
  let s = '';
  for (let i = 0; i < bytesOrLen; i++) s += alphabet[randomInt(alphabet.length)];
  return { token: s, bits: Math.floor(bytesOrLen * Math.log2(alphabet.length)) };
}

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export function generatePassword(o: PasswordOptions): { password: string; bits: number } {
  if (!Number.isInteger(o.length) || o.length < 4 || o.length > 256) throw new Error('Length must be between 4 and 256.');
  const strip = (s: string) => (o.excludeAmbiguous ? s.replace(/[Il1O0o|`'"]/gu, '') : s);
  const sets: string[] = [];
  if (o.lower) sets.push(strip('abcdefghijklmnopqrstuvwxyz'));
  if (o.upper) sets.push(strip('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
  if (o.digits) sets.push(strip('0123456789'));
  if (o.symbols) sets.push(strip('!@#$%^&*()-_=+[]{};:,.<>/?~'));
  if (sets.length === 0) throw new Error('Select at least one character set.');
  if (o.length < sets.length) throw new Error('Length is too short to include one character from every selected set.');
  const all = sets.join('');
  const chars: string[] = sets.map((s) => s[randomInt(s.length)] as string); // guarantee one of each set
  while (chars.length < o.length) chars.push(all[randomInt(all.length)] as string);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return { password: chars.join(''), bits: Math.floor(o.length * Math.log2(all.length)) };
}

export function generateUuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** RFC 9562 UUIDv7: 48-bit unix-ms timestamp followed by random bits. */
export function generateUuidV7(now = Date.now()): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let t = BigInt(now);
  for (let i = 5; i >= 0; i--) {
    b[i] = Number(t & 0xffn);
    t >>= 8n;
  }
  b[6] = ((b[6] as number) & 0x0f) | 0x70;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface UuidReport {
  valid: boolean;
  normalized?: string;
  version?: number;
  variant?: string;
  timestamp?: string;
  nil?: boolean;
  notes: string[];
}

export function inspectUuid(input: string): UuidReport {
  const s = input.trim().replace(/^urn:uuid:/iu, '').replace(/^[{(]|[})]$/gu, '').toLowerCase();
  const notes: string[] = [];
  const m = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/u.exec(s);
  if (!m) return { valid: false, notes: ['Not a 128-bit UUID in 8-4-4-4-12 hexadecimal form.'] };
  const hex = m.slice(1).join('');
  const normalized = `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}`;
  if (hex === '0'.repeat(32)) return { valid: true, normalized, nil: true, notes: ['Nil UUID (all zeros).'] };
  if (hex === 'f'.repeat(32)) return { valid: true, normalized, notes: ['Max UUID (all ones).'] };
  const version = parseInt(hex[12] as string, 16);
  const vbits = parseInt(hex[16] as string, 16);
  const variant = (vbits & 0x8) === 0 ? 'NCS (reserved)' : (vbits & 0xc) === 0x8 ? 'RFC 4122 / 9562' : (vbits & 0xe) === 0xc ? 'Microsoft (reserved)' : 'Future (reserved)';
  const rep: UuidReport = { valid: true, normalized, version, variant, notes };
  if (version === 7) {
    rep.timestamp = new Date(Number(BigInt('0x' + hex.slice(0, 12)))).toISOString();
    notes.push('Version 7 leaks its creation time (millisecond precision) and is time-sortable.');
  } else if (version === 1) {
    // 100-ns intervals since 1582-10-15.
    const tl = hex.slice(0, 8);
    const tm = hex.slice(8, 12);
    const th = hex.slice(13, 16);
    const ts = BigInt('0x' + th + tm + tl);
    const ms = Number((ts - 122192928000000000n) / 10000n);
    rep.timestamp = new Date(ms).toISOString();
    notes.push('Version 1 embeds a timestamp and a node ID that is often a MAC address: a privacy leak.');
  } else if (version === 4) {
    notes.push('Version 4 should be random, but a UUID alone cannot prove it was generated with a secure RNG.');
  } else if (version === 3 || version === 5) notes.push(`Version ${version} is a deterministic hash of a name; it is not secret.`);
  else if (version < 1 || version > 8) notes.push('Version nibble is outside the defined range 1–8.');
  notes.push('A UUID is an identifier, not a secret. Do not use it as a session token or password-reset token unless generated from a CSPRNG and treated as a bearer secret.');
  return rep;
}

// ---------- password strength ----------

export interface StrengthReport {
  entropyBits: number;
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  findings: string[];
  crackTimeOffline: string;
}

const COMMON = new Set(['password', 'passw0rd', 'p@ssw0rd', '123456', '12345678', '123456789', '1234567890', 'qwerty', 'qwertyuiop', 'abc123', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'master', 'sunshine', 'princess', 'login', 'passw0rd1', 'trustno1', '111111', '000000', '654321', 'superman', 'whatever', 'changeme', 'default', 'secret', 'qazwsx', '1q2w3e4r', 'zaq12wsx', 'letmein123', 'password1', 'password123']);

/**
 * Heuristic estimate. It penalises common passwords, keyboard walks, repeats and sequences, but it is NOT a
 * guarantee: a password that scores "Strong" can still be leaked, phished or reused.
 */
export function estimatePassword(pw: string): StrengthReport {
  const findings: string[] = [];
  if (pw === '') return { entropyBits: 0, score: 0, label: 'Very weak', findings: ['Empty.'], crackTimeOffline: 'instant' };
  let pool = 0;
  if (/[a-z]/u.test(pw)) pool += 26;
  if (/[A-Z]/u.test(pw)) pool += 26;
  if (/\d/u.test(pw)) pool += 10;
  if (/[^\w\s]/u.test(pw)) pool += 33;
  if (/\s/u.test(pw)) pool += 1;
  if (/[^\x00-\x7F]/u.test(pw)) pool += 100;
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  const lower = pw.toLowerCase();
  const deLeet = lower.replace(/0/gu, 'o').replace(/[1!|]/gu, 'i').replace(/3/gu, 'e').replace(/4|@/gu, 'a').replace(/5|\$/gu, 's').replace(/7/gu, 't');
  if (COMMON.has(lower) || COMMON.has(deLeet)) {
    bits = Math.min(bits, 10);
    findings.push('Matches a very common password.');
  } else {
    for (const c of COMMON) {
      if (c.length >= 5 && (lower.includes(c) || deLeet.includes(c))) {
        bits -= c.length * 3;
        findings.push(`Contains the common password "${c}".`);
        break;
      }
    }
  }
  // Dictionary-word shapes. No word list ships with the app, so these structural rules stand in for one and
  // intentionally err toward UNDER-estimating strength.
  const wordDigits = /^([A-Za-z]{3,10})(\d{1,4})([!@#$%^&*.?_-]{0,3})$/u.exec(pw);
  if (wordDigits) {
    const cap = 17 + 3.3 * (wordDigits[2] as string).length + 4 * (wordDigits[3] as string).length;
    if (bits > cap) {
      bits = cap;
      findings.push('Shaped like a common word followed by digits and symbols, which attackers try first.');
    }
  }
  if (/^[a-z]+$/u.test(deLeet) && deLeet !== lower && pw.length <= 14) {
    const leetCount = [...pw].filter((ch, idx) => ch.toLowerCase() !== deLeet[idx]).length;
    bits = Math.min(bits, 20 + leetCount * 2);
    findings.push('Looks like a plain word with look-alike substitutions (0 for o, 4 for a). Attackers apply these substitutions automatically.');
  }
  if (/^[a-z ]+$/u.test(pw) && pw.length >= 8) {
    const cap = pw.length * 2.2; // natural-language text carries roughly 2 bits per character
    if (bits > cap) {
      bits = cap;
      findings.push('Only lowercase letters and spaces: estimated at natural-language strength rather than as random characters.');
    }
  }
  const unique = new Set(pw).size;
  if (pw.length >= 4 && unique <= Math.ceil(pw.length / 4)) {
    bits *= 0.5;
    findings.push('Very few distinct characters.');
  }
  if (/(.)\1{2,}/u.test(pw)) {
    bits -= 6;
    findings.push('Repeated characters (aaa).');
  }
  if (/(.{2,})\1/u.test(pw)) {
    bits -= 8;
    findings.push('Repeated pattern (abab).');
  }
  const seqs = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  for (const sq of seqs) {
    for (let i = 0; i + 4 <= sq.length; i++) {
      const w = sq.slice(i, i + 4);
      if (lower.includes(w) || lower.includes([...w].reverse().join(''))) {
        bits -= 8;
        findings.push(`Sequence or keyboard walk ("${w}").`);
        i = sq.length;
        break;
      }
    }
  }
  if (/(19|20)\d{2}$/u.test(pw)) {
    bits -= 6;
    findings.push('Ends with a year.');
  }
  if (/^[a-zA-Z]+\d{1,3}[!@#$.?]?$/u.test(pw)) {
    bits -= 6;
    findings.push('Word followed by digits/symbol is a very common pattern.');
  }
  if (pw.length < 12) findings.push('Shorter than 12 characters.');
  bits = Math.max(0, Math.round(bits));
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
  // Assume a fast offline attack of 1e10 guesses/second against a fast hash; the true average is half the space.
  const seconds = 2 ** Math.max(0, bits - 1) / 1e10;
  return { entropyBits: bits, score, label: labels[score], findings, crackTimeOffline: humanDuration(seconds) };
}

function humanDuration(sec: number): string {
  if (sec < 1) return 'under a second';
  const units: [number, string][] = [[3.156e16, 'billion years'], [3.156e13, 'million years'], [3.156e10, 'thousand years'], [31557600, 'years'], [86400, 'days'], [3600, 'hours'], [60, 'minutes'], [1, 'seconds']];
  for (const [s, name] of units) {
    if (sec >= s) {
      const v = sec / s;
      return `about ${v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1)} ${name}`;
    }
  }
  return 'under a second';
}

// ---------- URL syntax inspection ----------

export interface UrlFinding {
  level: 'info' | 'warn' | 'high';
  message: string;
}

/** Syntactic red-flag checks. This is NOT a phishing or malware detector; it never contacts the URL. */
export function inspectUrlSyntax(input: string): { parsed: boolean; findings: UrlFinding[]; hostname?: string } {
  const findings: UrlFinding[] = [];
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { parsed: false, findings: [{ level: 'high', message: 'Not a valid absolute URL.' }] };
  }
  const host = u.hostname;
  if (['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'].includes(u.protocol)) findings.push({ level: 'high', message: `Scheme "${u.protocol}" can run code or read local data; do not open links like this from untrusted sources.` });
  else if (u.protocol === 'http:') findings.push({ level: 'warn', message: 'Uses HTTP, so traffic is not encrypted.' });
  if (u.username || u.password) findings.push({ level: 'high', message: 'Contains user:password@ before the host; the real host is what follows the "@". Often used to disguise destinations.' });
  if (/^\d{1,3}(\.\d{1,3}){3}$/u.test(host) || /^\[.*\]$/u.test(host) || /^0x[0-9a-f]+$/iu.test(host) || /^\d{8,10}$/u.test(host)) findings.push({ level: 'warn', message: 'Host is an IP address (or numeric form of one) instead of a domain name.' });
  if (host.split('.').some((l) => l.startsWith('xn--'))) findings.push({ level: 'warn', message: 'Internationalised (Punycode) hostname. Compare the decoded name carefully for look-alike characters.' });
  if (/[^\x00-\x7F]/u.test(raw.split('/')[2] ?? '')) findings.push({ level: 'warn', message: 'Raw non-ASCII characters in the host.' });
  if (host.split('.').length > 4) findings.push({ level: 'info', message: 'Many subdomain levels; the registrable domain is only the last two or three labels.' });
  if (u.port && !['80', '443'].includes(u.port)) findings.push({ level: 'info', message: `Non-standard port ${u.port}.` });
  if (raw.length > 2000) findings.push({ level: 'info', message: 'Very long URL.' });
  if (/%2e%2e|%2f|%5c/iu.test(raw)) findings.push({ level: 'warn', message: 'Percent-encoded dots or slashes in the URL, sometimes used to bypass path filters.' });
  if (/\.(zip|mov)$/iu.test(host)) findings.push({ level: 'info', message: `The TLD ".${host.split('.').pop()}" is also a common file extension, which has been abused in look-alike links.` });
  if (/(login|verify|secure|account|update|wallet|signin)/iu.test(host) && host.split('.').length > 2) findings.push({ level: 'info', message: 'Host contains a credential-themed word as a subdomain. Check the registrable domain, not the leftmost label.' });
  if (findings.length === 0) findings.push({ level: 'info', message: 'No syntactic red flags found. This does not mean the site is safe.' });
  return { parsed: true, findings, hostname: host };
}

// ---------- CSP builder ----------

export interface CspConfig {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  fontSrc: string[];
  objectSrc: string[];
  frameSrc: string[];
  workerSrc: string[];
  baseUri: string[];
  formAction: string[];
  frameAncestors: string[];
  upgradeInsecure: boolean;
  blockMixed: boolean;
}

export const defaultCsp: CspConfig = {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'"],
  objectSrc: ["'none'"], frameSrc: ["'none'"], workerSrc: ["'self'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"], upgradeInsecure: true, blockMixed: false,
};

const SRC_TOKEN = /^('(self|none|unsafe-inline|unsafe-eval|unsafe-hashes|strict-dynamic|wasm-unsafe-eval|report-sample|nonce-[A-Za-z0-9+/_=-]+|sha(256|384|512)-[A-Za-z0-9+/_=-]+)'|[a-z][a-z0-9+.-]*:|\*|(\*\.)?[a-z0-9.-]+(:\d+|:\*)?(\/[^\s;,]*)?|https?:\/\/[^\s;,']+)$/iu;

export function buildCsp(c: CspConfig): { header: string; warnings: string[] } {
  const warnings: string[] = [];
  const dirs: [string, string[]][] = [
    ['default-src', c.defaultSrc], ['script-src', c.scriptSrc], ['style-src', c.styleSrc], ['img-src', c.imgSrc], ['connect-src', c.connectSrc], ['font-src', c.fontSrc],
    ['object-src', c.objectSrc], ['frame-src', c.frameSrc], ['worker-src', c.workerSrc], ['base-uri', c.baseUri], ['form-action', c.formAction], ['frame-ancestors', c.frameAncestors],
  ];
  const parts: string[] = [];
  for (const [name, vals] of dirs) {
    if (vals.length === 0) continue;
    for (const v of vals) {
      if (/^(self|none|unsafe-inline|unsafe-eval|unsafe-hashes|strict-dynamic|wasm-unsafe-eval|report-sample|nonce-.+|sha(256|384|512)-.+)$/iu.test(v)) {
        throw new Error(`"${v}" is a keyword and must be written in single quotes, for example '${v}'. Unquoted, browsers treat it as a host name.`);
      }
    }
    for (const v of vals) if (!SRC_TOKEN.test(v)) throw new Error(`"${v}" is not a valid source expression for ${name}. Quote keywords like 'self' and 'none'.`);
    if (vals.includes("'none'") && vals.length > 1) throw new Error(`${name}: 'none' cannot be combined with other sources.`);
    parts.push(`${name} ${vals.join(' ')}`);
    if (vals.includes("'unsafe-inline'")) warnings.push(`${name} allows 'unsafe-inline', which largely defeats CSP protection against XSS. Prefer nonces or hashes.`);
    if (vals.includes("'unsafe-eval'")) warnings.push(`${name} allows 'unsafe-eval'. Avoid it unless a library strictly requires it.`);
    if (vals.includes('*')) warnings.push(`${name} allows any origin (*).`);
    if (vals.some((v) => v === 'data:') && name === 'script-src') warnings.push("script-src allows data: URLs, which permits script injection.");
    if (vals.some((v) => v === 'https:') && (name === 'script-src' || name === 'default-src')) warnings.push(`${name} allows any HTTPS origin, which is a very broad trust.`);
  }
  if (c.upgradeInsecure) parts.push('upgrade-insecure-requests');
  if (c.blockMixed) parts.push('block-all-mixed-content');
  if (!c.objectSrc.includes("'none'")) warnings.push("object-src is not 'none'; plugins/embeds remain a risk.");
  if (c.baseUri.length === 0) warnings.push('base-uri is not set; injected <base> tags could redirect relative URLs.');
  if (c.frameAncestors.length === 0) warnings.push('frame-ancestors is not set, so the page can be framed (clickjacking). X-Frame-Options is not a CSP replacement for every browser.');
  warnings.push('frame-ancestors, report-uri and sandbox are ignored when CSP is delivered in a <meta> tag; send it as an HTTP header.');
  return { header: parts.join('; '), warnings };
}

// ---------- SRI ----------

export async function sriFromBytes(data: Uint8Array, algos: ('SHA-256' | 'SHA-384' | 'SHA-512')[] = ['SHA-384']): Promise<string> {
  const out: string[] = [];
  for (const a of algos) {
    const d = new Uint8Array(await crypto.subtle.digest(a, data as BufferSource));
    out.push(`sha${a.slice(4)}-${bytesToBase64(d)}`);
  }
  return out.join(' ');
}

export function sriTag(kind: 'script' | 'link', url: string, integrity: string): string {
  if (!/^https:\/\//iu.test(url)) throw new Error('Use an absolute https:// URL: SRI only protects resources fetched over a secure channel.');
  const esc = (s: string) => s.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');
  return kind === 'script'
    ? `<script src="${esc(url)}" integrity="${esc(integrity)}" crossorigin="anonymous"></script>`
    : `<link rel="stylesheet" href="${esc(url)}" integrity="${esc(integrity)}" crossorigin="anonymous">`;
}

// ---------- security header reference (static documentation, not a scan) ----------

export interface HeaderRef {
  name: string;
  purpose: string;
  recommended: string;
  notes: string;
}

export const SECURITY_HEADERS: HeaderRef[] = [
  { name: 'Content-Security-Policy', purpose: 'Restricts where scripts, styles, images and other resources may load from; mitigates XSS impact.', recommended: "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'", notes: 'Tune per app. Avoid unsafe-inline/unsafe-eval. It reduces, but does not eliminate, XSS risk.' },
  { name: 'Strict-Transport-Security', purpose: 'Tells browsers to use HTTPS only for the host.', recommended: 'max-age=31536000; includeSubDomains', notes: 'Add preload only after confirming every subdomain supports HTTPS. Ignored over plain HTTP.' },
  { name: 'X-Content-Type-Options', purpose: 'Stops MIME sniffing so a file is not reinterpreted as script.', recommended: 'nosniff', notes: 'Pair with correct Content-Type headers.' },
  { name: 'Referrer-Policy', purpose: 'Controls how much URL information is sent in the Referer header.', recommended: 'strict-origin-when-cross-origin', notes: 'Use no-referrer for sensitive pages.' },
  { name: 'Permissions-Policy', purpose: 'Disables powerful browser features (camera, microphone, geolocation) for the page and embedded frames.', recommended: 'camera=(), microphone=(), geolocation=()', notes: 'Only list features you do not need.' },
  { name: 'Cross-Origin-Opener-Policy', purpose: 'Isolates the browsing context group from cross-origin windows.', recommended: 'same-origin', notes: 'May break OAuth pop-up flows; test first.' },
  { name: 'Cross-Origin-Resource-Policy', purpose: 'Prevents other origins from loading your resources.', recommended: 'same-origin', notes: 'Use same-site or cross-origin for assets that must be shared.' },
  { name: 'Cross-Origin-Embedder-Policy', purpose: 'Requires cross-origin resources to opt in; needed for cross-origin isolation (SharedArrayBuffer).', recommended: 'require-corp', notes: 'Can break third-party embeds.' },
  { name: 'X-Frame-Options', purpose: 'Legacy clickjacking protection.', recommended: 'DENY', notes: 'Superseded by CSP frame-ancestors; keep both for older browsers.' },
  { name: 'Cache-Control', purpose: 'Prevents sensitive responses from being stored by shared caches.', recommended: 'no-store (for sensitive pages)', notes: 'Static hashed assets can use long max-age + immutable.' },
];
