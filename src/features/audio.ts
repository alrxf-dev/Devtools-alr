import { form, kv, notice, optNum, optSelect, optText, table, text, str, num, download, readBytes, oneFile, needFiles, throwIfAborted, tick, fmtNum } from './kit';
import type { Block, ImplMap, RunCtx } from './types';
import { parseAudioHeader, encodeWav, peakOf, rmsOf, toDb, fromDb, normalizePeak, trimAudio, applyFade, changeSpeed, detectSilence, waveformPeaks, type AudioHeaderInfo, type Channels } from '../lib/audio';
import { createZip } from '../lib/zip';
import { formatBytes } from '../lib/sniff';
import { safeDownloadName, withExtension, LimitError } from '../lib/safe';
import { makeCanvas } from '../lib/canvas';

const MAX_DECODE_BYTES = 200 * 1024 * 1024;
const MAX_DECODED_SAMPLES = 60 * 60 * 48000 * 2; // one hour of 48 kHz stereo

const AUDIO_ACCEPT = 'audio/*,.wav,.flac,.mp3,.ogg,.oga,.opus,.m4a,.aac';

interface Decoded { channels: Channels; sampleRate: number; duration: number; header: AudioHeaderInfo; bytes: Uint8Array }

const fmtDur = (s: number | null): string => {
  if (s === null || !Number.isFinite(s)) return 'unknown';
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, '0')} (${fmtNum(s, 3)} s)`;
};
const dbText = (x: number): string => (x <= 0 ? '−∞ dBFS (silence)' : `${toDb(x).toFixed(2)} dBFS`);

/** Decode with the browser's own decoder (Web Audio API). Output is Float32 per channel at the file's native rate when known. */
async function decode(file: File): Promise<Decoded> {
  const bytes = await readBytes(file, MAX_DECODE_BYTES);
  const header = parseAudioHeader(bytes);
  const rate = Math.min(96000, Math.max(8000, header.sampleRate ?? 44100));
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error('This browser does not support the Web Audio API (OfflineAudioContext).');
  const ctx = new Offline(1, 1, rate);
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new Error(`Your browser could not decode "${file.name}". The file may be damaged, or this browser lacks the codec. WAV is decoded everywhere.`);
  }
  if (buf.length * buf.numberOfChannels > MAX_DECODED_SAMPLES) throw new LimitError('This audio is longer than the one-hour decode limit.');
  const channels: Channels = [];
  for (let c = 0; c < buf.numberOfChannels; c++) channels.push(new Float32Array(buf.getChannelData(c)));
  return { channels, sampleRate: buf.sampleRate, duration: buf.duration, header, bytes };
}

/** Parse "90", "1:30", "1:02:03.5" to seconds. */
export function parseTime(s: string, label: string): number {
  const t = s.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/u.test(t)) throw new Error(`${label}: use seconds (90) or mm:ss (1:30) or h:mm:ss.`);
  return t.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
}

const wavName = (f: File, suffix: string) => safeDownloadName(withExtension(f.name, 'wav', suffix));
const bitsOpt = optSelect('bits', 'WAV bit depth', [['16', '16-bit PCM'], ['24', '24-bit PCM'], ['32', '32-bit float']], '16');
const toBits = (o: Record<string, string | number | boolean>): 16 | 24 | 32 => (str(o, 'bits') === '24' ? 24 : str(o, 'bits') === '32' ? 32 : 16);

function wavBlocks(file: File, suffix: string, channels: Channels, rate: number, bits: 16 | 24 | 32, note: string): Block[] {
  const wav = encodeWav(channels, rate, bits);
  const name = wavName(file, suffix);
  return [
    notice('success', note),
    { type: 'media', kind: 'audio', blob: new Blob([wav as BlobPart], { type: 'audio/wav' }), title: 'Preview (plays in this tab)' },
    download(`Download ${name}`, name, 'audio/wav', wav, `${formatBytes(wav.length)}, ${bits === 32 ? '32-bit float' : bits + '-bit'} PCM WAV`),
  ];
}

function headerRows(h: AudioHeaderInfo): [string, string][] {
  return [
    ['Container', h.container], ['Codec', h.codec], ['Channels', h.channels === null ? 'unknown' : String(h.channels)],
    ['Sample rate', h.sampleRate === null ? 'unknown' : `${h.sampleRate.toLocaleString('en-US')} Hz`],
    ['Bit depth', h.bitsPerSample ? `${h.bitsPerSample}-bit` : 'not applicable / unknown'],
    ['Duration', fmtDur(h.durationSeconds) + (h.durationIsEstimate ? ' (estimate)' : '')],
    ['Bitrate', h.bitrateKbps === null ? 'unknown' : `${h.bitrateKbps} kbps`],
  ];
}
const noteBlocks = (h: AudioHeaderInfo): Block[] => (h.notes.length ? h.notes.map((n) => notice('info', n)) : []);

/** Duration via a media element: works for any format the browser can play, even when the header parser cannot. */
function elementDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v: number | null) => { a.src = ''; URL.revokeObjectURL(url); resolve(v); };
    const timer = setTimeout(() => done(null), 8000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { clearTimeout(timer); done(Number.isFinite(a.duration) ? a.duration : null); };
    a.onerror = () => { clearTimeout(timer); done(null); };
    a.src = url;
  });
}

async function eachFile<T>(files: File[], ctx: RunCtx, fn: (f: File) => Promise<T>): Promise<{ file: File; value?: T; error?: string }[]> {
  const out: { file: File; value?: T; error?: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    throwIfAborted(ctx.signal);
    const file = files[i] as File;
    ctx.progress(i / files.length, file.name);
    try { out.push({ file, value: await fn(file) }); } catch (e) { out.push({ file, error: e instanceof Error ? e.message : String(e) }); }
    await tick();
  }
  ctx.progress(1);
  return out;
}

const filesSpec = { label: 'Audio files', accept: AUDIO_ACCEPT, multiple: true } as const;
const fileSpec = { label: 'Audio file', accept: AUDIO_ACCEPT } as const;

// ---------- waveform drawing (pixel style) ----------
function drawWaveform(channels: Channels, width: number, height: number): Promise<Blob> {
  const c = makeCanvas(width, height);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#080C16'; g.fillRect(0, 0, width, height);
  g.fillStyle = '#1b2640'; g.fillRect(0, Math.floor(height / 2), width, 1);
  const { min, max } = waveformPeaks(channels, width);
  const mid = height / 2;
  for (let x = 0; x < width; x++) {
    const hi = (max[x] ?? 0), lo = (min[x] ?? 0);
    const y1 = Math.round(mid - hi * mid), y2 = Math.round(mid - lo * mid);
    g.fillStyle = Math.max(Math.abs(hi), Math.abs(lo)) > 0.99 ? '#FF747F' : '#59D8FF';
    g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not render the waveform.'))), 'image/png'));
}

export const IMPL: ImplMap = {
  'audio-metadata-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const bytes = await readBytes(f, MAX_DECODE_BYTES);
      const h = parseAudioHeader(bytes);
      const out: Block[] = [kv([['File', f.name], ['Size', formatBytes(f.size)], ...headerRows(h)], 'Header fields'), ...noteBlocks(h)];
      const tags = Object.entries(h.tags);
      out.push(tags.length ? table(['Tag', 'Value'], tags.map(([k, v]) => [k, v]), { title: 'Tags' }) : notice('info', 'No tags found.'));
      const d = await elementDuration(f);
      out.push(kv([['Browser-reported duration', d === null ? 'the browser could not read this file' : fmtDur(d)]], 'What this browser reports'));
      return out;
    },
  }),

  'audio-duration-viewer': form({
    files: filesSpec,
    async run({ files }, ctx) {
      needFiles(files, 1);
      const rows = await eachFile(files, ctx, async (f) => {
        const h = parseAudioHeader(await readBytes(f, MAX_DECODE_BYTES));
        if (h.durationSeconds !== null) return { s: h.durationSeconds, via: h.durationIsEstimate ? 'header (estimate)' : 'header' };
        const d = await elementDuration(f);
        if (d === null) throw new Error('duration not available');
        return { s: d, via: 'browser' };
      });
      const total = rows.reduce((a, r) => a + (r.value?.s ?? 0), 0);
      return [
        table(['File', 'Duration', 'Source'], rows.map((r) => [r.file.name, r.value ? fmtDur(r.value.s) : `Error: ${r.error}`, r.value?.via ?? '—']), { note: `${rows.filter((r) => r.value).length} of ${rows.length} readable.` }),
        kv([['Total', fmtDur(total)]]),
      ];
    },
  }),

  'audio-format-support-checker': form({
    runLabel: 'Test this browser',
    async run() {
      const el = document.createElement('audio');
      const types: [string, string][] = [['WAV (PCM)', 'audio/wav'], ['MP3', 'audio/mpeg'], ['AAC / M4A', 'audio/mp4; codecs="mp4a.40.2"'], ['FLAC', 'audio/flac'], ['Ogg Vorbis', 'audio/ogg; codecs="vorbis"'], ['Opus (Ogg)', 'audio/ogg; codecs="opus"'], ['Opus (WebM)', 'audio/webm; codecs="opus"'], ['WebM Vorbis', 'audio/webm; codecs="vorbis"']];
      const rec = (m: string) => (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m) ? 'yes' : 'no');
      const rows = types.map(([n, m]) => [n, el.canPlayType(m) || 'no', rec(m.split(';')[0] as string)]);
      const AC = window.AudioContext;
      const out: Block[] = [table(['Format', 'Playback (canPlayType)', 'Recording (MediaRecorder)'], rows, { note: '"maybe" and "probably" are the browser’s own answers; only decoding a real file proves support.' })];
      if (AC) {
        const c = new AC();
        out.push(kv([['Web Audio API', 'available'], ['Audio engine sample rate', `${c.sampleRate} Hz`], ['Channels at output', String(c.destination.maxChannelCount)], ['Base latency', `${(c.baseLatency * 1000).toFixed(1)} ms`], ['AudioWorklet', 'audioWorklet' in c ? 'available' : 'not available']], 'Audio engine'));
        await c.close();
      } else out.push(notice('warn', 'Web Audio API is not available in this browser.'));
      return out;
    },
  }),

  'audio-file-size-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const h = parseAudioHeader(await readBytes(f, MAX_DECODE_BYTES));
      const dur = h.durationSeconds;
      const rows: [string, string][] = [['File size', `${formatBytes(f.size)} (${f.size.toLocaleString('en-US')} bytes)`], ['Duration', fmtDur(dur)]];
      if (dur && dur > 0) {
        rows.push(['Effective bitrate', `${((f.size * 8) / dur / 1000).toFixed(1)} kbps`], ['Bytes per second', fmtNum(f.size / dur, 0)], ['Per minute', formatBytes((f.size / dur) * 60)]);
        if (h.channels && h.sampleRate && h.bitsPerSample && h.codec === 'PCM') {
          const raw = h.channels * h.sampleRate * (h.bitsPerSample / 8) * dur;
          rows.push(['Uncompressed PCM size', formatBytes(raw)], ['Overhead (headers, tags)', formatBytes(Math.max(0, f.size - raw))]);
        }
      } else rows.push(['Bitrate', 'needs a duration; the header does not provide one']);
      return [kv(rows), ...noteBlocks(h)];
    },
  }),

  'audio-waveform-preview': form({
    files: fileSpec,
    options: [optNum('width', 'Image width (px)', 960, { min: 200, max: 4000, step: 20 }), optNum('height', 'Image height (px)', 240, { min: 60, max: 800, step: 10 })],
    async run({ files, opts }) {
      const d = await decode(oneFile(files));
      const blob = await drawWaveform(d.channels, Math.round(num(opts, 'width')), Math.round(num(opts, 'height')));
      const pk = peakOf(d.channels);
      return [
        { type: 'image', title: 'Waveform (all channels overlaid)', blob, alt: 'Waveform of the audio file', pixelated: true },
        { type: 'media', kind: 'audio', blob: new Blob([d.bytes as BlobPart], { type: files[0]?.type || 'audio/*' }), title: 'Play' },
        kv([['Duration', fmtDur(d.duration)], ['Peak', dbText(pk)], ['RMS', dbText(rmsOf(d.channels))], ['Clipping', pk >= 0.999 ? 'peaks reach full scale (drawn in red)' : 'none detected']]),
      ];
    },
  }),

  'audio-trimmer': form({
    files: fileSpec,
    options: [optText('start', 'Start (seconds or mm:ss)', '0'), optText('end', 'End (blank = end of file)', ''), optNum('fadeIn', 'Fade in (s)', 0, { min: 0, max: 30, step: 0.1 }), optNum('fadeOut', 'Fade out (s)', 0, { min: 0, max: 30, step: 0.1 }), bitsOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      const d = await decode(f);
      const start = parseTime(str(opts, 'start') || '0', 'Start');
      const end = str(opts, 'end').trim() === '' ? d.duration : parseTime(str(opts, 'end'), 'End');
      if (start >= d.duration) throw new Error(`Start is beyond the end of the audio (${fmtDur(d.duration)}).`);
      if (end <= start) throw new Error('End must be after start.');
      let out = trimAudio(d.channels, d.sampleRate, start, Math.min(end, d.duration));
      out = applyFade(out, d.sampleRate, num(opts, 'fadeIn'), num(opts, 'fadeOut'));
      const len = (out[0]?.length ?? 0) / d.sampleRate;
      return wavBlocks(f, '-trim', out, d.sampleRate, toBits(opts), `Kept ${fmtNum(len, 3)} s (${fmtNum(start, 3)} s to ${fmtNum(Math.min(end, d.duration), 3)} s).`);
    },
  }),

  'audio-volume-normalizer': form({
    files: fileSpec,
    options: [optNum('target', 'Target peak (dBFS)', -1, { min: -60, max: 0, step: 0.5 }), bitsOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      const d = await decode(f);
      const before = { peak: peakOf(d.channels), rms: rmsOf(d.channels) };
      if (before.peak === 0) throw new Error('The audio is completely silent, so there is nothing to normalise.');
      const r = normalizePeak(d.channels, num(opts, 'target'));
      const after = { peak: peakOf(r.channels), rms: rmsOf(r.channels) };
      return [
        kv([['Gain applied', `${r.gainDb >= 0 ? '+' : ''}${r.gainDb.toFixed(2)} dB`], ['Peak', `${dbText(before.peak)} → ${dbText(after.peak)}`], ['RMS', `${dbText(before.rms)} → ${dbText(after.rms)}`]], 'Levels'),
        notice('info', 'Peak normalisation matches the loudest sample, not perceived loudness (LUFS).'),
        ...wavBlocks(f, '-normalized', r.channels, d.sampleRate, toBits(opts), 'Normalised copy ready.'),
      ];
    },
  }),

  'audio-channel-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const d = await decode(oneFile(files));
      const rows = d.channels.map((c, i) => [`Channel ${i + 1}`, dbText(peakOf([c])), dbText(rmsOf([c]))]);
      const out: Block[] = [kv([['Channels', String(d.channels.length)], ['Sample rate', `${d.sampleRate} Hz`]]), table(['Channel', 'Peak', 'RMS'], rows)];
      if (d.channels.length >= 2) {
        const a = d.channels[0] as Float32Array, b = d.channels[1] as Float32Array;
        let sab = 0, saa = 0, sbb = 0, same = true;
        for (let i = 0; i < a.length; i++) { const x = a[i] as number, y = b[i] as number; sab += x * y; saa += x * x; sbb += y * y; if (same && x !== y) same = false; }
        const corr = saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
        const verdict = same ? 'Channels 1 and 2 are identical: this is mono stored as stereo.' : corr < -0.5 ? 'Strongly negative correlation: the channels are largely out of phase and may cancel when summed to mono.' : corr > 0.98 ? 'Nearly identical channels (very narrow stereo image).' : 'Normal stereo relationship.';
        out.push(kv([['Left/right correlation', corr.toFixed(4)], ['Interpretation', verdict]], 'Channels 1 and 2'));
      } else out.push(notice('info', 'Mono file: there is no channel pair to compare.'));
      return out;
    },
  }),

  'audio-sample-rate-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const h = parseAudioHeader(await readBytes(f, MAX_DECODE_BYTES));
      const AC = window.AudioContext;
      let engine = 'unavailable';
      if (AC) { const c = new AC(); engine = `${c.sampleRate} Hz`; await c.close(); }
      const native = h.sampleRate;
      const verdict = native === null ? 'Header did not report a sample rate.' : engine === 'unavailable' ? 'No audio engine to compare with.' : `${native}` === engine.split(' ')[0] ? 'Rates match: playback needs no resampling.' : 'Rates differ: this browser resamples on playback. That is normal and usually inaudible.';
      const nyq = native ? `${(native / 2000).toFixed(2)} kHz` : 'unknown';
      return [kv([['File sample rate', native === null ? 'unknown' : `${native.toLocaleString('en-US')} Hz`], ['Highest representable frequency (Nyquist)', nyq], ['This device’s audio engine', engine], ['Result', verdict]]), ...noteBlocks(h)];
    },
  }),

  'audio-bit-depth-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const h = parseAudioHeader(await readBytes(oneFile(files), MAX_DECODE_BYTES));
      const bits = h.bitsPerSample;
      const rows: [string, string][] = [['Container', h.container], ['Codec', h.codec]];
      if (bits) rows.push(['Bit depth', `${bits}-bit`], ['Theoretical dynamic range', h.codec === 'IEEE float' ? 'about 1528 dB (float)' : `about ${(6.02 * bits + 1.76).toFixed(1)} dB`]);
      else rows.push(['Bit depth', 'not applicable'], ['Why', h.container === 'mp3' || h.container === 'ogg' ? 'Lossy codecs store frequency-domain data, not fixed-width samples. Decoded output depth depends on the player.' : 'The header did not report a bit depth.']);
      return [kv(rows), ...noteBlocks(h)];
    },
  }),

  'audio-playback-speed-controller': form({
    files: fileSpec,
    options: [optNum('speed', 'Speed factor (0.25 – 4)', 1.5, { min: 0.25, max: 4, step: 0.05 }), bitsOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      const speed = num(opts, 'speed');
      if (!(speed >= 0.25 && speed <= 4)) throw new Error('Speed must be between 0.25 and 4.');
      const d = await decode(f);
      const out = changeSpeed(d.channels, speed);
      return [notice('info', 'This export resamples, so pitch changes with speed (like a tape). Pitch-preserving time-stretch is not implemented.'), ...wavBlocks(f, `-x${speed}`, out, d.sampleRate, toBits(opts), `New length ${fmtNum((out[0]?.length ?? 0) / d.sampleRate, 3)} s (was ${fmtNum(d.duration, 3)} s).`)];
    },
  }),

  'audio-silence-detector': form({
    files: fileSpec,
    options: [optNum('db', 'Silence threshold (dBFS)', -50, { min: -120, max: 0, step: 1 }), optNum('min', 'Minimum silence length (s)', 0.5, { min: 0.01, max: 60, step: 0.05 })],
    async run({ files, opts }) {
      const d = await decode(oneFile(files));
      const r = detectSilence(d.channels, d.sampleRate, num(opts, 'db'), num(opts, 'min'));
      const total = r.reduce((a, x) => a + x.duration, 0);
      return [kv([['Duration', fmtDur(d.duration)], ['Silent ranges', String(r.length)], ['Total silence', `${fmtNum(total, 3)} s (${((total / d.duration) * 100).toFixed(1)}%)`]]), r.length ? table(['#', 'Start', 'End', 'Length'], r.map((x, i) => [String(i + 1), fmtDur(x.start), fmtDur(x.end), `${fmtNum(x.duration, 3)} s`])) : notice('info', 'No silence at this threshold and minimum length.')];
    },
  }),

  'audio-segment-extractor': form({
    files: fileSpec,
    text: { label: 'Segments: one per line, "start-end" (seconds or mm:ss)', sample: '0-5\n0:10-0:15', rows: 6 },
    options: [bitsOpt],
    async run({ files, text: t }, ctx) {
      const f = oneFile(files);
      const lines = t.split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) throw new Error('Enter at least one segment such as 0:10-0:20.');
      if (lines.length > 200) throw new LimitError('At most 200 segments at once.');
      const d = await decode(f);
      const parts: { path: string; data: Uint8Array }[] = [];
      const rows: string[][] = [];
      for (const [i, l] of lines.entries()) {
        throwIfAborted(ctx.signal);
        const m = /^(\S+)\s*-\s*(\S+)$/u.exec(l);
        if (!m) throw new Error(`Line ${i + 1}: use "start-end", for example 0:10-0:20.`);
        const s = parseTime(m[1] as string, `Line ${i + 1} start`), e = parseTime(m[2] as string, `Line ${i + 1} end`);
        if (e <= s) throw new Error(`Line ${i + 1}: end must be after start.`);
        if (s >= d.duration) throw new Error(`Line ${i + 1}: start is beyond the end of the audio (${fmtNum(d.duration, 3)} s).`);
        const seg = trimAudio(d.channels, d.sampleRate, s, Math.min(e, d.duration));
        const name = `${String(i + 1).padStart(2, '0')}_${wavName(f, '')}`;
        parts.push({ path: name, data: encodeWav(seg, d.sampleRate, toBits({ bits: String(16) })) });
        rows.push([String(i + 1), name, `${fmtNum(s, 3)} s`, `${fmtNum(Math.min(e, d.duration), 3)} s`]);
      }
      const zip = await createZip(parts, { level: 6 });
      return [table(['#', 'File', 'Start', 'End'], rows), download('Download segments.zip', 'segments.zip', 'application/zip', zip, `${parts.length} WAV files, ${formatBytes(zip.length)}`)];
    },
  }),

  'audio-metadata-exporter': form({
    files: filesSpec,
    options: [optSelect('format', 'Format', [['json', 'JSON'], ['csv', 'CSV']])],
    async run({ files, opts }, ctx) {
      needFiles(files, 1);
      const rows = await eachFile(files, ctx, async (f) => ({ f, h: parseAudioHeader(await readBytes(f, MAX_DECODE_BYTES)) }));
      const recs = rows.map((r) => r.value ? { file: r.file.name, bytes: r.file.size, container: r.value.h.container, codec: r.value.h.codec, channels: r.value.h.channels, sampleRate: r.value.h.sampleRate, bitsPerSample: r.value.h.bitsPerSample, durationSeconds: r.value.h.durationSeconds, bitrateKbps: r.value.h.bitrateKbps, tags: r.value.h.tags, error: null } : { file: r.file.name, bytes: r.file.size, error: r.error ?? 'unreadable' });
      if (str(opts, 'format') === 'json') {
        const j = JSON.stringify(recs, null, 2);
        return [text(j, { title: 'JSON', filename: 'audio-metadata.json', mime: 'application/json' })];
      }
      const { stringifyCsv } = await import('../lib/data');
      const cols = ['file', 'bytes', 'container', 'codec', 'channels', 'sampleRate', 'bitsPerSample', 'durationSeconds', 'bitrateKbps', 'title', 'artist', 'album', 'error'];
      const body = recs.map((r) => { const x = r as Record<string, unknown>; const tg = (x.tags ?? {}) as Record<string, string>; return cols.map((c) => String(c === 'title' || c === 'artist' || c === 'album' ? tg[c] ?? '' : x[c] ?? '')); });
      return [text(stringifyCsv([cols, ...body], { formulaGuard: true }), { title: 'CSV (formula-guarded)', filename: 'audio-metadata.csv', mime: 'text/csv' })];
    },
  }),

  'audio-file-comparison': form({
    files: { label: 'Two audio files', accept: AUDIO_ACCEPT, multiple: true, maxFiles: 2 },
    async run({ files }) {
      needFiles(files, 2, 'audio files');
      const [a, b] = [await decode(files[0] as File), await decode(files[1] as File)];
      const stat = (d: Decoded) => [dbText(peakOf(d.channels)), dbText(rmsOf(d.channels))];
      const cmp = (x: string | number | null, y: string | number | null) => (x === y ? '=' : '≠');
      const rows: string[][] = [
        ['Container / codec', `${a.header.container} / ${a.header.codec}`, `${b.header.container} / ${b.header.codec}`, cmp(a.header.codec, b.header.codec)],
        ['Channels', String(a.channels.length), String(b.channels.length), cmp(a.channels.length, b.channels.length)],
        ['Sample rate', `${a.sampleRate} Hz`, `${b.sampleRate} Hz`, cmp(a.sampleRate, b.sampleRate)],
        ['Duration', fmtDur(a.duration), fmtDur(b.duration), Math.abs(a.duration - b.duration) < 0.001 ? '=' : '≠'],
        ['Peak', stat(a)[0] as string, stat(b)[0] as string, ''], ['RMS', stat(a)[1] as string, stat(b)[1] as string, ''],
      ];
      let identical = a.channels.length === b.channels.length && a.sampleRate === b.sampleRate && (a.channels[0]?.length ?? 0) === (b.channels[0]?.length ?? 0);
      let maxDiff = 0;
      if (identical) for (let c = 0; c < a.channels.length && identical; c++) { const x = a.channels[c] as Float32Array, y = b.channels[c] as Float32Array; for (let i = 0; i < x.length; i++) { const dlt = Math.abs((x[i] as number) - (y[i] as number)); if (dlt > maxDiff) maxDiff = dlt; } }
      const verdict = !identical ? 'Different shape (channels, rate or length), so samples cannot be compared one-to-one.' : maxDiff === 0 ? 'Decoded samples are identical.' : `Decoded samples differ. Largest sample difference ${maxDiff.toFixed(6)} (${dbText(maxDiff)}).`;
      return [table(['Property', files[0]?.name ?? 'A', files[1]?.name ?? 'B', ''], rows), kv([['Sample comparison', verdict]]), notice('info', 'Comparison is of decoded samples; two different encodings of the same sound will normally differ slightly.')];
    },
  }),
};
void fromDb;
