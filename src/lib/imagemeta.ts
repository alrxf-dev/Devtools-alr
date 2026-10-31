/**
 * Image container parsing: dimensions, EXIF/GPS, PNG text chunks, and metadata stripping.
 * Every loop is bounded and every read is range-checked: input is untrusted and may be deliberately malformed.
 */

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'unknown';

export interface ImageInfo {
  format: ImageFormat;
  width: number | null;
  height: number | null;
  notes: string[];
}

const ascii = (b: Uint8Array, o: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i] as number);
  return s;
};
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

export function detectImageFormat(b: Uint8Array): ImageFormat {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 6 && ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 2 && ascii(b, 0, 2) === 'BM') return 'bmp';
  return 'unknown';
}

export function readImageInfo(b: Uint8Array): ImageInfo {
  const format = detectImageFormat(b);
  const notes: string[] = [];
  let width: number | null = null;
  let height: number | null = null;
  const v = view(b);
  try {
    if (format === 'png' && b.length >= 24) {
      width = v.getUint32(16);
      height = v.getUint32(20);
    } else if (format === 'gif' && b.length >= 10) {
      width = v.getUint16(6, true);
      height = v.getUint16(8, true);
    } else if (format === 'bmp' && b.length >= 26) {
      width = v.getInt32(18, true);
      height = Math.abs(v.getInt32(22, true));
    } else if (format === 'jpeg') {
      let p = 2;
      let guard = 0;
      while (p + 4 < b.length && guard++ < 5000) {
        if (b[p] !== 0xff) {
          p++;
          continue;
        }
        const m = b[p + 1] as number;
        if (m === 0xff) {
          p++;
          continue;
        }
        if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
          p += 2;
          continue;
        }
        const len = v.getUint16(p + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          height = v.getUint16(p + 5);
          width = v.getUint16(p + 7);
          break;
        }
        if (m === 0xda) break;
        p += 2 + len;
      }
    } else if (format === 'webp' && b.length >= 30) {
      const chunk = ascii(b, 12, 4);
      if (chunk === 'VP8 ') {
        width = v.getUint16(26, true) & 0x3fff;
        height = v.getUint16(28, true) & 0x3fff;
      } else if (chunk === 'VP8L') {
        const bits = v.getUint32(21, true);
        width = (bits & 0x3fff) + 1;
        height = ((bits >> 14) & 0x3fff) + 1;
      } else if (chunk === 'VP8X') {
        width = ((b[24] as number) | ((b[25] as number) << 8) | ((b[26] as number) << 16)) + 1;
        height = ((b[27] as number) | ((b[28] as number) << 8) | ((b[29] as number) << 16)) + 1;
      }
    }
  } catch {
    notes.push('Header is truncated; dimensions could not be read.');
  }
  if (format === 'unknown') notes.push('Not a PNG, JPEG, GIF, WebP or BMP file.');
  if (width !== null && (width <= 0 || height === null || height <= 0)) {
    width = null;
    height = null;
    notes.push('Header reports non-positive dimensions.');
  }
  return { format, width, height, notes };
}

// ---------- PNG chunks ----------

export interface PngChunk {
  type: string;
  length: number;
  offset: number;
}

export function readPngChunks(b: Uint8Array): PngChunk[] {
  if (detectImageFormat(b) !== 'png') throw new Error('Not a PNG file.');
  const v = view(b);
  const out: PngChunk[] = [];
  let p = 8;
  while (p + 12 <= b.length && out.length < 10_000) {
    const len = v.getUint32(p);
    const type = ascii(b, p + 4, 4);
    if (p + 12 + len > b.length) break;
    out.push({ type, length: len, offset: p });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

const PNG_PRIVACY_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

export function readPngText(b: Uint8Array): { keyword: string; text: string }[] {
  const out: { keyword: string; text: string }[] = [];
  for (const c of readPngChunks(b)) {
    if (c.type !== 'tEXt' && c.type !== 'iTXt') continue;
    const data = b.subarray(c.offset + 8, c.offset + 8 + Math.min(c.length, 65536));
    const nul = data.indexOf(0);
    if (nul <= 0) continue;
    const keyword = new TextDecoder('latin1').decode(data.subarray(0, nul));
    if (c.type === 'tEXt') out.push({ keyword, text: new TextDecoder('latin1').decode(data.subarray(nul + 1)) });
    else {
      const compressed = data[nul + 1] === 1;
      if (compressed) {
        out.push({ keyword, text: '(compressed text)' });
        continue;
      }
      // iTXt: keyword\0 compFlag compMethod lang\0 translated\0 text
      let q = nul + 3;
      q = data.indexOf(0, q) + 1;
      q = data.indexOf(0, q) + 1;
      out.push({ keyword, text: new TextDecoder().decode(data.subarray(q)) });
    }
  }
  return out;
}

export function stripPngMetadata(b: Uint8Array): { data: Uint8Array; removed: string[] } {
  const chunks = readPngChunks(b);
  if (!chunks.some((c) => c.type === 'IEND')) throw new Error('PNG is truncated (no IEND chunk).');
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const removed: string[] = [];
  for (const c of chunks) {
    if (PNG_PRIVACY_CHUNKS.has(c.type)) removed.push(c.type);
    else parts.push(b.subarray(c.offset, c.offset + 12 + c.length));
  }
  return { data: concat(parts), removed };
}

// ---------- JPEG / EXIF ----------

export interface ExifTag {
  ifd: 'IFD0' | 'Exif' | 'GPS' | 'IFD1';
  tag: number;
  name: string;
  value: string | number | number[];
  display: string;
}

const TAGS_IFD0: Record<number, string> = {
  0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution', 0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime', 0x013b: 'Artist', 0x8298: 'Copyright',
};
const TAGS_EXIF: Record<number, string> = {
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9209: 'Flash', 0x920a: 'FocalLength',
  0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension', 0xa401: 'CustomRendered', 0xa403: 'WhiteBalance', 0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber', 0xa432: 'LensSpecification', 0xa433: 'LensMake', 0xa434: 'LensModel', 0xa435: 'LensSerialNumber',
};
const TAGS_GPS: Record<number, string> = {
  0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude', 0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x001d: 'GPSDateStamp',
};

export const ORIENTATION_NAMES: Record<number, string> = { 1: 'Normal', 2: 'Mirrored', 3: 'Rotated 180°', 4: 'Mirrored vertically', 5: 'Mirrored, rotated 90° CCW', 6: 'Rotated 90° CW', 7: 'Mirrored, rotated 90° CW', 8: 'Rotated 90° CCW' };

export interface JpegSegment {
  marker: number;
  name: string;
  offset: number;
  length: number;
  label: string;
}

export function readJpegSegments(b: Uint8Array): JpegSegment[] {
  if (detectImageFormat(b) !== 'jpeg') throw new Error('Not a JPEG file.');
  const v = view(b);
  const segs: JpegSegment[] = [];
  let p = 2;
  while (p + 4 <= b.length && segs.length < 5000) {
    if (b[p] !== 0xff) break;
    const m = b[p + 1] as number;
    if (m === 0xff) {
      p++;
      continue;
    }
    if (m === 0xd9) break;
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      p += 2;
      continue;
    }
    const len = v.getUint16(p + 2);
    if (len < 2 || p + 2 + len > b.length) break;
    const head = ascii(b, p + 4, 14);
    let label = '';
    if (m === 0xe0) label = head.startsWith('JFIF') ? 'JFIF' : head.startsWith('JFXX') ? 'JFXX' : 'APP0';
    else if (m === 0xe1) label = head.startsWith('Exif') ? 'EXIF' : head.startsWith('http://ns.adobe.com/xap') ? 'XMP' : 'APP1';
    else if (m === 0xe2) label = head.startsWith('ICC_PROFILE') ? 'ICC profile' : 'APP2';
    else if (m === 0xed) label = head.startsWith('Photoshop') ? 'Photoshop IRB' : 'APP13';
    else if (m === 0xfe) label = 'Comment';
    else if (m >= 0xe0 && m <= 0xef) label = `APP${m - 0xe0}`;
    else if (m >= 0xc0 && m <= 0xcf) label = 'Frame header';
    else if (m === 0xdb) label = 'Quantization table';
    else if (m === 0xc4) label = 'Huffman table';
    else if (m === 0xda) label = 'Scan (image data)';
    segs.push({ marker: m, name: '0xFF' + m.toString(16).toUpperCase().padStart(2, '0'), offset: p, length: len + 2, label });
    if (m === 0xda) break;
    p += 2 + len;
  }
  return segs;
}

export function readExif(b: Uint8Array): ExifTag[] {
  const seg = readJpegSegments(b).find((s) => s.marker === 0xe1 && s.label === 'EXIF');
  if (!seg) return [];
  return parseExifBlock(b.subarray(seg.offset + 10, seg.offset + seg.length)); // skip marker(2)+len(2)+"Exif\0\0"(6)
}

/** Parse a TIFF structure (starting at the byte-order mark). */
export function parseExifBlock(t: Uint8Array): ExifTag[] {
  if (t.length < 8) return [];
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return [];
  const v = view(t);
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  if (u16(2) !== 42) return [];
  const out: ExifTag[] = [];
  const seen = new Set<number>();
  const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  const readIfd = (off: number, ifd: ExifTag['ifd'], table: Record<number, string>, depth: number) => {
    if (depth > 3 || off < 8 || off + 2 > t.length || seen.has(off)) return;
    seen.add(off);
    const count = Math.min(u16(off), 500);
    for (let i = 0; i < count; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > t.length) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = u32(e + 4);
      const size = (TYPE_SIZE[type] ?? 0) * n;
      if (size === 0 || n > 100_000) continue;
      const valOff = size <= 4 ? e + 8 : u32(e + 8);
      if (valOff + size > t.length) continue;
      if (tag === 0x8769 && ifd === 'IFD0') {
        readIfd(u32(e + 8), 'Exif', TAGS_EXIF, depth + 1);
        continue;
      }
      if (tag === 0x8825 && ifd === 'IFD0') {
        readIfd(u32(e + 8), 'GPS', TAGS_GPS, depth + 1);
        continue;
      }
      const name = table[tag];
      if (!name) continue;
      let value: string | number | number[];
      if (type === 2) value = ascii(t, valOff, Math.min(size, 512)).replace(/\0+$/u, '');
      else if (type === 3) {
        const a = Array.from({ length: Math.min(n, 16) }, (_, k) => v.getUint16(valOff + k * 2, le));
        value = a.length === 1 ? (a[0] as number) : a;
      } else if (type === 4) {
        const a = Array.from({ length: Math.min(n, 16) }, (_, k) => v.getUint32(valOff + k * 4, le));
        value = a.length === 1 ? (a[0] as number) : a;
      } else if (type === 5 || type === 10) {
        const a = Array.from({ length: Math.min(n, 6) }, (_, k) => {
          const num = type === 5 ? v.getUint32(valOff + k * 8, le) : v.getInt32(valOff + k * 8, le);
          const den = type === 5 ? v.getUint32(valOff + k * 8 + 4, le) : v.getInt32(valOff + k * 8 + 4, le);
          return den === 0 ? 0 : num / den;
        });
        value = a.length === 1 ? (a[0] as number) : a;
      } else if (type === 1 || type === 7) {
        const a = Array.from({ length: Math.min(n, 16) }, (_, k) => t[valOff + k] as number);
        value = a.length === 1 ? (a[0] as number) : a;
      } else continue;
      out.push({ ifd, tag, name, value, display: displayExif(name, value) });
    }
  };
  readIfd(u32(4), 'IFD0', TAGS_IFD0, 0);
  return out;
}

function displayExif(name: string, v: string | number | number[]): string {
  if (name === 'Orientation' && typeof v === 'number') return `${v} (${ORIENTATION_NAMES[v] ?? 'unknown'})`;
  if (name === 'ExposureTime' && typeof v === 'number') return v > 0 && v < 1 ? `1/${Math.round(1 / v)} s` : `${v} s`;
  if (name === 'FNumber' && typeof v === 'number') return `f/${v.toFixed(1)}`;
  if (name === 'FocalLength' && typeof v === 'number') return `${v} mm`;
  if ((name === 'GPSLatitude' || name === 'GPSLongitude') && Array.isArray(v) && v.length === 3) return `${v[0]}° ${v[1]}' ${(v[2] as number).toFixed(2)}"`;
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

export function gpsDecimal(tags: ExifTag[]): { lat: number; lon: number } | null {
  const get = (n: string) => tags.find((t) => t.ifd === 'GPS' && t.name === n)?.value;
  const lat = get('GPSLatitude');
  const lon = get('GPSLongitude');
  const latRef = get('GPSLatitudeRef');
  const lonRef = get('GPSLongitudeRef');
  if (!Array.isArray(lat) || !Array.isArray(lon) || lat.length < 3 || lon.length < 3) return null;
  const d = (a: number[]) => (a[0] as number) + (a[1] as number) / 60 + (a[2] as number) / 3600;
  const la = d(lat) * (latRef === 'S' ? -1 : 1);
  const lo = d(lon) * (lonRef === 'W' ? -1 : 1);
  return Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? { lat: la, lon: lo } : null;
}

/** Remove EXIF, XMP, Photoshop and comment segments. ICC colour profiles and JFIF are kept so colours do not shift. */
export function stripJpegMetadata(b: Uint8Array, opts: { keepIcc?: boolean } = { keepIcc: true }): { data: Uint8Array; removed: string[]; orientationLost: number | null } {
  const segs = readJpegSegments(b);
  const sos = segs.find((s) => s.marker === 0xda);
  if (!sos) throw new Error('JPEG has no image scan; it appears truncated or corrupt.');
  const orientation = readExif(b).find((t) => t.name === 'Orientation')?.value;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  const removed: string[] = [];
  for (const s of segs) {
    const drop = s.marker === 0xe1 || s.marker === 0xed || s.marker === 0xfe || (s.marker >= 0xe3 && s.marker <= 0xef && s.marker !== 0xee) || (s.label === 'ICC profile' && !opts.keepIcc);
    if (s.marker === 0xda) {
      parts.push(b.subarray(s.offset)); // scan header + entropy-coded data + EOI, untouched
      break;
    }
    if (drop) removed.push(s.label || s.name);
    else parts.push(b.subarray(s.offset, s.offset + s.length));
  }
  return { data: concat(parts), removed, orientationLost: typeof orientation === 'number' && orientation !== 1 ? orientation : null };
}

// ---------- WebP ----------

export function stripWebpMetadata(b: Uint8Array): { data: Uint8Array; removed: string[] } {
  if (detectImageFormat(b) !== 'webp') throw new Error('Not a WebP file.');
  const v = view(b);
  const removed: string[] = [];
  const kept: Uint8Array[] = [];
  let p = 12;
  let vp8xIndex = -1;
  while (p + 8 <= b.length) {
    const type = ascii(b, p, 4);
    const size = v.getUint32(p + 4, true);
    const end = p + 8 + size + (size & 1);
    if (end > b.length + 1) throw new Error('WebP chunk extends past the end of the file (truncated).');
    const chunk = b.slice(p, Math.min(end, b.length));
    if (type === 'EXIF' || type === 'XMP ') removed.push(type.trim());
    else {
      if (type === 'VP8X') vp8xIndex = kept.length;
      kept.push(chunk);
    }
    p = end;
  }
  if (vp8xIndex >= 0) {
    const c = kept[vp8xIndex] as Uint8Array;
    c[8] = (c[8] as number) & ~(0x08 | 0x04); // clear EXIF and XMP flags
  }
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return { data: out, removed };
}

// ---------- privacy report ----------

export interface PrivacyFinding {
  level: 'high' | 'medium' | 'info';
  message: string;
}

export function privacyReport(b: Uint8Array): { format: ImageFormat; findings: PrivacyFinding[]; exif: ExifTag[]; gps: { lat: number; lon: number } | null } {
  const format = detectImageFormat(b);
  const findings: PrivacyFinding[] = [];
  let exif: ExifTag[] = [];
  let gps: { lat: number; lon: number } | null = null;
  if (format === 'jpeg') {
    const segs = readJpegSegments(b);
    exif = readExif(b);
    gps = gpsDecimal(exif);
    if (gps) findings.push({ level: 'high', message: `Contains GPS coordinates (${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}); anyone with the file can locate where it was taken.` });
    const has = (n: string) => exif.find((t) => t.name === n);
    for (const n of ['BodySerialNumber', 'LensSerialNumber', 'CameraOwnerName', 'Artist']) {
      const t = has(n);
      if (t) findings.push({ level: 'high', message: `${n} is embedded ("${t.display}"), which can identify the device or person.` });
    }
    const dev = [has('Make')?.display, has('Model')?.display].filter(Boolean).join(' ');
    if (dev) findings.push({ level: 'medium', message: `Camera/device model is embedded: ${dev}.` });
    if (has('DateTimeOriginal') || has('DateTime')) findings.push({ level: 'medium', message: `Capture date/time is embedded (${has('DateTimeOriginal')?.display ?? has('DateTime')?.display}).` });
    if (has('Software')) findings.push({ level: 'info', message: `Editing software is recorded: ${has('Software')?.display}.` });
    if (segs.some((s) => s.label === 'XMP')) findings.push({ level: 'medium', message: 'Contains an XMP packet (can hold author, edit history, keywords, and location).' });
    if (segs.some((s) => s.label === 'Photoshop IRB')) findings.push({ level: 'medium', message: 'Contains Photoshop/IPTC data (captions, creator, copyright).' });
    if (segs.some((s) => s.label === 'Comment')) findings.push({ level: 'info', message: 'Contains a JPEG comment segment.' });
  } else if (format === 'png') {
    const chunks = readPngChunks(b);
    const text = readPngText(b);
    for (const c of chunks) {
      if (c.type === 'eXIf') findings.push({ level: 'medium', message: 'Contains an EXIF chunk (may include GPS and device data).' });
      if (c.type === 'tIME') findings.push({ level: 'info', message: 'Contains a last-modification timestamp.' });
    }
    for (const t of text) findings.push({ level: /author|creator|copyright|location|gps|comment|software|description/iu.test(t.keyword) ? 'medium' : 'info', message: `Text chunk "${t.keyword}" is present.` });
  } else if (format === 'webp') {
    let p = 12;
    const v = view(b);
    while (p + 8 <= b.length) {
      const type = ascii(b, p, 4);
      const size = v.getUint32(p + 4, true);
      if (type === 'EXIF') findings.push({ level: 'medium', message: 'Contains an EXIF chunk.' });
      if (type === 'XMP ') findings.push({ level: 'medium', message: 'Contains an XMP chunk.' });
      p += 8 + size + (size & 1);
    }
  } else if (format === 'gif') {
    findings.push({ level: 'info', message: 'GIF comment/application extensions are not parsed by this tool.' });
  } else findings.push({ level: 'info', message: 'Unsupported or unrecognised format; metadata could not be inspected.' });
  if (findings.length === 0) findings.push({ level: 'info', message: 'No EXIF, XMP, GPS or text metadata was found in the parts of the file this tool understands. Pixels themselves can still identify people or places.' });
  return { format, findings, exif, gps };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
