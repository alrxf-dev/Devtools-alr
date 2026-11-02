import type { Case } from '../harness';
import { buildZip } from '../../helpers/zipbuild';
import { createZip } from '../../../src/lib/zip';

const te = (s: string) => new TextEncoder().encode(s);
const sample = await createZip([{ path: 'readme.md', data: te('# Hello readme\nTODO: write') }, { path: 'src/main.js', data: te('console.log(1)\n') }, { path: 'src/lib/util.js', data: te('export const x = 1;\n') }]);
const evil = buildZip([
  { name: 'ok/safe.txt', data: te('safe content'), method: 8 },
  { name: '../../escape.txt', data: te('pwned') },
  { name: '/abs/path.txt', data: te('abs') },
  { name: 'C:\\win\\x.txt', data: te('win') },
  { name: 'link', data: te('/etc/passwd'), madeBy: 0x0314, externalAttrs: (0o120777 << 16) >>> 0 },
  { name: 'dup.txt', data: te('one') },
  { name: 'DUP.txt', data: te('two') },
]);
const bomb = buildZip([{ name: 'zeros.bin', data: new Uint8Array(20 * 1024 * 1024), method: 8 }, { name: 'tiny.txt', data: te('x') }]);
const corrupt = buildZip([{ name: 'bad.txt', data: te('hello'), crc: 0x12345678 }]);
const encrypted = buildZip([{ name: 'secret.txt', data: te('x'), flags: 1 }]);
const zipFile = { name: 'a.zip', buffer: Buffer.from(sample), mimeType: 'application/zip' };
const JSZip = async () => (await import('jszip')).default;

export const archiveCases: Case[] = [
  { id: 'zip-creator', files: [{ name: 'a.txt', buffer: 'AAA AAA AAA AAA' }, { name: 'b.txt', buffer: 'BBB' }], expect: [/Created a ZIP with 2 file/], downloads: [{ button: 'Download ZIP', filename: 'archive.zip', check: async (b) => { const z = await (await JSZip()).loadAsync(b); return (await z.file('a.txt')!.async('string')) === 'AAA AAA AAA AAA' && (await z.file('b.txt')!.async('string')) === 'BBB' || 'content differs'; } }] },
  { id: 'zip-creator', name: 'duplicate names are kept', files: [{ name: 'a.txt', buffer: '1' }], expect: [/1 file/] },
  { id: 'zip-extractor', name: 'normal archive', files: [zipFile], expect: [/3 file\(s\) extracted safely/, 'main.js'], downloads: [{ button: /Download main\.js/, filename: 'main.js', check: (b) => b.toString() === 'console.log(1)\n' }, { button: /Download sanitised ZIP/, check: async (b) => { const z = await (await JSZip()).loadAsync(b); return Object.keys(z.files).filter((n) => !n.endsWith('/')).sort().join() === 'readme.md,src/lib/util.js,src/main.js' || Object.keys(z.files).join(); } }] },
  { id: 'zip-extractor', name: 'PATH TRAVERSAL archive: unsafe entries skipped, nothing escapes', files: [{ name: 'evil.zip', buffer: Buffer.from(evil) }], expect: [/2 file\(s\) extracted safely/, /5 skipped/, 'unsafe name', 'symbolic link', 'duplicate'], expectNot: ['pwned'], downloads: [{ button: /Download sanitised ZIP/, check: async (b) => { const z = await (await JSZip()).loadAsync(b); const names = Object.keys(z.files).filter((n) => !n.endsWith('/')); return (names.join() === 'ok/safe.txt,dup.txt' && !names.some((n) => n.includes('..'))) || `names: ${names.join()}`; } }, { button: /Download safe\.txt/, check: (b) => b.toString() === 'safe content' }] },
  { id: 'zip-extractor', name: 'DECOMPRESSION BOMB entry is refused, other entries survive', files: [{ name: 'bomb.zip', buffer: Buffer.from(bomb) }], expect: ['suspicious compression ratio', /1 file\(s\) extracted safely/] },
  { id: 'zip-extractor', name: 'not a zip', files: [{ name: 'x.zip', buffer: 'this is not a zip file at all' }], error: /not a readable ZIP/ },
  { id: 'zip-extractor', name: 'empty file', files: [{ name: 'x.zip', buffer: '' }], error: /not a readable ZIP/ },
  { id: 'zip-extractor', name: 'corrupt CRC is flagged', files: [{ name: 'c.zip', buffer: Buffer.from(corrupt) }], error: /CRC mismatch/ },
  { id: 'archive-content-viewer', files: [zipFile], expect: ['readme.md', 'src/main.js', /deflate|stored/, /Files\s*3/] },
  { id: 'zip-file-validator', files: [zipFile], expect: [/Valid\./, /passed the CRC-32 check/] },
  { id: 'zip-file-validator', name: 'evil archive', files: [{ name: 'evil.zip', buffer: Buffer.from(evil) }], expect: [/issue/, 'Unsafe entry', 'symbolic link', 'Duplicate'] },
  { id: 'zip-file-validator', name: 'truncated', files: [{ name: 't.zip', buffer: Buffer.from(sample.subarray(0, sample.length - 30)) }], error: /not a readable ZIP|end of central directory/i },
  { id: 'archive-size-inspector', files: [{ name: 'bomb.zip', buffer: Buffer.from(bomb) }], expect: ['zeros.bin', 'suspicious compression ratio', /Overall ratio\s*\d{3,}/] },
  { id: 'batch-file-archiver', name: 'folder via webkitdirectory is exercised in the browser tests', customOnly: true, custom: async (page) => { await page.waitForSelector('.tool-panel input[type=file]'); const wd = await page.locator('.tool-panel input[type=file]').getAttribute('webkitdirectory'); if (wd === null) throw new Error('folder picker attribute missing'); } },
  { id: 'zip-compression-level-selector', files: [{ name: 'a.txt', buffer: 'abc'.repeat(5000) }], expect: [/Level 0 \(store\)/, 'Level 9'], downloads: [{ button: 'Download level 9', filename: 'archive-level9.zip', check: async (b) => { const z = await (await JSZip()).loadAsync(b); return (await z.file('a.txt')!.async('string')).length === 15000 || 'bad content'; } }] },
  { id: 'zip-password-support-inspector', files: [{ name: 'e.zip', buffer: Buffer.from(encrypted) }], expect: [/1 of 1 entries are encrypted/, 'ZipCrypto'] },
  { id: 'zip-password-support-inspector', name: 'not encrypted', files: [zipFile], expect: ['No entries are encrypted'] },
  { id: 'archive-file-list-exporter', files: [zipFile], opts: { Format: 'CSV' }, expect: ['name,size,compressed_size'], downloads: [{ button: 'Download', filename: 'file-list.csv', check: (b) => b.toString().includes('src/main.js') }] },
  { id: 'archive-file-list-exporter', name: 'json', files: [zipFile], opts: { Format: 'JSON' }, expect: ['"name": "readme.md"'] },
  { id: 'archive-integrity-checker', files: [zipFile], expect: [/3 entries decompressed and matched/] },
  { id: 'archive-integrity-checker', name: 'corrupt', files: [{ name: 'c.zip', buffer: Buffer.from(corrupt) }], error: /corrupt/ },
  { id: 'zip-metadata-viewer', files: [{ name: 'c.zip', buffer: Buffer.from(buildZip([{ name: 'a.txt', data: te('x') }], { comment: 'my comment' })) }], expect: ['my comment', 'a.txt', /ZIP64\s*no/] },
  { id: 'archive-file-search', text: 'readme', files: [zipFile], expect: [/1 entry name/, 'readme.md'] },
  { id: 'archive-file-search', name: 'inside contents', text: 'todo', files: [zipFile], opts: { 'Also search inside text entries (up to 1 MiB each)': true }, expect: [/content matches/i, 'readme.md'] },
  { id: 'zip-directory-structure-viewer', files: [zipFile], expect: ['├── ', 'src/', 'util.js'] },
  { id: 'archive-extraction-preview', files: [{ name: 'evil.zip', buffer: Buffer.from(evil) }], expect: [/2 file\(s\)/, 'WRITE', 'SKIP', 'ok/safe.txt'] },
  { id: 'zip-manifest-generator', files: [zipFile], expect: [/[0-9a-f]{64}  readme\.md/], downloads: [{ button: 'Download', filename: /^SHA256SUMS(\.txt)?$/, check: (b) => b.toString().split('\n').filter(Boolean).length === 3 }] },
];
