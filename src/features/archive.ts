import { form, kv, notice, optCheck, optSelect, optText, table, text, tree, str, bool, readBytes, needFiles, oneFile, fmtNum } from './kit';
import type { Block, FormToolImpl, ImplMap } from './types';
import { runJob } from '../workers/client';
import { readZipDirectory, canExtract, buildTree, renderTree, METHOD_NAMES, ZipFormatError, type ZipReport, type ZipEntryInfo } from '../lib/zip';
import { formatBytes } from '../lib/sniff';
import { hashBytes } from '../lib/hash';
import { stringifyCsv } from '../lib/data';
import { LIMITS } from '../lib/safe';

const ZIP_ACCEPT = '.zip,.jar,.docx,.xlsx,.pptx,.odt,.epub,application/zip';
const ZIP_CAP = 512 * 1024 * 1024;

async function openZip(f: File): Promise<{ bytes: Uint8Array; report: ZipReport }> {
  const bytes = await readBytes(f, ZIP_CAP);
  try {
    return { bytes, report: readZipDirectory(bytes) };
  } catch (e) {
    if (e instanceof ZipFormatError) throw new Error(`"${f.name}" is not a readable ZIP archive: ${e.message}`);
    throw e;
  }
}

const date = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(0, 19) : '—');
const methodName = (m: number) => METHOD_NAMES[m] ?? `method ${m}`;
const zipForm = (o: Omit<FormToolImpl, 'kind' | 'files'> & { fileLabel?: string }): FormToolImpl => form({ ...o, files: { label: o.fileLabel ?? 'ZIP archive', accept: ZIP_ACCEPT }, live: false });

function summary(r: ZipReport): Block {
  return kv([['Files', String(r.fileCount)], ['Folders', String(r.dirCount)], ['Compressed', formatBytes(r.totalCompressed)], ['Expanded', formatBytes(r.totalUncompressed)], ['Overall ratio', r.overallRatio.toFixed(1) + ':1'], ['Encrypted entries', String(r.encryptedCount)], ['Unsafe names', String(r.unsafeCount)], ['ZIP64', r.zip64 ? 'yes' : 'no']], 'Archive');
}

const warnBlocks = (r: ZipReport): Block[] => r.warnings.map((w) => notice('warn', w));

function entryFlags(e: ZipEntryInfo): string {
  return [e.encrypted ? 'encrypted' : '', e.isSymlink ? 'symlink' : '', e.unsafeReason ? `unsafe (${e.unsafeReason})` : ''].filter(Boolean).join(', ') || '—';
}

export const IMPL: ImplMap = {
  'zip-creator': form({
    files: { label: 'Files to add', multiple: true, maxFiles: LIMITS.zip.maxEntries },
    options: [optSelect('level', 'Compression', [['6', 'Normal (6)'], ['1', 'Fast (1)'], ['9', 'Smallest (9)'], ['0', 'None (store)']]), optText('comment', 'Archive comment (optional)', '', { maxLength: 500 })],
    live: false,
    runLabel: 'Create ZIP',
    async run({ files, opts }, ctx) {
      needFiles(files, 1);
      const total = files.reduce((a, f) => a + f.size, 0);
      if (total > LIMITS.zip.maxTotalUncompressedBytes) throw new Error(`These files total ${formatBytes(total)}; one ZIP is limited to ${formatBytes(LIMITS.zip.maxTotalUncompressedBytes)}.`);
      const zip = await runJob('zipCreate', { files: files.map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, data: f })), level: Number(str(opts, 'level')) }, { signal: ctx.signal, onProgress: ctx.progress });
      const r = readZipDirectory(zip);
      return [notice('success', `Created a ZIP with ${r.fileCount} file(s): ${formatBytes(total)} → ${formatBytes(zip.length)}.`), { type: 'download', label: 'Download ZIP', filename: 'archive.zip', mime: 'application/zip', data: zip }, table(['Name', 'Size', 'Compressed'], r.entries.filter((e) => !e.isDirectory).map((e) => [e.name, formatBytes(e.uncompressedSize), formatBytes(e.compressedSize)]))];
    },
  }),

  'zip-extractor': zipForm({
    async run({ files }, ctx) {
      const f = oneFile(files);
      const { bytes, report } = await openZip(f);
      const res = await runJob('zipExtract', { data: bytes }, { signal: ctx.signal, onProgress: ctx.progress });
      const out: Block[] = [summary(report), ...warnBlocks(report)];
      out.push(notice(res.skipped.length ? 'warn' : 'success', `${res.files.length} file(s) extracted safely (${formatBytes(res.totalBytes)}).${res.skipped.length ? ` ${res.skipped.length} skipped.` : ''}`));
      if (res.skipped.length) out.push(table(['Skipped entry', 'Reason'], res.skipped.map((s) => [s.name, s.reason])));
      const bad = res.files.filter((x) => !x.crcOk);
      if (bad.length) out.push(notice('error', `CRC mismatch (corrupt data): ${bad.map((b) => b.path).join(', ')}`));
      if (res.files.length > 0) {
        const clean = await runJob('zipCreate', { files: res.files.map((x) => ({ path: x.path, data: new Blob([x.data as BlobPart]) })), level: 6 }, { signal: ctx.signal });
        out.push({ type: 'download', label: 'Download sanitised ZIP of safe entries', filename: 'extracted-safe.zip', mime: 'application/zip', data: clean });
        for (const x of res.files.slice(0, 100)) out.push({ type: 'download', label: `Download ${x.path.split('/').pop()}`, filename: x.path.split('/').pop() ?? 'file', mime: 'application/octet-stream', data: x.data, note: x.path });
        if (res.files.length > 100) out.push(notice('info', `Only the first 100 individual download buttons are shown. The sanitised ZIP above has all ${res.files.length} files.`));
      }
      return out;
    },
  }),

  'archive-content-viewer': zipForm({
    async run({ files }) {
      const { report } = await openZip(oneFile(files));
      return [summary(report), ...warnBlocks(report), table(['Name', 'Size', 'Compressed', 'Method', 'Modified', 'CRC-32', 'Flags'], report.entries.map((e) => [e.name + (e.isDirectory ? '' : ''), e.isDirectory ? '—' : formatBytes(e.uncompressedSize), e.isDirectory ? '—' : formatBytes(e.compressedSize), e.isDirectory ? '—' : methodName(e.method), date(e.modified), e.crc32.toString(16).padStart(8, '0'), entryFlags(e)]))];
    },
  }),

  'zip-file-validator': zipForm({
    async run({ files }, ctx) {
      const { bytes, report } = await openZip(oneFile(files));
      const problems: string[] = [...report.warnings];
      const names = new Map<string, number>();
      for (const e of report.entries) { const k = e.name.toLowerCase(); names.set(k, (names.get(k) ?? 0) + 1); if (e.unsafeReason) problems.push(`Unsafe entry "${e.name}": ${e.unsafeReason}.`); if (e.isSymlink) problems.push(`"${e.name}" is a symbolic link.`); if (e.encrypted) problems.push(`"${e.name}" is encrypted.`); if (e.method !== 0 && e.method !== 8 && !e.isDirectory) problems.push(`"${e.name}" uses ${methodName(e.method)}, which this tool cannot decompress.`); }
      for (const [k, n] of names) if (n > 1) problems.push(`Duplicate entry name (case-insensitive): "${k}" appears ${n} times.`);
      const v = await runJob('zipVerify', { data: bytes }, { signal: ctx.signal });
      for (const x of v.failed) problems.push(`"${x.name}": ${x.reason}.`);
      return [summary(report), notice(problems.length === 0 ? 'success' : 'warn', problems.length === 0 ? `Valid. Central directory is consistent and ${v.checked} entr${v.checked === 1 ? 'y' : 'ies'} passed the CRC-32 check.` : `${problems.length} issue(s) found.`), ...(problems.length ? [{ type: 'list', title: 'Issues', items: problems } as Block] : []), ...(v.skipped.length ? [table(['Not checked', 'Reason'], v.skipped.map((s) => [s.name, s.reason]))] : [])];
    },
  }),

  'archive-size-inspector': zipForm({
    async run({ files }) {
      const { report } = await openZip(oneFile(files));
      const fl = report.entries.filter((e) => !e.isDirectory);
      const top = [...fl].sort((a, b) => b.uncompressedSize - a.uncompressedSize).slice(0, 10);
      const trips = fl.map((e) => ({ e, v: canExtract(e) })).filter((x) => !x.v.ok);
      return [summary(report), kv([['Allowed entries', fmtNum(LIMITS.zip.maxEntries)], ['Allowed expanded size', formatBytes(LIMITS.zip.maxTotalUncompressedBytes)], ['Allowed ratio', `${LIMITS.zip.maxCompressionRatio}:1`], ['This archive exceeds limits', report.fileCount > LIMITS.zip.maxEntries || report.totalUncompressed > LIMITS.zip.maxTotalUncompressedBytes ? 'YES' : 'no']], 'Safety limits'), table(['Largest entries', 'Size', 'Compressed', 'Ratio'], top.map((e) => [e.name, formatBytes(e.uncompressedSize), formatBytes(e.compressedSize), e.ratio.toFixed(1) + ':1'])), ...(trips.length ? [table(['Entry that would be skipped', 'Reason'], trips.map((x) => [x.e.name, (x.v as { reason: string }).reason]))] : [])];
    },
  }),

  'batch-file-archiver': form({
    files: { label: 'Choose a folder', directory: true, maxFiles: LIMITS.zip.maxEntries },
    options: [optText('exclude', 'Skip names containing (comma-separated)', 'node_modules,.git,.DS_Store,Thumbs.db', { maxLength: 300 }), optSelect('level', 'Compression', [['6', 'Normal (6)'], ['1', 'Fast (1)'], ['9', 'Smallest (9)'], ['0', 'None (store)']])],
    live: false,
    runLabel: 'Create ZIP',
    async run({ files, opts }, ctx) {
      needFiles(files, 1, 'files (choose a folder)');
      const ex = str(opts, 'exclude').split(',').map((s) => s.trim()).filter(Boolean);
      const kept: File[] = [], skipped: string[] = [];
      for (const f of files) { const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name; if (ex.some((x) => p.split('/').includes(x) || p.endsWith(x))) skipped.push(p); else kept.push(f); }
      if (kept.length === 0) throw new Error('Every file was excluded.');
      const total = kept.reduce((a, f) => a + f.size, 0);
      if (total > LIMITS.zip.maxTotalUncompressedBytes) throw new Error(`The folder is ${formatBytes(total)}; one ZIP is limited to ${formatBytes(LIMITS.zip.maxTotalUncompressedBytes)}.`);
      const zip = await runJob('zipCreate', { files: kept.map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, data: f })), level: Number(str(opts, 'level')) }, { signal: ctx.signal, onProgress: ctx.progress });
      return [notice('success', `Archived ${kept.length} file(s) (${formatBytes(total)} → ${formatBytes(zip.length)}). ${skipped.length} skipped.`), { type: 'download', label: 'Download ZIP', filename: 'folder.zip', mime: 'application/zip', data: zip }, ...(skipped.length ? [{ type: 'list', title: 'Skipped', items: skipped.slice(0, 200) } as Block] : [])];
    },
  }),

  'zip-compression-level-selector': form({
    files: { label: 'Files to compress', multiple: true, maxFiles: 500 },
    live: false,
    runLabel: 'Try all levels',
    async run({ files }, ctx) {
      needFiles(files, 1);
      const total = files.reduce((a, f) => a + f.size, 0);
      if (total > 64 * 1024 * 1024) throw new Error(`Trying five levels needs about ${formatBytes(total * 5)} of memory. Choose at most 64 MiB of files (this selection is ${formatBytes(total)}).`);
      const out: Block[] = [];
      const rows: string[][] = [];
      let i = 0;
      for (const level of [0, 1, 3, 6, 9]) {
        const t0 = performance.now();
        const zip = await runJob('zipCreate', { files: files.map((f) => ({ path: f.name, data: f })), level }, { signal: ctx.signal });
        const ms = performance.now() - t0;
        rows.push([`Level ${level}${level === 0 ? ' (store)' : ''}`, formatBytes(zip.length), `${((zip.length / Math.max(1, total)) * 100).toFixed(1)}%`, `${ms.toFixed(0)} ms`]);
        out.push({ type: 'download', label: `Download level ${level}`, filename: `archive-level${level}.zip`, mime: 'application/zip', data: zip });
        ctx.progress(++i / 5);
      }
      return [kv([['Input', `${files.length} file(s), ${formatBytes(total)}`]]), table(['Level', 'ZIP size', 'Of original', 'Time'], rows, { note: 'Times include running in a worker and vary between runs.' }), ...out];
    },
  }),

  'zip-password-support-inspector': zipForm({
    async run({ files }) {
      const { report } = await openZip(oneFile(files));
      const enc = report.entries.filter((e) => e.encrypted);
      if (enc.length === 0) return [notice('success', 'No entries are encrypted.'), summary(report)];
      const aes = enc.filter((e) => e.method === 99).length;
      return [notice('warn', `${enc.length} of ${report.entries.length} entries are encrypted: ${aes} with AES, ${enc.length - aes} with legacy ZipCrypto. This tool cannot open encrypted entries.`), table(['Entry', 'Scheme'], enc.map((e) => [e.name, e.method === 99 ? 'WinZip AES' : 'ZipCrypto (weak, avoid)'])), notice('info', 'ZipCrypto is easy to attack; use AES-256 or encrypt the file with a modern tool before zipping.')];
    },
  }),

  'archive-file-list-exporter': zipForm({
    options: [optSelect('format', 'Format', [['csv', 'CSV'], ['json', 'JSON'], ['txt', 'Plain text']]), optCheck('dirs', 'Include folder entries')],
    async run({ files, opts }) {
      const { report } = await openZip(oneFile(files));
      const es = report.entries.filter((e) => bool(opts, 'dirs') || !e.isDirectory);
      const f = str(opts, 'format');
      const body = f === 'json' ? JSON.stringify(es.map((e) => ({ name: e.name, size: e.uncompressedSize, compressedSize: e.compressedSize, method: methodName(e.method), crc32: e.crc32.toString(16).padStart(8, '0'), modified: e.modified?.toISOString() ?? null, directory: e.isDirectory })), null, 2) : f === 'txt' ? es.map((e) => e.name).join('\n') : stringifyCsv([['name', 'size', 'compressed_size', 'method', 'crc32', 'modified'], ...es.map((e) => [e.name, e.uncompressedSize, e.compressedSize, methodName(e.method), e.crc32.toString(16).padStart(8, '0'), e.modified?.toISOString() ?? ''])]);
      return [text(body, { title: `${es.length} entries`, filename: `file-list.${f}`, mime: f === 'json' ? 'application/json' : f === 'csv' ? 'text/csv' : 'text/plain' })];
    },
  }),

  'archive-integrity-checker': zipForm({
    async run({ files }, ctx) {
      const { bytes } = await openZip(oneFile(files));
      const v = await runJob('zipVerify', { data: bytes }, { signal: ctx.signal });
      return [notice(v.failed.length === 0 ? 'success' : 'error', v.failed.length === 0 ? `${v.checked} entr${v.checked === 1 ? 'y' : 'ies'} decompressed and matched their recorded CRC-32.` : `${v.failed.length} entr${v.failed.length === 1 ? 'y is' : 'ies are'} corrupt.`), ...(v.failed.length ? [table(['Entry', 'Problem'], v.failed.map((x) => [x.name, x.reason]))] : []), ...(v.skipped.length ? [table(['Not checked', 'Reason'], v.skipped.map((s) => [s.name, s.reason]))] : [])];
    },
  }),

  'zip-metadata-viewer': zipForm({
    async run({ files }) {
      const { report } = await openZip(oneFile(files));
      return [kv([['Archive comment', report.comment || '(none)'], ['ZIP64', report.zip64 ? 'yes' : 'no'], ['Entries', String(report.entries.length)]], 'Archive'), ...warnBlocks(report), table(['Entry', 'Modified', 'Unix mode', 'Method', 'Symlink', 'Comment'], report.entries.map((e) => [e.name, date(e.modified), e.unixMode === null ? '—' : (e.unixMode & 0o7777).toString(8).padStart(4, '0'), e.isDirectory ? '—' : methodName(e.method), e.isSymlink ? 'yes' : '', e.comment]))];
    },
  }),

  'archive-file-search': form({
    text: { label: 'Search for', rows: 1, sample: 'readme' },
    files: { label: 'ZIP archive', accept: ZIP_ACCEPT },
    options: [optCheck('contents', 'Also search inside text entries (up to 1 MiB each)'), optCheck('cs', 'Match case')],
    live: false,
    runLabel: 'Search',
    async run({ text: q, files, opts }, ctx) {
      if (q === '') throw new Error('Enter what to search for.');
      const { bytes, report } = await openZip(oneFile(files));
      const cs = bool(opts, 'cs');
      const n = (s: string) => (cs ? s : s.toLowerCase());
      const needle = n(q);
      const nameHits = report.entries.filter((e) => n(e.name).includes(needle));
      const out: Block[] = [notice('info', `${nameHits.length} entry name(s) match.`)];
      if (nameHits.length) out.push({ type: 'list', title: 'Name matches', items: nameHits.map((e) => e.name) });
      if (bool(opts, 'contents')) {
        const small = report.entries.filter((e) => !e.isDirectory && canExtract(e).ok && e.uncompressedSize <= 1024 * 1024).map((e) => e.name);
        const res = await runJob('zipExtract', { data: bytes, only: small }, { signal: ctx.signal, onProgress: ctx.progress });
        const rows: string[][] = [];
        for (const f of res.files) {
          if (f.data.subarray(0, 4096).includes(0)) continue;
          const lines = new TextDecoder().decode(f.data).split(/\r?\n/u);
          for (let i = 0; i < lines.length && rows.length < 500; i++) if (n(lines[i] as string).includes(needle)) rows.push([f.path, String(i + 1), (lines[i] as string).slice(0, 300)]);
        }
        out.push(rows.length ? table(['Entry', 'Line', 'Text'], rows, { title: 'Content matches' }) : notice('info', 'No matches inside entry contents (binary and over-1-MiB entries are skipped).'));
      }
      return out;
    },
  }),

  'zip-directory-structure-viewer': zipForm({
    async run({ files }) {
      const { report } = await openZip(oneFile(files));
      const t = buildTree(report.entries.filter((e) => !e.isDirectory).map((e) => ({ path: e.name, size: e.uncompressedSize })));
      return [summary(report), tree(renderTree(t, (n) => formatBytes(n)), 'Structure')];
    },
  }),

  'archive-extraction-preview': zipForm({
    async run({ files }) {
      const { report } = await openZip(oneFile(files));
      const seen = new Set<string>();
      let write = 0, bytes = 0;
      const rows = report.entries.filter((e) => !e.isDirectory).map((e) => {
        const v = canExtract(e);
        if (!v.ok) return [e.name, 'SKIP', v.reason];
        const p = (e.safePath as string).toLowerCase();
        if (seen.has(p)) return [e.name, 'SKIP', 'duplicate path'];
        seen.add(p); write++; bytes += e.uncompressedSize;
        return [e.name, 'WRITE', e.safePath === e.name ? e.safePath as string : `${e.safePath} (name sanitised)`];
      });
      return [notice('info', `Dry run: ${write} file(s), ${formatBytes(bytes)} would be written; ${rows.length - write} skipped. Nothing has been extracted.`), table(['Entry', 'Action', 'Output path or reason'], rows)];
    },
  }),

  'zip-manifest-generator': zipForm({
    options: [optSelect('format', 'Format', [['sha256sum', 'sha256sum text'], ['json', 'JSON']])],
    async run({ files, opts }, ctx) {
      const { bytes } = await openZip(oneFile(files));
      const res = await runJob('zipExtract', { data: bytes }, { signal: ctx.signal, onProgress: ctx.progress });
      const rows: { name: string; size: number; sha256: string }[] = [];
      for (const f of res.files) rows.push({ name: f.path, size: f.data.length, sha256: await hashBytes('SHA-256', f.data) });
      const json = str(opts, 'format') === 'json';
      const body = json ? JSON.stringify(rows, null, 2) : rows.map((r) => `${r.sha256}  ${r.name}`).join('\n') + '\n';
      return [...(res.skipped.length ? [notice('warn', `${res.skipped.length} entr${res.skipped.length === 1 ? 'y was' : 'ies were'} not hashed: ${res.skipped.slice(0, 5).map((s) => `${s.name} (${s.reason})`).join('; ')}`)] : []), text(body, { title: `${rows.length} entries`, filename: json ? 'zip-manifest.json' : 'SHA256SUMS', mime: json ? 'application/json' : 'text/plain' })];
    },
  }),
};

