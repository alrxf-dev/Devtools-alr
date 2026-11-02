/**
 * Audio helpers: container header parsing (no decoding required) and sample-level processing on Float32 channels.
 * Export is WAV only; MP3/AAC/Ogg encoders are not available in a browser without an extra codec library.
 */

export interface AudioHeaderInfo {
  container: 'wav' | 'flac' | 'mp3' | 'ogg' | 'mp4' | 'unknown';
  codec: string;
  channels: number | null;
  sampleRate: number | null;
  bitsPerSample: number | null;
  durationSeconds: number | null;
  durationIsEstimate: boolean;
  bitrateKbps: number | null;
  tags: Record<string, string>;
  notes: string[];
}

const ascii = (b: Uint8Array, o: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i] as number);
  return s;
};
const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

const WAV_FORMATS: Record<number, string> = { 1: 'PCM', 3: 'IEEE float', 6: 'A-law', 7: 'mu-law', 0x11: 'IMA ADPCM', 0x55: 'MP3', 0xfffe: 'Extensible' };

export function parseWav(b: Uint8Array): AudioHeaderInfo {
  if (ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WAVE') throw new Error('Not a RIFF/WAVE file.');
  const v = dv(b);
  const info: AudioHeaderInfo = { container: 'wav', codec: 'unknown', channels: null, sampleRate: null, bitsPerSample: null, durationSeconds: null, durationIsEstimate: false, bitrateKbps: null, tags: {}, notes: [] };
  let p = 12;
  let dataBytes: number | null = null;
  let blockAlign = 0;
  let guard = 0;
  while (p + 8 <= b.length && guard++ < 1000) {
    const id = ascii(b, p, 4);
    const size = v.getUint32(p + 4, true);
    const body = p + 8;
    if (id === 'fmt ' && size >= 16 && body + 16 <= b.length) {
      let tag = v.getUint16(body, true);
      info.channels = v.getUint16(body + 2, true);
      info.sampleRate = v.getUint32(body + 4, true);
      const byteRate = v.getUint32(body + 8, true);
      blockAlign = v.getUint16(body + 12, true);
      info.bitsPerSample = v.getUint16(body + 14, true);
      if (tag === 0xfffe && size >= 40 && body + 26 <= b.length) tag = v.getUint16(body + 24, true);
      info.codec = WAV_FORMATS[tag] ?? `format 0x${tag.toString(16)}`;
      info.bitrateKbps = Math.round((byteRate * 8) / 1000);
    } else if (id === 'data') {
      dataBytes = size === 0xffffffff || body + size > b.length ? b.length - body : size;
      if (body + size > b.length) info.notes.push('Data chunk is longer than the file (truncated or streamed WAV); duration is from the bytes present.');
    } else if (id === 'LIST' && ascii(b, body, 4) === 'INFO') {
      let q = body + 4;
      const end = Math.min(body + size, b.length);
      while (q + 8 <= end) {
        const k = ascii(b, q, 4);
        const sz = v.getUint32(q + 4, true);
        const val = ascii(b, q + 8, Math.min(sz, 256)).replace(/\0+$/u, '');
        const names: Record<string, string> = { INAM: 'title', IART: 'artist', IPRD: 'album', ICRD: 'date', IGNR: 'genre', ICMT: 'comment', ISFT: 'software', ICOP: 'copyright', ITRK: 'track' };
        if (names[k]) info.tags[names[k] as string] = val;
        q += 8 + sz + (sz & 1);
      }
    }
    p = body + size + (size & 1);
  }
  if (info.sampleRate && blockAlign && dataBytes !== null) info.durationSeconds = dataBytes / blockAlign / info.sampleRate;
  else info.notes.push('Could not find both the fmt and data chunks; duration unavailable.');
  return info;
}

export function parseFlac(b: Uint8Array): AudioHeaderInfo {
  if (ascii(b, 0, 4) !== 'fLaC' || b.length < 42) throw new Error('Not a FLAC file.');
  // STREAMINFO: 34 bytes after the 4-byte metadata block header.
  const sr = ((b[18] as number) << 12) | ((b[19] as number) << 4) | ((b[20] as number) >> 4);
  const ch = (((b[20] as number) >> 1) & 7) + 1;
  const bps = ((((b[20] as number) & 1) << 4) | ((b[21] as number) >> 4)) + 1;
  const total = (((b[21] as number) & 0x0f) * 2 ** 32) + (((b[22] as number) << 24) >>> 0) + (((b[23] as number) << 16) | ((b[24] as number) << 8) | (b[25] as number));
  const tags: Record<string, string> = {};
  let p = 4;
  let last = false;
  let guard = 0;
  while (!last && p + 4 <= b.length && guard++ < 200) {
    last = ((b[p] as number) & 0x80) !== 0;
    const type = (b[p] as number) & 0x7f;
    const len = ((b[p + 1] as number) << 16) | ((b[p + 2] as number) << 8) | (b[p + 3] as number);
    if (type === 4 && p + 4 + len <= b.length) {
      const v = dv(b);
      let q = p + 4;
      const vendorLen = v.getUint32(q, true);
      q += 4 + vendorLen;
      const n = Math.min(v.getUint32(q, true), 200);
      q += 4;
      for (let i = 0; i < n && q + 4 <= p + 4 + len; i++) {
        const l = v.getUint32(q, true);
        q += 4;
        const kv = new TextDecoder().decode(b.subarray(q, Math.min(q + l, p + 4 + len)));
        const eq = kv.indexOf('=');
        if (eq > 0) tags[kv.slice(0, eq).toLowerCase()] = kv.slice(eq + 1).slice(0, 256);
        q += l;
      }
    }
    p += 4 + len;
  }
  return { container: 'flac', codec: 'FLAC (lossless)', channels: ch, sampleRate: sr, bitsPerSample: bps, durationSeconds: sr > 0 && total > 0 ? total / sr : null, durationIsEstimate: false, bitrateKbps: null, tags, notes: total === 0 ? ['Total sample count is unknown (0) in the header.'] : [] };
}

const MP3_BITRATES: Record<string, number[]> = {
  'V1L1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], 'V1L2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], 'V1L3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  'V2L1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], 'V2L2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], 'V2L3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export function parseMp3(b: Uint8Array): AudioHeaderInfo {
  const tags: Record<string, string> = {};
  const notes: string[] = [];
  let start = 0;
  if (ascii(b, 0, 3) === 'ID3' && b.length >= 10) {
    const size = (((b[6] as number) & 0x7f) << 21) | (((b[7] as number) & 0x7f) << 14) | (((b[8] as number) & 0x7f) << 7) | ((b[9] as number) & 0x7f);
    start = 10 + size;
    const major = b[3] as number;
    let p = 10;
    const names: Record<string, string> = { TIT2: 'title', TPE1: 'artist', TALB: 'album', TYER: 'year', TDRC: 'year', TRCK: 'track', TCON: 'genre', TPE2: 'albumartist', TCOM: 'composer' };
    let guard = 0;
    while (major >= 3 && p + 10 < Math.min(start, b.length) && guard++ < 500) {
      const id = ascii(b, p, 4);
      if (!/^[A-Z0-9]{4}$/u.test(id)) break;
      const fsz = major === 4
        ? (((b[p + 4] as number) & 0x7f) << 21) | (((b[p + 5] as number) & 0x7f) << 14) | (((b[p + 6] as number) & 0x7f) << 7) | ((b[p + 7] as number) & 0x7f)
        : (((b[p + 4] as number) << 24) | ((b[p + 5] as number) << 16) | ((b[p + 6] as number) << 8) | (b[p + 7] as number)) >>> 0;
      if (fsz === 0 || p + 10 + fsz > b.length) break;
      if (names[id]) {
        const enc = b[p + 10] as number;
        const raw = b.subarray(p + 11, p + 10 + fsz);
        const label = enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'latin1';
        try {
          tags[names[id] as string] = new TextDecoder(label).decode(raw).replace(/\0+/gu, '').slice(0, 256);
        } catch {
          /* ignore undecodable frame */
        }
      }
      p += 10 + fsz;
    }
  }
  let i = start;
  const limit = Math.min(b.length - 4, start + 65536);
  while (i < limit) {
    if (b[i] === 0xff && ((b[i + 1] as number) & 0xe0) === 0xe0) {
      const verBits = ((b[i + 1] as number) >> 3) & 3;
      const layerBits = ((b[i + 1] as number) >> 1) & 3;
      const brIdx = (b[i + 2] as number) >> 4;
      const srIdx = ((b[i + 2] as number) >> 2) & 3;
      if (verBits !== 1 && layerBits !== 0 && brIdx !== 0 && brIdx !== 15 && srIdx !== 3) {
        const ver = verBits === 3 ? 'V1' : 'V2';
        const layer = 4 - layerBits;
        const br = MP3_BITRATES[`${ver}L${layer}`]?.[brIdx] ?? 0;
        const sr = MP3_RATES[verBits]?.[srIdx] ?? 0;
        const ch = ((b[i + 3] as number) >> 6) === 3 ? 1 : 2;
        // Xing/Info VBR header gives an exact frame count.
        const xingOff = i + 4 + (verBits === 3 ? (ch === 1 ? 17 : 32) : ch === 1 ? 9 : 17);
        let duration: number | null = null;
        let estimate = true;
        const tag = ascii(b, xingOff, 4);
        const spf = layer === 1 ? 384 : layer === 2 || verBits === 3 ? 1152 : 576;
        if ((tag === 'Xing' || tag === 'Info') && xingOff + 12 <= b.length) {
          const flags = dv(b).getUint32(xingOff + 4);
          if (flags & 1) {
            duration = (dv(b).getUint32(xingOff + 8) * spf) / sr;
            estimate = false;
          }
        }
        if (duration === null && br > 0) duration = ((b.length - start) * 8) / (br * 1000);
        notes.push(estimate ? 'Duration is estimated from the first frame bitrate and file size (accurate for CBR files only).' : 'Duration read from the Xing/Info header.');
        return { container: 'mp3', codec: `MPEG-${verBits === 3 ? '1' : '2'} Layer ${layer}`, channels: ch, sampleRate: sr, bitsPerSample: null, durationSeconds: duration, durationIsEstimate: estimate, bitrateKbps: br, tags, notes };
      }
    }
    i++;
  }
  throw new Error('No valid MPEG audio frame found in the first 64 KiB.');
}

export function parseOgg(b: Uint8Array): AudioHeaderInfo {
  if (ascii(b, 0, 4) !== 'OggS') throw new Error('Not an Ogg file.');
  const notes: string[] = [];
  const first = b.subarray(0, Math.min(b.length, 400));
  const text = ascii(first, 0, first.length);
  const vi = text.indexOf('\x01vorbis');
  const op = text.indexOf('OpusHead');
  const v = dv(b);
  let channels: number | null = null;
  let sampleRate: number | null = null;
  let codec = 'Ogg (unknown codec)';
  if (vi >= 0) {
    codec = 'Vorbis';
    channels = b[vi + 11] as number;
    sampleRate = v.getUint32(vi + 12, true);
  } else if (op >= 0) {
    codec = 'Opus';
    channels = b[op + 9] as number;
    sampleRate = v.getUint32(op + 12, true);
    notes.push('Opus always decodes at 48 kHz; the value shown is the original input rate.');
  } else if (text.includes('\x7fFLAC')) codec = 'FLAC in Ogg';
  // Duration: granule position of the last page.
  let duration: number | null = null;
  const tail = Math.max(0, b.length - 65536);
  for (let i = b.length - 27; i >= tail; i--) {
    if (b[i] === 0x4f && b[i + 1] === 0x67 && b[i + 2] === 0x67 && b[i + 3] === 0x53) {
      const gran = Number(v.getBigInt64(i + 6, true));
      const rate = codec === 'Opus' ? 48000 : sampleRate;
      if (gran > 0 && rate) duration = gran / rate;
      break;
    }
  }
  return { container: 'ogg', codec, channels, sampleRate, bitsPerSample: null, durationSeconds: duration, durationIsEstimate: false, bitrateKbps: null, tags: {}, notes };
}

export function parseAudioHeader(b: Uint8Array): AudioHeaderInfo {
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return parseWav(b);
  if (ascii(b, 0, 4) === 'fLaC') return parseFlac(b);
  if (ascii(b, 0, 4) === 'OggS') return parseOgg(b);
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] as number) & 0xe0) === 0xe0)) return parseMp3(b);
  return { container: 'unknown', codec: 'unknown', channels: null, sampleRate: null, bitsPerSample: null, durationSeconds: null, durationIsEstimate: false, bitrateKbps: null, tags: {}, notes: ['Container not recognised by the header parser. The browser may still be able to decode it.'] };
}

// ---------- sample processing ----------

export type Channels = Float32Array[];

export function encodeWav(channels: Channels, sampleRate: number, bits: 16 | 24 | 32 = 16): Uint8Array {
  if (channels.length === 0) throw new Error('No audio channels.');
  const frames = channels[0]?.length ?? 0;
  if (!channels.every((c) => c.length === frames)) throw new Error('Channels have different lengths.');
  if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 768000) throw new Error('Sample rate must be between 1000 and 768000 Hz.');
  const nch = channels.length;
  const bytesPer = bits / 8;
  const dataLen = frames * nch * bytesPer;
  if (dataLen > 0xffffffff - 44) throw new Error('Audio is too long for a WAV file (4 GiB limit).');
  const out = new Uint8Array(44 + dataLen);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, bits === 32 ? 3 : 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nch * bytesPer, true);
  v.setUint16(32, nch * bytesPer, true);
  v.setUint16(34, bits, true);
  w(36, 'data');
  v.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, (channels[c] as Float32Array)[i] as number));
      if (bits === 16) v.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
      else if (bits === 24) {
        const n = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        out[o] = n & 0xff;
        out[o + 1] = (n >> 8) & 0xff;
        out[o + 2] = (n >> 16) & 0xff;
      } else v.setFloat32(o, s, true);
      o += bytesPer;
    }
  }
  return out;
}

export function peakOf(channels: Channels): number {
  let p = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i] as number));
  return p;
}

export function rmsOf(channels: Channels): number {
  let sum = 0;
  let n = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) sum += (c[i] as number) ** 2;
    n += c.length;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

export const toDb = (x: number): number => (x <= 0 ? -Infinity : 20 * Math.log10(x));
export const fromDb = (d: number): number => 10 ** (d / 20);

/** Peak-normalise to targetDb (dBFS). Silent audio is returned unchanged instead of dividing by zero. */
export function normalizePeak(channels: Channels, targetDb = -1): { channels: Channels; gainDb: number; peakBefore: number } {
  if (targetDb > 0 || targetDb < -60) throw new Error('Target must be between -60 and 0 dBFS.');
  const peak = peakOf(channels);
  if (peak === 0) return { channels, gainDb: 0, peakBefore: 0 };
  const gain = fromDb(targetDb) / peak;
  return { channels: channels.map((c) => c.map((x) => x * gain)), gainDb: toDb(gain), peakBefore: peak };
}

export function trimAudio(channels: Channels, sampleRate: number, startSec: number, endSec: number): Channels {
  const len = channels[0]?.length ?? 0;
  if (!(startSec >= 0) || !(endSec > startSec)) throw new Error('End time must be greater than start time, and start must not be negative.');
  const a = Math.floor(startSec * sampleRate);
  const b = Math.min(len, Math.ceil(endSec * sampleRate));
  if (a >= len) throw new Error(`Start time is past the end of the audio (${(len / sampleRate).toFixed(2)} s).`);
  return channels.map((c) => c.slice(a, b));
}

export function applyFade(channels: Channels, sampleRate: number, fadeInSec: number, fadeOutSec: number): Channels {
  const len = channels[0]?.length ?? 0;
  const fi = Math.min(len, Math.round(fadeInSec * sampleRate));
  const fo = Math.min(len, Math.round(fadeOutSec * sampleRate));
  return channels.map((c) => {
    const o = c.slice();
    for (let i = 0; i < fi; i++) o[i] = (o[i] as number) * (i / fi);
    for (let i = 0; i < fo; i++) o[len - 1 - i] = (o[len - 1 - i] as number) * (i / fo);
    return o;
  });
}

/** Speed change by resampling (pitch changes with speed, like a tape). Linear interpolation. */
export function changeSpeed(channels: Channels, factor: number): Channels {
  if (!(factor >= 0.25 && factor <= 4)) throw new Error('Speed factor must be between 0.25 and 4.');
  return channels.map((c) => {
    const n = Math.max(1, Math.floor(c.length / factor));
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pos = i * factor;
      const i0 = Math.floor(pos);
      const f = pos - i0;
      o[i] = (c[i0] as number) * (1 - f) + ((c[Math.min(c.length - 1, i0 + 1)] as number) ?? 0) * f;
    }
    return o;
  });
}

export function mixToMono(channels: Channels): Float32Array {
  const n = channels[0]?.length ?? 0;
  const o = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) o[i] = (o[i] as number) + (c[i] as number) / channels.length;
  return o;
}

export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

export function detectSilence(channels: Channels, sampleRate: number, thresholdDb = -50, minDurationSec = 0.5): SilenceRange[] {
  if (thresholdDb > 0 || thresholdDb < -120) throw new Error('Threshold must be between -120 and 0 dBFS.');
  const mono = mixToMono(channels);
  const thr = fromDb(thresholdDb);
  const win = Math.max(1, Math.floor(sampleRate * 0.01));
  const out: SilenceRange[] = [];
  let startWin = -1;
  const nWin = Math.floor(mono.length / win);
  for (let w = 0; w <= nWin; w++) {
    let silent = false;
    if (w < nWin) {
      let peak = 0;
      for (let i = w * win; i < (w + 1) * win; i++) peak = Math.max(peak, Math.abs(mono[i] as number));
      silent = peak < thr;
    }
    if (silent && startWin < 0) startWin = w;
    if (!silent && startWin >= 0) {
      const s = (startWin * win) / sampleRate;
      const e = (w * win) / sampleRate;
      if (e - s >= minDurationSec) out.push({ start: s, end: e, duration: e - s });
      startWin = -1;
    }
  }
  return out;
}

export function waveformPeaks(channels: Channels, buckets: number): { min: Float32Array; max: Float32Array } {
  const mono = mixToMono(channels);
  const n = Math.max(1, Math.min(buckets, mono.length));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const step = mono.length / n;
  for (let b = 0; b < n; b++) {
    let lo = 1;
    let hi = -1;
    const a = Math.floor(b * step);
    const z = Math.max(a + 1, Math.floor((b + 1) * step));
    for (let i = a; i < z && i < mono.length; i++) {
      const s = mono[i] as number;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { min, max };
}

export function concatAudio(parts: Channels[]): Channels {
  if (parts.length === 0) throw new Error('Nothing to join.');
  const nch = Math.max(...parts.map((p) => p.length));
  const total = parts.reduce((n, p) => n + (p[0]?.length ?? 0), 0);
  const out = Array.from({ length: nch }, () => new Float32Array(total));
  let o = 0;
  for (const p of parts) {
    const len = p[0]?.length ?? 0;
    for (let c = 0; c < nch; c++) (out[c] as Float32Array).set((p[Math.min(c, p.length - 1)] as Float32Array), o);
    o += len;
  }
  return out;
}

/** Resample with linear interpolation (used only to make clips of different rates joinable). */
export function resample(channels: Channels, from: number, to: number): Channels {
  if (from === to) return channels;
  const ratio = from / to;
  return channels.map((c) => {
    const n = Math.max(1, Math.round(c.length / ratio));
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const f = pos - i0;
      o[i] = (c[i0] as number) * (1 - f) + ((c[Math.min(c.length - 1, i0 + 1)] as number) ?? 0) * f;
    }
    return o;
  });
}
