/** Minimal ISO-BMFF (MP4/MOV/M4A) box reader for metadata only. Bounded depth and box count; never decodes media. */

export interface Mp4Track {
  id: number;
  type: 'video' | 'audio' | 'subtitle' | 'text' | 'other';
  handler: string;
  codec: string | null;
  width: number | null;
  height: number | null;
  /** Clockwise degrees a player applies when displaying. ffprobe reports the same matrix counter-clockwise (90 there = 270 here). */
  rotation: 0 | 90 | 180 | 270 | null;
  durationSeconds: number | null;
  timescale: number | null;
  sampleCount: number | null;
  fps: number | null;
  language: string | null;
  channels: number | null;
  sampleRate: number | null;
}

export interface Mp4Info {
  brands: string[];
  durationSeconds: number | null;
  timescale: number | null;
  created: string | null;
  tracks: Mp4Track[];
  fastStart: boolean | null;
  notes: string[];
}

interface Box {
  type: string;
  start: number;
  size: number;
  dataStart: number;
  end: number;
  truncated: boolean;
}

const ascii = (b: Uint8Array, o: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i] as number);
  return s;
};

function* boxes(b: Uint8Array, from: number, to: number, counter: { n: number }): Generator<Box> {
  let p = from;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (p + 8 <= to && counter.n++ < 20_000) {
    let size = v.getUint32(p);
    const type = ascii(b, p + 4, 4);
    let header = 8;
    if (size === 1 && p + 16 <= to) {
      size = Number(v.getBigUint64(p + 8));
      header = 16;
    } else if (size === 0) size = to - p;
    if (size < header || p + size > to) {
      // Truncated final box (common for partial reads): clamp rather than fail.
      if (size >= header && p + size > to) yield { type, start: p, size, dataStart: p + header, end: to, truncated: true };
      return;
    }
    yield { type, start: p, size, dataStart: p + header, end: p + size, truncated: false };
    p += size;
  }
}

const MAC_EPOCH_OFFSET = 2082844800; // seconds between 1904-01-01 and 1970-01-01

export function readMp4(b: Uint8Array): Mp4Info {
  if (b.length < 12 || ascii(b, 4, 4) !== 'ftyp') throw new Error('Not an MP4/MOV file (no ftyp box at the start).');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const info: Mp4Info = { brands: [], durationSeconds: null, timescale: null, created: null, tracks: [], fastStart: null, notes: [] };
  const counter = { n: 0 };
  const top = [...boxes(b, 0, b.length, counter)];
  const ftyp = top.find((x) => x.type === 'ftyp');
  if (ftyp) {
    info.brands.push(ascii(b, ftyp.dataStart, 4));
    for (let p = ftyp.dataStart + 8; p + 4 <= ftyp.end; p += 4) info.brands.push(ascii(b, p, 4));
  }
  const moov = top.find((x) => x.type === 'moov');
  const mdat = top.find((x) => x.type === 'mdat');
  if (!moov) {
    info.notes.push('No moov box found: the file is truncated, fragmented without an init segment, or the metadata is at the end beyond what was read.');
    return info;
  }
  if (moov.truncated) info.notes.push('The moov box is cut off (partial file). Track details below may be incomplete or missing.');
  if (mdat) info.fastStart = moov.start < mdat.start;
  for (const m of boxes(b, moov.dataStart, moov.end, counter)) {
    if (m.type === 'mvhd') {
      const ver = b[m.dataStart] as number;
      const o = m.dataStart + 4;
      const created = ver === 1 ? Number(v.getBigUint64(o)) : v.getUint32(o);
      info.timescale = ver === 1 ? v.getUint32(o + 16) : v.getUint32(o + 8);
      const dur = ver === 1 ? Number(v.getBigUint64(o + 20)) : v.getUint32(o + 12);
      if (info.timescale > 0) info.durationSeconds = dur / info.timescale;
      if (created > MAC_EPOCH_OFFSET) info.created = new Date((created - MAC_EPOCH_OFFSET) * 1000).toISOString();
    } else if (m.type === 'trak') info.tracks.push(readTrack(b, v, m, counter));
  }
  return info;
}

function readTrack(b: Uint8Array, v: DataView, trak: Box, counter: { n: number }): Mp4Track {
  const t: Mp4Track = { id: 0, type: 'other', handler: '', codec: null, width: null, height: null, rotation: null, durationSeconds: null, timescale: null, sampleCount: null, fps: null, language: null, channels: null, sampleRate: null };
  const walk = (from: number, to: number, depth: number) => {
    if (depth > 8) return;
    for (const bx of boxes(b, from, to, counter)) {
      switch (bx.type) {
        case 'tkhd': {
          // v0: flags(4) created(4) modified(4) id(4) reserved(4) duration(4) | v1 uses 8-byte times and duration.
          const ver = b[bx.dataStart] as number;
          const base = bx.dataStart + 4;
          t.id = v.getUint32(base + (ver === 1 ? 16 : 8));
          // After duration: reserved(8) layer(2) altGroup(2) volume(2) reserved(2) then the 3x3 matrix (36 bytes), width, height.
          const matrix = base + (ver === 1 ? 32 : 20) + 16;
          if (matrix + 44 <= bx.end) {
            const a = v.getInt32(matrix) / 65536;
            const c = v.getInt32(matrix + 4) / 65536;
            const norm = ((Math.round((Math.atan2(c, a) * 180) / Math.PI) % 360) + 360) % 360;
            t.rotation = norm === 90 || norm === 180 || norm === 270 ? norm : 0;
            const w = v.getUint32(matrix + 36) / 65536;
            const h = v.getUint32(matrix + 40) / 65536;
            if (w > 0 && h > 0) {
              t.width = Math.round(w);
              t.height = Math.round(h);
            }
          }
          break;
        }
        case 'mdhd': {
          const ver = b[bx.dataStart] as number;
          const o = bx.dataStart + 4;
          t.timescale = ver === 1 ? v.getUint32(o + 16) : v.getUint32(o + 8);
          const dur = ver === 1 ? Number(v.getBigUint64(o + 20)) : v.getUint32(o + 12);
          if (t.timescale > 0) t.durationSeconds = dur / t.timescale;
          const lang = v.getUint16(o + (ver === 1 ? 28 : 20));
          const code = String.fromCharCode(((lang >> 10) & 31) + 0x60, ((lang >> 5) & 31) + 0x60, (lang & 31) + 0x60);
          t.language = /^[a-z]{3}$/u.test(code) && code !== 'und' ? code : null;
          break;
        }
        case 'hdlr': {
          t.handler = ascii(b, bx.dataStart + 8, 4);
          t.type = t.handler === 'vide' ? 'video' : t.handler === 'soun' ? 'audio' : t.handler === 'sbtl' || t.handler === 'subt' ? 'subtitle' : t.handler === 'text' ? 'text' : 'other';
          break;
        }
        case 'stsd': {
          const entry = bx.dataStart + 8;
          if (entry + 8 <= bx.end) {
            t.codec = ascii(b, entry + 4, 4);
            if (t.type === 'audio' && entry + 36 <= bx.end) {
              t.channels = v.getUint16(entry + 8 + 16);
              t.sampleRate = v.getUint32(entry + 8 + 24) >>> 16;
            }
          }
          break;
        }
        case 'stts': {
          const n = v.getUint32(bx.dataStart + 4);
          let samples = 0;
          let ticks = 0;
          for (let i = 0; i < Math.min(n, 100_000); i++) {
            const o = bx.dataStart + 8 + i * 8;
            if (o + 8 > bx.end) break;
            const c = v.getUint32(o);
            const d = v.getUint32(o + 4);
            samples += c;
            ticks += c * d;
          }
          t.sampleCount = samples;
          if (t.timescale && ticks > 0) t.fps = (samples * t.timescale) / ticks;
          break;
        }
        case 'mdia':
        case 'minf':
        case 'stbl':
          walk(bx.dataStart, bx.end, depth + 1);
          break;
        default:
      }
    }
  };
  walk(trak.dataStart, trak.end, 0);
  return t;
}

export const FOURCC_NAMES: Record<string, string> = {
  avc1: 'H.264 / AVC', avc3: 'H.264 / AVC', hvc1: 'H.265 / HEVC', hev1: 'H.265 / HEVC', av01: 'AV1', vp09: 'VP9', vp08: 'VP8', mp4v: 'MPEG-4 Visual', mp4a: 'AAC (MPEG-4 Audio)', 'ac-3': 'Dolby Digital (AC-3)', 'ec-3': 'Dolby Digital Plus', Opus: 'Opus', fLaC: 'FLAC', alac: 'Apple Lossless', tx3g: '3GPP Timed Text', wvtt: 'WebVTT', ulaw: 'mu-law', sowt: 'PCM (little-endian)', twos: 'PCM (big-endian)', jpeg: 'Motion JPEG',
};
