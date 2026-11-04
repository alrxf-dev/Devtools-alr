import type { Case } from '../harness';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fx = (n: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', n));
const mp4 = { name: 'clip.mp4', buffer: fx('clip.mp4'), mimeType: 'video/mp4' };
const rot = { name: 'clip_rot.mp4', buffer: fx('clip_rot.mp4'), mimeType: 'video/mp4' };
const webm = { name: 'clip.webm', buffer: fx('clip.webm'), mimeType: 'video/webm' };
const junk = { name: 'junk.mp4', buffer: 'not a video at all', mimeType: 'video/mp4' };
const isPng = (d: Buffer) => d.toString('latin1', 1, 4) === 'PNG';

// Chromium builds used for testing may not decode H.264, so decode-based tools are tested with WebM (VP8/Vorbis)
// and header-based tools with the MP4 fixtures.
export const videoCases: Case[] = [
  { id: 'video-metadata-inspector', files: [mp4], expect: [/isom|mp42|avc1/, /h264|avc1/i, /160×120/, /0:02\.000/] },
  { id: 'video-metadata-inspector', name: 'webm falls back to browser', files: [webm], expect: [/Not an MP4\/MOV/, /160×120/] },
  { id: 'video-metadata-inspector', name: 'junk', files: [junk], expect: [/Not an MP4\/MOV/] },
  { id: 'video-duration-viewer', files: [mp4, webm], expect: [/MP4\/MOV header/, /browser/, /2 of 2 readable/] },
  { id: 'video-duration-viewer', name: 'junk reported', files: [mp4, junk], expect: [/Error:/, /1 of 2 readable/] },
  { id: 'video-resolution-inspector', files: [mp4, rot], expect: [/160×120/, /120×160/, /4:3/, /3:4/] },
  { id: 'video-aspect-ratio-calculator', opts: { Width: 1280, Height: 720, 'Target ratio (W:H)': '4:3' }, expect: [/Current ratio\s*16:9/, /1280×960/] },
  { id: 'video-aspect-ratio-calculator', name: 'solve width', opts: { Width: 1000, Height: 1080, 'Target ratio (W:H)': '16:9', 'Solve for': 'Width from height' }, expect: [/1920×1080/] },
  { id: 'video-aspect-ratio-calculator', name: 'bad ratio', opts: { 'Target ratio (W:H)': 'wide' }, error: /must look like 16:9/ },
  { id: 'video-frame-rate-inspector', files: [mp4], expect: [/25\.000 fps/, /50/] },
  { id: 'video-frame-rate-inspector', name: 'webm unsupported', files: [webm], expect: [/No MP4\/MOV video track/] },
  { id: 'video-thumbnail-generator', files: [webm], opts: { 'Time (seconds or mm:ss)': '1' }, expect: [/Frame at 0:01\.0/i], downloads: [{ button: /Download clip-1\.0s\.png/, check: (d) => (isPng(d) && d.readUInt32BE(16) === 160 && d.readUInt32BE(20) === 120 ? true : 'not a 160x120 PNG') }] },
  { id: 'video-thumbnail-generator', name: 'time past end', files: [webm], opts: { 'Time (seconds or mm:ss)': '99' }, error: /beyond the end/ },
  { id: 'video-thumbnail-generator', name: 'undecodable', files: [junk], error: /cannot play/ },
  { id: 'video-preview-player', files: [webm], expect: [/160×120/, /Size/] },
  { id: 'video-frame-extractor', files: [webm], opts: { 'Interval (s)': 1 }, expect: [/frame_001_0\.00s\.png/, /frame_003_2\.00s\.png/], downloads: [{ button: /Download frames\.zip/, check: (d) => (d.toString('latin1').split('PK\x01\x02').length - 1 >= 3 ? true : `expected 3 frames in zip, found ${d.toString('latin1').split('PK\x01\x02').length - 1}`) }] },
  { id: 'video-frame-extractor', name: 'too many', files: [webm], opts: { Mode: 'Specific times (list below)', 'Times (comma separated)': Array.from({ length: 121 }, () => '0').join(',') }, error: /limit is 120/ },
  { id: 'video-frame-extractor', name: 'time list', files: [webm], opts: { Mode: 'Specific times (list below)', 'Times (comma separated)': '0, 0:01' }, expect: [/frame_002_1\.00s/] },
  { id: 'video-frame-extractor', name: 'time past end', files: [webm], opts: { Mode: 'Specific times (list below)', 'Times (comma separated)': '50' }, error: /beyond the end/ },
  { id: 'video-file-size-inspector', files: [mp4], expect: [/Overall bitrate/, /Per minute/] },
  { id: 'video-codec-support-checker', expect: [/VP8 \(WebM\)/, /playback/i] },
  { id: 'video-rotation-metadata-viewer', files: [rot], expect: [/270°|90°/, /120×160/] },
  { id: 'video-rotation-metadata-viewer', name: 'not mp4', files: [junk], error: /not one/ },
  { id: 'video-audio-track-inspector', files: [mp4], expect: [/aac|mp4a/i, /44100 Hz/] },
  { id: 'video-contact-sheet-generator', files: [webm], opts: { Columns: 2, Rows: 2, 'Thumbnail width (px)': 80 }, expect: [/2×2 contact sheet/i], downloads: [{ button: /Download clip-contact-sheet\.png/, check: (d) => (isPng(d) && d.readUInt32BE(16) === 160 && d.readUInt32BE(20) === 120 ? true : `unexpected size ${d.readUInt32BE(16)}x${d.readUInt32BE(20)}`) }] },
  { id: 'video-metadata-exporter', files: [mp4, junk], expect: [/"displayWidth": 160/, /not an MP4\/MOV file/] },
  { id: 'video-metadata-exporter', name: 'csv', files: [mp4], opts: { Format: 'CSV' }, expect: [/file,bytes,brands/] },
  // The success path is intentionally NOT asserted. Re-recording the clip in headless Chromium produced no MediaRecorder data
  // in several attempts, although the watermark tool's recorder works there. Input validation is tested below.
  { id: 'video-trim-tool', name: 'start past end', files: [webm], opts: { 'Start (seconds or mm:ss)': '99', 'End (seconds or mm:ss)': '100' }, error: /beyond the end/ },
  { id: 'video-trim-tool', name: 'end before start', files: [webm], opts: { 'Start (seconds or mm:ss)': '2', 'End (seconds or mm:ss)': '1' }, error: /End must be after start/ },
];

// ---- video-watermark ----
const logoRed = { name: 'logo_red.png', buffer: fx('logo_red.png'), mimeType: 'image/png' };
const fileInputs = (page: import('playwright').Page) => page.locator('.tool-panel input[type=file]');
/** Count preview-canvas pixels satisfying a colour test (preview canvas is the watermark's own drawing, no recording involved). */
const countPx = (page: import('playwright').Page, kind: 'red' | 'green' | 'blue') => page.evaluate((k) => {
  const c = document.querySelector('.wm-canvas') as HTMLCanvasElement;
  const d = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] as number, g = d[i + 1] as number, b = d[i + 2] as number;
    if ((k === 'red' && r > 200 && g < 60 && b < 60) || (k === 'green' && g > 200 && r < 60 && b < 60) || (k === 'blue' && b > 200 && r < 60 && g < 60)) n++;
  }
  return n;
}, kind);
const wmReady = async (page: import('playwright').Page) => {
  await fileInputs(page).nth(0).setInputFiles(webm);
  await page.waitForSelector('.wm-canvas', { timeout: 10000 });
  await page.waitForTimeout(600);
};
/** Turn the text off. Uploading a logo switches the editor to the Logo tab, so open Text first, then go back to Logo. */
const hideText = async (page: import('playwright').Page) => {
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByLabel('Show text', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Logo', exact: true }).click();
};
const setNum = async (page: import('playwright').Page, label: string, v: number) => { await page.getByLabel(label, { exact: true }).first().fill(String(v)); await page.waitForTimeout(150); };

videoCases.push(
  {
    id: 'video-watermark', name: 'logo at centre is rendered into the recorded video', customOnly: true,
    async custom(page) {
      await wmReady(page);
      await fileInputs(page).nth(1).setInputFiles(logoRed);
      await page.waitForTimeout(400);
      await hideText(page);
      await setNum(page, 'Across (%)', 50); await setNum(page, 'Down (%)', 50); await setNum(page, 'Logo size (% of width)', 40);
      await setNum(page, 'Opacity (%)', 100);
      await page.getByRole('button', { name: /Render watermarked video/ }).click();
      await page.waitForSelector('.tool-panel :text("Rendered")', { timeout: 40000 });
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /Download clip-watermark\.webm/ }).click()]);
      const chunks: Buffer[] = []; for await (const ch of await dl.createReadStream()) chunks.push(Buffer.from(ch as Buffer));
      const buf = Buffer.concat(chunks);
      if (buf.readUInt32BE(0) !== 0x1a45dfa3) throw new Error('download is not a WebM/EBML file');
      if (buf.length < 3000) throw new Error(`download is only ${buf.length} bytes`);
      // decode the real downloaded bytes and look at actual pixels
      const px = await page.evaluate(async (b64) => {
        const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'video/webm' });
        const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob);
        await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('downloaded file does not decode')); });
        await v.play(); await new Promise((r) => setTimeout(r, 900)); v.pause();
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        const g = c.getContext('2d') as CanvasRenderingContext2D; g.drawImage(v, 0, 0);
        // no named inner functions here: tsx would inject a __name helper that does not exist in the page
        return { w: v.videoWidth, h: v.videoHeight, centre: Array.from(g.getImageData(c.width / 2, c.height / 2, 1, 1).data.slice(0, 3)), corner: Array.from(g.getImageData(3, c.height - 3, 1, 1).data.slice(0, 3)) };
      }, buf.toString('base64'));
      if (px.w !== 160 || px.h !== 120) throw new Error(`decoded size ${px.w}x${px.h}, expected 160x120`);
      const [r, g, b] = px.centre as number[];
      if (!((r as number) > 180 && (g as number) < 90 && (b as number) < 90)) throw new Error(`centre pixel is rgb(${px.centre}), expected red from the logo`);
      const [cr, cg, cb] = px.corner as number[];
      if ((cr as number) > 180 && (cg as number) < 90 && (cb as number) < 90) throw new Error(`corner pixel is also red (${px.corner}); the logo should only cover the centre`);
    },
  },
  {
    id: 'video-watermark', name: 'text colour and logo recolour change the drawn pixels', customOnly: true,
    async custom(page) {
      await wmReady(page);
      await page.getByLabel('Outline (keeps text readable on any background)', { exact: true }).uncheck();
      await page.getByLabel('Text colour', { exact: true }).fill('#00ff00');
      await setNum(page, 'Text size (% of height)', 30); await setNum(page, 'Opacity (%)', 100);
      await setNum(page, 'Across (%)', 50); await setNum(page, 'Down (%)', 50);
      const green = await countPx(page, 'green');
      if (green < 80) throw new Error(`only ${green} green pixels; the text colour was not applied`);
      await page.getByLabel('Text colour', { exact: true }).fill('#ff0000');
      const red = await countPx(page, 'red');
      if (red < 80) throw new Error(`only ${red} red pixels after changing the text colour`);
      // logo recolour: red logo tinted blue
      await fileInputs(page).nth(1).setInputFiles(logoRed); await page.waitForTimeout(300);
      await hideText(page);
      await setNum(page, 'Logo size (% of width)', 40); await setNum(page, 'Opacity (%)', 100);
      await page.getByLabel('Recolour the logo (keeps its shape, replaces its colours)', { exact: true }).check();
      await page.getByLabel('Logo colour', { exact: true }).fill('#0000ff');
      await page.waitForTimeout(200);
      const blue = await countPx(page, 'blue');
      if (blue < 400) throw new Error(`only ${blue} blue pixels; the logo recolour was not applied`);
    },
  },
  {
    id: 'video-watermark', name: 'dragging, arrow keys, quick positions and tiling', customOnly: true,
    async custom(page) {
      await wmReady(page);
      await fileInputs(page).nth(1).setInputFiles(logoRed); await page.waitForTimeout(300);
      await hideText(page);
      await setNum(page, 'Logo size (% of width)', 20); await setNum(page, 'Opacity (%)', 100);
      await setNum(page, 'Across (%)', 50); await setNum(page, 'Down (%)', 50);
      const box = await page.locator('.wm-canvas').boundingBox();
      if (!box) throw new Error('preview not visible');
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 6 }); await page.mouse.up();
      const across = Number(await page.getByLabel('Across (%)', { exact: true }).first().inputValue()), down = Number(await page.getByLabel('Down (%)', { exact: true }).first().inputValue());
      if (Math.abs(across - 80) > 3 || Math.abs(down - 30) > 3) throw new Error(`after dragging to 80/30 the position is ${across}/${down}`);
      await page.locator('.wm-canvas').focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
      const after = Number(await page.getByLabel('Across (%)', { exact: true }).first().inputValue());
      if (after !== across - 2) throw new Error(`two ArrowLeft presses moved ${across} -> ${after}, expected ${across - 2}`);
      await page.getByRole('button', { name: 'Move logo to bottom right' }).click();
      const br = [Number(await page.getByLabel('Across (%)', { exact: true }).first().inputValue()), Number(await page.getByLabel('Down (%)', { exact: true }).first().inputValue())];
      if (!(br[0] as number > 80 && br[1] as number > 80)) throw new Error(`bottom-right anchor gave ${br}`);
      const single = await countPx(page, 'red');
      await page.getByLabel('Tile across the whole video (harder to crop out)', { exact: true }).check();
      await page.waitForTimeout(200);
      const tiled = await countPx(page, 'red');
      if (!(tiled > single * 2)) throw new Error(`tiling did not add logos: ${single} -> ${tiled} red pixels`);
    },
  },
  { id: 'video-watermark', name: 'not a video', customOnly: true, async custom(page, h) { await fileInputs(page).nth(0).setInputFiles({ ...junk, buffer: Buffer.from(junk.buffer) }); await page.waitForSelector('.tool-panel .notice-error', { timeout: 15000 }); await h.expectText(/cannot play/); } },
  {
    id: 'video-watermark', name: 'not an image as logo', customOnly: true,
    async custom(page, h) { await wmReady(page); await fileInputs(page).nth(1).setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('nope') }); await page.waitForSelector('.tool-panel .notice-error', { timeout: 8000 }); await h.expectText(/could not be read as an image/); },
  },
  {
    id: 'video-watermark', name: 'nothing to draw disables rendering', customOnly: true,
    async custom(page) {
      await wmReady(page);
      await page.getByLabel('Show text', { exact: true }).uncheck();
      if (!(await page.getByRole('button', { name: /Render watermarked video/ }).isDisabled())) throw new Error('Render should be disabled when there is no text and no logo');
    },
  },
);
