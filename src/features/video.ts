import { form, custom, kv, notice, optCheck, optNum, optSelect, optText, table, text, str, num, bool, download, readBytes, oneFile, needFiles, throwIfAborted, tick, fmtNum } from './kit';
import type { Block, ImplMap, RunCtx } from './types';
import { readMp4, type Mp4Info, type Mp4Track } from '../lib/mp4';
import { createZip } from '../lib/zip';
import { formatBytes } from '../lib/sniff';
import { safeDownloadName, withExtension, LimitError } from '../lib/safe';
import { makeCanvas, canvasToBlob, MIME, EXT, type OutFormat } from '../lib/canvas';
import { stringifyCsv } from '../lib/data';

const VIDEO_ACCEPT = 'video/*,.mp4,.m4v,.mov,.webm,.mkv,.ogv';
const MAX_HEADER_BYTES = 4 * 1024 * 1024 * 1024;
const fileSpec = { label: 'Video file', accept: VIDEO_ACCEPT } as const;
const filesSpec = { label: 'Video files', accept: VIDEO_ACCEPT, multiple: true } as const;

const fmtDur = (s: number | null | undefined): string => {
  if (s === null || s === undefined || !Number.isFinite(s)) return 'unknown';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s - h * 3600 - m * 60;
  return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${sec.toFixed(3).padStart(6, '0')} (${fmtNum(s, 3)} s)`;
};
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const ratioOf = (w: number, h: number): string => { const g = gcd(w, h) || 1; return `${w / g}:${h / g}`; };

/** Read only the boxes we need from MP4/MOV. moov may sit at the end, so read head and tail for big files. */
async function mp4Info(file: File): Promise<Mp4Info | null> {
  try {
    if (file.size <= 64 * 1024 * 1024) return readMp4(await readBytes(file, MAX_HEADER_BYTES));
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    if (new TextDecoder('latin1').decode(head.subarray(4, 8)) !== 'ftyp') return null;
    return readMp4(new Uint8Array(await file.arrayBuffer()));
  } catch { return null; }
}

interface Vid { el: HTMLVideoElement; url: string; width: number; height: number; duration: number }
function loadVideo(file: File, timeoutMs = 15000): Promise<Vid> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto';
    const fail = (m: string) => { clearTimeout(timer); el.removeAttribute('src'); el.load(); URL.revokeObjectURL(url); reject(new Error(m)); };
    const timer = setTimeout(() => fail(`This browser took too long to read "${file.name}".`), timeoutMs);
    el.onloadeddata = () => { clearTimeout(timer); resolve({ el, url, width: el.videoWidth, height: el.videoHeight, duration: el.duration }); };
    el.onerror = () => fail(`This browser cannot play "${file.name}" (unsupported codec or damaged file). Header-based tools may still work for MP4/MOV.`);
    el.src = url;
  });
}
const release = (v: Vid) => { v.el.remove(); v.el.pause(); v.el.removeAttribute('src'); v.el.load(); URL.revokeObjectURL(v.url); };
function seekTo(el: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { el.onseeked = null; reject(new Error('Seeking timed out.')); }, 10000);
    el.onseeked = () => { clearTimeout(timer); el.onseeked = null; resolve(); };
    el.currentTime = Math.min(Math.max(0, t), Math.max(0, el.duration - 0.001));
  });
}
async function grab(v: Vid, t: number, maxW: number): Promise<HTMLCanvasElement> {
  await seekTo(v.el, t);
  const scale = Math.min(1, maxW / v.width);
  const c = makeCanvas(Math.max(1, Math.round(v.width * scale)), Math.max(1, Math.round(v.height * scale)));
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(v.el, 0, 0, c.width, c.height);
  return c;
}
function parseTime(s: string, label: string): number {
  const t = s.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/u.test(t)) throw new Error(`${label}: use seconds (90) or mm:ss (1:30).`);
  return t.split(':').reduce((a, p) => a * 60 + Number(p), 0);
}
const stamp = (s: number) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const fmtOpt = optSelect('format', 'Image format', [['png', 'PNG (lossless)'], ['jpeg', 'JPEG'], ['webp', 'WebP']], 'png');
const toFmt = (o: Record<string, string | number | boolean>): OutFormat => (str(o, 'format') === 'jpeg' ? 'jpeg' : str(o, 'format') === 'webp' ? 'webp' : 'png');

async function eachFile<T>(files: File[], ctx: RunCtx, fn: (f: File) => Promise<T>): Promise<{ file: File; value?: T; error?: string }[]> {
  const out: { file: File; value?: T; error?: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.progress(i / files.length, (files[i] as File).name);
    const file = files[i] as File;
    try { out.push({ file, value: await fn(file) }); } catch (e) { out.push({ file, error: e instanceof Error ? e.message : String(e) }); }
    await tick();
  }
  ctx.progress(1);
  return out;
}

const vTrack = (i: Mp4Info | null): Mp4Track | undefined => i?.tracks.find((t) => t.type === 'video');
const dispDims = (t: Mp4Track | undefined): { w: number; h: number } | null => (t?.width && t.height ? (t.rotation === 90 || t.rotation === 270 ? { w: t.height, h: t.width } : { w: t.width, h: t.height }) : null);
const resClass = (h: number) => (h >= 2160 ? '4K / UHD' : h >= 1440 ? 'QHD (1440p)' : h >= 1080 ? 'Full HD (1080p)' : h >= 720 ? 'HD (720p)' : h >= 480 ? 'SD (480p)' : 'below SD');

async function durationOf(f: File): Promise<{ s: number; via: string }> {
  const info = await mp4Info(f);
  if (info?.durationSeconds) return { s: info.durationSeconds, via: 'MP4/MOV header' };
  const v = await loadVideo(f); const s = v.duration; release(v);
  if (!Number.isFinite(s)) throw new Error('duration not available (stream without a length)');
  return { s, via: 'browser' };
}

const trackRows = (t: Mp4Track): string[] => [String(t.id), t.type, t.codec ?? '—', t.width && t.height ? `${t.width}×${t.height}` : '—', t.fps ? `${t.fps.toFixed(3)}` : '—', t.rotation === null ? '—' : `${t.rotation}°`, t.channels ? `${t.channels} ch @ ${t.sampleRate ?? '?'} Hz` : '—', t.language ?? '—', t.durationSeconds === null ? '—' : fmtNum(t.durationSeconds, 3)];
const TRACK_COLS = ['ID', 'Type', 'Codec', 'Size', 'fps', 'Rotation', 'Audio', 'Lang', 'Seconds'];

export const IMPL: ImplMap = {
  'video-metadata-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const info = await mp4Info(f);
      const out: Block[] = [];
      if (info) {
        out.push(kv([['File', f.name], ['Size', formatBytes(f.size)], ['Brands', info.brands.join(', ') || '—'], ['Duration', fmtDur(info.durationSeconds)], ['Created (header)', info.created ?? '—'], ['Fast start (moov before mdat)', info.fastStart === null ? 'unknown' : info.fastStart ? 'yes' : 'no']], 'Container'));
        out.push(table(TRACK_COLS, info.tracks.map(trackRows), { title: 'Tracks' }));
        info.notes.forEach((n) => out.push(notice('info', n)));
      } else out.push(notice('info', 'Not an MP4/MOV file, so no container header could be read here. Showing what the browser reports.'));
      try { const v = await loadVideo(f, 8000); out.push(kv([['Decoded size', `${v.width}×${v.height}`], ['Duration', fmtDur(v.duration)]], 'What this browser reports')); release(v); } catch (e) { out.push(notice('warn', e instanceof Error ? e.message : String(e))); }
      return out;
    },
  }),

  'video-duration-viewer': form({
    files: filesSpec,
    async run({ files }, ctx) {
      needFiles(files, 1);
      const rows = await eachFile(files, ctx, durationOf);
      return [table(['File', 'Duration', 'Source'], rows.map((r) => [r.file.name, r.value ? fmtDur(r.value.s) : `Error: ${r.error}`, r.value?.via ?? '—']), { note: `${rows.filter((r) => r.value).length} of ${rows.length} readable.` }), kv([['Total', fmtDur(rows.reduce((a, r) => a + (r.value?.s ?? 0), 0))]])];
    },
  }),

  'video-resolution-inspector': form({
    files: filesSpec,
    async run({ files }, ctx) {
      needFiles(files, 1);
      const rows = await eachFile(files, ctx, async (f) => {
        const d = dispDims(vTrack(await mp4Info(f)));
        if (d) return { ...d, via: 'MP4/MOV header (rotation applied)' };
        const v = await loadVideo(f); const r = { w: v.width, h: v.height, via: 'browser' }; release(v); return r;
      });
      return [table(['File', 'Displayed size', 'Aspect ratio', 'Class', 'Source'], rows.map((r) => (r.value ? [r.file.name, `${r.value.w}×${r.value.h}`, `${ratioOf(r.value.w, r.value.h)} (${(r.value.w / r.value.h).toFixed(3)})`, resClass(Math.min(r.value.w, r.value.h)), r.value.via] : [r.file.name, `Error: ${r.error}`, '—', '—', '—'])))];
    },
  }),

  'video-aspect-ratio-calculator': form({
    options: [optNum('w', 'Width', 1920, { min: 1, max: 100000 }), optNum('h', 'Height', 1080, { min: 1, max: 100000 }), optText('ratio', 'Target ratio (W:H)', '16:9', { placeholder: '16:9' }), optSelect('solve', 'Solve for', [['height', 'Height from width'], ['width', 'Width from height']])],
    run({ opts }) {
      const w = Math.round(num(opts, 'w')), h = Math.round(num(opts, 'h'));
      if (w < 1 || h < 1) throw new Error('Width and height must be at least 1.');
      const m = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/u.exec(str(opts, 'ratio').trim());
      if (!m) throw new Error('Target ratio must look like 16:9.');
      const rw = Number(m[1]), rh = Number(m[2]);
      if (!(rw > 0 && rh > 0)) throw new Error('Ratio parts must be above zero.');
      const solved = str(opts, 'solve') === 'width' ? { w: Math.round((h * rw) / rh), h } : { w, h: Math.round((w * rh) / rw) };
      return [kv([['Current ratio', `${ratioOf(w, h)} (${(w / h).toFixed(4)})`], [`${m[1]}:${m[2]} at this ${str(opts, 'solve') === 'width' ? 'height' : 'width'}`, `${solved.w}×${solved.h}`], ['Even dimensions (needed by most encoders)', `${solved.w % 2 === 0 && solved.h % 2 === 0 ? 'yes' : 'no, round to ' + (solved.w + (solved.w % 2)) + '×' + (solved.h + (solved.h % 2))}`]])];
    },
  }),

  'video-frame-rate-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const info = await mp4Info(f);
      const t = vTrack(info);
      if (!t) return [notice('warn', 'No MP4/MOV video track found. Frame rate for other containers (WebM, MKV) is not read by this tool, and browsers do not expose it reliably.')];
      const rows: [string, string][] = [['Frame rate (average)', t.fps ? `${t.fps.toFixed(3)} fps` : 'unknown'], ['Frame count', t.sampleCount === null ? 'unknown' : t.sampleCount.toLocaleString('en-US')], ['Video duration', fmtDur(t.durationSeconds)]];
      return [kv(rows), notice('info', 'Average from the sample table. Variable-frame-rate files may vary frame to frame.')];
    },
  }),

  'video-thumbnail-generator': form({
    files: fileSpec,
    options: [optText('time', 'Time (seconds or mm:ss)', '0'), fmtOpt, optNum('maxw', 'Maximum width (px)', 1280, { min: 16, max: 7680 })],
    async run({ files, opts }) {
      const f = oneFile(files);
      const v = await loadVideo(f);
      try {
        const t = parseTime(str(opts, 'time') || '0', 'Time');
        if (t > v.duration) throw new Error(`Time is beyond the end of the video (${fmtDur(v.duration)}).`);
        const c = await grab(v, t, num(opts, 'maxw'));
        const fmt = toFmt(opts);
        const blob = await canvasToBlob(c, fmt, 0.92);
        const name = safeDownloadName(withExtension(f.name, EXT[fmt], `-${t.toFixed(1)}s`));
        return [{ type: 'image', title: `Frame at ${stamp(t)}`, blob, alt: 'Captured video frame' }, download(`Download ${name}`, name, MIME[fmt], blob, `${c.width}×${c.height}, ${formatBytes(blob.size)}`)];
      } finally { release(v); }
    },
  }),

  'video-preview-player': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const v = await loadVideo(f).catch((e: Error) => { throw e; });
      const info = { w: v.width, h: v.height, d: v.duration };
      release(v);
      return [{ type: 'media', kind: 'video', blob: f, title: 'Player (local playback; nothing is uploaded)' }, kv([['Size', `${info.w}×${info.h}`], ['Duration', fmtDur(info.d)], ['File', `${f.name}, ${formatBytes(f.size)}`]])];
    },
  }),

  'video-watermark': custom(() => import('./custom/VideoWatermark')),

  'video-trim-tool': form({
    files: fileSpec,
    options: [optText('start', 'Start (seconds or mm:ss)', '0'), optText('end', 'End (seconds or mm:ss)', '5'), optNum('mbps', 'Video bitrate (Mbit/s)', 4, { min: 0.2, max: 40, step: 0.2 })],
    async run({ files, opts }, ctx) {
      const f = oneFile(files);
      if (typeof MediaRecorder === 'undefined') throw new Error('This browser has no MediaRecorder, so recording a trimmed copy is not possible.');
      const v = await loadVideo(f);
      try {
        const start = parseTime(str(opts, 'start') || '0', 'Start'), end = parseTime(str(opts, 'end'), 'End');
        if (start >= v.duration) throw new Error(`Start is beyond the end of the video (${fmtDur(v.duration)}).`);
        if (end <= start) throw new Error('End must be after start.');
        const stop = Math.min(end, v.duration);
        if (stop - start > 600) throw new LimitError('Trimming records in real time. Choose a section of 10 minutes or less.');
        const cap = (v.el as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
        if (!cap) throw new Error('This browser cannot capture a video element (captureStream).');
        const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
        if (!mime) throw new Error('This browser cannot record WebM.');
        // Some browsers only produce frames for capture when the element is in the document.
        v.el.setAttribute('aria-hidden', 'true');
        v.el.style.cssText = 'position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
        document.body.appendChild(v.el);
        await seekTo(v.el, start);
        v.el.muted = false; v.el.volume = 0; // silent to the user, audio still captured
        // Video frames are drawn onto a canvas and captured from there (more reliable than capturing the element
        // directly); the audio track still comes from the element.
        const cv = makeCanvas(v.width, v.height);
        const cg = cv.getContext('2d') as CanvasRenderingContext2D;
        const draw = () => cg.drawImage(v.el, 0, 0, cv.width, cv.height);
        draw();
        const stream = cv.captureStream(30);
        cap.call(v.el).getAudioTracks().forEach((t) => stream.addTrack(t));
        const drawTimer = setInterval(draw, 1000 / 30);
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(num(opts, 'mbps') * 1e6) });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        const done = new Promise<void>((res) => { rec.onstop = () => res(); });
        rec.start();
        await v.el.play();
        await new Promise<void>((resolve, reject) => {
          const iv = setInterval(() => {
            ctx.progress(Math.min(1, (v.el.currentTime - start) / (stop - start)), 'Recording in real time');
            if (ctx.signal.aborted) { clearInterval(iv); reject(new DOMException('Cancelled', 'AbortError')); }
            else if (v.el.currentTime >= stop || v.el.ended) { clearInterval(iv); resolve(); }
          }, 100);
        }).finally(() => { clearInterval(drawTimer); v.el.pause(); if (rec.state === 'recording') { rec.requestData(); rec.stop(); } else if (rec.state !== 'inactive') rec.stop(); stream.getTracks().forEach((t) => t.stop()); });
        await done;
        const blob = new Blob(chunks, { type: 'video/webm' });
        if (!blob.size) throw new Error('Nothing was recorded.');
        const name = safeDownloadName(withExtension(f.name, 'webm', '-trim'));
        return [notice('success', `Recorded ${fmtNum(stop - start, 1)} s as WebM.`), { type: 'media', kind: 'video', blob, title: 'Preview' }, download(`Download ${name}`, name, 'video/webm', blob, formatBytes(blob.size)), notice('info', 'Re-encoded in real time by your browser, so quality is lower than the original and timing can drift by a fraction of a second. WebM duration metadata may be missing in some players.')];
      } finally { release(v); }
    },
  }),

  'video-frame-extractor': form({
    files: fileSpec,
    options: [optSelect('mode', 'Mode', [['interval', 'Every N seconds'], ['times', 'Specific times (list below)']]), optNum('every', 'Interval (s)', 5, { min: 0.1, max: 3600, step: 0.1 }), optText('times', 'Times (comma separated)', '0, 10, 0:30'), fmtOpt, optNum('maxw', 'Maximum width (px)', 1280, { min: 16, max: 7680 })],
    async run({ files, opts }, ctx) {
      const f = oneFile(files);
      const v = await loadVideo(f);
      try {
        const times: number[] = [];
        if (str(opts, 'mode') === 'times') str(opts, 'times').split(/[,\n]/u).map((s) => s.trim()).filter(Boolean).forEach((s) => times.push(parseTime(s, `Time "${s}"`)));
        else for (let t = 0; t < v.duration; t += num(opts, 'every')) times.push(t);
        if (!times.length) throw new Error('No times to capture.');
        if (times.length > 120) throw new LimitError(`That would be ${times.length} frames. The limit is 120; raise the interval.`);
        const bad = times.find((t) => t > v.duration);
        if (bad !== undefined) throw new Error(`Time ${bad} s is beyond the end of the video (${fmtNum(v.duration, 1)} s).`);
        const fmt = toFmt(opts);
        const parts: { path: string; data: Blob }[] = [];
        for (const [i, t] of times.entries()) {
          throwIfAborted(ctx.signal);
          ctx.progress(i / times.length, `Frame ${i + 1} of ${times.length}`);
          parts.push({ path: `frame_${String(i + 1).padStart(3, '0')}_${t.toFixed(2)}s.${EXT[fmt]}`, data: await canvasToBlob(await grab(v, t, num(opts, 'maxw')), fmt, 0.9) });
        }
        const zip = await createZip(parts, { level: 0 });
        return [table(['#', 'File'], parts.map((p, i) => [String(i + 1), p.path])), download('Download frames.zip', 'frames.zip', 'application/zip', zip, `${parts.length} images, ${formatBytes(zip.length)}`)];
      } finally { release(v); }
    },
  }),

  'video-file-size-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const info = await mp4Info(f);
      const dur = info?.durationSeconds ?? (await durationOf(f).then((d) => d.s, () => null));
      const rows: [string, string][] = [['File size', `${formatBytes(f.size)} (${f.size.toLocaleString('en-US')} bytes)`], ['Duration', fmtDur(dur)]];
      if (dur) rows.push(['Overall bitrate', `${((f.size * 8) / dur / 1e6).toFixed(2)} Mbit/s`], ['Per minute', formatBytes((f.size / dur) * 60)], ['Per hour', formatBytes((f.size / dur) * 3600)]);
      const out: Block[] = [kv(rows)];
      if (info?.tracks.length) out.push(table(['Track', 'Type', 'Codec'], info.tracks.map((t) => [String(t.id), t.type, t.codec ?? '—']), { note: 'Per-track byte sizes are not computed; bitrate above is for the whole file.' }));
      return out;
    },
  }),

  'video-codec-support-checker': form({
    runLabel: 'Test this browser',
    async run() {
      const el = document.createElement('video');
      const types: [string, string][] = [['H.264 / AVC (MP4)', 'video/mp4; codecs="avc1.42E01E"'], ['H.265 / HEVC (MP4)', 'video/mp4; codecs="hvc1.1.6.L93.B0"'], ['AV1 (MP4)', 'video/mp4; codecs="av01.0.05M.08"'], ['VP8 (WebM)', 'video/webm; codecs="vp8"'], ['VP9 (WebM)', 'video/webm; codecs="vp9"'], ['AV1 (WebM)', 'video/webm; codecs="av01.0.05M.08"'], ['Theora (Ogg)', 'video/ogg; codecs="theora"'], ['QuickTime (MOV)', 'video/quicktime']];
      const rows = types.map(([n, m]) => [n, el.canPlayType(m) || 'no', typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m) ? 'yes' : 'no']);
      const out: Block[] = [table(['Format', 'Playback', 'Recording'], rows, { note: '"maybe"/"probably" are the browser’s own answers.' })];
      const VD = (window as unknown as { VideoDecoder?: { isConfigSupported(c: { codec: string }): Promise<{ supported?: boolean }> } }).VideoDecoder;
      if (VD) {
        const cfg: [string, string][] = [['H.264', 'avc1.42E01E'], ['HEVC', 'hvc1.1.6.L93.B0'], ['VP8', 'vp8'], ['VP9', 'vp09.00.10.08'], ['AV1', 'av01.0.04M.08']];
        const res = await Promise.all(cfg.map(async ([n, c]) => [n, await Promise.race([VD.isConfigSupported({ codec: c }).then((r) => (r.supported ? 'yes' : 'no'), () => 'error'), new Promise<string>((res) => setTimeout(() => res('no answer (timed out)'), 3000))])]));
        out.push(table(['Codec', 'WebCodecs decode'], res));
      } else out.push(notice('info', 'WebCodecs (VideoDecoder) is not available in this browser.'));
      return out;
    },
  }),

  'video-rotation-metadata-viewer': form({
    files: fileSpec,
    async run({ files }) {
      const info = await mp4Info(oneFile(files));
      if (!info) throw new Error('Rotation is read from MP4/MOV headers; this file is not one.');
      const vt = info.tracks.filter((t) => t.type === 'video');
      if (!vt.length) throw new Error('No video track found.');
      return [table(['Track', 'Stored size', 'Rotation (clockwise)', 'Displayed size'], vt.map((t) => { const d = dispDims(t); return [String(t.id), t.width && t.height ? `${t.width}×${t.height}` : '—', t.rotation === null ? 'not stored' : `${t.rotation}°`, d ? `${d.w}×${d.h}` : '—']; })), notice('info', 'Rotation is the clockwise angle a player applies when displaying. ffprobe prints the matrix counter-clockwise (its 90 is 270 here).')];
    },
  }),

  'video-audio-track-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const info = await mp4Info(oneFile(files));
      if (!info) throw new Error('Audio tracks are listed from MP4/MOV headers; this file is not one.');
      const at = info.tracks.filter((t) => t.type === 'audio');
      return at.length ? [table(['Track', 'Codec', 'Channels', 'Sample rate', 'Language', 'Seconds'], at.map((t) => [String(t.id), t.codec ?? '—', t.channels ? String(t.channels) : '—', t.sampleRate ? `${t.sampleRate} Hz` : '—', t.language ?? '—', t.durationSeconds === null ? '—' : fmtNum(t.durationSeconds, 3)]))] : [notice('info', 'This file has no audio track.')];
    },
  }),

  'video-contact-sheet-generator': form({
    files: fileSpec,
    options: [optNum('cols', 'Columns', 4, { min: 1, max: 10 }), optNum('rows', 'Rows', 3, { min: 1, max: 10 }), optNum('tw', 'Thumbnail width (px)', 320, { min: 64, max: 800 }), optCheck('labels', 'Timestamp labels', true)],
    async run({ files, opts }, ctx) {
      const f = oneFile(files);
      const cols = Math.round(num(opts, 'cols')), rows = Math.round(num(opts, 'rows')), tw = Math.round(num(opts, 'tw'));
      const v = await loadVideo(f);
      try {
        const n = cols * rows, th = Math.max(1, Math.round((tw * v.height) / v.width));
        const sheet = makeCanvas(cols * tw, rows * th);
        const g = sheet.getContext('2d') as CanvasRenderingContext2D;
        g.fillStyle = '#080C16'; g.fillRect(0, 0, sheet.width, sheet.height);
        g.font = '14px monospace';
        for (let i = 0; i < n; i++) {
          throwIfAborted(ctx.signal);
          ctx.progress(i / n, `Frame ${i + 1} of ${n}`);
          const t = (v.duration * (i + 0.5)) / n;
          const c = await grab(v, t, tw);
          const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
          g.drawImage(c, x, y, tw, th);
          if (bool(opts, 'labels')) { const s = stamp(t); g.fillStyle = 'rgba(8,12,22,0.8)'; g.fillRect(x, y + th - 20, g.measureText(s).width + 12, 20); g.fillStyle = '#FFD078'; g.fillText(s, x + 6, y + th - 5); }
        }
        const blob = await canvasToBlob(sheet, 'png');
        const name = safeDownloadName(withExtension(f.name, 'png', '-contact-sheet'));
        return [{ type: 'image', title: `${cols}×${rows} contact sheet`, blob, alt: 'Grid of frames from the video' }, download(`Download ${name}`, name, 'image/png', blob, `${sheet.width}×${sheet.height}, ${formatBytes(blob.size)}`)];
      } finally { release(v); }
    },
  }),

  'video-metadata-exporter': form({
    files: filesSpec,
    options: [optSelect('format', 'Format', [['json', 'JSON'], ['csv', 'CSV']])],
    async run({ files, opts }, ctx) {
      needFiles(files, 1);
      const rows = await eachFile(files, ctx, async (f) => { const i = await mp4Info(f); const vt = vTrack(i); const d = dispDims(vt); return { file: f.name, bytes: f.size, brands: i?.brands.join(' ') ?? '', durationSeconds: i?.durationSeconds ?? null, codec: vt?.codec ?? null, displayWidth: d?.w ?? null, displayHeight: d?.h ?? null, fps: vt?.fps ?? null, audioTracks: i?.tracks.filter((t) => t.type === 'audio').length ?? 0, error: i ? null : 'not an MP4/MOV file' }; });
      const recs = rows.map((r) => r.value ?? { file: r.file.name, bytes: r.file.size, error: r.error ?? 'unreadable' });
      if (str(opts, 'format') === 'json') return [text(JSON.stringify(recs, null, 2), { title: 'JSON', filename: 'video-metadata.json', mime: 'application/json' })];
      const cols = ['file', 'bytes', 'brands', 'durationSeconds', 'codec', 'displayWidth', 'displayHeight', 'fps', 'audioTracks', 'error'];
      return [text(stringifyCsv([cols, ...recs.map((r) => cols.map((c) => String((r as Record<string, unknown>)[c] ?? '')))]), { title: 'CSV (formula-guarded)', filename: 'video-metadata.csv', mime: 'text/csv' })];
    },
  }),
};
