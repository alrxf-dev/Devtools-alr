/** File signature (magic number) detection, MIME lookup and text-encoding detection. */

export interface Signature {
  name: string;
  mime: string;
  ext: string[];
  offset: number;
  bytes: (number | null)[]; // null = wildcard
  note?: string;
}

const s = (str: string): number[] => Array.from(str, (c) => c.charCodeAt(0));

export const SIGNATURES: Signature[] = [
  { name: 'PNG image', mime: 'image/png', ext: ['png'], offset: 0, bytes: [0x89, ...s('PNG'), 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: 'JPEG image', mime: 'image/jpeg', ext: ['jpg', 'jpeg', 'jpe'], offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { name: 'GIF image', mime: 'image/gif', ext: ['gif'], offset: 0, bytes: s('GIF8') },
  { name: 'BMP image', mime: 'image/bmp', ext: ['bmp'], offset: 0, bytes: s('BM') },
  { name: 'ICO icon', mime: 'image/x-icon', ext: ['ico'], offset: 0, bytes: [0, 0, 1, 0] },
  { name: 'TIFF image (LE)', mime: 'image/tiff', ext: ['tif', 'tiff'], offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { name: 'TIFF image (BE)', mime: 'image/tiff', ext: ['tif', 'tiff'], offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { name: 'WebP image', mime: 'image/webp', ext: ['webp'], offset: 0, bytes: [...s('RIFF'), null, null, null, null, ...s('WEBP')] },
  { name: 'AVIF/HEIF image', mime: 'image/avif', ext: ['avif', 'heic'], offset: 4, bytes: s('ftypavif') },
  { name: 'PDF document', mime: 'application/pdf', ext: ['pdf'], offset: 0, bytes: s('%PDF-') },
  { name: 'ZIP archive (also DOCX/XLSX/PPTX/JAR/APK/EPUB)', mime: 'application/zip', ext: ['zip', 'docx', 'xlsx', 'pptx', 'jar', 'apk', 'epub', 'odt'], offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'ZIP archive (empty)', mime: 'application/zip', ext: ['zip'], offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
  { name: 'GZIP archive', mime: 'application/gzip', ext: ['gz', 'tgz'], offset: 0, bytes: [0x1f, 0x8b, 0x08] },
  { name: '7-Zip archive', mime: 'application/x-7z-compressed', ext: ['7z'], offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { name: 'RAR archive v1.5+', mime: 'application/vnd.rar', ext: ['rar'], offset: 0, bytes: [...s('Rar!'), 0x1a, 0x07, 0x00] },
  { name: 'RAR archive v5', mime: 'application/vnd.rar', ext: ['rar'], offset: 0, bytes: [...s('Rar!'), 0x1a, 0x07, 0x01, 0x00] },
  { name: 'TAR archive', mime: 'application/x-tar', ext: ['tar'], offset: 257, bytes: s('ustar') },
  { name: 'BZip2 archive', mime: 'application/x-bzip2', ext: ['bz2'], offset: 0, bytes: s('BZh') },
  { name: 'XZ archive', mime: 'application/x-xz', ext: ['xz'], offset: 0, bytes: [0xfd, ...s('7zXZ'), 0x00] },
  { name: 'Zstandard archive', mime: 'application/zstd', ext: ['zst'], offset: 0, bytes: [0x28, 0xb5, 0x2f, 0xfd] },
  { name: 'MP3 audio (ID3)', mime: 'audio/mpeg', ext: ['mp3'], offset: 0, bytes: s('ID3') },
  { name: 'MP3 audio (frame sync)', mime: 'audio/mpeg', ext: ['mp3'], offset: 0, bytes: [0xff, null], note: 'Frame-sync only; weak signature.' },
  { name: 'WAV audio', mime: 'audio/wav', ext: ['wav'], offset: 0, bytes: [...s('RIFF'), null, null, null, null, ...s('WAVE')] },
  { name: 'AVI video', mime: 'video/x-msvideo', ext: ['avi'], offset: 0, bytes: [...s('RIFF'), null, null, null, null, ...s('AVI ')] },
  { name: 'FLAC audio', mime: 'audio/flac', ext: ['flac'], offset: 0, bytes: s('fLaC') },
  { name: 'Ogg container', mime: 'audio/ogg', ext: ['ogg', 'oga', 'ogv', 'opus'], offset: 0, bytes: s('OggS') },
  { name: 'MIDI audio', mime: 'audio/midi', ext: ['mid', 'midi'], offset: 0, bytes: s('MThd') },
  { name: 'MP4/MOV (ISO base media)', mime: 'video/mp4', ext: ['mp4', 'm4a', 'm4v', 'mov', '3gp'], offset: 4, bytes: s('ftyp') },
  { name: 'QuickTime movie', mime: 'video/quicktime', ext: ['mov'], offset: 4, bytes: s('moov') },
  { name: 'Matroska/WebM', mime: 'video/webm', ext: ['webm', 'mkv'], offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { name: 'FLV video', mime: 'video/x-flv', ext: ['flv'], offset: 0, bytes: [...s('FLV'), 0x01] },
  { name: 'Windows executable (PE)', mime: 'application/vnd.microsoft.portable-executable', ext: ['exe', 'dll'], offset: 0, bytes: s('MZ') },
  { name: 'ELF executable', mime: 'application/x-elf', ext: ['elf', 'so', ''], offset: 0, bytes: [0x7f, ...s('ELF')] },
  { name: 'Mach-O executable (64-bit)', mime: 'application/x-mach-binary', ext: ['dylib', ''], offset: 0, bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: 'Java class file', mime: 'application/java-vm', ext: ['class'], offset: 0, bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: 'WebAssembly module', mime: 'application/wasm', ext: ['wasm'], offset: 0, bytes: [0x00, ...s('asm')] },
  { name: 'SQLite database', mime: 'application/vnd.sqlite3', ext: ['sqlite', 'db'], offset: 0, bytes: s('SQLite format 3\0') },
  { name: 'Microsoft OLE2 (legacy DOC/XLS/PPT/MSI)', mime: 'application/x-ole-storage', ext: ['doc', 'xls', 'ppt', 'msi'], offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { name: 'RTF document', mime: 'application/rtf', ext: ['rtf'], offset: 0, bytes: s('{\\rtf') },
  { name: 'PostScript', mime: 'application/postscript', ext: ['ps', 'eps'], offset: 0, bytes: s('%!PS') },
  { name: 'WOFF font', mime: 'font/woff', ext: ['woff'], offset: 0, bytes: s('wOFF') },
  { name: 'WOFF2 font', mime: 'font/woff2', ext: ['woff2'], offset: 0, bytes: s('wOF2') },
  { name: 'TrueType font', mime: 'font/ttf', ext: ['ttf'], offset: 0, bytes: [0x00, 0x01, 0x00, 0x00, 0x00] },
  { name: 'OpenType font', mime: 'font/otf', ext: ['otf'], offset: 0, bytes: s('OTTO') },
  { name: 'Shell script (shebang)', mime: 'text/x-shellscript', ext: ['sh'], offset: 0, bytes: s('#!') },
];

export interface SignatureMatch {
  signature: Signature;
  strong: boolean;
}

export function matchesAt(bytes: Uint8Array, sig: Signature): boolean {
  if (bytes.length < sig.offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    const want = sig.bytes[i];
    if (want !== null && want !== undefined && bytes[sig.offset + i] !== want) return false;
  }
  return true;
}

export function detectSignatures(bytes: Uint8Array): SignatureMatch[] {
  const out: SignatureMatch[] = [];
  for (const sig of SIGNATURES) if (matchesAt(bytes, sig)) out.push({ signature: sig, strong: sig.bytes.filter((b) => b !== null).length >= 3 });
  // Prefer specific matches (more fixed bytes) first.
  out.sort((a, b) => b.signature.bytes.filter((x) => x !== null).length - a.signature.bytes.filter((x) => x !== null).length);
  return out;
}

export function looksLikeText(bytes: Uint8Array, sample = 4096): boolean {
  const n = Math.min(bytes.length, sample);
  if (n === 0) return true;
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i] as number;
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) bad++;
  }
  return bad / n < 0.02;
}

export const EXT_MIME: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', ndjson: 'application/x-ndjson', xml: 'application/xml', yaml: 'application/yaml', yml: 'application/yaml',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', ts: 'text/typescript', svg: 'image/svg+xml', pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/opus',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', exe: 'application/vnd.microsoft.portable-executable', wasm: 'application/wasm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', srt: 'application/x-subrip', vtt: 'text/vtt', log: 'text/plain', ini: 'text/plain', toml: 'application/toml', sh: 'application/x-sh',
};

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/u).pop() ?? name;
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i + 1).toLowerCase();
}

export interface ExtensionReport {
  name: string;
  extension: string;
  allExtensions: string[];
  hidden: boolean;
  doubleExtension: boolean;
  suspicious: string[];
}

const EXEC_EXT = new Set(['exe', 'scr', 'bat', 'cmd', 'com', 'pif', 'msi', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'ps1', 'jar', 'lnk', 'hta', 'sh', 'apk']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'mp3', 'mp4', 'zip', 'rtf']);

export function inspectExtension(name: string): ExtensionReport {
  const base = name.split(/[\\/]/u).pop() ?? name;
  const parts = base.split('.');
  const hidden = base.startsWith('.');
  const allExtensions = parts.slice(hidden ? 2 : 1).map((p) => p.toLowerCase());
  const extension = allExtensions[allExtensions.length - 1] ?? '';
  const suspicious: string[] = [];
  const doubleExtension = allExtensions.length >= 2;
  if (doubleExtension && EXEC_EXT.has(extension) && DOC_EXT.has(allExtensions[allExtensions.length - 2] as string)) {
    suspicious.push(`Looks like a document ("${allExtensions[allExtensions.length - 2]}") but actually ends in executable type ".${extension}".`);
  }
  if (/[‪-‮⁦-⁩]/u.test(base)) suspicious.push('Filename contains a Unicode bidirectional control character, which can disguise the real extension.');
  if (/\s{3,}\./u.test(base)) suspicious.push('Filename has long padding spaces before the extension, a common disguise trick.');
  if (extension === '' && !hidden) suspicious.push('No file extension.');
  return { name: base, extension, allExtensions, hidden, doubleExtension, suspicious };
}

export interface TypeReport {
  claimedExt: string;
  claimedMime: string;
  detected: SignatureMatch | null;
  extMime: string | null;
  isText: boolean;
  verdict: 'match' | 'mismatch' | 'unknown' | 'text';
  message: string;
}

export function analyzeType(name: string, claimedMime: string, head: Uint8Array): TypeReport {
  const ext = extensionOf(name);
  const matches = detectSignatures(head);
  const best = matches[0] ?? null;
  const isText = !best && looksLikeText(head);
  const extMime = EXT_MIME[ext] ?? null;
  let verdict: TypeReport['verdict'] = 'unknown';
  let message = 'No known signature matched; the type cannot be confirmed from content.';
  if (best) {
    const ok = best.signature.ext.includes(ext) || best.signature.mime === claimedMime;
    verdict = ok ? 'match' : 'mismatch';
    message = ok
      ? `Content signature (${best.signature.name}) is consistent with the extension.`
      : `Content looks like ${best.signature.name} (.${best.signature.ext[0] ?? '?'}), but the extension is ".${ext || '(none)'}". Treat the extension as unreliable.`;
  } else if (isText) {
    verdict = 'text';
    message = 'Content looks like plain text. Text formats (JSON, CSV, HTML, scripts) have no signature, so the extension is used as a hint only.';
  }
  return { claimedExt: ext, claimedMime, detected: best, extMime, isText, verdict, message };
}

// ---------- text encoding detection ----------

export interface EncodingReport {
  encoding: string;
  confidence: 'certain' | 'high' | 'medium' | 'low';
  bom: string | null;
  lineEndings: 'LF' | 'CRLF' | 'CR' | 'mixed' | 'none';
  notes: string[];
}

export function detectEncoding(bytes: Uint8Array): EncodingReport {
  const notes: string[] = [];
  const sample = bytes.subarray(0, Math.min(bytes.length, 1_000_000));
  let bom: string | null = null;
  let encoding = 'unknown';
  let confidence: EncodingReport['confidence'] = 'low';
  if (sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) {
    bom = 'UTF-8 BOM';
    encoding = 'UTF-8';
    confidence = 'certain';
  } else if (sample[0] === 0xff && sample[1] === 0xfe && sample[2] === 0 && sample[3] === 0) {
    bom = 'UTF-32 LE BOM';
    encoding = 'UTF-32LE';
    confidence = 'certain';
  } else if (sample[0] === 0xff && sample[1] === 0xfe) {
    bom = 'UTF-16 LE BOM';
    encoding = 'UTF-16LE';
    confidence = 'certain';
  } else if (sample[0] === 0xfe && sample[1] === 0xff) {
    bom = 'UTF-16 BE BOM';
    encoding = 'UTF-16BE';
    confidence = 'certain';
  } else if (sample.length === 0) {
    encoding = 'empty';
    confidence = 'certain';
  } else {
    let nul = 0;
    let ascii = true;
    for (const b of sample) {
      if (b === 0) nul++;
      if (b > 127) ascii = false;
    }
    if (nul > 0 && nul / sample.length > 0.2) {
      // Alternating NULs suggest UTF-16 without BOM.
      const evenNul = sample.filter((b, i) => b === 0 && i % 2 === 0).length;
      const oddNul = sample.filter((b, i) => b === 0 && i % 2 === 1).length;
      encoding = oddNul > evenNul ? 'UTF-16LE (no BOM)' : 'UTF-16BE (no BOM)';
      confidence = 'medium';
    } else if (nul > 0) {
      encoding = 'binary (not text)';
      confidence = 'high';
    } else if (ascii) {
      encoding = 'ASCII (also valid UTF-8)';
      confidence = 'high';
    } else {
      try {
        // Only when the sample was cut at 1 MB may it end mid-character; a complete file must decode strictly.
        new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: bytes.length > sample.length });
        encoding = 'UTF-8';
        confidence = 'high';
      } catch {
        encoding = 'Not valid UTF-8 (likely a legacy single-byte encoding such as Windows-1252 or ISO-8859-1)';
        confidence = 'low';
        notes.push('A legacy 8-bit encoding cannot be identified reliably from bytes alone.');
      }
    }
  }
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 13) {
      if (sample[i + 1] === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (sample[i] === 10) lf++;
  }
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  const lineEndings: EncodingReport['lineEndings'] = kinds === 0 ? 'none' : kinds > 1 ? 'mixed' : crlf ? 'CRLF' : lf ? 'LF' : 'CR';
  if (bytes.length > sample.length) notes.push('Only the first 1 MB was analysed.');
  return { encoding, confidence, bom, lineEndings, notes };
}

// ---------- size formatting ----------

export function formatBytes(n: number, binary = true): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  const base = binary ? 1024 : 1000;
  const units = binary ? ['B', 'KiB', 'MiB', 'GiB', 'TiB'] : ['B', 'kB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= base && i < units.length - 1) {
    v /= base;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function convertSize(value: number, unit: string): Record<string, string> {
  const F: Record<string, number> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4, bit: 1 / 8 };
  if (!(unit in F)) throw new Error(`Unknown unit "${unit}".`);
  if (!Number.isFinite(value) || value < 0) throw new Error('Enter a non-negative number.');
  const bytes = value * (F[unit] as number);
  const out: Record<string, string> = {};
  for (const [u, f] of Object.entries(F)) out[u] = u === 'bit' ? String(bytes * 8) : String(Number((bytes / f).toPrecision(12)));
  return out;
}

/** Classic hex dump: offset, 16 hex bytes, ASCII gutter. Non-printable bytes show as ".". */
export function hexDump(bytes: Uint8Array, start = 0, length = 256): string {
  const end = Math.min(bytes.length, start + length);
  const lines: string[] = [];
  for (let off = start; off < end; off += 16) {
    const row = bytes.subarray(off, Math.min(off + 16, end));
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
    const asc = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex}  ${asc}`);
  }
  return lines.join('\n');
}
