import type { Case } from '../harness';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fx = (n: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', n));
const sha = (a: string, d: string | Buffer) => createHash(a).update(d).digest('hex');
const hello = Buffer.from('hello world\n');
const png = fx('plain.png');

export const filesCases: Case[] = [
  { id: 'file-information-viewer', files: [{ name: 'p.png', buffer: png, mimeType: 'image/png' }], expect: [/Name\s*p\.png/, /PNG image/, '89 50 4e 47', /Size\s*\d/] },
  { id: 'file-information-viewer', name: 'empty file', files: [{ name: 'e.bin', buffer: '' }], expect: [/0 bytes/] },
  { id: 'file-size-converter', opts: { Size: 1, Unit: 'Gibibytes (GiB)' }, expect: [/MiB\s*1024/, /B\s*1073741824/] },
  { id: 'file-size-converter', name: 'decimal vs binary', opts: { Size: 1, Unit: 'Kilobytes (kB, 1000)' }, expect: [/B\s*1000/] },
  { id: 'mime-type-inspector', name: 'renamed executable', files: [{ name: 'holiday.jpg', buffer: Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), mimeType: 'image/jpeg' }], expect: [/Windows executable/, /mismatch/] },
  { id: 'mime-type-inspector', name: 'matching png', files: [{ name: 'a.png', buffer: png, mimeType: 'image/png' }], expect: [/consistent/, /match/] },
  { id: 'file-extension-inspector', text: 'report.pdf.exe\n.gitignore\narchive.tar.gz\nnoext', expect: [/double extension/, /executable/, /hidden file/, /No file extension/] },
  { id: 'file-extension-inspector', name: 'bidi names are shown escaped', text: 'invoice‮fdp.exe', expect: ['<U+202E>', /bidirectional/] },
  { id: 'file-hash-calculator', files: [{ name: 'h.txt', buffer: hello }], expect: [sha('md5', hello), sha('sha1', hello), sha('sha256', hello), createHash('sha256').update(hello).digest('hex').slice(0, 8)] },
  { id: 'file-hash-calculator', name: 'no algorithm selected', files: [{ name: 'h.txt', buffer: hello }], opts: { MD5: false, 'SHA-1': false, 'SHA-256': false, CRC32: false }, error: /at least one algorithm/ },
  { id: 'file-duplicate-checker', files: [{ name: 'a.txt', buffer: 'same' }, { name: 'b.txt', buffer: 'same' }, { name: 'c.txt', buffer: 'diff' }, { name: 'd.txt', buffer: 'longer' }], expect: [/1 group/, 'a.txt', 'b.txt'], expectNot: ['c.txt', 'd.txt'] },
  { id: 'file-duplicate-checker', name: 'same size but different', files: [{ name: 'a.txt', buffer: 'aaaa' }, { name: 'b.txt', buffer: 'bbbb' }], expect: [/No duplicates/] },
  { id: 'file-duplicate-checker', name: 'needs two files', files: [{ name: 'a.txt', buffer: 'aaaa' }], error: /at least 2/ },
  { id: 'file-comparison-tool', files: [{ name: 'a.bin', buffer: Buffer.from([1, 2, 3, 4]) }, { name: 'b.bin', buffer: Buffer.from([1, 2, 9, 4]) }], expect: [/1 differing byte/, /offset 2/] },
  { id: 'file-comparison-tool', name: 'identical', files: [{ name: 'a.bin', buffer: hello }, { name: 'b.bin', buffer: hello }], expect: ['byte-for-byte identical'] },
  { id: 'file-comparison-tool', name: 'prefix', files: [{ name: 'a.bin', buffer: 'abc' }, { name: 'b.bin', buffer: 'abcdef' }], expect: [/prefix/] },
  { id: 'file-comparison-tool', name: 'one file only', files: [{ name: 'a.bin', buffer: 'abc' }], error: /exactly two/ },
  { id: 'file-previewer', name: 'png preview', files: [{ name: 'p.png', buffer: png, mimeType: 'image/png' }], expect: [/image/i], custom: async (page) => { await page.waitForSelector('.tool-panel img.img-preview'); const ok = await page.evaluate(() => { const i = document.querySelector('.tool-panel img.img-preview') as HTMLImageElement; return i.complete && i.naturalWidth > 0; }); if (!ok) throw new Error('image did not load'); } },
  { id: 'file-previewer', name: 'SVG with script runs nothing', files: [{ name: 'x.svg', buffer: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" onload="window.__pwn=1"><script>window.__pwn=2</script><rect width="40" height="40" fill="red"/></svg>', mimeType: 'image/svg+xml' }], expect: ['SVG is displayed as an image'], custom: async (page) => { await page.waitForTimeout(500); const p = await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn ?? null); if (p !== null) throw new Error('SVG script executed'); } },
  { id: 'file-previewer', name: 'text', files: [{ name: 'n.txt', buffer: 'line1\n<b>not html</b>' }], expect: ['<b>not html</b>'], custom: async (page) => { if (await page.locator('.tool-panel pre b').count()) throw new Error('text was interpreted as HTML'); } },
  { id: 'file-previewer', name: 'binary shows hex', files: [{ name: 'b.bin', buffer: Buffer.from([0, 1, 2, 255, 254, 0, 0, 7]) }], expect: ['00 01 02 ff fe'] },
  { id: 'file-renamer', files: [{ name: 'old.txt', buffer: hello }], opts: { 'New file name': 'new name.md' }, expect: ['renamed COPY', 'changes from ".txt" to ".md"'], downloads: [{ button: /Download new name\.md/, filename: 'new name.md', check: (b) => b.equals(hello) }] },
  { id: 'file-renamer', name: 'unsafe name is sanitised', files: [{ name: 'old.txt', buffer: hello }], opts: { 'New file name': '../../etc/passwd' }, expect: ['adjusted for safety'], downloads: [{ button: /Download/, check: (b, n) => (!/[\\/]/.test(n) && b.equals(hello)) || `name was ${n}` }] },
  { id: 'batch-file-renamer', files: [{ name: 'A.TXT', buffer: 'a' }, { name: 'b.txt', buffer: 'b' }], opts: { Prefix: 'doc_', 'Add sequence numbers': true, 'Digits (zero-padded)': 2, 'Letter case': 'lowercase' }, expect: ['doc_a_01.txt', 'doc_b_02.txt'], downloads: [{ button: /Download renamed files/, filename: 'renamed-files.zip', check: async (b) => { const JSZip = (await import('jszip')).default; const z = await JSZip.loadAsync(b); const n = Object.keys(z.files).sort(); return (n.join() === 'doc_a_01.txt,doc_b_02.txt' && (await z.file('doc_a_01.txt')!.async('string')) === 'a') || `zip had ${n.join()}`; } }] },
  { id: 'batch-file-renamer', name: 'collision is reported and kept', files: [{ name: 'a.txt', buffer: '1' }, { name: 'b.txt', buffer: '2' }], opts: { 'Add sequence numbers': false, 'Find in name (literal)': 'b', 'Replace with': 'a' }, expect: [/collide/], downloads: [{ button: /Download renamed files/, check: async (b) => { const JSZip = (await import('jszip')).default; const z = await JSZip.loadAsync(b); return Object.keys(z.files).length === 2 || 'a file was lost'; } }] },
  { id: 'file-timestamp-viewer', files: [{ name: 'a.txt', buffer: 'a' }], expect: [/20\d\d-\d\d-\d\dT/, /unix seconds/i] },
  { id: 'file-manifest-generator', files: [{ name: 'h.txt', buffer: hello }], expect: [`${sha('sha256', hello)}  h.txt`], downloads: [{ button: 'Download', filename: /^SHA256SUMS(\.txt)?$/, check: (b) => b.toString() === `${sha('sha256', hello)}  h.txt\n` || b.toString() }] },
  { id: 'file-manifest-generator', name: 'json', files: [{ name: 'h.txt', buffer: hello }], opts: { Format: 'JSON' }, expect: ['"sha256"'] },
  { id: 'file-content-search', text: 'todo', files: [{ name: 'a.js', buffer: 'x\n// TODO fix\ny' }, { name: 'b.bin', buffer: Buffer.from([0, 1, 2, 3, 0, 0]) }], expect: [/1 matching line/, 'a.js', 'binary'] },
  { id: 'file-content-search', name: 'regex', text: 'f\\w+', files: [{ name: 'a.txt', buffer: 'foo bar\nbaz' }], opts: { 'Treat the search as a regular expression': true }, expect: [/1 matching line/] },
  { id: 'file-content-search', name: 'dangerous regex refused', text: '(a+)+$', files: [{ name: 'a.txt', buffer: 'aaaa' }], opts: { 'Treat the search as a regular expression': true }, error: /backtrack|nested/i },
  { id: 'file-content-search', name: 'invalid regex', text: '(', files: [{ name: 'a.txt', buffer: 'aaaa' }], opts: { 'Treat the search as a regular expression': true }, error: /Invalid pattern/ },
  { id: 'file-encoding-detector', files: [{ name: 'u.txt', buffer: Buffer.from('﻿hi\r\nthere') }], expect: [/UTF-8/, /UTF-8 BOM/, /CRLF/] },
  { id: 'file-encoding-detector', name: 'latin1 bytes', files: [{ name: 'l.txt', buffer: Buffer.from([0x63, 0x61, 0x66, 0xe9]) }], expect: [/Not valid UTF-8/] },
  { id: 'file-checksum-verifier', text: sha('sha256', hello), files: [{ name: 'h.txt', buffer: hello }], expect: [/Match/] },
  { id: 'file-checksum-verifier', name: 'mismatch', text: sha('sha256', 'nope'), files: [{ name: 'h.txt', buffer: hello }], error: /MISMATCH/ },
  { id: 'file-checksum-verifier', name: 'not a digest', text: 'abc', files: [{ name: 'h.txt', buffer: hello }], error: /not a recognised digest/ },
  { id: 'file-checksum-verifier', name: 'md5', text: sha('md5', hello).toUpperCase(), files: [{ name: 'h.txt', buffer: hello }], expect: [/Match/, 'MD5'] },
];
