/**
 * ZIP inspection and safe extraction.
 *
 * We parse the central directory ourselves, BEFORE any decompression, so that size, ratio, entry-count
 * and path checks happen on declared metadata. JSZip is then used only for entries that pass the checks,
 * and actual decompressed sizes are re-verified while extracting (declared sizes can lie).
 */
import JSZip from 'jszip';
import { crc32 } from './hash';
import { LIMITS, LimitError, safeRelativePath } from './safe';

export interface ZipEntryInfo {
  name: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  encrypted: boolean;
  crc32: number;
  localOffset: number;
  modified: Date | null;
  comment: string;
  unixMode: number | null;
  isSymlink: boolean;
  safePath: string | null;
  unsafeReason?: string;
  ratio: number;
}

export interface ZipReport {
  entries: ZipEntryInfo[];
  totalCompressed: number;
  totalUncompressed: number;
  comment: string;
  warnings: string[];
  fileCount: number;
  dirCount: number;
  encryptedCount: number;
  unsafeCount: number;
  overallRatio: number;
  zip64: boolean;
}

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const dec = (b: Uint8Array, utf8: boolean) => new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(b);

export const METHOD_NAMES: Record<number, string> = { 0: 'stored', 8: 'deflate', 9: 'deflate64', 12: 'bzip2', 14: 'lzma', 93: 'zstd', 95: 'xz', 98: 'ppmd', 99: 'AES-encrypted' };

export class ZipFormatError extends Error {
  override name = 'ZipFormatError';
}

/** Parse the End Of Central Directory + central directory records without decompressing anything. */
export function readZipDirectory(data: Uint8Array): ZipReport {
  if (data.length < 22) throw new ZipFormatError('File is too small to be a ZIP archive.');
  const v = dv(data);
  let eocd = -1;
  const minPos = Math.max(0, data.length - 22 - 0xffff);
  for (let i = data.length - 22; i >= minPos; i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipFormatError('End-of-central-directory record not found. The file is not a ZIP archive or is truncated.');
  let total = v.getUint16(eocd + 10, true);
  let cdSize = v.getUint32(eocd + 12, true);
  let cdOffset = v.getUint32(eocd + 16, true);
  const commentLen = v.getUint16(eocd + 20, true);
  const warnings: string[] = [];
  let zip64 = false;
  if (eocd + 22 + commentLen > data.length) warnings.push('Archive comment length exceeds file size.');
  const comment = dec(data.subarray(eocd + 22, Math.min(data.length, eocd + 22 + commentLen)), true);

  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    zip64 = true;
    const loc = eocd - 20;
    if (loc < 0 || v.getUint32(loc, true) !== 0x07064b50) throw new ZipFormatError('ZIP64 locator is missing or corrupt.');
    const off64 = Number(v.getBigUint64(loc + 8, true));
    if (off64 + 56 > data.length || v.getUint32(off64, true) !== 0x06064b50) throw new ZipFormatError('ZIP64 end-of-central-directory record is corrupt.');
    total = Number(v.getBigUint64(off64 + 32, true));
    cdSize = Number(v.getBigUint64(off64 + 40, true));
    cdOffset = Number(v.getBigUint64(off64 + 48, true));
  }
  if (total > LIMITS.zip.maxEntries) throw new LimitError(`Archive declares ${total.toLocaleString()} entries; the limit is ${LIMITS.zip.maxEntries.toLocaleString()}.`);
  if (cdOffset + cdSize > data.length) throw new ZipFormatError('Central directory extends beyond the end of the file.');

  const entries: ZipEntryInfo[] = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > data.length || v.getUint32(p, true) !== 0x02014b50) throw new ZipFormatError(`Central directory entry ${n + 1} is corrupt.`);
    const madeBy = v.getUint16(p + 4, true);
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const dosTime = v.getUint16(p + 12, true);
    const dosDate = v.getUint16(p + 14, true);
    const crc = v.getUint32(p + 16, true);
    let csize = v.getUint32(p + 20, true);
    let usize = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const cmtLen = v.getUint16(p + 32, true);
    const externalAttrs = v.getUint32(p + 38, true);
    let localOffset = v.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen + cmtLen > data.length) throw new ZipFormatError(`Central directory entry ${n + 1} runs past end of file.`);
    const utf8 = (flags & 0x800) !== 0;
    const name = dec(data.subarray(p + 46, p + 46 + nameLen), utf8);
    // ZIP64 extra field: sizes replaced by 0xFFFFFFFF are stored there.
    let ep = p + 46 + nameLen;
    const eEnd = ep + extraLen;
    while (ep + 4 <= eEnd) {
      const id = v.getUint16(ep, true);
      const sz = v.getUint16(ep + 2, true);
      if (id === 0x0001) {
        let q = ep + 4;
        if (usize === 0xffffffff && q + 8 <= eEnd) {
          usize = Number(v.getBigUint64(q, true));
          q += 8;
        }
        if (csize === 0xffffffff && q + 8 <= eEnd) {
          csize = Number(v.getBigUint64(q, true));
          q += 8;
        }
        if (localOffset === 0xffffffff && q + 8 <= eEnd) localOffset = Number(v.getBigUint64(q, true));
      }
      ep += 4 + sz;
    }
    const entryComment = dec(data.subarray(p + 46 + nameLen + extraLen, p + 46 + nameLen + extraLen + cmtLen), utf8);
    const isDirectory = name.endsWith('/') || name.endsWith('\\');
    const unixMode = (madeBy >> 8) === 3 ? (externalAttrs >>> 16) & 0xffff : null;
    const isSymlink = unixMode !== null && (unixMode & 0xf000) === 0xa000;
    const sp = safeRelativePath(name);
    const modified = new Date(((dosDate >> 9) & 0x7f) + 1980, Math.max(0, ((dosDate >> 5) & 0xf) - 1), Math.max(1, dosDate & 0x1f), (dosTime >> 11) & 0x1f, (dosTime >> 5) & 0x3f, (dosTime & 0x1f) * 2);
    entries.push({
      name,
      isDirectory,
      compressedSize: csize,
      uncompressedSize: usize,
      method,
      encrypted: (flags & 0x1) !== 0 || method === 99,
      crc32: crc,
      localOffset,
      modified: Number.isNaN(modified.getTime()) ? null : modified,
      comment: entryComment,
      unixMode,
      isSymlink,
      safePath: sp.path,
      ...(sp.reason ? { unsafeReason: sp.reason } : {}),
      ratio: csize > 0 ? usize / csize : usize > 0 ? Infinity : 1,
    });
    p += 46 + nameLen + extraLen + cmtLen;
  }

  const totalCompressed = entries.reduce((a, e) => a + e.compressedSize, 0);
  const totalUncompressed = entries.reduce((a, e) => a + e.uncompressedSize, 0);
  const names = new Map<string, number>();
  for (const e of entries) names.set(e.name, (names.get(e.name) ?? 0) + 1);
  for (const [nm, c] of names) if (c > 1) warnings.push(`Duplicate entry name "${nm}" appears ${c} times (can be used to confuse extractors).`);
  if (entries.some((e) => e.isSymlink)) warnings.push('Archive contains symbolic links; they are never followed or created by this app.');
  if (entries.some((e) => e.unsafeReason)) warnings.push('Some entry names are unsafe (path traversal, absolute paths or control characters) and are blocked from extraction.');
  if (totalUncompressed > LIMITS.zip.maxTotalUncompressedBytes) warnings.push(`Declared uncompressed size exceeds the ${(LIMITS.zip.maxTotalUncompressedBytes / 1048576).toFixed(0)} MiB extraction limit.`);
  if (entries.some((e) => e.ratio > LIMITS.zip.maxCompressionRatio && e.uncompressedSize > 1_000_000)) warnings.push(`At least one entry has a compression ratio above ${LIMITS.zip.maxCompressionRatio}:1, a possible decompression bomb.`);
  if (entries.some((e) => e.encrypted)) warnings.push('Encrypted entries cannot be read by this app (no ZIP decryption support).');
  const unsupported = entries.filter((e) => !e.encrypted && e.method !== 0 && e.method !== 8);
  if (unsupported.length) warnings.push(`${unsupported.length} entr${unsupported.length === 1 ? 'y uses' : 'ies use'} a compression method this app cannot decode (${[...new Set(unsupported.map((e) => METHOD_NAMES[e.method] ?? `method ${e.method}`))].join(', ')}).`);

  const compressedAll = totalCompressed;
  return {
    entries,
    totalCompressed,
    totalUncompressed,
    comment,
    warnings,
    fileCount: entries.filter((e) => !e.isDirectory).length,
    dirCount: entries.filter((e) => e.isDirectory).length,
    encryptedCount: entries.filter((e) => e.encrypted).length,
    unsafeCount: entries.filter((e) => e.unsafeReason).length,
    overallRatio: compressedAll > 0 ? totalUncompressed / compressedAll : 1,
    zip64,
  };
}

export type ExtractVerdict = { ok: true } | { ok: false; reason: string };

export function canExtract(e: ZipEntryInfo): ExtractVerdict {
  if (e.unsafeReason) return { ok: false, reason: `unsafe name: ${e.unsafeReason}` };
  if (e.isSymlink) return { ok: false, reason: 'symbolic link' };
  if (e.encrypted) return { ok: false, reason: 'encrypted' };
  if (e.method !== 0 && e.method !== 8) return { ok: false, reason: `unsupported compression (${METHOD_NAMES[e.method] ?? e.method})` };
  if (e.uncompressedSize > LIMITS.zip.maxEntryUncompressedBytes) return { ok: false, reason: 'entry too large' };
  if (e.ratio > LIMITS.zip.maxCompressionRatio && e.uncompressedSize > 1_000_000) return { ok: false, reason: 'suspicious compression ratio' };
  return { ok: true };
}

export interface ExtractedFile {
  path: string;
  data: Uint8Array;
  crcOk: boolean;
}

export interface ExtractResult {
  files: ExtractedFile[];
  skipped: { name: string; reason: string }[];
  totalBytes: number;
}

/**
 * Inflate raw DEFLATE data, aborting as soon as the OUTPUT would exceed maxBytes.
 * This is the real decompression-bomb defence: it counts bytes actually produced, not sizes the archive claims.
 */
export async function inflateLimited(compressed: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // Do not await the write: with back-pressure it only settles once we read.
  const writing = writer.write(compressed as BufferSource).then(() => writer.close()).catch(() => undefined);
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new LimitError(`Decompressed data exceeded the ${(maxBytes / 1048576).toFixed(0)} MiB limit; extraction stopped (possible decompression bomb).`);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof LimitError) throw e;
    throw new ZipFormatError('Compressed data is corrupt and could not be inflated.');
  } finally {
    await writing;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function entryDataSlice(data: Uint8Array, e: ZipEntryInfo): Uint8Array {
  const v = dv(data);
  const o = e.localOffset;
  if (o + 30 > data.length || v.getUint32(o, true) !== 0x04034b50) throw new ZipFormatError(`Local header for "${e.name}" is missing or corrupt.`);
  const start = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
  const end = start + e.compressedSize;
  if (end > data.length) throw new ZipFormatError(`Data for "${e.name}" extends past the end of the file (archive truncated).`);
  return data.subarray(start, end);
}

/**
 * Extract entries that pass the pre-checks. Sizes are re-measured on the actual decompressed output, so an
 * archive that under-declares its sizes is still stopped at the limit. Encrypted and unsupported entries are skipped
 * individually instead of failing the whole archive.
 */
export async function extractZipSafely(data: Uint8Array, report: ZipReport = readZipDirectory(data), opts: { only?: Set<string>; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<ExtractResult> {
  if (report.totalUncompressed > LIMITS.zip.maxTotalUncompressedBytes) throw new LimitError('Archive declares more than the allowed total uncompressed size; extraction refused.');
  const files: ExtractedFile[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const seen = new Set<string>();
  let total = 0;
  const candidates = report.entries.filter((e) => !e.isDirectory && (!opts.only || opts.only.has(e.name)));
  let done = 0;
  for (const e of candidates) {
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const v = canExtract(e);
    if (!v.ok) {
      skipped.push({ name: e.name, reason: v.reason });
      continue;
    }
    const path = e.safePath as string;
    if (seen.has(path.toLowerCase())) {
      skipped.push({ name: e.name, reason: 'duplicate path (would overwrite an earlier entry)' });
      continue;
    }
    const remaining = Math.min(LIMITS.zip.maxEntryUncompressedBytes, LIMITS.zip.maxTotalUncompressedBytes - total);
    const raw = entryDataSlice(data, e);
    const bytes = e.method === 0 ? raw.slice() : await inflateLimited(raw, remaining);
    if (bytes.length > remaining) throw new LimitError('Extraction stopped: decompressed data exceeded the size limit.');
    total += bytes.length;
    seen.add(path.toLowerCase());
    files.push({ path, data: bytes, crcOk: crc32(bytes) === e.crc32 && bytes.length === e.uncompressedSize });
    opts.onProgress?.(++done, candidates.length);
  }
  return { files, skipped, totalBytes: total };
}

export interface ZipInputFile {
  path: string;
  data: Uint8Array | Blob;
}

export async function createZip(files: ZipInputFile[], opts: { level?: number; comment?: string } = {}): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('Add at least one file.');
  if (files.length > LIMITS.zip.maxEntries) throw new LimitError(`At most ${LIMITS.zip.maxEntries} files can be archived at once.`);
  const level = Math.min(9, Math.max(0, Math.round(opts.level ?? 6)));
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    const sp = safeRelativePath(f.path);
    if (!sp.path) throw new Error(`"${f.path}" cannot be added: ${sp.reason}.`);
    let p = sp.path;
    // Avoid silently overwriting an earlier file with the same name.
    if (used.has(p.toLowerCase())) {
      const dot = p.lastIndexOf('.');
      let i = 2;
      let cand: string;
      do {
        cand = dot > 0 ? `${p.slice(0, dot)} (${i})${p.slice(dot)}` : `${p} (${i})`;
        i++;
      } while (used.has(cand.toLowerCase()));
      p = cand;
    }
    used.add(p.toLowerCase());
    zip.file(p, f.data, { binary: true, date: new Date(), createFolders: true });
  }
  return zip.generateAsync({ type: 'uint8array', compression: level === 0 ? 'STORE' : 'DEFLATE', compressionOptions: { level }, ...(opts.comment ? { comment: opts.comment } : {}) });
}

/** Verify every entry's CRC-32 by decompressing it, subject to the same limits. */
export async function verifyZipIntegrity(data: Uint8Array): Promise<{ checked: number; failed: { name: string; reason: string }[]; skipped: { name: string; reason: string }[] }> {
  const report = readZipDirectory(data);
  const res = await extractZipSafely(data, report);
  const failed = res.files.filter((f) => !f.crcOk).map((f) => ({ name: f.path, reason: 'CRC-32 mismatch (data is corrupt)' }));
  return { checked: res.files.length, failed, skipped: res.skipped };
}

// ---------- directory tree ----------

export interface TreeNode {
  name: string;
  size: number;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

export function buildTree(entries: { path: string; size: number }[]): TreeNode {
  const root: TreeNode = { name: '/', size: 0, children: new Map(), isFile: false };
  for (const e of entries) {
    const parts = e.path.split('/').filter(Boolean);
    let node = root;
    node.size += e.size;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, size: 0, children: new Map(), isFile: i === parts.length - 1 };
        node.children.set(part, child);
      }
      child.size += e.size;
      node = child;
    });
  }
  return root;
}

export function renderTree(root: TreeNode, fmt: (n: number) => string = String): string {
  const lines: string[] = [];
  const walk = (n: TreeNode, prefix: string) => {
    const kids = [...n.children.values()].sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name));
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${k.name}${k.isFile ? `  (${fmt(k.size)})` : '/'}`);
      walk(k, prefix + (last ? '    ' : '│   '));
    });
  };
  walk(root, '');
  return lines.join('\n') || '(empty)';
}
