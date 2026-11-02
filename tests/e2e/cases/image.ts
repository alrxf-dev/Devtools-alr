import type { Case } from '../harness';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fx = (n: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', n));
const F = (name: string, mimeType: string, file = name) => ({ name, buffer: fx(file), mimeType });
const png = F('plain.png', 'image/png');
const textPng = F('text.png', 'image/png');
const jpg = F('exif.jpg', 'image/jpeg');
const changed = F('changed.png', 'image/png');
const alpha = F('alpha.png', 'image/png');
const junk = { name: 'junk.png', buffer: 'definitely not an image', mimeType: 'image/png' };

const pngSize = (d: Buffer): [number, number] | null => (d.toString('latin1', 1, 4) === 'PNG' ? [d.readUInt32BE(16), d.readUInt32BE(20)] : null);
function jpegSize(d: Buffer): [number, number] | null {
  if (d[0] !== 0xff || d[1] !== 0xd8) return null;
  for (let p = 2; p + 9 < d.length;) {
    if (d[p] !== 0xff) return null;
    const m = d[p + 1] as number;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [d.readUInt16BE(p + 7), d.readUInt16BE(p + 5)];
    p += 2 + d.readUInt16BE(p + 2);
  }
  return null;
}
const sized = (w: number, h: number) => (d: Buffer) => { const s = pngSize(d) ?? jpegSize(d); return s && s[0] === w && s[1] === h ? true : `expected ${w}×${h}, got ${s ? s.join('×') : 'not an image'}`; };
const hasExif = (d: Buffer) => d.includes(Buffer.from('Exif\0\0', 'latin1'));

export const imageCases: Case[] = [
  { id: 'image-resizer', files: [png], opts: { 'Width (px, or % when resizing by percentage)': 32 }, expect: [/64×48 → 32×24/], downloads: [{ button: /Download plain-32x24\.png/, check: sized(32, 24) }] },
  { id: 'image-resizer', name: 'percentage', files: [png], opts: { 'Resize by': 'Percentage', 'Width (px, or % when resizing by percentage)': 50 }, expect: [/64×48 → 32×24/] },
  { id: 'image-resizer', name: 'unlocked ratio', files: [png], opts: { 'Keep aspect ratio (height follows width)': false, 'Width (px, or % when resizing by percentage)': 10, 'Height (px, ignored if aspect ratio is locked)': 30 }, expect: [/→ 10×30/] },
  { id: 'image-resizer', name: 'not an image', files: [junk], error: /could not be decoded/ },
  { id: 'image-resizer', name: 'absurd size', files: [png], opts: { 'Width (px, or % when resizing by percentage)': 32767 }, error: /megapixels|pixels/ },
  { id: 'image-cropper', files: [png], opts: { 'Width (px)': 30, 'Height (px)': 20, 'X (left, px)': 4, 'Y (top, px)': 2 }, expect: [/Cropped 30×20 at \(4, 2\)/], downloads: [{ button: /Download plain-crop\.png/, check: sized(30, 20) }] },
  { id: 'image-cropper', name: 'outside', files: [png], opts: { 'Width (px)': 100, 'Height (px)': 20 }, error: /outside the image/ },
  { id: 'image-cropper', name: 'ratio', files: [png], opts: { 'Crop by': 'Centred aspect ratio', 'Aspect ratio (W:H) for ratio mode': '1:1' }, expect: [/Cropped 48×48 at \(8, 0\)/] },
  { id: 'image-cropper', name: 'bad ratio', files: [png], opts: { 'Crop by': 'Centred aspect ratio', 'Aspect ratio (W:H) for ratio mode': 'x' }, error: /must look like/ },
  { id: 'image-compressor', files: [jpg], opts: { 'Quality for JPEG/WebP (1–100)': 30 }, expect: [/Original/, /Compressed/, /Change/], downloads: [{ button: /Download exif-compressed\.jpg/, check: (d) => (hasExif(d) ? 'EXIF survived re-encoding' : jpegSize(d) ? true : 'not a JPEG') }] },
  { id: 'image-compressor', name: 'webp', files: [png], opts: { 'Output format': 'WebP' }, downloads: [{ button: /Download plain-compressed\.webp/, check: (d) => (d.toString('latin1', 0, 4) === 'RIFF' && d.toString('latin1', 8, 12) === 'WEBP' ? true : 'not WebP') }] },
  { id: 'image-format-converter', files: [png], opts: { 'Output format': 'JPEG' }, downloads: [{ button: /Download plain\.jpg/, check: sized(64, 48) }] },
  { id: 'image-format-converter', name: 'transparent to jpeg is flattened and disclosed', files: [alpha], opts: { 'Output format': 'JPEG', 'Background colour (HEX) for JPEG and empty areas': '#00ff00' }, expect: [/flattened onto #00ff00/], downloads: [{ button: /Download alpha\.jpg/, check: sized(40, 20) }] },
  { id: 'image-format-converter', name: 'gif to png', files: [F('plain.gif', 'image/gif')], downloads: [{ button: /Download plain\.png/, check: sized(64, 48) }] },
  { id: 'image-rotator', files: [png], opts: { 'Angle (degrees, clockwise)': 90 }, downloads: [{ button: /Download plain-rot90\.png/, check: sized(48, 64) }] },
  { id: 'image-rotator', name: '45 degrees expands', files: [png], opts: { 'Angle (degrees, clockwise)': 45 }, downloads: [{ button: /Download plain-rot45\.png/, check: sized(79, 79) }] },
  { id: 'image-rotator', name: 'no expand keeps size', files: [png], opts: { 'Angle (degrees, clockwise)': 45, 'Expand canvas so nothing is cut off': false }, downloads: [{ button: /Download plain-rot45\.png/, check: sized(64, 48) }] },
  { id: 'image-flipper', files: [png], downloads: [{ button: /Download plain-flip-h\.png/, check: sized(64, 48) }] },
  { id: 'image-metadata-viewer', files: [jpg], expect: [/Format \(from bytes\)\s*jpeg/, /64×48/, /EXIF/, /gps position/i, /Latitude/] },
  { id: 'image-metadata-viewer', name: 'no exif', files: [png], expect: [/Format \(from bytes\)\s*png/] },
  { id: 'image-metadata-viewer', name: 'junk', files: [junk], expect: [/unknown/] },
  { id: 'image-palette-extractor', files: [png], opts: { 'Number of colours': 4 }, expect: [/#[0-9A-F]{6}/, /%/] },
  { id: 'image-to-base64', files: [png], expect: [/data:image\/png;base64,iVBOR/, /image\/png/] },
  { id: 'image-to-base64', name: 'raw', files: [png], opts: { Output: 'Raw Base64' }, expect: [/iVBOR/], expectNot: ['data:image'] },
  { id: 'image-to-base64', name: 'not an image', files: [junk], error: /does not look like/ },
  { id: 'base64-to-image', text: `data:image/png;base64,${fx('plain.png').toString('base64')}`, expect: [/image\/png/, /64×48/], downloads: [{ button: /Download image\.png/, check: (d) => (d.equals(fx('plain.png')) ? true : 'bytes differ from original') }] },
  { id: 'base64-to-image', name: 'declared type lies', text: `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`, error: /not a PNG, JPEG, GIF, WebP or BMP/ },
  { id: 'base64-to-image', name: 'invalid base64', text: '%%%%', error: /not valid Base64/ },
  { id: 'base64-to-image', name: 'url-safe jpeg', text: fx('plain.jpg').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), expect: [/image\/jpeg/] },
  { id: 'image-preview-generator', files: [png], opts: { 'Widths in px (comma separated)': '16, 32' }, expect: [/plain-16w\.png/, /16×12/], downloads: [{ button: /Download thumbnails\.zip/, check: (d) => (d.toString('latin1').split('PK\x01\x02').length - 1 === 2 ? true : 'expected 2 files') }] },
  { id: 'image-preview-generator', name: 'bad width', files: [png], opts: { 'Widths in px (comma separated)': '0, abc' }, error: /whole numbers/ },
  { id: 'image-grayscale-converter', files: [textPng], downloads: [{ button: /Download text-gray\.png/, check: sized(64, 48) }] },
  { id: 'image-grayscale-converter', name: 'sepia', files: [textPng], opts: { 'Sepia tone instead of grey': true }, downloads: [{ button: /Download text-sepia\.png/, check: sized(64, 48) }] },
  { id: 'image-watermark-tool', files: [png], opts: { 'Watermark text': 'HELLO' }, downloads: [{ button: /Download plain-watermarked\.png/, check: sized(64, 48) }] },
  { id: 'image-watermark-tool', name: 'empty text', files: [png], opts: { 'Watermark text': '  ' }, error: /Enter the watermark text/ },
  { id: 'image-watermark-tool', name: 'tiled', files: [png], opts: { 'Tile diagonally across the image': true }, downloads: [{ button: /Download plain-watermarked\.png/, check: sized(64, 48) }] },
  { id: 'image-comparison-tool', files: [png, png], expect: [/Identical within the tolerance/, /0\.000%/] },
  { id: 'image-comparison-tool', name: 'different content', files: [png, changed], expect: [/Images differ/, /Differing pixels\s*400 of 3,072/, /13\.02\d%/] },
  { id: 'image-comparison-tool', name: 'different sizes', files: [png, alpha], expect: [/different dimensions/] },
  { id: 'image-comparison-tool', name: 'needs two', files: [png], error: /at least 2/ },
];

imageCases.push({
  id: 'image-color-picker', customOnly: true,
  files: [png],
  async custom(page, h) {
    await page.locator('#cp-file').setInputFiles({ name: 'plain.png', mimeType: 'image/png', buffer: fx('plain.png') });
    await page.waitForSelector('.tool-panel canvas');
    const box = await page.locator('.tool-panel canvas').boundingBox();
    if (!box) throw new Error('canvas not visible');
    await page.mouse.click(box.x + (5 / 64) * box.width, box.y + (5 / 48) * box.height);
    await page.waitForSelector('.tool-panel :text("Picked colours")', { timeout: 5000 });
    await h.expectText(/rgb\(20, \d+, 128\)/);
    // keyboard path: move the cursor and pick again with Enter
    await page.locator('.tool-panel canvas').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await h.expectText(/Picked colours/i);
  },
}, {
  id: 'image-color-picker', name: 'not an image', customOnly: true,
  async custom(page, h) {
    await page.locator('#cp-file').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('nope') });
    await page.waitForSelector('.tool-panel .notice-error', { timeout: 5000 });
    await h.expectText(/could not be decoded/);
  },
});
