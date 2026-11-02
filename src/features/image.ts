import { form, custom, kv, notice, optCheck, optNum, optSelect, optText, table, text, str, num, bool, download, readBytes, readText, oneFile, needFiles, fmtNum } from './kit';
import type { Block, ImplMap } from './types';
import { decodeImage, makeCanvas, ctx2d, canvasToBlob, hasTransparency, parseHexColor, MIME, EXT, MAX_OUTPUT_PIXELS, type OutFormat } from '../lib/canvas';
import { detectImageFormat, readImageInfo, readExif, privacyReport, readPngText, gpsDecimal } from '../lib/imagemeta';
import { extractPalette, luma709, sepia, diffImages } from '../lib/palette';
import { createZip } from '../lib/zip';
import { formatBytes } from '../lib/sniff';
import { safeDownloadName, withExtension, LimitError, LIMITS } from '../lib/safe';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif';
const fileSpec = { label: 'Image', accept: ACCEPT } as const;
const fmtOpt = (def: OutFormat = 'png') => optSelect('format', 'Output format', [['png', 'PNG (lossless)'], ['jpeg', 'JPEG'], ['webp', 'WebP']], def);
const qOpt = optNum('quality', 'Quality for JPEG/WebP (1–100)', 90, { min: 1, max: 100 });
const bgOpt = optText('bg', 'Background colour (HEX) for JPEG and empty areas', '#ffffff', { placeholder: '#ffffff' });
const toFmt = (o: Record<string, string | number | boolean>): OutFormat => (str(o, 'format') === 'jpeg' ? 'jpeg' : str(o, 'format') === 'webp' ? 'webp' : 'png');
const quality = (o: Record<string, string | number | boolean>) => Math.min(1, Math.max(0.01, num(o, 'quality') / 100));

/** Flatten transparent pixels onto a colour (JPEG has no alpha, and a black fallback would be a surprise). */
function flatten(c: HTMLCanvasElement, bg: string): HTMLCanvasElement {
  const out = makeCanvas(c.width, c.height);
  const g = ctx2d(out);
  g.fillStyle = bg; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(c, 0, 0);
  return out;
}

async function emit(file: File, c: HTMLCanvasElement, o: Record<string, string | number | boolean>, suffix: string, extra: Block[] = []): Promise<Block[]> {
  const fmt = toFmt(o);
  const bg = parseHexColor(str(o, 'bg') || '#ffffff');
  const notes: Block[] = [];
  let src = c;
  if (fmt === 'jpeg' && hasTransparency(c)) { src = flatten(c, bg); notes.push(notice('info', `Transparent areas were flattened onto ${bg} because JPEG has no transparency.`)); }
  const blob = await canvasToBlob(src, fmt, quality(o));
  const name = safeDownloadName(withExtension(file.name, EXT[fmt], suffix));
  return [
    ...extra, ...notes,
    { type: 'image', title: 'Result', blob, alt: 'Processed image' },
    kv([['Output size', `${c.width}×${c.height}`], ['File size', `${formatBytes(blob.size)}${file.size ? ` (original ${formatBytes(file.size)})` : ''}`]]),
    download(`Download ${name}`, name, MIME[fmt], blob),
    notice('info', 'Re-encoding in the browser drops EXIF and other metadata, which also removes GPS data.'),
  ];
}

const withImage = async <T>(file: File, fn: (b: ImageBitmap) => Promise<T> | T): Promise<T> => { const b = await decodeImage(file); try { return await fn(b); } finally { b.close(); } };
const toCanvas = (b: ImageBitmap): HTMLCanvasElement => { const c = makeCanvas(b.width, b.height); ctx2d(c).drawImage(b, 0, 0); return c; };
const pixels = (c: HTMLCanvasElement) => ctx2d(c, { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

export const IMPL: ImplMap = {
  'image-resizer': form({
    files: fileSpec,
    options: [
      optSelect('mode', 'Resize by', [['px', 'Pixels'], ['pct', 'Percentage']]),
      optNum('w', 'Width (px, or % when resizing by percentage)', 800, { min: 1, max: 32767 }), optNum('h', 'Height (px, ignored if aspect ratio is locked)', 600, { min: 1, max: 32767 }),
      optCheck('lock', 'Keep aspect ratio (height follows width)', true), fmtOpt(), qOpt, bgOpt,
    ],
    async run({ files, opts }) {
      const f = oneFile(files);
      return withImage(f, async (b) => {
        let w = num(opts, 'w'), h = num(opts, 'h');
        if (str(opts, 'mode') === 'pct') { h = w; w = (b.width * w) / 100; h = (b.height * h) / 100; }
        else if (bool(opts, 'lock')) h = (b.height * w) / b.width;
        w = Math.round(w); h = Math.round(h);
        if (!(w >= 1 && h >= 1)) throw new Error('The resulting size is below 1 pixel.');
        const c = makeCanvas(w, h);
        ctx2d(c).drawImage(b, 0, 0, w, h);
        return emit(f, c, opts, `-${w}x${h}`, [notice('success', `${b.width}×${b.height} → ${w}×${h}`)]);
      });
    },
  }),

  'image-cropper': form({
    files: fileSpec,
    options: [optSelect('mode', 'Crop by', [['rect', 'Pixel rectangle'], ['ratio', 'Centred aspect ratio']]), optNum('x', 'X (left, px)', 0, { min: 0 }), optNum('y', 'Y (top, px)', 0, { min: 0 }), optNum('w', 'Width (px)', 200, { min: 1 }), optNum('h', 'Height (px)', 200, { min: 1 }), optText('ratio', 'Aspect ratio (W:H) for ratio mode', '1:1'), fmtOpt(), qOpt, bgOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      return withImage(f, async (b) => {
        let x: number, y: number, w: number, h: number;
        if (str(opts, 'mode') === 'ratio') {
          const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/u.exec(str(opts, 'ratio').trim());
          if (!m || !(Number(m[1]) > 0 && Number(m[2]) > 0)) throw new Error('Aspect ratio must look like 16:9.');
          const r = Number(m[1]) / Number(m[2]);
          w = Math.min(b.width, Math.floor(b.height * r)); h = Math.min(b.height, Math.floor(w / r)); w = Math.floor(h * r);
          x = Math.floor((b.width - w) / 2); y = Math.floor((b.height - h) / 2);
        } else { x = Math.round(num(opts, 'x')); y = Math.round(num(opts, 'y')); w = Math.round(num(opts, 'w')); h = Math.round(num(opts, 'h')); }
        if (w < 1 || h < 1) throw new Error('Crop width and height must be at least 1.');
        if (x < 0 || y < 0 || x + w > b.width || y + h > b.height) throw new Error(`The crop area (${x},${y} ${w}×${h}) is outside the image (${b.width}×${b.height}).`);
        const c = makeCanvas(w, h);
        ctx2d(c).drawImage(b, x, y, w, h, 0, 0, w, h);
        return emit(f, c, opts, `-crop`, [notice('success', `Cropped ${w}×${h} at (${x}, ${y}) from ${b.width}×${b.height}.`)]);
      });
    },
  }),

  'image-compressor': form({
    files: fileSpec,
    options: [optSelect('format', 'Output format', [['jpeg', 'JPEG'], ['webp', 'WebP']], 'jpeg'), qOpt, bgOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      return withImage(f, async (b) => {
        const out = await emit(f, toCanvas(b), { ...opts, quality: num(opts, 'quality') }, '-compressed');
        const blob = (out.find((x) => x.type === 'image') as { blob: Blob }).blob;
        const saved = f.size - blob.size;
        const verdict = saved > 0 ? `${((saved / f.size) * 100).toFixed(1)}% smaller` : `${((-saved / f.size) * 100).toFixed(1)}% LARGER than the original, so keep the original`;
        return [kv([['Original', formatBytes(f.size)], ['Compressed', formatBytes(blob.size)], ['Change', verdict]], 'Size comparison'), ...out];
      });
    },
  }),

  'image-format-converter': form({
    files: fileSpec,
    options: [fmtOpt('png'), qOpt, bgOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      return withImage(f, (b) => emit(f, toCanvas(b), opts, ''));
    },
  }),

  'image-rotator': form({
    files: fileSpec,
    options: [optNum('angle', 'Angle (degrees, clockwise)', 90, { min: -360, max: 360, step: 1 }), optCheck('expand', 'Expand canvas so nothing is cut off', true), fmtOpt(), qOpt, bgOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      return withImage(f, async (b) => {
        const a = ((num(opts, 'angle') % 360) + 360) % 360, rad = (a * Math.PI) / 180;
        const expand = bool(opts, 'expand');
        const cw = expand ? Math.abs(b.width * Math.cos(rad)) + Math.abs(b.height * Math.sin(rad)) : b.width;
        const ch = expand ? Math.abs(b.width * Math.sin(rad)) + Math.abs(b.height * Math.cos(rad)) : b.height;
        const c = makeCanvas(Math.round(cw), Math.round(ch));
        const g = ctx2d(c);
        const bg = parseHexColor(str(opts, 'bg') || '#ffffff');
        if (a % 90 !== 0 && toFmt(opts) !== 'jpeg') { /* leave the corners transparent for PNG/WebP */ } else if (a % 90 !== 0) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
        g.translate(c.width / 2, c.height / 2); g.rotate(rad); g.drawImage(b, -b.width / 2, -b.height / 2);
        return emit(f, c, opts, `-rot${Math.round(a)}`);
      });
    },
  }),

  'image-flipper': form({
    files: fileSpec,
    options: [optSelect('dir', 'Mirror', [['h', 'Horizontally'], ['v', 'Vertically'], ['both', 'Both']]), fmtOpt(), qOpt, bgOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      return withImage(f, async (b) => {
        const c = makeCanvas(b.width, b.height);
        const g = ctx2d(c);
        const d = str(opts, 'dir');
        g.translate(d === 'v' ? 0 : b.width, d === 'h' ? 0 : b.height);
        g.scale(d === 'v' ? 1 : -1, d === 'h' ? 1 : -1);
        g.drawImage(b, 0, 0);
        return emit(f, c, opts, `-flip-${d}`);
      });
    },
  }),

  'image-metadata-viewer': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const bytes = await readBytes(f);
      const info = readImageInfo(bytes);
      const out: Block[] = [kv([['File', f.name], ['Size', formatBytes(f.size)], ['Format (from bytes)', info.format], ['Dimensions', info.width && info.height ? `${info.width}×${info.height}` : 'unknown']], 'Basics'), ...info.notes.map((n) => notice('info', n))];
      if (info.format === 'jpeg' || info.format === 'webp' || info.format === 'png') {
        const tags = info.format === 'jpeg' ? readExif(bytes) : privacyReport(bytes).exif;
        out.push(tags.length ? table(['Group', 'Tag', 'Value'], tags.map((t) => [t.ifd, t.name, t.display]), { title: `EXIF (${tags.length})` }) : notice('info', 'No EXIF data found.'));
        const gps = gpsDecimal(tags);
        if (gps) out.push(kv([['Latitude', gps.lat.toFixed(6)], ['Longitude', gps.lon.toFixed(6)]], 'GPS position (this reveals where the photo was taken)'));
      }
      if (info.format === 'png') { const t = readPngText(bytes); if (t.length) out.push(table(['Keyword', 'Text'], t.map((x) => [x.keyword, x.text.slice(0, 500)]), { title: 'PNG text chunks' })); }
      return out;
    },
  }),

  'image-color-picker': custom(() => import('./custom/ColorPicker')),

  'image-palette-extractor': form({
    files: fileSpec,
    options: [optNum('count', 'Number of colours', 8, { min: 2, max: 24 })],
    async run({ files, opts }) {
      const f = oneFile(files);
      return withImage(f, (b) => {
        const s = Math.min(1, 200 / Math.max(b.width, b.height));
        const c = makeCanvas(Math.max(1, Math.round(b.width * s)), Math.max(1, Math.round(b.height * s)));
        ctx2d(c, { willReadFrequently: true }).drawImage(b, 0, 0, c.width, c.height);
        const pal = extractPalette(pixels(c).data, Math.round(num(opts, 'count')));
        if (!pal.length) throw new Error('The image has no visible pixels to sample.');
        return [{ type: 'swatches', title: 'Dominant colours', colors: pal.map((p) => p.hex) }, table(['HEX', 'RGB', 'Share'], pal.map((p) => [p.hex, `${p.r}, ${p.g}, ${p.b}`, `${(p.share * 100).toFixed(1)}%`])), text(pal.map((p) => p.hex).join('\n'), { title: 'Copy list' })] as Block[];
      });
    },
  }),

  'image-to-base64': form({
    files: fileSpec,
    options: [optSelect('as', 'Output', [['uri', 'Data URI'], ['raw', 'Raw Base64']])],
    async run({ files, opts }) {
      const f = oneFile(files);
      if (f.size > 8 * 1024 * 1024) throw new LimitError('Base64 grows files by about a third. Use images under 8 MB.');
      const bytes = await readBytes(f, 8 * 1024 * 1024);
      const fmt = detectImageFormat(bytes);
      if (fmt === 'unknown') throw new Error('This file does not look like PNG, JPEG, GIF, WebP or BMP, so it was not encoded.');
      const mime = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[fmt];
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const b64 = btoa(bin);
      const s = str(opts, 'as') === 'raw' ? b64 : `data:${mime};base64,${b64}`;
      return [kv([['Detected type', mime], ['Original', formatBytes(bytes.length)], ['Encoded length', `${s.length.toLocaleString('en-US')} characters`]]), text(s, { title: 'Result', filename: 'image.b64.txt', mime: 'text/plain', wrap: true })];
    },
  }),

  'base64-to-image': form({
    text: { label: 'Base64 or data URI', rows: 6, placeholder: 'data:image/png;base64,iVBORw0KGgo…' },
    live: false,
    run({ text: input }) {
      let s = input.trim();
      if (!s) throw new Error('Paste Base64 or a data URI.');
      if (s.length > 12 * 1024 * 1024) throw new LimitError('Input is larger than 12 MB of text.');
      const m = /^data:([^;,]*)(;[^,]*)?,/iu.exec(s);
      if (m) { if (!/;base64/iu.test(m[0])) throw new Error('Only Base64 data URIs are supported.'); s = s.slice(m[0].length); }
      s = s.replace(/\s+/gu, '').replace(/-/gu, '+').replace(/_/gu, '/');
      if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(s)) throw new Error('This is not valid Base64.');
      let bin: string;
      try { bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4)); } catch { throw new Error('This is not valid Base64.'); }
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      const fmt = detectImageFormat(bytes);
      if (fmt === 'unknown') throw new Error('The decoded bytes are not a PNG, JPEG, GIF, WebP or BMP image (checked by signature, not by the declared type).');
      const mime = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[fmt];
      const ext = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp', bmp: 'bmp' }[fmt];
      const blob = new Blob([bytes as BlobPart], { type: mime });
      const info = readImageInfo(bytes);
      return [{ type: 'image', title: 'Decoded image', blob, alt: 'Decoded image' }, kv([['Type', mime], ['Dimensions', info.width && info.height ? `${info.width}×${info.height}` : 'unknown'], ['Size', formatBytes(bytes.length)]]), download(`Download image.${ext}`, `image.${ext}`, mime, blob)] as Block[];
    },
  }),

  'image-preview-generator': form({
    files: fileSpec,
    options: [optText('sizes', 'Widths in px (comma separated)', '64, 128, 256, 512'), fmtOpt('png'), qOpt, bgOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      const sizes = [...new Set(str(opts, 'sizes').split(/[,\s]+/u).filter(Boolean).map((s) => Number(s)))];
      if (!sizes.length || sizes.some((s) => !Number.isInteger(s) || s < 1 || s > 8192)) throw new Error('Widths must be whole numbers from 1 to 8192, for example 64, 128, 256.');
      if (sizes.length > 20) throw new LimitError('At most 20 sizes at once.');
      return withImage(f, async (b) => {
        const fmt = toFmt(opts), bg = parseHexColor(str(opts, 'bg') || '#ffffff');
        const parts: { path: string; data: Blob }[] = [], rows: string[][] = [];
        for (const w of sizes) {
          const h = Math.max(1, Math.round((b.height * w) / b.width));
          let c = makeCanvas(w, h); ctx2d(c).drawImage(b, 0, 0, w, h);
          if (fmt === 'jpeg') c = flatten(c, bg);
          const blob = await canvasToBlob(c, fmt, quality(opts));
          const path = safeDownloadName(withExtension(f.name, EXT[fmt], `-${w}w`));
          parts.push({ path, data: blob }); rows.push([path, `${w}×${h}`, formatBytes(blob.size)]);
        }
        const zip = await createZip(parts, { level: 0 });
        return [table(['File', 'Size', 'Bytes'], rows), download('Download thumbnails.zip', 'thumbnails.zip', 'application/zip', zip, `${parts.length} images, ${formatBytes(zip.length)}`)];
      });
    },
  }),

  'image-grayscale-converter': form({
    files: fileSpec,
    options: [optCheck('sepia', 'Sepia tone instead of grey'), fmtOpt(), qOpt, bgOpt],
    async run({ files, opts }) {
      const f = oneFile(files);
      return withImage(f, (b) => {
        const c = toCanvas(b), g = ctx2d(c, { willReadFrequently: true });
        const id = g.getImageData(0, 0, c.width, c.height), d = id.data, sep = bool(opts, 'sepia');
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] as number, gg = d[i + 1] as number, bb = d[i + 2] as number;
          if (sep) { const [x, y, z] = sepia(r, gg, bb); d[i] = x; d[i + 1] = y; d[i + 2] = z; } else { const l = luma709(r, gg, bb); d[i] = l; d[i + 1] = l; d[i + 2] = l; }
        }
        g.putImageData(id, 0, 0);
        return emit(f, c, opts, sep ? '-sepia' : '-gray');
      });
    },
  }),

  'image-watermark-tool': form({
    files: fileSpec,
    options: [
      optText('label', 'Watermark text', '© Your name', { maxLength: 120 }), optNum('size', 'Text size (% of image width)', 5, { min: 1, max: 40, step: 0.5 }),
      optText('color', 'Text colour (HEX)', '#ffffff'), optNum('opacity', 'Opacity (%)', 60, { min: 5, max: 100 }),
      optSelect('pos', 'Position', [['br', 'Bottom right'], ['bl', 'Bottom left'], ['tr', 'Top right'], ['tl', 'Top left'], ['c', 'Centre']]), optCheck('tile', 'Tile diagonally across the image'), fmtOpt(), qOpt, bgOpt,
    ],
    async run({ files, opts }) {
      const f = oneFile(files);
      const label = str(opts, 'label');
      if (!label.trim()) throw new Error('Enter the watermark text.');
      return withImage(f, (b) => {
        const c = toCanvas(b), g = ctx2d(c);
        const px = Math.max(8, Math.round((c.width * num(opts, 'size')) / 100));
        g.font = `bold ${px}px sans-serif`; g.fillStyle = parseHexColor(str(opts, 'color'), '#ffffff'); g.globalAlpha = num(opts, 'opacity') / 100; g.textBaseline = 'middle';
        g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = Math.max(1, px / 8);
        if (bool(opts, 'tile')) {
          g.rotate(-Math.PI / 6);
          const stepX = g.measureText(label).width + px * 2, stepY = px * 3, span = Math.hypot(c.width, c.height);
          for (let y = -span; y < span; y += stepY) for (let x = -span; x < span; x += stepX) g.fillText(label, x, y);
        } else {
          const w = g.measureText(label).width, m = px * 0.6, p = str(opts, 'pos');
          const x = p.endsWith('l') ? m : p === 'c' ? (c.width - w) / 2 : c.width - w - m;
          const y = p.startsWith('t') ? m + px / 2 : p === 'c' ? c.height / 2 : c.height - m - px / 2;
          g.fillText(label, x, y);
        }
        return emit(f, c, opts, '-watermarked');
      });
    },
  }),

  'image-comparison-tool': form({
    files: { label: 'Two images (same dimensions)', accept: ACCEPT, multiple: true, maxFiles: 2 },
    options: [optNum('threshold', 'Per-channel tolerance (0–255)', 8, { min: 0, max: 255 })],
    async run({ files, opts }) {
      needFiles(files, 2, 'images');
      const [a, b] = await Promise.all([decodeImage(files[0] as File), decodeImage(files[1] as File)]);
      try {
        const dims = `${a.width}×${a.height} vs ${b.width}×${b.height}`;
        if (a.width !== b.width || a.height !== b.height) return [notice('warn', `The images have different dimensions (${dims}), so a pixel comparison is not meaningful. Resize one first.`)];
        const ca = toCanvas(a), cb = toCanvas(b);
        const r = diffImages(pixels(ca).data, pixels(cb).data, num(opts, 'threshold'));
        const out = makeCanvas(a.width, a.height);
        const id = ctx2d(out).createImageData(a.width, a.height); id.data.set(r.map);
        ctx2d(out).putImageData(id, 0, 0);
        const blob = await canvasToBlob(out, 'png');
        return [kv([['Dimensions', `${a.width}×${a.height}`], ['Differing pixels', `${r.differing.toLocaleString('en-US')} of ${(a.width * a.height).toLocaleString('en-US')}`], ['Difference', `${(r.fraction * 100).toFixed(3)}%`], ['Verdict', r.differing === 0 ? 'Identical within the tolerance' : 'Images differ']]), { type: 'image', title: 'Difference map (red = differs)', blob, alt: 'Pixel difference map' }, download('Download difference-map.png', 'difference-map.png', 'image/png', blob)] as Block[];
      } finally { a.close(); b.close(); }
    },
  }),
};
void readText; void fmtNum; void LIMITS; void MAX_OUTPUT_PIXELS;
