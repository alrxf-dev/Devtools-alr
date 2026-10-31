import type { Case } from '../harness';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fx = (n: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', n));
const tone = fx('tone.wav');

/** Mono 16-bit PCM WAV: `sec` seconds of a 440 Hz sine at `amp`, then `quiet` seconds of digital silence. */
function makeWav(sec: number, quiet: number, amp: number, rate = 8000): Buffer {
  const n = Math.round((sec + quiet) * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(i < sec * rate ? Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * amp * 32767) : 0, 44 + i * 2);
  return b;
}
const peakDb = (wav: Buffer) => { let p = 0; for (let i = 44; i + 1 < wav.length; i += 2) p = Math.max(p, Math.abs(wav.readInt16LE(i))); return 20 * Math.log10(p / 32768); };
const half = makeWav(2, 1, 0.25);
const W = (name: string, buffer: Buffer | string = half) => ({ name, buffer, mimeType: 'audio/wav' });

export const audioCases: Case[] = [
  { id: 'audio-metadata-inspector', files: [W('tone.wav', tone)], expect: [/Container\s*wav/, /Codec\s*PCM/, /Sample rate/, /Browser-reported duration/] },
  { id: 'audio-metadata-inspector', name: 'flac', files: [{ name: 'tone.flac', buffer: fx('tone.flac'), mimeType: 'audio/flac' }], expect: [/Container\s*flac/] },
  { id: 'audio-metadata-inspector', name: 'mp3', files: [{ name: 'tone.mp3', buffer: fx('tone.mp3'), mimeType: 'audio/mpeg' }], expect: [/Container\s*mp3/] },
  { id: 'audio-metadata-inspector', name: 'not audio', files: [{ name: 'x.wav', buffer: 'hello' }], expect: [/Container\s*unknown/, /not recognised/] },
  { id: 'audio-duration-viewer', files: [W('a.wav'), W('b.wav')], expect: [/0:03\.000/, /Total\s*0:06\.000/] },
  { id: 'audio-duration-viewer', name: 'unreadable file is reported, others kept', files: [W('a.wav'), W('junk.wav', 'junk')], expect: [/1 of 2 readable/] },
  { id: 'audio-format-support-checker', expect: [/Web Audio API\s*available/, /WAV \(PCM\)/, /Audio engine sample rate/] },
  { id: 'audio-file-size-inspector', files: [W('a.wav')], expect: [/Effective bitrate\s*1\d\d\.\d kbps/, /Uncompressed PCM size/] },
  { id: 'audio-waveform-preview', files: [W('a.wav')], expect: [/Duration\s*0:03\.000/, /Peak\s*-12\.0\d dBFS/, /Clipping\s*none/] },
  { id: 'audio-waveform-preview', name: 'undecodable', files: [W('junk.wav', 'junk')], error: /could not decode/ },
  {
    id: 'audio-trimmer', files: [W('a.wav')], opts: { 'Start (seconds or mm:ss)': '0:00.5', 'End (blank = end of file)': '1.5' }, expect: [/Kept 1 s/],
    downloads: [{ button: /Download a-trim\.wav/, filename: 'a-trim.wav', check: (d) => (d.toString('latin1', 0, 4) === 'RIFF' && d.readUInt32LE(40) === 16000 ? true : `bad wav: data bytes ${d.readUInt32LE(40)} (expected 16000)`) }],
  },
  { id: 'audio-trimmer', name: 'end before start', files: [W('a.wav')], opts: { 'Start (seconds or mm:ss)': '2', 'End (blank = end of file)': '1' }, error: /End must be after start/ },
  { id: 'audio-trimmer', name: 'bad time text', files: [W('a.wav')], opts: { 'Start (seconds or mm:ss)': 'abc' }, error: /Start: use seconds/ },
  { id: 'audio-trimmer', name: 'start beyond end', files: [W('a.wav')], opts: { 'Start (seconds or mm:ss)': '99' }, error: /beyond the end/ },
  {
    id: 'audio-volume-normalizer', files: [W('a.wav')], opts: { 'Target peak (dBFS)': -3 }, expect: [/Gain applied\s*\+9\.\d+ dB/],
    downloads: [{ button: /Download a-normalized\.wav/, check: (d) => { const p = peakDb(d); return Math.abs(p + 3) < 0.1 ? true : `peak is ${p.toFixed(2)} dBFS, expected -3`; } }],
  },
  { id: 'audio-volume-normalizer', name: 'silent file', files: [W('s.wav', makeWav(0, 1, 0))], error: /completely silent/ },
  { id: 'audio-channel-inspector', files: [W('tone.wav', tone)], expect: [/Channel 1/, /peak/i] },
  { id: 'audio-channel-inspector', name: 'mono', files: [W('a.wav')], expect: [/Mono file/] },
  { id: 'audio-sample-rate-inspector', files: [W('a.wav')], expect: [/File sample rate\s*8,000 Hz/, /Nyquist\)\s*4\.00 kHz/, /audio engine/] },
  { id: 'audio-bit-depth-inspector', files: [W('a.wav')], expect: [/Bit depth\s*16-bit/, /98\.1 dB/] },
  { id: 'audio-bit-depth-inspector', name: 'lossy', files: [{ name: 'tone.mp3', buffer: fx('tone.mp3'), mimeType: 'audio/mpeg' }], expect: [/not applicable/, /Lossy codecs/] },
  {
    id: 'audio-playback-speed-controller', files: [W('a.wav')], opts: { 'Speed factor (0.25 – 4)': 2 }, expect: [/New length 1\.5 s/, /pitch changes/],
    downloads: [{ button: /Download a-x2\.wav/, check: (d) => (Math.abs(d.readUInt32LE(40) - 24000) <= 4 ? true : `data bytes ${d.readUInt32LE(40)}, expected ~24000`) }],
  },
  { id: 'audio-playback-speed-controller', name: 'out of range', files: [W('a.wav')], opts: { 'Speed factor (0.25 – 4)': 9 }, error: /between 0\.25 and 4/ },
  { id: 'audio-silence-detector', files: [W('a.wav')], expect: [/Silent ranges\s*1/, /Total silence\s*1 s/] },
  {
    id: 'audio-segment-extractor', files: [W('a.wav')], text: '0-1\n0:01-0:02.5', expect: [/01_a\.wav/, /02_a\.wav/],
    downloads: [{ button: /Download segments\.zip/, check: (d) => { const n = d.toString('latin1').split('PK\x01\x02').length - 1; return d.toString('latin1', 0, 2) === 'PK' && n === 2 ? true : `expected 2 entries, found ${n}`; } }],
  },
  { id: 'audio-segment-extractor', name: 'bad line', files: [W('a.wav')], text: 'nonsense', error: /Line 1/ },
  { id: 'audio-metadata-exporter', files: [W('a.wav'), W('bad.wav', 'x')], expect: [/"file": "a\.wav"/, /"sampleRate": 8000/, /"error"/] },
  { id: 'audio-metadata-exporter', name: 'csv', files: [W('=cmd.wav')], opts: { Format: 'CSV' }, expect: [/'=cmd\.wav/] },
  { id: 'audio-file-comparison', files: [W('a.wav'), W('b.wav')], expect: [/Decoded samples are identical/] },
  { id: 'audio-file-comparison', name: 'different level', files: [W('a.wav'), W('b.wav', makeWav(2, 1, 0.5))], expect: [/Decoded samples differ/] },
  { id: 'audio-file-comparison', name: 'needs two', files: [W('a.wav')], error: /at least 2/ },
];
