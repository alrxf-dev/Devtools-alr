import type { Case } from '../harness';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fx = (n: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', n));

async function makePdf(pages: number, opts: { size?: [number, number]; title?: string; blank?: number[] } = {}): Promise<Buffer> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = d.addPage(opts.size ?? [595.28, 841.89]);
    if (!opts.blank?.includes(i)) p.drawText(`Hello page ${i}`, { x: 60, y: 700, size: 24, font: f });
  }
  if (opts.title) { d.setTitle(opts.title); d.setAuthor('Test Author'); }
  return Buffer.from(await d.save());
}

const a3 = await makePdf(3, { title: 'Tri Doc' });
const b2 = await makePdf(2);
const six = await makePdf(6);
const letter = await makePdf(1, { size: [612, 792] });
const mixed = await (async () => { const d = await PDFDocument.create(); d.addPage([595.28, 841.89]); d.addPage([842, 595]); d.addPage([300, 300]); return Buffer.from(await d.save()); })();
const scanned = await makePdf(2, { blank: [2] });
const big = await makePdf(51);
const encrypted = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n5 0 obj\n<< /Filter /Standard /V 2 /R 3 /Length 128 /P -44 >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 5 0 R >>\nstartxref\n0\n%%EOF\n');
const truncated = a3.subarray(0, Math.floor(a3.length / 2));
const junk = Buffer.from('this is not a pdf');

const P = (name: string, buffer: Buffer | string) => ({ name, buffer, mimeType: 'application/pdf' });
const load = (d: Buffer) => PDFDocument.load(d);
const pages = (n: number) => async (d: Buffer) => { const c = (await load(d)).getPageCount(); return c === n ? true : `expected ${n} pages, found ${c}`; };
const zipEntries = (n: number) => (d: Buffer) => { const c = d.toString('latin1').split('PK\x01\x02').length - 1; return d.toString('latin1', 0, 2) === 'PK' && c === n ? true : `expected ${n} zip entries, found ${c}`; };
const png = F('plain.png', 'image/png'); const jpg = F('plain.jpg', 'image/jpeg'); const gif = F('plain.gif', 'image/gif');
function F(name: string, mimeType: string) { return { name, buffer: fx(name), mimeType }; }

export const pdfCases: Case[] = [
  { id: 'pdf-merger', files: [P('a.pdf', a3), P('b.pdf', b2)], expect: [/Total pages\s*5/], downloads: [{ button: /Download merged\.pdf/, check: pages(5) }] },
  { id: 'pdf-merger', name: 'order is kept', files: [P('b.pdf', b2), P('a.pdf', a3)], expect: [/1\s*b\.pdf\s*2/], downloads: [{ button: /Download merged\.pdf/, check: pages(5) }] },
  { id: 'pdf-merger', name: 'needs two files', files: [P('a.pdf', a3)], error: /at least 2/ },
  { id: 'pdf-merger', name: 'encrypted is refused', files: [P('a.pdf', a3), P('e.pdf', encrypted)], error: /password-protected/ },
  { id: 'pdf-merger', name: 'not a pdf', files: [P('a.pdf', a3), P('j.pdf', junk)], error: /not a PDF/ },
  { id: 'pdf-splitter', files: [P('six.pdf', six)], opts: { 'Split into': 'One file per page' }, expect: [/Files created\s*6/], downloads: [{ button: /Download split\.zip/, check: zipEntries(6) }] },
  { id: 'pdf-splitter', name: 'chunks', files: [P('six.pdf', six)], opts: { 'Split into': 'Fixed-size chunks', 'Pages per chunk': 4 }, expect: [/Files created\s*2/], downloads: [{ button: /Download split\.zip/, check: zipEntries(2) }] },
  { id: 'pdf-splitter', name: 'ranges', files: [P('six.pdf', six)], opts: { 'Split into': 'Custom ranges (one file per range)', 'Ranges (for custom), e.g. 1-3, 4-6, 9': '1-2, 5-' }, expect: [/Files created\s*2/] },
  { id: 'pdf-splitter', name: 'range past end', files: [P('six.pdf', six)], opts: { 'Split into': 'Custom ranges (one file per range)', 'Ranges (for custom), e.g. 1-3, 4-6, 9': '1-9' }, error: /Page 9 does not exist/ },
  { id: 'pdf-page-extractor', files: [P('six.pdf', six)], opts: { 'Pages to keep (e.g. 1-3, 7, 10-12)': '2-3, 6' }, expect: [/Extracted 3 of 6/], downloads: [{ button: /Download six-extract\.pdf/, check: pages(3) }] },
  { id: 'pdf-page-extractor', name: 'page zero', files: [P('six.pdf', six)], opts: { 'Pages to keep (e.g. 1-3, 7, 10-12)': '0' }, error: /Pages start at 1/ },
  { id: 'pdf-page-extractor', name: 'garbage', files: [P('six.pdf', six)], opts: { 'Pages to keep (e.g. 1-3, 7, 10-12)': 'two' }, error: /not a page or range/ },
  { id: 'pdf-page-extractor', name: 'backwards', files: [P('six.pdf', six)], opts: { 'Pages to keep (e.g. 1-3, 7, 10-12)': '5-2' }, error: /backwards/ },
  { id: 'pdf-page-reorderer', files: [P('a.pdf', a3)], opts: { 'New order, e.g. 3, 1, 2, 2 (repeat pages to duplicate, omit to drop)': '3, 1, 1' }, expect: [/3 pages: 3, 1, 1/], downloads: [{ button: /Download a-reordered\.pdf/, check: pages(3) }] },
  { id: 'pdf-page-reorderer', name: 'reverse', files: [P('a.pdf', a3)], opts: { Order: 'Reverse all pages' }, expect: [/3, 2, 1/] },
  { id: 'pdf-rotator', files: [P('a.pdf', a3)], opts: { 'Rotate clockwise by': '90°', 'Pages (blank = all)': '2' }, expect: [/Rotated 1 page by 90/], downloads: [{ button: /Download a-rot90\.pdf/, check: async (d) => { const doc = await load(d); const r = doc.getPages().map((p) => p.getRotation().angle); return r.join() === '0,90,0' ? true : `rotations ${r.join()}`; } }] },
  { id: 'pdf-rotator', name: 'all pages 270', files: [P('a.pdf', a3)], opts: { 'Rotate clockwise by': '270°' }, downloads: [{ button: /Download a-rot270\.pdf/, check: async (d) => ((await load(d)).getPages().every((p) => p.getRotation().angle === 270) ? true : 'not all rotated') }] },
  { id: 'pdf-metadata-viewer', files: [P('a.pdf', a3)], expect: [/Pages\s*3/, /Title\s*Tri Doc/, /Author\s*Test Author/, /Encrypted\s*no/, /PDF version\s*1\./] },
  { id: 'pdf-metadata-viewer', name: 'encrypted', files: [P('e.pdf', encrypted)], expect: [/Encrypted\s*yes/, /cannot be read/] },
  { id: 'pdf-metadata-viewer', name: 'junk', files: [P('j.pdf', junk)], error: /no %PDF- header/ },
  { id: 'pdf-page-counter', files: [P('a.pdf', a3), P('b.pdf', b2)], expect: [/Total pages\s*5/, /2 of 2 readable/] },
  { id: 'pdf-page-counter', name: 'bad file reported', files: [P('a.pdf', a3), P('j.pdf', junk)], expect: [/Error:/, /1 of 2 readable/, /Total pages\s*3/] },
  { id: 'pdf-to-image', files: [P('a.pdf', a3)], opts: { 'Pages (blank = all, max 50)': '' }, expect: [/preview/i], downloads: [{ button: /Download pages\.zip/, check: zipEntries(3) }] },
  { id: 'pdf-to-image', name: 'jpeg and range', files: [P('six.pdf', six)], opts: { 'Pages (blank = all, max 50)': '2-3', Format: 'JPEG' }, downloads: [{ button: /Download pages\.zip/, check: (d) => (zipEntries(2)(d) === true && d.includes('page-002.jpg') ? true : 'missing page-002.jpg') }] },
  { id: 'pdf-to-image', name: 'page limit', files: [P('big.pdf', big)], opts: { 'Pages (blank = all, max 50)': '' }, error: /limited to 50 pages/ },
  { id: 'pdf-to-image', name: 'encrypted refused', files: [P('e.pdf', encrypted)], error: /password-protected/ },
  { id: 'image-to-pdf', files: [png, jpg], expect: [/2 pages created/], downloads: [{ button: /Download images\.pdf/, check: pages(2) }] },
  { id: 'image-to-pdf', name: 'gif is converted', files: [gif], opts: { 'Page size': 'A4' }, downloads: [{ button: /Download images\.pdf/, check: async (d) => { const s = (await load(d)).getPage(0).getSize(); return Math.abs(s.width - 595.28) < 1 ? true : `page width ${s.width}`; } }] },
  { id: 'image-to-pdf', name: 'not an image', files: [{ name: 'x.png', buffer: 'nope', mimeType: 'image/png' }], error: /could not be decoded/ },
  { id: 'pdf-compressor', files: [P('a.pdf', a3)], expect: [/Original/, /Rewritten/, /Change/] },
  { id: 'pdf-compressor', name: 'junk', files: [P('j.pdf', junk)], error: /not a PDF/ },
  { id: 'pdf-password-status-checker', files: [P('e.pdf', encrypted)], expect: [/Encrypted\s*yes/, /Security handler\s*Standard/, /Revision \(R\)\s*3/, /Key length\s*128 bits/, /never tries passwords/] },
  { id: 'pdf-password-status-checker', name: 'plain', files: [P('a.pdf', a3)], expect: [/Encrypted\s*no/, /No \/Encrypt entry/] },
  { id: 'pdf-password-status-checker', name: 'junk', files: [P('j.pdf', junk)], error: /no %PDF- header/ },
  { id: 'pdf-text-extractor', files: [P('a.pdf', a3)], expect: [/Hello page 1/, /Hello page 3/, /Pages read\s*3/, /Page 2/i] },
  { id: 'pdf-text-extractor', name: 'blank page is disclosed', files: [P('s.pdf', scanned)], expect: [/Hello page 1/, /Pages without a text layer\s*1/, /no OCR/], expectNot: ['Hello page 2'] },
  { id: 'pdf-text-extractor', name: 'page range', files: [P('six.pdf', six)], opts: { 'Pages (blank = all)': '4' }, expect: [/Hello page 4/], expectNot: ['Hello page 1'] },
  { id: 'pdf-page-size-inspector', files: [P('m.pdf', mixed)], expect: [/A4/, /landscape/, /square/, /595\.28 × 841\.89/] },
  { id: 'pdf-page-size-inspector', name: 'letter', files: [P('l.pdf', letter)], expect: [/Letter/, /8\.5 × 11/] },
  { id: 'pdf-watermark-tool', files: [P('a.pdf', a3)], opts: { 'Watermark text (Latin characters)': 'DRAFT' }, expect: [/3 pages/], downloads: [{ button: /Download a-watermarked\.pdf/, check: pages(3) }] },
  { id: 'pdf-watermark-tool', name: 'non latin text', files: [P('a.pdf', a3)], opts: { 'Watermark text (Latin characters)': '你好' }, error: /Latin/ },
  { id: 'pdf-watermark-tool', name: 'empty text', files: [P('a.pdf', a3)], opts: { 'Watermark text (Latin characters)': ' ' }, error: /Enter the watermark text/ },
  { id: 'pdf-document-validator', files: [P('a.pdf', a3)], expect: [/No structural problems/, /parser 1/i, /parser 2/i], errorNoticeOk: false },
  { id: 'pdf-document-validator', name: 'truncated file', files: [P('t.pdf', truncated)], expect: [/failed/, /missing/i], errorNoticeOk: true },
  { id: 'pdf-document-validator', name: 'junk', files: [P('j.pdf', junk)], expect: [/FAIL/], errorNoticeOk: true },
];
