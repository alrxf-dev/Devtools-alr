import { form, kv, notice, optCheck, optNum, optSelect, optText, table, text, str, bool, num, readBytes, oneFile, needFiles } from './kit';
import type { Block, FormToolImpl, ImplMap } from './types';
import { runJob } from '../workers/client';
import { hashText, timingSafeEqualHex, guessAlgoFromHex, LEGACY_NOTICE, type HashAlgo } from '../lib/hash';
import { generateToken, generatePassword, inspectUuid, estimatePassword, inspectUrlSyntax, buildCsp, defaultCsp, sriTag, SECURITY_HEADERS, type TokenFormat, type CspConfig } from '../lib/security';
import { privacyReport, stripJpegMetadata, stripPngMetadata, stripWebpMetadata } from '../lib/imagemeta';
import { formatBytes } from '../lib/sniff';
import { withExtension } from '../lib/safe';


function hashTool(algo: HashAlgo): FormToolImpl {
  return form({
    text: { label: 'Text to hash (UTF-8)', rows: 4, sample: 'hello', optional: true },
    files: { label: 'Or choose files', multiple: true, optional: true, maxFiles: 50 },
    options: [optCheck('upper', 'Uppercase hex'), optText('expected', 'Expected digest (optional, to compare)', '', { placeholder: 'paste a known-good hash', maxLength: 200 })],
    live: false,
    runLabel: 'Compute hash',
    async run({ text: t, files, opts }, ctx) {
      if (t === '' && files.length === 0) throw new Error('Enter text or choose at least one file.');
      const up = (s: string) => (bool(opts, 'upper') ? s.toUpperCase() : s.toLowerCase());
      const expected = str(opts, 'expected').trim().replace(/\s+/gu, '');
      const out: Block[] = [];
      const legacy = LEGACY_NOTICE[algo];
      if (legacy) out.push(notice('warn', legacy));
      const rows: [string, string][] = [];
      const digests: string[] = [];
      if (t !== '') { const d = await hashText(algo, t); digests.push(d); rows.push(['Text', up(d)]); }
      if (files.length > 0) {
        const res = await runJob('hashFiles', { files, algos: [algo] }, { signal: ctx.signal, onProgress: ctx.progress });
        for (const r of res) { const d = r.hashes[algo] as string; digests.push(d); rows.push([`${r.name} (${formatBytes(r.size)})`, up(d)]); }
      }
      out.push(kv(rows, algo));
      if (expected) {
        const hit = digests.some((d) => timingSafeEqualHex(d, expected));
        out.push(notice(hit ? 'success' : 'error', hit ? 'The expected digest matches.' : 'The expected digest does NOT match any computed digest.'));
      }
      out.push(text(rows.map(([n, d]) => `${d}  ${n.replace(/ \([^)]*\)$/u, '')}`).join('\n'), { title: 'Checksum list', filename: `${algo.toLowerCase()}sums.txt`, mime: 'text/plain' }));
      return out;
    },
  });
}

function parseChecksumList(src: string): { hash: string; name: string }[] {
  const out: { hash: string; name: string }[] = [];
  for (const raw of src.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let m = /^(?:MD5|SHA-?1|SHA-?256|SHA-?384|SHA-?512|CRC32)\s*\((.+)\)\s*=\s*([0-9a-fA-F]+)$/iu.exec(line);
    if (m) { out.push({ name: m[1] as string, hash: (m[2] as string).toLowerCase() }); continue; }
    m = /^([0-9a-fA-F]{8,128})\s+[* ]?(.+)$/u.exec(line);
    if (m) { out.push({ name: m[2] as string, hash: (m[1] as string).toLowerCase() }); continue; }
    throw new Error(`Line not understood: "${line.slice(0, 80)}". Use "<hash>  <filename>" or "SHA256 (file) = <hash>".`);
  }
  return out;
}

const base = (n: string) => n.split(/[\\/]/u).pop() ?? n;

const SEC_HEADERS_TABLE = SECURITY_HEADERS.map((h) => [h.name, h.purpose, h.recommended, h.notes]);

const cspOpt = (key: string, label: string, def: string) => optText(key, label, def, { maxLength: 500 });
const split = (s: string) => s.split(/\s+/u).filter(Boolean);

export const IMPL: ImplMap = {
  'sha-256-hash-calculator': hashTool('SHA-256'),
  'sha-384-hash-calculator': hashTool('SHA-384'),
  'sha-512-hash-calculator': hashTool('SHA-512'),
  'sha-1-hash-calculator': hashTool('SHA-1'),
  'md5-hash-calculator': hashTool('MD5'),

  'text-hash-calculator': form({
    text: { label: 'Text (UTF-8)', rows: 5, sample: 'hello' },
    live: true,
    async run({ text: t }) {
      const algos: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'CRC32'];
      const rows: [string, string][] = [];
      for (const a of algos) rows.push([a, await hashText(a, t)]);
      return [notice('info', 'MD5, SHA-1 and CRC32 are for checksums only, not for security.'), kv(rows, 'Digests')];
    },
  }),

  'file-integrity-verifier': form({
    text: { label: 'Checksum list (sha256sum, md5sum or BSD style)', rows: 6, sample: '' },
    files: { label: 'Files to verify', multiple: true, maxFiles: 200 },
    live: false,
    runLabel: 'Verify',
    async run({ text: list, files }, ctx) {
      needFiles(files, 1);
      const entries = parseChecksumList(list);
      if (entries.length === 0) throw new Error('Paste a checksum list first.');
      const kinds = new Set<HashAlgo>();
      for (const e of entries) { const g = guessAlgoFromHex(e.hash)[0]; if (!g) throw new Error(`"${e.hash.slice(0, 20)}…" is not a recognised digest length (8, 32, 40, 64, 96 or 128 hex characters).`); kinds.add(g); }
      const res = await runJob('hashFiles', { files, algos: [...kinds] }, { signal: ctx.signal, onProgress: ctx.progress });
      const byName = new Map(res.map((r) => [r.name, r]));
      const rows: string[][] = [];
      let ok = 0, bad = 0, missing = 0;
      const seen = new Set<string>();
      for (const e of entries) {
        const f = byName.get(base(e.name));
        const algo = guessAlgoFromHex(e.hash)[0] as HashAlgo;
        if (!f) { rows.push([e.name, 'MISSING', 'no file with this name was chosen']); missing++; continue; }
        seen.add(f.name);
        const got = f.hashes[algo] as string;
        if (timingSafeEqualHex(got, e.hash)) { rows.push([e.name, 'OK', algo]); ok++; } else { rows.push([e.name, 'FAILED', `${algo}: expected ${e.hash}, got ${got}`]); bad++; }
      }
      for (const r of res) if (!seen.has(r.name)) rows.push([r.name, 'NOT LISTED', 'file chosen but not in the checksum list']);
      return [notice(bad === 0 && missing === 0 ? 'success' : 'error', `${ok} verified, ${bad} failed, ${missing} missing.`), table(['File', 'Result', 'Detail'], rows)];
    },
  }),

  'secure-random-token-generator': form({
    options: [
      optSelect('kind', 'Generate', [['token', 'Token'], ['password', 'Password']]),
      optSelect('format', 'Token format', [['hex', 'Hex'], ['base64url', 'Base64URL'], ['base62', 'Base62 (A–Z a–z 0–9)'], ['base32', 'Base32'], ['digits', 'Digits']]),
      optNum('length', 'Length (bytes for hex/base64url; characters otherwise and for passwords)', 32, { min: 1, max: 1024, step: 1 }),
      optNum('count', 'How many', 1, { min: 1, max: 100, step: 1 }),
      optCheck('lower', 'Password: lowercase', true), optCheck('upper', 'Password: uppercase', true), optCheck('digits', 'Password: digits', true), optCheck('symbols', 'Password: symbols', true), optCheck('ambig', 'Password: exclude look-alike characters (I l 1 O 0)'),
    ],
    live: false,
    runLabel: 'Generate',
    run({ opts }) {
      const n = Math.max(1, Math.min(100, Math.floor(num(opts, 'count'))));
      const len = Math.floor(num(opts, 'length'));
      const items: string[] = [];
      let bits = 0;
      for (let i = 0; i < n; i++) {
        if (str(opts, 'kind') === 'password') { const r = generatePassword({ length: len, lower: bool(opts, 'lower'), upper: bool(opts, 'upper'), digits: bool(opts, 'digits'), symbols: bool(opts, 'symbols'), excludeAmbiguous: bool(opts, 'ambig') }); items.push(r.password); bits = r.bits; }
        else { const r = generateToken(len, str(opts, 'format') as TokenFormat); items.push(r.token); bits = r.bits; }
      }
      return [notice('info', `About ${bits} bits of entropy each. Generated with crypto.getRandomValues; nothing is stored or sent anywhere.`), text(items.join('\n'), { title: n === 1 ? 'Result' : 'Results', filename: 'secrets.txt', mime: 'text/plain' })];
    },
  }),

  'uuid-security-inspector': form({
    text: { label: 'UUID', rows: 2, sample: '018f3b1e-7c2a-7d3b-9a1f-0123456789ab' },
    live: true,
    run({ text: t }) {
      const r = inspectUuid(t);
      if (!r.valid) return [notice('error', r.notes.join(' '))];
      return [kv([['Normalised', r.normalized ?? ''], ['Version', r.nil ? 'nil' : String(r.version ?? '?')], ['Variant', r.variant ?? '—'], ['Embedded timestamp', r.timestamp ?? 'none']], 'UUID'), ...r.notes.map((n) => notice('info', n))];
    },
  }),

  'url-safety-syntax-inspector': form({
    text: { label: 'URL', rows: 2, sample: 'http://user:pass@192.168.0.1:8080/login' },
    live: true,
    run({ text: t }) {
      const r = inspectUrlSyntax(t);
      return [notice('info', 'Syntax checks only. This tool never visits the URL and cannot tell whether a site is malicious.'), table(['Level', 'Finding'], r.findings.map((f) => [f.level.toUpperCase(), f.message]))];
    },
  }),

  'http-security-header-reference': form({
    live: true,
    run: () => [table(['Header', 'Purpose', 'Recommended starting value', 'Notes'], SEC_HEADERS_TABLE, { title: 'Security headers', note: 'Reference only. Nothing here scans a site; tune every value to your application.' })],
  }),

  'content-security-policy-builder': form({
    options: [
      cspOpt('defaultSrc', 'default-src', "'self'"), cspOpt('scriptSrc', 'script-src', "'self'"), cspOpt('styleSrc', 'style-src', "'self'"), cspOpt('imgSrc', 'img-src', "'self' data:"),
      cspOpt('connectSrc', 'connect-src', "'self'"), cspOpt('fontSrc', 'font-src', "'self'"), cspOpt('objectSrc', 'object-src', "'none'"), cspOpt('frameSrc', 'frame-src', "'none'"),
      cspOpt('workerSrc', 'worker-src', "'self'"), cspOpt('baseUri', 'base-uri', "'self'"), cspOpt('formAction', 'form-action', "'self'"), cspOpt('frameAncestors', 'frame-ancestors', "'none'"),
      optCheck('upgrade', 'upgrade-insecure-requests', true), optCheck('mixed', 'block-all-mixed-content'),
    ],
    live: true,
    run({ opts }) {
      const c: CspConfig = { ...defaultCsp, upgradeInsecure: bool(opts, 'upgrade'), blockMixed: bool(opts, 'mixed') } as CspConfig;
      for (const k of ['defaultSrc', 'scriptSrc', 'styleSrc', 'imgSrc', 'connectSrc', 'fontSrc', 'objectSrc', 'frameSrc', 'workerSrc', 'baseUri', 'formAction', 'frameAncestors'] as const) c[k] = split(str(opts, k));
      const r = buildCsp(c);
      return [text(r.header, { title: 'Content-Security-Policy header value', filename: 'csp.txt', mime: 'text/plain', wrap: true }), ...r.warnings.map((w) => notice('warn', w))];
    },
  }),

  'subresource-integrity-generator': form({
    files: { label: 'Script or stylesheet file', accept: '.js,.mjs,.css,text/javascript,text/css' },
    options: [optSelect('algo', 'Algorithm', [['SHA-384', 'SHA-384 (recommended)'], ['SHA-256', 'SHA-256'], ['SHA-512', 'SHA-512']]), optText('url', 'Public https:// URL of the file (for the tag)', 'https://cdn.example.com/app.js', { maxLength: 500 })],
    live: false,
    async run({ files, opts }, ctx) {
      const f = oneFile(files);
      const bytes = await readBytes(f, 64 * 1024 * 1024);
      const integrity = await runJob('sri', { data: bytes, algos: [str(opts, 'algo') as 'SHA-384'] }, { signal: ctx.signal });
      const kind = /\.css$/iu.test(f.name) ? 'link' : 'script';
      const out: Block[] = [kv([['File', `${f.name} (${formatBytes(f.size)})`], ['integrity', integrity]], 'Result')];
      try { out.push(text(sriTag(kind, str(opts, 'url'), integrity), { title: `<${kind}> tag`, filename: 'sri-tag.html', mime: 'text/html', wrap: true })); } catch (e) { out.push(notice('warn', (e as Error).message)); }
      return out;
    },
  }),

  'password-strength-estimator': form({
    text: { label: 'Password (analysed in this tab only)', rows: 1, sample: 'correct horse battery staple' },
    live: true,
    run({ text: pw }) {
      const r = estimatePassword(pw);
      return [kv([['Rating', `${r.label} (${r.score}/4)`], ['Estimated entropy', `${r.entropyBits} bits`], ['Offline cracking time (estimate)', r.crackTimeOffline]], 'Estimate'), ...(r.findings.length ? [{ type: 'list', title: 'Findings', items: r.findings } as Block] : []), notice('info', 'A heuristic, not a guarantee. A long unique password in a password manager beats any rule of thumb.')];
    },
  }),

  'local-file-metadata-privacy-inspector': form({
    files: { label: 'Image (JPEG, PNG or WebP)', accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp' },
    live: false,
    async run({ files }) {
      const f = oneFile(files);
      const b = await readBytes(f, 64 * 1024 * 1024);
      const r = privacyReport(b);
      const out: Block[] = [];
      if (r.format === 'unknown') throw new Error('This is not a JPEG, PNG or WebP image.');
      out.push(kv([['Format', r.format.toUpperCase()], ['Size', formatBytes(f.size)]], 'File'));
      out.push(r.findings.length === 0 ? notice('success', 'No identifying metadata found.') : table(['Severity', 'Finding'], r.findings.map((x) => [x.level.toUpperCase(), x.message]), { title: 'Privacy findings' }));
      if (r.gps) out.push(notice('error', `GPS position embedded: ${r.gps.lat.toFixed(5)}, ${r.gps.lon.toFixed(5)}. Anyone who receives this file can see where it was taken.`));
      let cleaned: { data: Uint8Array; removed: string[] } | null = null;
      if (r.format === 'jpeg') cleaned = stripJpegMetadata(b);
      else if (r.format === 'png') cleaned = stripPngMetadata(b);
      else if (r.format === 'webp') cleaned = stripWebpMetadata(b);
      if (cleaned && cleaned.removed.length > 0) {
        const mime = r.format === 'jpeg' ? 'image/jpeg' : r.format === 'png' ? 'image/png' : 'image/webp';
        out.push({ type: 'download', label: 'Download cleaned copy', filename: withExtension(f.name, r.format === 'jpeg' ? 'jpg' : r.format, '-clean'), mime, data: cleaned.data, note: `removed: ${cleaned.removed.join(', ')}` });
        if ('orientationLost' in cleaned && typeof (cleaned as { orientationLost?: number | null }).orientationLost === 'number') out.push(notice('warn', 'The image carried an orientation flag that was removed; it may now display rotated in some viewers.'));
      }
      return out;
    },
  }),
};

