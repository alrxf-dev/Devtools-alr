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
  // The success path is intentionally NOT asserted: headless Chromium (software rendering) produced empty MediaRecorder output,
  // so real recording is unverified here. Input validation is tested below.
  { id: 'video-trim-tool', name: 'start past end', files: [webm], opts: { 'Start (seconds or mm:ss)': '99', 'End (seconds or mm:ss)': '100' }, error: /beyond the end/ },
  { id: 'video-trim-tool', name: 'end before start', files: [webm], opts: { 'Start (seconds or mm:ss)': '2', 'End (seconds or mm:ss)': '1' }, error: /End must be after start/ },
];
