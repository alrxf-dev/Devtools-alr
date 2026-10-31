import { form, kv, notice, optCheck, optNum, optSelect, optText, table, text, str, bool, num, readBytes, readText, oneFile, needFiles } from './kit';
import type { Block, ImplMap } from './types';
import { runJob } from '../workers/client';
import { runRegex } from '../workers/regex';
import { hashFile, timingSafeEqualHex, guessAlgoFromHex, LEGACY_NOTICE, type HashAlgo } from '../lib/hash';
import { analyzeType, convertSize, detectEncoding, detectSignatures, extensionOf, formatBytes, hexDump, inspectExtension, looksLikeText, EXT_MIME } from '../lib/sniff';
import { safeDownloadName, LIMITS } from '../lib/safe';
import { assertSafeRegex } from '../lib/text';

const HEAD = 4096;
const head = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.slice(0, HEAD).arrayBuffer());
const iso = (ms: number) => new Date(ms).toISOString();
const ALL: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'CRC32'];

const caseOpt = optSelect('case', 'Letter case', [['keep', 'Keep'], ['lower', 'lowercase'], ['upper', 'UPPERCASE']]);

function applyCase(s: string, mode: string): string {
  return mode === 'lower' ? s.toLowerCase() : mode === 'upper' ? s.toUpperCase() : s;
}

export function planRename(names: string[], o: { prefix: string; suffix: string; find: string; replace: string; start: number; pad: number; numbering: boolean; caseMode: string; keepExt: boolean }): { from: string; to: string }[] {
  return names.map((name, i) => {
    const dot = name.lastIndexOf('.');
    const hasExt = dot > 0;
    const stem = hasExt ? name.slice(0, dot) : name;
    const ext = hasExt && o.keepExt ? name.slice(dot) : hasExt ? '' : '';
    let s = o.find ? stem.split(o.find).join(o.replace) : stem;
    const n = o.numbering ? String(o.start + i).padStart(o.pad, '0') : '';
    const out = `${o.prefix}${s}${o.suffix}${n ? (s || o.prefix || o.suffix ? '_' : '') + n : ''}${ext}`;
    return { from: name, to: safeDownloadName(applyCase(out, o.caseMode), `file-${i + 1}`) };
  });
}

export const IMPL: ImplMap = {
  'file-information-viewer': form({
    files: { label: 'File' },
    live: false,
    runLabel: 'Inspect',
    async run({ files }) {
      const f = oneFile(files);
      const h = await head(f);
      const sig = detectSignatures(h)[0];
      return [
        kv([['Name', f.name], ['Size', `${formatBytes(f.size)} (${f.size.toLocaleString('en-US')} bytes)`], ['Type reported by browser', f.type || '(none)'], ['Extension', extensionOf(f.name) || '(none)'], ['Last modified (UTC)', iso(f.lastModified)], ['Detected signature', sig ? `${sig.signature.name} (${sig.signature.mime})` : looksLikeText(h) ? 'plain text (no signature)' : 'none recognised']], 'File'),
        text(hexDump(h, 0, 256), { title: 'First 256 bytes', filename: 'head.hex.txt', mime: 'text/plain' }),
      ];
    },
  }),

  'file-size-converter': form({
    options: [optNum('value', 'Size', 1, { min: 0 }), optSelect('unit', 'Unit', [['B', 'Bytes (B)'], ['KB', 'Kilobytes (kB, 1000)'], ['MB', 'Megabytes (MB, 1000²)'], ['GB', 'Gigabytes (GB, 1000³)'], ['TB', 'Terabytes (TB)'], ['KiB', 'Kibibytes (KiB, 1024)'], ['MiB', 'Mebibytes (MiB)'], ['GiB', 'Gibibytes (GiB)'], ['TiB', 'Tebibytes (TiB)'], ['bit', 'Bits']], 'MiB')],
    live: true,
    run({ opts }) {
      const r = convertSize(num(opts, 'value'), str(opts, 'unit'));
      return [table(['Unit', 'Value'], Object.entries(r).map(([u, v]) => [u, v]), { title: 'Equivalent sizes', note: 'kB/MB/GB are powers of 1000 (as on drive labels); KiB/MiB/GiB are powers of 1024 (as most operating systems report memory).' })];
    },
  }),

  'mime-type-inspector': form({
    files: { label: 'File' },
    live: false,
    async run({ files }) {
      const f = oneFile(files);
      const r = analyzeType(f.name, f.type, await head(f));
      return [notice(r.verdict === 'mismatch' ? 'warn' : r.verdict === 'match' ? 'success' : 'info', r.message), kv([['Type from the browser', f.type || '(none)'], ['Extension', r.claimedExt ? '.' + r.claimedExt : '(none)'], ['Type implied by extension', r.extMime ?? 'unknown'], ['Type from content signature', r.detected ? `${r.detected.signature.mime} (${r.detected.signature.name})` : r.isText ? 'text (no signature)' : 'not recognised'], ['Verdict', r.verdict]])];
    },
  }),

  'file-extension-inspector': form({
    text: { label: 'File names (one per line)', rows: 6, sample: 'report.pdf.exe\n.gitignore\narchive.tar.gz\nphoto.JPG\nnoextension\ninvoice‮fdp.exe' },
    live: true,
    run({ text: t }) {
      const names = t.split(/\r?\n/u).filter((l) => l.trim() !== '').slice(0, 2000);
      return [table(['Name', 'Extension', 'All extensions', 'Notes'], names.map((n) => { const r = inspectExtension(n); return [n.replace(/[‪-‮⁦-⁩]/gu, (c) => `<U+${c.codePointAt(0)?.toString(16).toUpperCase()}>`), r.extension ? '.' + r.extension : '—', r.allExtensions.map((e) => '.' + e).join(' ') || '—', [r.hidden ? 'hidden file' : '', r.doubleExtension ? 'double extension' : '', ...r.suspicious].filter(Boolean).join('; ') || 'ok']; }))];
    },
  }),

  'file-hash-calculator': form({
    files: { label: 'Files', multiple: true, maxFiles: 50 },
    options: [optCheck('md5', 'MD5', true), optCheck('sha1', 'SHA-1', true), optCheck('sha256', 'SHA-256', true), optCheck('sha384', 'SHA-384'), optCheck('sha512', 'SHA-512'), optCheck('crc32', 'CRC32', true)],
    live: false,
    runLabel: 'Hash files',
    async run({ files, opts }, ctx) {
      needFiles(files, 1);
      const algos = ALL.filter((a) => bool(opts, a.replace('-', '').toLowerCase()));
      if (algos.length === 0) throw new Error('Select at least one algorithm.');
      const res = await runJob('hashFiles', { files, algos }, { signal: ctx.signal, onProgress: ctx.progress });
      const out: Block[] = [];
      const legacy = algos.filter((a) => LEGACY_NOTICE[a]);
      if (legacy.length) out.push(notice('info', `${legacy.join(', ')}: for checksums only, not for security.`));
      for (const r of res) out.push(kv(algos.map((a) => [a, r.hashes[a] as string]), `${r.name} (${formatBytes(r.size)})`));
      out.push(text(res.flatMap((r) => algos.map((a) => `${r.hashes[a]}  ${r.name}  [${a}]`)).join('\n'), { title: 'All digests', filename: 'hashes.txt', mime: 'text/plain' }));
      return out;
    },
  }),

  'file-duplicate-checker': form({
    files: { label: 'Files to compare', multiple: true, maxFiles: 500 },
    live: false,
    runLabel: 'Find duplicates',
    async run({ files }, ctx) {
      needFiles(files, 2);
      const bySize = new Map<number, File[]>();
      for (const f of files) bySize.set(f.size, [...(bySize.get(f.size) ?? []), f]);
      const cand = [...bySize.values()].filter((g) => g.length > 1).flat();
      if (cand.length === 0) return [notice('success', 'No two files have the same size, so there are no duplicates.')];
      const res = await runJob('hashFiles', { files: cand, algos: ['SHA-256'] }, { signal: ctx.signal, onProgress: ctx.progress });
      const groups = new Map<string, { name: string; size: number }[]>();
      for (const r of res) { const k = `${r.size}:${r.hashes['SHA-256']}`; groups.set(k, [...(groups.get(k) ?? []), { name: r.name, size: r.size }]); }
      const dups = [...groups.entries()].filter(([, g]) => g.length > 1);
      if (dups.length === 0) return [notice('success', `${cand.length} files share a size with another file, but their contents all differ. No duplicates.`)];
      const wasted = dups.reduce((a, [, g]) => a + (g.length - 1) * (g[0]?.size ?? 0), 0);
      return [notice('warn', `${dups.length} group(s) of identical files. Removing the extra copies would free ${formatBytes(wasted)}.`), ...dups.map(([k, g], i) => ({ type: 'list', title: `Group ${i + 1} · ${formatBytes(g[0]?.size ?? 0)} · SHA-256 ${k.split(':')[1]?.slice(0, 16)}…`, items: g.map((x) => x.name) } as Block)), notice('info', 'This tool only reports. It cannot delete files; a web page has no access to do that.')];
    },
  }),

  'file-comparison-tool': form({
    files: { label: 'Choose exactly two files', multiple: true, maxFiles: 2 },
    live: false,
    runLabel: 'Compare',
    async run({ files }) {
      if (files.length !== 2) throw new Error('Choose exactly two files.');
      const [a, b] = files as [File, File];
      const LIM = 128 * 1024 * 1024;
      const [x, y] = [await readBytes(a, LIM), await readBytes(b, LIM)];
      const n = Math.min(x.length, y.length);
      let first = -1, diff = 0;
      for (let i = 0; i < n; i++) if (x[i] !== y[i]) { if (first < 0) first = i; diff++; }
      const out: Block[] = [];
      if (first < 0 && x.length === y.length) { out.push(notice('success', 'The files are byte-for-byte identical.')); out.push(kv([['Size', formatBytes(x.length)]])); return out; }
      out.push(notice('warn', first < 0 ? `The shorter file is a prefix of the longer one. Sizes: ${x.length} vs ${y.length} bytes.` : `${diff.toLocaleString('en-US')} differing byte(s) in the first ${n.toLocaleString('en-US')} bytes; first difference at offset ${first} (0x${first.toString(16)}).${x.length !== y.length ? ` Sizes also differ: ${x.length} vs ${y.length} bytes.` : ''}`));
      const at = first < 0 ? n : first;
      const s = Math.max(0, at - (at % 16) - 32);
      out.push(text(hexDump(x, s, 96), { title: `${a.name} around offset ${at}`, filename: 'a.hex.txt', mime: 'text/plain' }), text(hexDump(y, s, 96), { title: `${b.name} around offset ${at}`, filename: 'b.hex.txt', mime: 'text/plain' }));
      return out;
    },
  }),

  'file-previewer': form({
    files: { label: 'File to preview' },
    live: false,
    runLabel: 'Preview',
    async run({ files }) {
      const f = oneFile(files);
      const h = await head(f);
      const sig = detectSignatures(h)[0]?.signature;
      const ext = extensionOf(f.name);
      const mime = sig?.mime ?? EXT_MIME[ext] ?? f.type;
      const out: Block[] = [kv([['Name', f.name], ['Size', formatBytes(f.size)], ['Detected', sig?.name ?? (looksLikeText(h) ? 'text' : 'unknown')]])];
      if (/^image\/(png|jpeg|gif|webp|bmp)$/u.test(mime) || mime === 'image/svg+xml') {
        // Images (including SVG) are shown through <img>, which never runs scripts inside the file.
        out.push({ type: 'image', title: 'Image', blob: new Blob([await f.arrayBuffer()], { type: mime }), alt: `Preview of ${f.name}` });
        if (mime === 'image/svg+xml') out.push(notice('info', 'SVG is displayed as an image, so any scripts inside it do not run.'));
      } else if (/^audio\//u.test(mime) || /^video\//u.test(mime)) {
        out.push({ type: 'media', kind: mime.startsWith('audio') ? 'audio' : 'video', blob: new Blob([await f.arrayBuffer()], { type: mime }) });
        out.push(notice('info', 'Playback depends on the codecs your browser supports.'));
      } else if (looksLikeText(h)) {
        const t = new TextDecoder().decode(new Uint8Array(await f.slice(0, 200_000).arrayBuffer()));
        out.push(text(t, { title: f.size > 200_000 ? 'First 200,000 bytes (as text)' : 'Contents', wrap: true }));
      } else {
        out.push(text(hexDump(new Uint8Array(await f.slice(0, 2048).arrayBuffer()), 0, 2048), { title: 'Binary file: first 2 KiB as hex' }));
      }
      return out;
    },
  }),

  'file-renamer': form({
    files: { label: 'File' },
    options: [optText('name', 'New file name', '', { placeholder: 'leave empty to keep the current name', maxLength: 200 })],
    live: false,
    runLabel: 'Create renamed copy',
    async run({ files, opts }) {
      const f = oneFile(files);
      const wanted = str(opts, 'name').trim() || f.name;
      const safe = safeDownloadName(wanted, f.name);
      const out: Block[] = [];
      if (safe !== wanted) out.push(notice('warn', `The name was adjusted for safety: "${wanted}" → "${safe}". Path separators, control characters and reserved names are not allowed.`));
      if (extensionOf(safe) !== extensionOf(f.name)) out.push(notice('warn', `The extension changes from ".${extensionOf(f.name) || '(none)'}" to ".${extensionOf(safe) || '(none)'}". Changing an extension does not convert the file.`));
      out.push(notice('info', 'This creates a renamed COPY. A web page cannot rename the original file on your disk.'), { type: 'download', label: `Download ${safe}`, filename: safe, mime: f.type || 'application/octet-stream', data: f });
      return out;
    },
  }),

  'batch-file-renamer': form({
    files: { label: 'Files to rename', multiple: true, maxFiles: 500 },
    options: [optText('prefix', 'Prefix', '', { maxLength: 80 }), optText('suffix', 'Suffix (before the extension)', '', { maxLength: 80 }), optText('find', 'Find in name (literal)', '', { maxLength: 80 }), optText('replace', 'Replace with', '', { maxLength: 80 }), optCheck('numbering', 'Add sequence numbers', true), optNum('start', 'First number', 1, { min: 0, step: 1 }), optNum('pad', 'Digits (zero-padded)', 3, { min: 1, max: 8, step: 1 }), caseOpt, optCheck('keepExt', 'Keep file extensions', true)],
    live: false,
    runLabel: 'Preview and build ZIP',
    async run({ files, opts }, ctx) {
      needFiles(files, 1);
      const plan = planRename(files.map((f) => f.name), { prefix: str(opts, 'prefix'), suffix: str(opts, 'suffix'), find: str(opts, 'find'), replace: str(opts, 'replace'), start: Math.floor(num(opts, 'start')), pad: Math.floor(num(opts, 'pad')), numbering: bool(opts, 'numbering'), caseMode: str(opts, 'case'), keepExt: bool(opts, 'keepExt') });
      const total = files.reduce((a, f) => a + f.size, 0);
      if (total > LIMITS.zip.maxTotalUncompressedBytes) throw new Error(`Together these files are ${formatBytes(total)}; the limit for one ZIP is ${formatBytes(LIMITS.zip.maxTotalUncompressedBytes)}.`);
      const zip = await runJob('zipCreate', { files: files.map((f, i) => ({ path: (plan[i] as { to: string }).to, data: f })), level: 6 }, { signal: ctx.signal, onProgress: ctx.progress });
      const dupNames = plan.length - new Set(plan.map((p) => p.to.toLowerCase())).size;
      return [...(dupNames > 0 ? [notice('warn', `${dupNames} name(s) collide after renaming; the ZIP adds " (2)", " (3)" … to keep every file.`)] : []), notice('info', 'Originals are never modified; the ZIP contains renamed copies.'), table(['Original', 'New name'], plan.map((p) => [p.from, p.to])), { type: 'download', label: 'Download renamed files (ZIP)', filename: 'renamed-files.zip', mime: 'application/zip', data: zip }];
    },
  }),

  'file-timestamp-viewer': form({
    files: { label: 'Files', multiple: true, maxFiles: 500 },
    live: false,
    runLabel: 'Show timestamps',
    run({ files }) {
      needFiles(files, 1);
      return [notice('info', 'Browsers expose only the last-modified time. Creation and access times are not available to web pages.'), table(['File', 'Modified (UTC)', 'Modified (local)', 'Unix seconds'], files.map((f) => [f.name, iso(f.lastModified), new Date(f.lastModified).toString(), String(Math.floor(f.lastModified / 1000))]))];
    },
  }),

  'file-manifest-generator': form({
    files: { label: 'Files', multiple: true, maxFiles: 500 },
    options: [optSelect('format', 'Format', [['sha256sum', 'sha256sum text'], ['json', 'JSON']])],
    live: false,
    runLabel: 'Generate manifest',
    async run({ files, opts }, ctx) {
      needFiles(files, 1);
      const res = await runJob('hashFiles', { files, algos: ['SHA-256'] }, { signal: ctx.signal, onProgress: ctx.progress });
      const json = str(opts, 'format') === 'json';
      const body = json ? JSON.stringify(res.map((r) => ({ name: r.name, size: r.size, sha256: r.hashes['SHA-256'] })), null, 2) : res.map((r) => `${r.hashes['SHA-256']}  ${r.name}`).join('\n') + '\n';
      return [text(body, { title: 'Manifest', filename: json ? 'manifest.json' : 'SHA256SUMS', mime: json ? 'application/json' : 'text/plain' }), notice('info', 'Verify later with the File Integrity Verifier or `sha256sum -c SHA256SUMS`.')];
    },
  }),

  'file-content-search': form({
    text: { label: 'Search for', rows: 1, sample: 'TODO' },
    files: { label: 'Files to search (text files)', multiple: true, maxFiles: 300 },
    options: [optCheck('regex', 'Treat the search as a regular expression'), optCheck('cs', 'Match case'), optNum('max', 'Maximum matches to list', 500, { min: 1, max: 5000, step: 1 })],
    live: false,
    runLabel: 'Search',
    async run({ text: q, files, opts }, ctx) {
      needFiles(files, 1);
      if (q === '') throw new Error('Enter what to search for.');
      const regex = bool(opts, 'regex');
      const cs = bool(opts, 'cs');
      if (regex) { try { new RegExp(q); } catch (e) { throw new Error(`Invalid pattern: ${(e as Error).message}`); } try { assertSafeRegex(q); } catch (e) { throw new Error((e as Error).message); } }
      const max = Math.floor(num(opts, 'max'));
      const rows: string[][] = [];
      const skipped: string[] = [];
      let truncated = false;
      for (const f of files) {
        if (ctx.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        if (f.size > 5 * 1024 * 1024) { skipped.push(`${f.name} (over 5 MiB)`); continue; }
        const h = await head(f);
        if (!looksLikeText(h)) { skipped.push(`${f.name} (binary)`); continue; }
        const lines = (await readText(f)).split(/\r?\n/u);
        if (regex) {
          const r = await runRegex({ pattern: q, flags: cs ? 'g' : 'gi', text: lines.join('\n'), replacement: '', maxMatches: max });
          if (!r.ok) throw new Error(r.error);
          let off = 0; const starts = lines.map((l) => { const s = off; off += l.length + 1; return s; });
          for (const m of r.data.matches) { let li = starts.findIndex((s, i) => m.index >= s && (i === starts.length - 1 || m.index < (starts[i + 1] as number))); li = Math.max(li, 0); rows.push([f.name, String(li + 1), (lines[li] ?? '').slice(0, 300)]); if (rows.length >= max) break; }
        } else {
          const needle = cs ? q : q.toLowerCase();
          for (let i = 0; i < lines.length && rows.length < max; i++) if ((cs ? (lines[i] as string) : (lines[i] as string).toLowerCase()).includes(needle)) rows.push([f.name, String(i + 1), (lines[i] as string).slice(0, 300)]);
        }
        if (rows.length >= max) { truncated = true; break; }
      }
      return [notice(rows.length ? 'success' : 'info', `${rows.length}${truncated ? '+' : ''} matching line(s).`), ...(rows.length ? [table(['File', 'Line', 'Text'], rows)] : []), ...(skipped.length ? [{ type: 'list', title: 'Skipped', items: skipped } as Block] : [])];
    },
  }),

  'file-encoding-detector': form({
    files: { label: 'File' },
    live: false,
    async run({ files }) {
      const f = oneFile(files);
      const r = detectEncoding(await readBytes(f, 64 * 1024 * 1024));
      return [kv([['Encoding', r.encoding], ['Confidence', r.confidence], ['Byte order mark', r.bom ?? 'none'], ['Line endings', r.lineEndings]]), ...(r.notes.length ? [{ type: 'list', title: 'Notes', items: r.notes } as Block] : [])];
    },
  }),

  'file-checksum-verifier': form({
    text: { label: 'Expected checksum', rows: 2, sample: '' },
    files: { label: 'File' },
    live: false,
    runLabel: 'Verify',
    async run({ text: t, files }, ctx) {
      const f = oneFile(files);
      const expected = (t.trim().split(/\s+/u)[0] ?? '').toLowerCase();
      if (!expected) throw new Error('Paste the checksum you expect.');
      const algos = guessAlgoFromHex(expected);
      const algo = algos[0];
      if (!algo) throw new Error('This is not a recognised digest: expected 8 (CRC32), 32 (MD5), 40 (SHA-1), 64 (SHA-256), 96 (SHA-384) or 128 (SHA-512) hexadecimal characters.');
      const got = await hashFile(algo, f, ctx.progress, ctx.signal);
      const ok = timingSafeEqualHex(got, expected);
      return [notice(ok ? 'success' : 'error', ok ? `Match. ${algo} of "${f.name}" equals the expected checksum.` : `MISMATCH. The file does not match the expected ${algo}.`), kv([['Algorithm (guessed from length)', algo], ['Expected', expected], ['Computed', got]])];
    },
  }),
};

