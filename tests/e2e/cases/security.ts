import type { Case } from '../harness';
import { createHash } from 'node:crypto';

const sha = (a: string, d: string | Buffer) => createHash(a).update(d).digest('hex');
const hello = Buffer.from('hello world\n');

export const securityCases: Case[] = [
  { id: 'sha-256-hash-calculator', text: 'hello', expect: [sha('sha256', 'hello')] },
  { id: 'sha-256-hash-calculator', name: 'file + expected match', files: [{ name: 'h.txt', buffer: hello }], opts: { 'Expected digest (optional, to compare)': sha('sha256', hello).toUpperCase() }, expect: [sha('sha256', hello), 'matches'] },
  { id: 'sha-256-hash-calculator', name: 'expected mismatch', text: 'x', opts: { 'Expected digest (optional, to compare)': '00' }, error: 'does NOT match' },
  { id: 'sha-256-hash-calculator', name: 'empty input', text: '', error: /Enter text or choose/ },
  { id: 'sha-384-hash-calculator', text: 'hello', expect: [sha('sha384', 'hello')] },
  { id: 'sha-512-hash-calculator', files: [{ name: 'h.txt', buffer: hello }], expect: [sha('sha512', hello)] },
  { id: 'sha-1-hash-calculator', text: 'hello', expect: [sha('sha1', 'hello'), /legacy|not.*security|collision/i] },
  { id: 'md5-hash-calculator', text: 'hello', expect: [sha('md5', 'hello')] },
  { id: 'md5-hash-calculator', name: 'multi-file, one empty', files: [{ name: 'e.bin', buffer: '' }, { name: 'h.txt', buffer: hello }], expect: [sha('md5', ''), sha('md5', hello)] },
  { id: 'text-hash-calculator', text: 'hello', expect: [sha('md5', 'hello'), sha('sha1', 'hello'), sha('sha256', 'hello'), sha('sha512', 'hello'), '3610a686'] },
  { id: 'file-integrity-verifier', text: `${sha('sha256', hello)}  h.txt\n${sha('md5', 'zzz')} *bad.bin\n${'0'.repeat(64)}  gone.txt`, files: [{ name: 'h.txt', buffer: hello }, { name: 'bad.bin', buffer: 'not zzz' }, { name: 'extra.txt', buffer: 'e' }], expect: [/1 verified, 1 failed, 1 missing/, 'NOT LISTED', 'MISSING', 'FAILED'], errorNoticeOk: true },
  { id: 'file-integrity-verifier', name: 'BSD style', text: `SHA256 (h.txt) = ${sha('sha256', hello)}`, files: [{ name: 'h.txt', buffer: hello }], expect: [/1 verified, 0 failed, 0 missing/] },
  { id: 'file-integrity-verifier', name: 'garbage list', text: 'hello', files: [{ name: 'h.txt', buffer: hello }], error: /not understood/ },
  { id: 'secure-random-token-generator', opts: { 'How many': 3, 'Length (bytes for hex/base64url; characters otherwise and for passwords)': 16 }, expect: [/[0-9a-f]{32}\n[0-9a-f]{32}\n[0-9a-f]{32}/, '128 bits'] },
  { id: 'secure-random-token-generator', name: 'password', opts: { Generate: 'Password', 'Length (bytes for hex/base64url; characters otherwise and for passwords)': 20 }, expect: [/bits/] },
  { id: 'secure-random-token-generator', name: 'password with no sets', opts: { Generate: 'Password', 'Password: lowercase': false, 'Password: uppercase': false, 'Password: digits': false, 'Password: symbols': false }, error: /Select at least one/ },
  { id: 'uuid-security-inspector', text: '018f3b1e-7c2a-7d3b-9a1f-0123456789ab', expect: [/Version\s*7/, /timestamp/i] },
  { id: 'uuid-security-inspector', name: 'v1 leak note', text: 'c232ab00-9414-11ec-b3c8-9f6bdeced846', expect: [/Version\s*1/, /MAC/] },
  { id: 'uuid-security-inspector', name: 'invalid', text: 'nope', expect: ['Not a 128-bit UUID'], errorNoticeOk: true },
  { id: 'url-safety-syntax-inspector', text: 'http://user:pass@192.168.0.1:8080/login', expect: ['HIGH', 'user:password', 'IP address', 'HTTP'] },
  { id: 'url-safety-syntax-inspector', name: 'javascript scheme', text: 'javascript:alert(1)', expect: ['HIGH', 'can run code'] },
  { id: 'http-security-header-reference', expect: ['Content-Security-Policy', 'Strict-Transport-Security', 'nosniff'] },
  { id: 'content-security-policy-builder', expect: ["default-src 'self'", "object-src 'none'", 'frame-ancestors'] },
  { id: 'content-security-policy-builder', name: 'unsafe-inline warns', opts: { 'script-src': "'self' 'unsafe-inline'" }, expect: ["allows 'unsafe-inline'"] },
  { id: 'content-security-policy-builder', name: 'unquoted keyword rejected', opts: { 'script-src': 'self' }, error: /single quotes/ },
  { id: 'subresource-integrity-generator', files: [{ name: 'a.js', buffer: 'console.log(1)' }], opts: { 'Public https:// URL of the file (for the tag)': 'https://cdn.example.com/a.js' }, expect: ['sha384-' + createHash('sha384').update('console.log(1)').digest('base64'), '<script src="https://cdn.example.com/a.js"'] },
  { id: 'subresource-integrity-generator', name: 'http URL refused for tag', files: [{ name: 'a.css', buffer: 'a{}' }], opts: { 'Public https:// URL of the file (for the tag)': 'http://x.test/a.css' }, expect: ['https://'] },
  { id: 'password-strength-estimator', text: 'password123', expect: [/Very weak|Weak/] },
  { id: 'password-strength-estimator', name: 'strong', text: 'k7#Qv!9zLm2$Xp8wRt', expect: [/Good|Strong/] },
  { id: 'local-file-metadata-privacy-inspector', name: 'not an image', files: [{ name: 'x.jpg', buffer: 'plain text' }], error: /not a JPEG, PNG or WebP/ },
];
