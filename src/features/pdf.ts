import { form, kv, notice, optCheck, optNum, optSelect, optText, table, text, str, num, bool, download, readBytes, oneFile, needFiles, throwIfAborted, tick, fmtNum } from './kit';
import type { Block, ImplMap, RunCtx } from './types';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { parsePageRanges, scanPdf, matchPaper, PAPER } from '../lib/pdfutil';
import { createZip } from '../lib/zip';
import { formatBytes } from '../lib/sniff';
import { safeDownloadName, withExtension, LimitError } from '../lib/safe';
import { decodeImage, makeCanvas, ctx2d, canvasToBlob, parseHexColor } from '../lib/canvas';

const MAX_PDF_BYTES = 200 * 1024 * 1024;
const MAX_PAGES = 5000;
const PDF_ACCEPT = 'application/pdf,.pdf';
const fileSpec = { label: 'PDF file', accept: PDF_ACCEPT } as const;
const filesSpec = { label: 'PDF files', accept: PDF_ACCEPT, multiple: true } as const;

async function openPdf(file: File): Promise<{ doc: PDFDocument; bytes: Uint8Array }> {
  const bytes = await readBytes(file, MAX_PDF_BYTES);
  const sig = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!sig.includes('%PDF-')) throw new Error(`"${file.name}" is not a PDF (no %PDF- header).`);
  if (scanPdf(bytes).encrypted) throw new Error(`"${file.name}" is password-protected. This tool cannot open encrypted PDFs and does not try to bypass protection. Remove the password in the app that created it, then try again.`);
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
    if (doc.getPageCount() > MAX_PAGES) throw new LimitError(`"${file.name}" has more than ${MAX_PAGES} pages.`);
    return { doc, bytes };
  } catch (e) {
    if (e instanceof LimitError) throw e;
    throw new Error(`"${file.name}" could not be parsed as a PDF. It may be damaged or use a feature this library cannot read.`);
  }
}

const pdfOut = (name: string, bytes: Uint8Array, suffix: string, note?: string): Block[] => {
  const n = safeDownloadName(withExtension(name, 'pdf', suffix));
  return [download(`Download ${n}`, n, 'application/pdf', bytes, note ?? formatBytes(bytes.length))];
};

async function subset(src: PDFDocument, idx: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, idx);
  pages.forEach((p) => out.addPage(p));
  return out.save();
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

// ---- pdf.js (rendering and text) ----
type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist').then((m) => {
    if (typeof __WORKER_PDFJS__ === 'string') m.GlobalWorkerOptions.workerSrc = __WORKER_PDFJS__;
    return m;
  });
  return pdfjsPromise;
}
async function openJs(file: File) {
  const bytes = await readBytes(file, MAX_PDF_BYTES);
  if (scanPdf(bytes).encrypted) throw new Error(`"${file.name}" is password-protected. This tool does not try to open or bypass protected PDFs.`);
  const lib = await pdfjs();
  const task = lib.getDocument({ data: bytes.slice(), enableXfa: false, useSystemFonts: false, verbosity: 0 });
  try {
    const pdf = await task.promise;
    // The loading task owns the worker, so destroying the task is what releases the document, worker and memory.
    return { pdf, close: () => task.destroy().catch(() => undefined) };
  } catch {
    await task.destroy().catch(() => undefined);
    throw new Error(`"${file.name}" could not be read as a PDF.`);
  }
}

const pageRows = (doc: PDFDocument) => doc.getPages().map((p, i) => { const { width, height } = p.getSize(); const r = p.getRotation().angle; return { i: i + 1, w: width, h: height, r }; });
const mm = (pt: number) => (pt * 25.4) / 72;
const inch = (pt: number) => pt / 72;

export const IMPL: ImplMap = {
  'pdf-merger': form({
    files: { label: 'PDF files (merged in this order)', accept: PDF_ACCEPT, multiple: true },
    async run({ files }, ctx) {
      needFiles(files, 2, 'PDF files');
      const out = await PDFDocument.create();
      const rows: string[][] = [];
      for (const [i, f] of files.entries()) {
        throwIfAborted(ctx.signal);
        ctx.progress(i / files.length, f.name);
        const { doc } = await openPdf(f);
        const pages = await out.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        rows.push([String(i + 1), f.name, String(pages.length)]);
        if (out.getPageCount() > MAX_PAGES) throw new LimitError(`The merged document would exceed ${MAX_PAGES} pages.`);
        await tick();
      }
      const bytes = await out.save();
      return [table(['#', 'File', 'Pages'], rows), kv([['Total pages', String(out.getPageCount())]]), ...pdfOut('merged.pdf', bytes, '')];
    },
  }),

  'pdf-splitter': form({
    files: fileSpec,
    options: [optSelect('mode', 'Split into', [['single', 'One file per page'], ['chunk', 'Fixed-size chunks'], ['ranges', 'Custom ranges (one file per range)']]), optNum('size', 'Pages per chunk', 5, { min: 1, max: 1000 }), optText('ranges', 'Ranges (for custom), e.g. 1-3, 4-6, 9', '1-3, 4-')],
    async run({ files, opts }, ctx) {
      const f = oneFile(files);
      const { doc } = await openPdf(f);
      const n = doc.getPageCount();
      const groups: number[][] = [];
      const mode = str(opts, 'mode');
      if (mode === 'single') for (let i = 0; i < n; i++) groups.push([i]);
      else if (mode === 'chunk') { const k = Math.round(num(opts, 'size')); for (let i = 0; i < n; i += k) groups.push(Array.from({ length: Math.min(k, n - i) }, (_, j) => i + j)); }
      else for (const part of str(opts, 'ranges').split(',').map((s) => s.trim()).filter(Boolean)) groups.push(parsePageRanges(part, n));
      if (!groups.length) throw new Error('Nothing to split.');
      if (groups.length > 500) throw new LimitError(`That would create ${groups.length} files. The limit is 500.`);
      const parts: { path: string; data: Uint8Array }[] = [];
      const rows: string[][] = [];
      for (const [i, g] of groups.entries()) {
        throwIfAborted(ctx.signal);
        ctx.progress(i / groups.length, `Part ${i + 1} of ${groups.length}`);
        const label = g.length === 1 ? `p${(g[0] as number) + 1}` : `p${(g[0] as number) + 1}-${(g[g.length - 1] as number) + 1}`;
        const path = safeDownloadName(withExtension(f.name, 'pdf', `-${String(i + 1).padStart(3, '0')}-${label}`));
        parts.push({ path, data: await subset(doc, g) });
        rows.push([path, String(g.length)]);
        await tick();
      }
      const zip = await createZip(parts, { level: 0 });
      return [kv([['Source pages', String(n)], ['Files created', String(parts.length)]]), table(['File', 'Pages'], rows), download('Download split.zip', 'split.zip', 'application/zip', zip, formatBytes(zip.length))];
    },
  }),

  'pdf-page-extractor': form({
    files: fileSpec,
    options: [optText('pages', 'Pages to keep (e.g. 1-3, 7, 10-12)', '1')],
    async run({ files, opts }) {
      const f = oneFile(files);
      const { doc } = await openPdf(f);
      const idx = parsePageRanges(str(opts, 'pages'), doc.getPageCount());
      const bytes = await subset(doc, idx);
      return [notice('success', `Extracted ${idx.length} of ${doc.getPageCount()} pages.`), ...pdfOut(f.name, bytes, '-extract')];
    },
  }),

  'pdf-page-reorderer': form({
    files: fileSpec,
    options: [optSelect('mode', 'Order', [['custom', 'Custom order (list below)'], ['reverse', 'Reverse all pages']]), optText('order', 'New order, e.g. 3, 1, 2, 2 (repeat pages to duplicate, omit to drop)', '2, 1')],
    async run({ files, opts }) {
      const f = oneFile(files);
      const { doc } = await openPdf(f);
      const n = doc.getPageCount();
      const idx = str(opts, 'mode') === 'reverse' ? Array.from({ length: n }, (_, i) => n - 1 - i) : parsePageRanges(str(opts, 'order'), n, { keepOrder: true });
      const bytes = await subset(doc, idx);
      return [notice('success', `New document has ${idx.length} pages: ${idx.slice(0, 30).map((i) => i + 1).join(', ')}${idx.length > 30 ? ', …' : ''}.`), ...pdfOut(f.name, bytes, '-reordered')];
    },
  }),

  'pdf-rotator': form({
    files: fileSpec,
    options: [optSelect('angle', 'Rotate clockwise by', [['90', '90°'], ['180', '180°'], ['270', '270°']]), optText('pages', 'Pages (blank = all)', '')],
    async run({ files, opts }) {
      const f = oneFile(files);
      const { doc } = await openPdf(f);
      const idx = str(opts, 'pages').trim() ? parsePageRanges(str(opts, 'pages'), doc.getPageCount()) : doc.getPageIndices();
      const add = Number(str(opts, 'angle'));
      for (const i of idx) { const p = doc.getPage(i); p.setRotation(degrees((p.getRotation().angle + add) % 360)); }
      const bytes = await doc.save();
      return [notice('success', `Rotated ${idx.length} page${idx.length === 1 ? '' : 's'} by ${add}°. Rotation is stored in the page, so content is not re-rendered.`), ...pdfOut(f.name, bytes, `-rot${add}`)];
    },
  }),

  'pdf-metadata-viewer': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const raw = await readBytes(f, MAX_PDF_BYTES);
      const s = scanPdf(raw);
      if (!s.header) throw new Error('This file has no %PDF- header, so it is not a PDF.');
      const rows: [string, string][] = [['File', f.name], ['Size', formatBytes(f.size)], ['PDF version', s.version ?? 'unknown'], ['Encrypted', s.encrypted ? 'yes' : 'no']];
      if (s.encrypted) return [kv(rows), notice('warn', 'Document information is inside the encrypted data, so it cannot be read here. This tool does not try to bypass protection.')];
      const { doc } = await openPdf(f);
      const d = (x: Date | undefined) => (x ? x.toISOString() : '—');
      rows.push(['Pages', String(doc.getPageCount())], ['Title', doc.getTitle() ?? '—'], ['Author', doc.getAuthor() ?? '—'], ['Subject', doc.getSubject() ?? '—'], ['Keywords', doc.getKeywords() ?? '—'], ['Creator', doc.getCreator() ?? '—'], ['Producer', doc.getProducer() ?? '—'], ['Created', d(doc.getCreationDate())], ['Modified', d(doc.getModificationDate())]);
      return [kv(rows)];
    },
  }),

  'pdf-page-counter': form({
    files: filesSpec,
    async run({ files }, ctx) {
      needFiles(files, 1, 'PDF file');
      const rows = await eachFile(files, ctx, async (f) => (await openPdf(f)).doc.getPageCount());
      const total = rows.reduce((a, r) => a + (r.value ?? 0), 0);
      return [table(['File', 'Pages'], rows.map((r) => [r.file.name, r.value === undefined ? `Error: ${r.error}` : String(r.value)]), { note: `${rows.filter((r) => r.value !== undefined).length} of ${rows.length} readable.` }), kv([['Total pages', String(total)]])];
    },
  }),

  'pdf-to-image': form({
    files: fileSpec,
    options: [optText('pages', 'Pages (blank = all, max 50)', '1'), optNum('dpi', 'Resolution (DPI)', 110, { min: 36, max: 300 }), optSelect('format', 'Format', [['png', 'PNG'], ['jpeg', 'JPEG']])],
    async run({ files, opts }, ctx) {
      const f = oneFile(files);
      const js = await openJs(f);
      const pdf = js.pdf;
      try {
        const n = pdf.numPages;
        const idx = str(opts, 'pages').trim() ? parsePageRanges(str(opts, 'pages'), n) : Array.from({ length: n }, (_, i) => i);
        if (idx.length > 50) throw new LimitError(`${idx.length} pages selected. Rendering is limited to 50 pages at a time; choose a range.`);
        const scale = num(opts, 'dpi') / 72, fmt = str(opts, 'format') === 'jpeg' ? 'jpeg' : 'png';
        const parts: { path: string; data: Blob }[] = [], previews: { blob: Blob; alt: string; caption: string }[] = [];
        for (const [k, i] of idx.entries()) {
          throwIfAborted(ctx.signal);
          ctx.progress(k / idx.length, `Rendering page ${i + 1}`);
          const page = await pdf.getPage(i + 1);
          const vp = page.getViewport({ scale });
          const c = makeCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
          const g = ctx2d(c);
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: g, viewport: vp, canvas: c }).promise;
          const blob = await canvasToBlob(c, fmt, 0.92);
          parts.push({ path: `page-${String(i + 1).padStart(3, '0')}.${fmt === 'jpeg' ? 'jpg' : 'png'}`, data: blob });
          if (previews.length < 6) previews.push({ blob, alt: `Page ${i + 1}`, caption: `Page ${i + 1} (${c.width}×${c.height})` });
          page.cleanup();
        }
        const zip = await createZip(parts, { level: 0 });
        return [{ type: 'images', title: previews.length < parts.length ? `Preview (first ${previews.length})` : 'Preview', items: previews }, download('Download pages.zip', 'pages.zip', 'application/zip', zip, `${parts.length} images, ${formatBytes(zip.length)}`)] as Block[];
      } finally { void js.close(); }
    },
  }),

  'image-to-pdf': form({
    files: { label: 'Images (one per page, in this order)', accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp', multiple: true },
    options: [optSelect('size', 'Page size', [['fit', 'Fit to image'], ...PAPER.slice(0, 5).map(([n]) => [n.toLowerCase(), n] as [string, string])]), optNum('margin', 'Margin (points, 72 = 1 inch)', 24, { min: 0, max: 200 }), optCheck('landscape', 'Landscape pages for standard sizes')],
    async run({ files, opts }, ctx) {
      needFiles(files, 1, 'image');
      if (files.length > 200) throw new LimitError('At most 200 images at once.');
      const doc = await PDFDocument.create();
      const margin = num(opts, 'margin');
      for (const [i, f] of files.entries()) {
        throwIfAborted(ctx.signal);
        ctx.progress(i / files.length, f.name);
        const raw = await readBytes(f);
        const isPng = raw[0] === 0x89 && raw[1] === 0x50, isJpg = raw[0] === 0xff && raw[1] === 0xd8;
        let img;
        if (isJpg) img = await doc.embedJpg(raw);
        else if (isPng) img = await doc.embedPng(raw);
        else { const bmp = await decodeImage(f); const c = makeCanvas(bmp.width, bmp.height); ctx2d(c).drawImage(bmp, 0, 0); bmp.close(); img = await doc.embedPng(new Uint8Array(await (await canvasToBlob(c, 'png')).arrayBuffer())); }
        let pw = img.width + margin * 2, ph = img.height + margin * 2;
        const sz = str(opts, 'size');
        if (sz !== 'fit') { const p = PAPER.find(([n]) => n.toLowerCase() === sz); if (p) { [pw, ph] = bool(opts, 'landscape') ? [p[2], p[1]] : [p[1], p[2]]; } }
        const page = doc.addPage([pw, ph]);
        const s = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height, sz === 'fit' ? 1 : Infinity);
        const w = img.width * s, h = img.height * s;
        if (!(w > 0 && h > 0)) throw new Error('The margin is larger than the page.');
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        await tick();
      }
      const bytes = await doc.save();
      return [notice('success', `${doc.getPageCount()} page${doc.getPageCount() === 1 ? '' : 's'} created.`), ...pdfOut('images.pdf', bytes, '')];
    },
  }),

  'pdf-compressor': form({
    files: fileSpec,
    options: [optCheck('strip', 'Remove document information (title, author, …)', true)],
    async run({ files, opts }) {
      const f = oneFile(files);
      const { doc } = await openPdf(f);
      if (bool(opts, 'strip')) { doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setCreator(''); doc.setProducer(''); }
      const bytes = await doc.save({ useObjectStreams: true });
      const diff = f.size - bytes.length;
      const out: Block[] = [kv([['Original', formatBytes(f.size)], ['Rewritten', formatBytes(bytes.length)], ['Change', diff > 0 ? `${((diff / f.size) * 100).toFixed(1)}% smaller` : `${((-diff / f.size) * 100).toFixed(1)}% larger, so the original is better`]])];
      out.push(diff > 0 ? { type: 'download', label: `Download ${safeDownloadName(withExtension(f.name, 'pdf', '-compressed'))}`, filename: safeDownloadName(withExtension(f.name, 'pdf', '-compressed')), mime: 'application/pdf', data: bytes } : notice('warn', 'The rewritten file is not smaller, so no download is offered. Images inside the PDF are not downsampled by this tool.'));
      return out;
    },
  }),

  'pdf-password-status-checker': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const s = scanPdf(await readBytes(f, MAX_PDF_BYTES));
      if (!s.header) throw new Error('This file has no %PDF- header, so it does not look like a PDF.');
      const rows: [string, string][] = [['PDF version', s.version ?? 'unknown'], ['Encrypted', s.encrypted ? 'yes' : 'no']];
      if (s.encryptInfo) rows.push(['Security handler', s.encryptInfo.filter ?? 'not found'], ['Algorithm version (V)', s.encryptInfo.v === null ? 'not found' : String(s.encryptInfo.v)], ['Revision (R)', s.encryptInfo.r === null ? 'not found' : String(s.encryptInfo.r)], ['Key length', s.encryptInfo.length === null ? 'not found' : `${s.encryptInfo.length} bits`]);
      return [kv(rows), notice('info', s.encrypted ? 'This PDF is encrypted. Encryption may require a password to open, or only to change permissions. This tool reports status only; it never tries passwords or removes protection.' : 'No /Encrypt entry was found.')];
    },
  }),

  'pdf-text-extractor': form({
    files: fileSpec,
    options: [optText('pages', 'Pages (blank = all)', ''), optCheck('markers', 'Insert page markers', true)],
    async run({ files, opts }, ctx) {
      const f = oneFile(files);
      const js = await openJs(f);
      const pdf = js.pdf;
      try {
        const n = pdf.numPages;
        const idx = str(opts, 'pages').trim() ? parsePageRanges(str(opts, 'pages'), n) : Array.from({ length: n }, (_, i) => i);
        let out = '', empty = 0;
        for (const [k, i] of idx.entries()) {
          throwIfAborted(ctx.signal);
          ctx.progress(k / idx.length, `Page ${i + 1}`);
          const page = await pdf.getPage(i + 1);
          const tc = await page.getTextContent();
          let line = '', t = '';
          for (const it of tc.items) { if (!('str' in it)) continue; line += it.str; if (it.hasEOL) { t += line + '\n'; line = ''; } else if (it.str && !/\s$/u.test(it.str)) line += ' '; }
          t += line;
          t = t.replace(/[ \t]+\n/gu, '\n').trim();
          if (!t) empty++;
          out += (bool(opts, 'markers') ? `\n--- Page ${i + 1} ---\n` : '\n') + t + '\n';
          page.cleanup();
          if (out.length > 20_000_000) throw new LimitError('The extracted text is larger than 20 million characters.');
        }
        const blocks: Block[] = [kv([['Pages read', String(idx.length)], ['Characters', out.trim().length.toLocaleString('en-US')], ['Pages without a text layer', String(empty)]])];
        if (empty) blocks.push(notice('warn', `${empty} page${empty === 1 ? ' has' : 's have'} no text layer (likely scanned images). There is no OCR in this tool.`));
        blocks.push(text(out.trim(), { title: 'Extracted text', filename: safeDownloadName(withExtension(f.name, 'txt')), mime: 'text/plain', wrap: true }));
        return blocks;
      } finally { void js.close(); }
    },
  }),

  'pdf-page-size-inspector': form({
    files: fileSpec,
    async run({ files }) {
      const { doc } = await openPdf(oneFile(files));
      const rows = pageRows(doc);
      return [table(['Page', 'Width × height (pt)', 'mm', 'inches', 'Orientation', 'Rotation', 'Paper'], rows.slice(0, 2000).map((r) => [String(r.i), `${fmtNum(r.w, 2)} × ${fmtNum(r.h, 2)}`, `${fmtNum(mm(r.w), 1)} × ${fmtNum(mm(r.h), 1)}`, `${fmtNum(inch(r.w), 2)} × ${fmtNum(inch(r.h), 2)}`, r.w > r.h ? 'landscape' : r.w < r.h ? 'portrait' : 'square', `${r.r}°`, matchPaper(r.w, r.h) ?? '—'])), notice('info', 'Sizes are the page boxes before rotation is applied. A 90° or 270° rotation swaps what you see on screen.')];
    },
  }),

  'pdf-watermark-tool': form({
    files: fileSpec,
    options: [optText('label', 'Watermark text (Latin characters)', 'CONFIDENTIAL', { maxLength: 60 }), optNum('size', 'Font size (pt)', 60, { min: 8, max: 300 }), optText('color', 'Colour (HEX)', '#888888'), optNum('opacity', 'Opacity (%)', 30, { min: 5, max: 100 }), optSelect('angle', 'Direction', [['45', 'Diagonal'], ['0', 'Horizontal']])],
    async run({ files, opts }) {
      const f = oneFile(files);
      const label = str(opts, 'label');
      if (!label.trim()) throw new Error('Enter the watermark text.');
      const { doc } = await openPdf(f);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const size = num(opts, 'size');
      let w: number;
      try { w = font.widthOfTextAtSize(label, size); } catch { throw new Error('The built-in font supports Latin (Western) characters only. Remove other characters from the watermark text.'); }
      const hex = parseHexColor(str(opts, 'color'), '#888888');
      const col = rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
      const ang = Number(str(opts, 'angle'));
      for (const p of doc.getPages()) {
        const { width, height } = p.getSize();
        const rad = (ang * Math.PI) / 180;
        const x = width / 2 - (w / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad), y = height / 2 - (w / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad);
        p.drawText(label, { x, y, size, font, color: col, opacity: num(opts, 'opacity') / 100, rotate: degrees(ang) });
      }
      const bytes = await doc.save();
      return [notice('success', `Watermark added to ${doc.getPageCount()} page${doc.getPageCount() === 1 ? '' : 's'}. It is drawn on top of the content and is not a security feature: anyone can remove it.`), ...pdfOut(f.name, bytes, '-watermarked')];
    },
  }),

  'pdf-document-validator': form({
    files: fileSpec,
    async run({ files }) {
      const f = oneFile(files);
      const raw = await readBytes(f, MAX_PDF_BYTES);
      const s = scanPdf(raw);
      const checks: [string, boolean | null, string][] = [
        ['%PDF- header at the start', s.header !== null, s.header ?? 'missing'],
        ['%%EOF marker near the end', s.eofMarker, s.eofMarker ? 'found' : 'missing (file may be truncated)'],
        ['startxref pointer', s.startxref, s.startxref ? 'found' : 'missing'],
        ['Cross-reference table or stream', s.xrefTable || s.xrefStream, s.xrefStream ? 'xref stream' : s.xrefTable ? 'xref table' : 'not found (readers may rebuild it)'],
        ['Not encrypted', !s.encrypted, s.encrypted ? 'encrypted: deeper checks skipped' : 'ok'],
      ];
      let pages: number | null = null;
      if (!s.encrypted) {
        let a = false, b = false, aMsg = '', bMsg = '';
        try { const d = await PDFDocument.load(raw, { throwOnInvalidObject: true, updateMetadata: false }); pages = d.getPageCount(); a = pages > 0; aMsg = `${pages} page${pages === 1 ? '' : 's'}`; } catch (e) { aMsg = e instanceof Error ? e.message.slice(0, 160) : 'failed'; }
        try { const j = await openJs(f); bMsg = `${j.pdf.numPages} page${j.pdf.numPages === 1 ? '' : 's'}`; b = j.pdf.numPages > 0; void j.close(); } catch (e) { bMsg = e instanceof Error ? e.message.slice(0, 160) : 'failed'; }
        checks.push(['Opens with parser 1 (pdf-lib, strict)', a, aMsg], ['Opens with parser 2 (pdf.js)', b, bMsg]);
      }
      const failed = checks.filter((c) => c[1] === false).length;
      return [notice(failed === 0 ? 'success' : 'warn', failed === 0 ? 'No structural problems detected by these checks.' : `${failed} check${failed === 1 ? '' : 's'} failed.`), table(['Check', 'Result', 'Detail'], checks.map(([n, ok, d]) => [n, ok === null ? 'n/a' : ok ? 'pass' : 'FAIL', d])), notice('info', 'This is a structural sanity check, not a PDF/A or ISO 32000 conformance validator.')];
    },
  }),
};
