import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as I from '../../src/lib/imagemeta';
import * as A from '../../src/lib/audio';
import * as M from '../../src/lib/mp4';

const fx = (n: string) => new Uint8Array(readFileSync(join(import.meta.dirname, '../fixtures', n)));
const near = (a: number | null, b: number, eps: number) => a !== null && Math.abs(a - b) <= eps;

// ---------- images (fixtures created with Pillow; expected values come from the generator script) ----------
test('image info reads real dimensions from every supported container', () => {
  for (const [f, fmt] of [['plain.jpg', 'jpeg'], ['plain.png', 'png'], ['plain.gif', 'gif'], ['exif.webp', 'webp']] as const) {
    const i = I.readImageInfo(fx(f));
    assert.equal(i.format, fmt, f);
    assert.deepEqual([i.width, i.height], [64, 48], f);
  }
  assert.equal(I.readImageInfo(new Uint8Array([1, 2, 3])).format, 'unknown');
  assert.equal(I.readImageInfo(fx('plain.png').subarray(0, 10)).width, null); // truncated header
});

test('EXIF parser reads tags and GPS from a real JPEG', () => {
  const tags = I.readExif(fx('exif.jpg'));
  const get = (n: string) => tags.find((t) => t.name === n)?.value;
  assert.equal(get('Make'), 'TestMake');
  assert.equal(get('Model'), 'TestModel');
  assert.equal(get('Orientation'), 6);
  assert.equal(get('Software'), 'Fixture 1.0');
  assert.equal(get('DateTimeOriginal'), '2024:05:06 07:08:09');
  assert.equal(get('BodySerialNumber'), 'SN-12345');
  const gps = I.gpsDecimal(tags);
  assert.ok(gps && near(gps.lat, -(33 + 51 / 60 + 54 / 3600), 1e-6) && near(gps.lon, 151 + 12 / 60 + 36 / 3600, 1e-6), JSON.stringify(gps));
  assert.deepEqual(I.readExif(fx('plain.jpg')), []);
});

test('privacy report flags GPS and serial numbers and stays calm for clean files', () => {
  const r = I.privacyReport(fx('exif.jpg'));
  assert.ok(r.findings.some((f) => f.level === 'high' && /GPS/.test(f.message)));
  assert.ok(r.findings.some((f) => /BodySerialNumber/.test(f.message)));
  assert.ok(r.findings.some((f) => /TestMake TestModel/.test(f.message)));
  const clean = I.privacyReport(fx('plain.jpg'));
  assert.ok(clean.findings.every((f) => f.level === 'info'));
  assert.match(clean.findings[0]?.message ?? '', /Pixels themselves can still identify/);
  assert.ok(I.privacyReport(fx('text.png')).findings.some((f) => /Author/.test(f.message)));
});

test('JPEG strip removes EXIF, keeps decodable image data and reports orientation loss', () => {
  const src = fx('exif.jpg');
  const out = I.stripJpegMetadata(src);
  assert.ok(out.removed.includes('EXIF'));
  assert.equal(out.orientationLost, 6);
  assert.deepEqual(I.readExif(out.data), []);
  assert.ok(out.data.length < src.length);
  assert.deepEqual(I.readImageInfo(out.data), { format: 'jpeg', width: 64, height: 48, notes: [] });
  assert.equal(I.privacyReport(out.data).findings.some((f) => f.level === 'high'), false);
  // Scan data is byte-identical (no re-encoding, so no quality loss).
  const sosIn = I.readJpegSegments(src).find((s) => s.marker === 0xda)!;
  const sosOut = I.readJpegSegments(out.data).find((s) => s.marker === 0xda)!;
  assert.deepEqual(src.subarray(sosIn.offset), out.data.subarray(sosOut.offset));
  assert.throws(() => I.stripJpegMetadata(src.subarray(0, 200)), /no image scan|truncated/i);
});

test('PNG strip removes text chunks and leaves a valid PNG', () => {
  const src = fx('text.png');
  assert.deepEqual(I.readPngText(src).map((t) => t.keyword).sort(), ['Author', 'Comment']);
  assert.equal(I.readPngText(src).find((t) => t.keyword === 'Author')?.text, 'Jane Doe');
  const out = I.stripPngMetadata(src);
  assert.deepEqual(out.removed.sort(), ['tEXt', 'tEXt']);
  assert.deepEqual(I.readPngText(out.data), []);
  assert.deepEqual(I.readPngChunks(out.data).map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  assert.throws(() => I.stripPngMetadata(src.subarray(0, src.length - 12)), /truncated/);
});

test('WebP strip removes EXIF chunk, clears VP8X flags and fixes RIFF size', () => {
  const src = fx('exif.webp');
  assert.ok(I.privacyReport(src).findings.some((f) => /EXIF/.test(f.message)));
  const out = I.stripWebpMetadata(src);
  assert.ok(out.removed.includes('EXIF'));
  const dv = new DataView(out.data.buffer, out.data.byteOffset, out.data.byteLength);
  assert.equal(dv.getUint32(4, true), out.data.length - 8);
  assert.equal(I.privacyReport(out.data).findings.some((f) => /Contains an EXIF chunk/.test(f.message)), false);
  assert.deepEqual([I.readImageInfo(out.data).width, I.readImageInfo(out.data).height], [64, 48]);
  assert.throws(() => I.stripWebpMetadata(fx('plain.png')), /Not a WebP/);
});

test('malformed image input never throws out of bounds or loops forever', () => {
  const rnd = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * seed + (i >> 3)) & 0xff);
  const jpeg = fx('exif.jpg');
  for (let cut = 0; cut < jpeg.length; cut += 37) {
    const t = jpeg.subarray(0, cut);
    assert.doesNotThrow(() => {
      I.readImageInfo(t);
      try { I.readExif(t); } catch { /* not-a-JPEG is an acceptable error */ }
    }, `cut=${cut}`);
  }
  // Corrupt every byte position of the EXIF region in turn.
  for (let i = 20; i < 260; i++) {
    const c = jpeg.slice();
    c[i] = (c[i] as number) ^ 0xff;
    assert.doesNotThrow(() => I.readExif(c), `flip=${i}`);
  }
  for (let s = 1; s < 40; s++) assert.doesNotThrow(() => I.parseExifBlock(Uint8Array.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, ...rnd(80, s)])));
  // Self-referential IFD loop must terminate.
  const loop = Uint8Array.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x69, 0x87, 4, 0, 1, 0, 0, 0, 8, 0, 0, 0, 8, 0, 0, 0]);
  assert.doesNotThrow(() => I.parseExifBlock(loop));
});

// ---------- audio (expected values from ffprobe on the same files) ----------
test('WAV header matches ffprobe', () => {
  const w = A.parseWav(fx('tone.wav'));
  assert.deepEqual([w.codec, w.channels, w.sampleRate, w.bitsPerSample], ['PCM', 2, 44100, 16]);
  assert.ok(near(w.durationSeconds, 2, 0.001));
  assert.equal(w.bitrateKbps, 1411);
  assert.throws(() => A.parseWav(fx('tone.flac')), /RIFF/);
});

test('FLAC header and tags match ffprobe', () => {
  const f = A.parseFlac(fx('tone.flac'));
  assert.deepEqual([f.channels, f.sampleRate, f.bitsPerSample], [2, 44100, 16]);
  assert.ok(near(f.durationSeconds, 2, 0.001));
  assert.equal(f.tags['title'], 'Tone A');
  assert.equal(f.tags['artist'], 'Tester');
});

test('MP3 header, ID3 tags and duration (ffprobe says 2.0376 s)', () => {
  const m = A.parseMp3(fx('tone.mp3'));
  assert.deepEqual([m.channels, m.sampleRate, m.bitrateKbps], [2, 44100, 128]);
  assert.match(m.codec, /MPEG-1 Layer 3/);
  assert.equal(m.tags['title'], 'Tone A');
  assert.equal(m.tags['artist'], 'Tester');
  assert.ok(near(m.durationSeconds, 2.0376, 0.05), String(m.durationSeconds));
  assert.throws(() => A.parseMp3(new Uint8Array(1000)), /No valid MPEG/);
});

test('Ogg Vorbis header and duration match ffprobe', () => {
  const o = A.parseOgg(fx('tone.ogg'));
  assert.deepEqual([o.codec, o.channels, o.sampleRate], ['Vorbis', 2, 44100]);
  assert.ok(near(o.durationSeconds, 2, 0.01), String(o.durationSeconds));
});

test('parseAudioHeader dispatches and falls back honestly', () => {
  assert.equal(A.parseAudioHeader(fx('tone.wav')).container, 'wav');
  assert.equal(A.parseAudioHeader(fx('tone.flac')).container, 'flac');
  assert.equal(A.parseAudioHeader(fx('tone.mp3')).container, 'mp3');
  assert.equal(A.parseAudioHeader(fx('tone.ogg')).container, 'ogg');
  assert.equal(A.parseAudioHeader(new Uint8Array(100)).container, 'unknown');
  for (const f of ['tone.wav', 'tone.flac', 'tone.mp3', 'tone.ogg']) {
    const b = fx(f);
    for (let cut = 0; cut < Math.min(b.length, 400); cut += 7) assert.doesNotThrow(() => { try { A.parseAudioHeader(b.subarray(0, cut)); } catch { /* readable error is fine */ } }, `${f}@${cut}`);
  }
});

test('WAV encode -> parse round trip preserves samples', () => {
  const n = 4410;
  const l = Float32Array.from({ length: n }, (_, i) => Math.sin((i / 44100) * 2 * Math.PI * 440) * 0.5);
  const r = Float32Array.from({ length: n }, (_, i) => Math.cos((i / 44100) * 2 * Math.PI * 220) * 0.25);
  for (const bits of [16, 24, 32] as const) {
    const wav = A.encodeWav([l, r], 44100, bits);
    const h = A.parseWav(wav);
    assert.deepEqual([h.channels, h.sampleRate, h.bitsPerSample], [2, 44100, bits]);
    assert.ok(near(h.durationSeconds, 0.1, 1e-6));
    const dv = new DataView(wav.buffer);
    const first = bits === 16 ? dv.getInt16(44 + 4 * 100, true) / 32768 : bits === 24 ? ((wav[44 + 6 * 100] as number) | ((wav[45 + 6 * 100] as number) << 8) | (((wav[46 + 6 * 100] as number) << 24) >> 8)) / 8388608 : dv.getFloat32(44 + 8 * 100, true);
    assert.ok(near(first, l[100] as number, bits === 16 ? 1e-4 : 1e-6), `bits=${bits}`);
  }
  assert.throws(() => A.encodeWav([], 44100), /No audio channels/);
  assert.throws(() => A.encodeWav([new Float32Array(2), new Float32Array(3)], 44100), /different lengths/);
  assert.throws(() => A.encodeWav([new Float32Array(2)], 5), /Sample rate/);
  // Clipping is clamped, not wrapped.
  const clip = A.encodeWav([Float32Array.from([2, -2])], 8000, 16);
  assert.equal(new DataView(clip.buffer).getInt16(44, true), 32767);
  assert.equal(new DataView(clip.buffer).getInt16(46, true), -32768);
});

test('audio processing: normalize, trim, fade, speed, silence, join', () => {
  const sr = 1000;
  const sine = (n: number, amp: number) => Float32Array.from({ length: n }, (_, i) => Math.sin(i / 5) * amp);
  const norm = A.normalizePeak([sine(2000, 0.25)], -6);
  assert.ok(near(A.toDb(A.peakOf(norm.channels)), -6, 0.05));
  assert.deepEqual(A.normalizePeak([new Float32Array(10)], -1).gainDb, 0); // silence: no divide-by-zero
  assert.throws(() => A.normalizePeak([sine(10, 1)], 3), /between -60 and 0/);

  const t = A.trimAudio([sine(5000, 1)], sr, 1, 3);
  assert.equal(t[0]?.length, 2000);
  assert.equal(A.trimAudio([sine(5000, 1)], sr, 4, 99)[0]?.length, 1000);
  assert.throws(() => A.trimAudio([sine(5000, 1)], sr, 3, 1), /greater than start/);
  assert.throws(() => A.trimAudio([sine(5000, 1)], sr, 10, 11), /past the end/);

  const ones = [new Float32Array(1000).fill(1)];
  const f = A.applyFade(ones, sr, 0.1, 0.1)[0] as Float32Array;
  assert.equal(f[0], 0);
  assert.equal(f[999], 0);
  assert.equal(f[500], 1);
  assert.ok(near(f[50] as number, 0.5, 0.01));

  assert.equal(A.changeSpeed([sine(4000, 1)], 2)[0]?.length, 2000);
  assert.equal(A.changeSpeed([sine(4000, 1)], 0.5)[0]?.length, 8000);
  assert.throws(() => A.changeSpeed([sine(10, 1)], 10), /between 0.25 and 4/);

  const audio = [Float32Array.from([...sine(1000, 0.5), ...new Float32Array(2000), ...sine(1000, 0.5)])];
  const sil = A.detectSilence(audio, sr, -50, 0.5);
  assert.equal(sil.length, 1);
  assert.ok(near(sil[0]?.start ?? null, 1, 0.02) && near(sil[0]?.end ?? null, 3, 0.02));
  assert.deepEqual(A.detectSilence(audio, sr, -50, 5), []);
  assert.throws(() => A.detectSilence(audio, sr, 5), /Threshold/);

  const joined = A.concatAudio([[sine(100, 1), sine(100, 1)], [sine(50, 1)]]);
  assert.equal(joined.length, 2);
  assert.equal(joined[0]?.length, 150);
  assert.throws(() => A.concatAudio([]), /Nothing to join/);
  assert.equal(A.resample([sine(1000, 1)], 1000, 500)[0]?.length, 500);

  const wf = A.waveformPeaks([sine(1000, 1)], 10);
  assert.equal(wf.max.length, 10);
  assert.ok((wf.max[0] as number) <= 1 && (wf.min[0] as number) >= -1);
});

// ---------- MP4 (expected values from ffprobe) ----------
test('MP4 metadata matches ffprobe: size, fps, codecs, duration, faststart', () => {
  const m = M.readMp4(fx('clip.mp4'));
  assert.ok(m.brands.includes('isom') || m.brands.includes('mp42'));
  assert.ok(near(m.durationSeconds, 2, 0.05));
  assert.equal(m.fastStart, true);
  const v = m.tracks.find((t) => t.type === 'video')!;
  const a = m.tracks.find((t) => t.type === 'audio')!;
  assert.deepEqual([v.width, v.height, v.codec], [160, 120, 'avc1']);
  assert.ok(near(v.fps, 25, 0.01));
  assert.equal(v.sampleCount, 50);
  assert.equal(v.rotation, 0);
  assert.deepEqual([a.codec, a.channels, a.sampleRate], ['mp4a', 1, 44100]);
  assert.equal(M.FOURCC_NAMES[v.codec as string], 'H.264 / AVC');
});

test('MP4 rotation is reported clockwise, verified against decoded pixels', () => {
  // `ffmpeg -display_rotation 90` = 90 deg COUNTER-clockwise (ffprobe says 90). Decoded frame equalled PIL rotate(+90)
  // (counter-clockwise), so the clockwise value a player applies is 270.
  const v = M.readMp4(fx('clip_rot.mp4')).tracks.find((t) => t.type === 'video')!;
  assert.equal(v.rotation, 270);
});

test('MP4 rejects non-MP4 and survives truncation', () => {
  assert.throws(() => M.readMp4(fx('tone.wav')), /Not an MP4/);
  const b = fx('clip.mp4');
  for (const cut of [12, 100, 800, 2000, b.length - 5]) assert.doesNotThrow(() => M.readMp4(b.subarray(0, cut)), `cut=${cut}`);
  assert.match(M.readMp4(b.subarray(0, 40)).notes.join(' '), /moov box is cut off|No moov/);
  assert.match(M.readMp4(b.subarray(0, 2000)).notes.join(' '), /cut off/);
});

test('extractPalette finds dominant colours by share, ignoring transparent pixels', async () => {
  const { extractPalette, luma709, sepia, diffImages } = await import('../../src/lib/palette');
  const px = new Uint8ClampedArray(4 * 10);
  for (let i = 0; i < 10; i++) px.set(i < 6 ? [255, 0, 0, 255] : i < 9 ? [0, 0, 255, 255] : [0, 255, 0, 0], i * 4);
  const p = extractPalette(px, 2);
  assert.equal(p.length, 2);
  assert.equal(p[0]?.hex, '#FF0000');
  assert.ok(Math.abs((p[0]?.share ?? 0) - 6 / 9) < 1e-9);
  assert.equal(p[1]?.hex, '#0000FF');
  assert.deepEqual(extractPalette(new Uint8ClampedArray([1, 2, 3, 0]), 3), []);
  assert.equal(extractPalette(new Uint8ClampedArray([9, 9, 9, 255, 9, 9, 9, 255]), 8).length, 1);
  assert.ok(Math.abs(luma709(255, 255, 255) - 255) < 1e-9);
  assert.equal(luma709(0, 0, 0), 0);
  const sp = sepia(255, 255, 255);
  assert.deepEqual([sp[0], sp[1]], [255, 255]);
  assert.ok(Math.abs(sp[2] - 238.935) < 1e-9);
  const a = new Uint8ClampedArray([10, 10, 10, 255, 200, 0, 0, 255]);
  const b = new Uint8ClampedArray([10, 10, 12, 255, 0, 0, 0, 255]);
  const d = diffImages(a, b, 8);
  assert.equal(d.differing, 1);
  assert.equal(d.fraction, 0.5);
  assert.throws(() => diffImages(a, new Uint8ClampedArray(4)), /same dimensions/);
});
