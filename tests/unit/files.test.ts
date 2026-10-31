import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/lib/sniff';
import * as F from '../../src/lib/safe';
import * as Z from '../../src/lib/zip';
import { buildZip } from '../helpers/zipbuild';

const u8 = (...n: number[]) => Uint8Array.from(n);
const ascii = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));

// ---------- signatures ----------
test('detects common file signatures', () => {
  assert.equal(S.detectSignatures(u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))[0]?.signature.name, 'PNG image');
  assert.equal(S.detectSignatures(u8(0xff, 0xd8, 0xff, 0xe0))[0]?.signature.mime, 'image/jpeg');
  assert.equal(S.detectSignatures(ascii('%PDF-1.7\n'))[0]?.signature.mime, 'application/pdf');
  const webp = new Uint8Array([...ascii('RIFF'), 1, 0, 0, 0, ...ascii('WEBP')]);
  assert.equal(S.detectSignatures(webp)[0]?.signature.mime, 'image/webp');
  const wav = new Uint8Array([...ascii('RIFF'), 1, 0, 0, 0, ...ascii('WAVE')]);
  assert.equal(S.detectSignatures(wav)[0]?.signature.mime, 'audio/wav');
  const mp4 = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypmp42')]);
  assert.equal(S.detectSignatures(mp4)[0]?.signature.name, 'MP4/MOV (ISO base media)');
  assert.deepEqual(S.detectSignatures(u8(1, 2, 3)).length, 0);
  assert.deepEqual(S.detectSignatures(new Uint8Array(0)).length, 0);
});

test('analyzeType flags a renamed executable', () => {
  const r = S.analyzeType('holiday.jpg', 'image/jpeg', ascii('MZ\x90\x00\x03\x00'));
  assert.equal(r.verdict, 'mismatch');
  assert.match(r.message, /Windows executable/);
  assert.equal(S.analyzeType('a.png', 'image/png', u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).verdict, 'match');
  assert.equal(S.analyzeType('x.json', 'application/json', ascii('{"a":1}')).verdict, 'text');
  assert.equal(S.analyzeType('x.bin', '', u8(0, 1, 2, 3, 4, 5)).verdict, 'unknown');
});

test('extension inspector spots disguised executables and bidi tricks', () => {
  assert.ok(S.inspectExtension('invoice.pdf.exe').suspicious.some((m) => /executable/.test(m)));
  assert.equal(S.inspectExtension('archive.tar.gz').doubleExtension, true);
  assert.equal(S.inspectExtension('archive.tar.gz').suspicious.length, 0);
  assert.ok(S.inspectExtension('photo\u202Egpj.exe').suspicious.some((m) => /bidirectional/.test(m)));
  assert.equal(S.inspectExtension('.gitignore').hidden, true);
  assert.equal(S.inspectExtension('Makefile').extension, '');
  assert.equal(S.extensionOf('C:\\dir\\File.TXT'), 'txt');
});

test('encoding detection', () => {
  assert.equal(S.detectEncoding(u8(0xef, 0xbb, 0xbf, 0x61)).encoding, 'UTF-8');
  assert.equal(S.detectEncoding(u8(0xff, 0xfe, 0x61, 0)).encoding, 'UTF-16LE');
  assert.equal(S.detectEncoding(ascii('hello\r\nworld\r\n')).lineEndings, 'CRLF');
  assert.equal(S.detectEncoding(ascii('a\nb\r\nc')).lineEndings, 'mixed');
  assert.match(S.detectEncoding(new TextEncoder().encode('naïve café')).encoding, /UTF-8/);
  assert.match(S.detectEncoding(u8(0x63, 0x61, 0x66, 0xe9)).encoding, /Not valid UTF-8/);
  assert.equal(S.detectEncoding(new Uint8Array(0)).encoding, 'empty');
  assert.match(S.detectEncoding(u8(0, 1, 0, 2, 0, 3, 7, 0)).encoding, /UTF-16|binary/);
});

test('size formatting and conversion', () => {
  assert.equal(S.formatBytes(0), '0 B');
  assert.equal(S.formatBytes(1536), '1.50 KiB');
  assert.equal(S.formatBytes(1500, false), '1.50 kB');
  assert.equal(S.formatBytes(-1), '—');
  assert.equal(S.convertSize(1, 'GiB')['MiB'], '1024');
  assert.equal(S.convertSize(1, 'KB')['B'], '1000');
  assert.throws(() => S.convertSize(1, 'XB'), /Unknown unit/);
  assert.throws(() => S.convertSize(-1, 'B'), /non-negative/);
});

// ---------- path safety ----------
test('safeRelativePath blocks traversal, absolute and control paths', () => {
  const bad = ['../evil.txt', 'a/../../evil', '/etc/passwd', 'C:\\Windows\\x', '\\\\server\\share\\f', 'a/b\0c', '..', 'a\\..\\..\\b', '', '/', './', 'x\u202Etxt.exe'];
  for (const b of bad) assert.equal(F.safeRelativePath(b).path, null, `should reject ${JSON.stringify(b)}`);
  assert.equal(F.safeRelativePath('dir/./file.txt').path, 'dir/file.txt');
  assert.equal(F.safeRelativePath('dir\\sub\\f.txt').path, 'dir/sub/f.txt');
  assert.equal(F.safeRelativePath('日本語/ファイル.txt').path, '日本語/ファイル.txt');
  assert.equal(F.safeRelativePath('a/'.repeat(40) + 'f').path, null);
  assert.equal(F.safeRelativePath('x'.repeat(2000)).path, null);
});

test('safeDownloadName and withExtension', () => {
  assert.equal(F.safeDownloadName('../../etc/passwd'), 'passwd');
  assert.equal(F.safeDownloadName('a<b>:"c|d?.txt'), 'a_b___c_d_.txt');
  assert.equal(F.safeDownloadName('...'), 'download');
  assert.equal(F.safeDownloadName('résumé 日本.pdf'), 'résumé 日本.pdf');
  assert.equal(F.withExtension('photo.final.PNG', 'jpg'), 'photo.final.jpg');
  assert.equal(F.withExtension('noext', 'txt', '-x'), 'noext-x.txt');
});

test('safeHref only allows http, https and mailto', () => {
  assert.ok(F.safeHref('https://example.com/a?b=1'));
  assert.ok(F.safeHref('mailto:a@b.co'));
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd', ' \tjavascript:alert(1)', 'java\nscript:alert(1)']) {
    assert.equal(F.safeHref(bad), null, bad);
  }
});

test('assertFileSize', () => {
  assert.throws(() => F.assertFileSize({ name: 'big.bin', size: 300 * 1024 * 1024 }), /accepts files up to 256 MiB/);
  assert.doesNotThrow(() => F.assertFileSize({ name: 'ok', size: 10 }));
});

// ---------- ZIP builder for adversarial fixtures ----------
test('readZipDirectory parses a normal archive made by JSZip', async () => {
  const zip = await Z.createZip([
    { path: 'a.txt', data: ascii('hello hello hello hello') },
    { path: 'dir/b.txt', data: ascii('world') },
    { path: 'ünï/文件.txt', data: ascii('unicode name') },
  ]);
  const r = Z.readZipDirectory(zip);
  assert.equal(r.fileCount, 3);
  assert.ok(r.entries.some((e) => e.name === 'ünï/文件.txt'));
  assert.equal(r.unsafeCount, 0);
  assert.equal(r.encryptedCount, 0);
  const ex = await Z.extractZipSafely(zip, r);
  assert.equal(ex.files.length, 3);
  assert.ok(ex.files.every((f) => f.crcOk));
  assert.equal(new TextDecoder().decode(ex.files.find((f) => f.path === 'a.txt')?.data), 'hello hello hello hello');
});

test('createZip rejects traversal names, de-duplicates and enforces non-empty input', async () => {
  await assert.rejects(() => Z.createZip([{ path: '../x', data: ascii('x') }]), /path traversal/);
  await assert.rejects(() => Z.createZip([]), /at least one file/i);
  const z = await Z.createZip([{ path: 'a.txt', data: ascii('1') }, { path: 'A.txt', data: ascii('2') }]);
  assert.deepEqual(Z.readZipDirectory(z).entries.map((e) => e.name).sort(), ['A (2).txt', 'a.txt'].sort());
});

test('PATH TRAVERSAL: malicious entry names are reported and never extracted', async () => {
  const evil = buildZip([
    { name: '../../evil.txt', data: ascii('pwn') },
    { name: '/abs/evil.txt', data: ascii('pwn') },
    { name: 'C:\\evil.txt', data: ascii('pwn') },
    { name: 'a/../../b.txt', data: ascii('pwn') },
    { name: 'good.txt', data: ascii('ok') },
  ]);
  const r = Z.readZipDirectory(evil);
  assert.equal(r.unsafeCount, 4);
  assert.ok(r.warnings.some((w) => /unsafe/.test(w)));
  const ex = await Z.extractZipSafely(evil, r);
  assert.deepEqual(ex.files.map((f) => f.path), ['good.txt']);
  assert.equal(ex.skipped.length, 4);
  assert.ok(ex.skipped.every((s) => /unsafe name/.test(s.reason)));
  for (const f of ex.files) assert.ok(!f.path.includes('..') && !f.path.startsWith('/'));
});

test('DECOMPRESSION BOMB: huge ratio is flagged and not extracted', async () => {
  // 20 MB of zeros deflates to ~20 KB (ratio ~1000:1).
  const zeros = new Uint8Array(20_000_000);
  const bomb = buildZip([{ name: 'zeros.bin', data: zeros, method: 8 }]);
  const r = Z.readZipDirectory(bomb);
  assert.ok(r.warnings.some((w) => /decompression bomb/.test(w)));
  assert.equal(Z.canExtract(r.entries[0] as Z.ZipEntryInfo).ok, false);
  const ex = await Z.extractZipSafely(bomb, r);
  assert.equal(ex.files.length, 0);
  assert.match(ex.skipped[0]?.reason ?? '', /ratio/);
});

test('DECOMPRESSION BOMB: refuses when declared total exceeds limit', async () => {
  const lying = buildZip([{ name: 'big.bin', data: ascii('x'), declaredUncompressed: 900 * 1024 * 1024 }]);
  const r = Z.readZipDirectory(lying);
  await assert.rejects(() => Z.extractZipSafely(lying, r), /more than the allowed total/);
});

test('too many entries is rejected up front', () => {
  const many = buildZip(Array.from({ length: 5001 }, (_, i) => ({ name: `f${i}`, data: new Uint8Array(0) })));
  assert.throws(() => Z.readZipDirectory(many), /5,001 entries|5001 entries/);
});

test('encrypted entries are detected and skipped, never "extracted"', async () => {
  const enc = buildZip([{ name: 'secret.txt', data: ascii('data'), flags: 1 }]);
  const r = Z.readZipDirectory(enc);
  assert.equal(r.encryptedCount, 1);
  const ex = await Z.extractZipSafely(enc, r);
  assert.equal(ex.files.length, 0);
  assert.equal(ex.skipped[0]?.reason, 'encrypted');
});

test('symlink entries are skipped', async () => {
  const sym = buildZip([{ name: 'link', data: ascii('/etc/passwd'), madeBy: (3 << 8) | 20, externalAttrs: (0o120777 << 16) >>> 0 }]);
  const r = Z.readZipDirectory(sym);
  assert.equal(r.entries[0]?.isSymlink, true);
  const ex = await Z.extractZipSafely(sym, r);
  assert.equal(ex.files.length, 0);
  assert.equal(ex.skipped[0]?.reason, 'symbolic link');
});

test('duplicate names are flagged and the later one is not allowed to overwrite', async () => {
  const dup = buildZip([{ name: 'a.txt', data: ascii('first') }, { name: 'a.txt', data: ascii('second') }]);
  const r = Z.readZipDirectory(dup);
  assert.ok(r.warnings.some((w) => /Duplicate entry/.test(w)));
  const ex = await Z.extractZipSafely(dup, r);
  assert.ok(ex.files.length <= 1);
});

test('malformed archives fail with readable errors, not crashes', () => {
  assert.throws(() => Z.readZipDirectory(new Uint8Array(0)), /too small/);
  assert.throws(() => Z.readZipDirectory(ascii('this is definitely not a zip file at all')), /not a ZIP|End-of-central/);
  const good = buildZip([{ name: 'a.txt', data: ascii('hello') }]);
  assert.throws(() => Z.readZipDirectory(good.subarray(0, good.length - 10)), /End-of-central|truncated|corrupt|beyond/);
  const corrupt = good.slice();
  const cdPos = corrupt.length - 22 - (46 + 5);
  corrupt[cdPos] = 0; // break the central directory signature
  assert.throws(() => Z.readZipDirectory(corrupt), /corrupt/);
});

test('integrity check catches CRC corruption', async () => {
  const bad = buildZip([{ name: 'a.txt', data: ascii('hello'), crc: 0x12345678 }]);
  const res = await Z.verifyZipIntegrity(bad);
  assert.equal(res.failed.length, 1);
  assert.match(res.failed[0]?.reason ?? '', /CRC/);
  const ok = await Z.verifyZipIntegrity(buildZip([{ name: 'a.txt', data: ascii('hello'), method: 8 }]));
  assert.equal(ok.failed.length, 0);
  assert.equal(ok.checked, 1);
});

test('directory tree rendering', () => {
  const tree = Z.buildTree([{ path: 'a/b.txt', size: 3 }, { path: 'a/c/d.txt', size: 5 }, { path: 'e.txt', size: 1 }]);
  assert.equal(tree.size, 9);
  const out = Z.renderTree(tree);
  assert.match(out, /a\//);
  assert.match(out, /d\.txt/);
  assert.equal(Z.renderTree(Z.buildTree([])), '(empty)');
});

test('hexDump formats offsets, hex and ASCII', async () => {
  const { hexDump } = await import('../../src/lib/sniff');
  const out = hexDump(new Uint8Array([0x48, 0x69, 0x00, 0xff, ...Array(14).fill(0x41)]), 0, 32);
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0] as string, /^00000000  48 69 00 ff 41/);
  assert.match(lines[0] as string, /Hi\.\.AAAAAAAAAAAA$/);
  assert.match(lines[1] as string, /^00000010  41 41  /);
  assert.equal(hexDump(new Uint8Array(0)), '');
});
