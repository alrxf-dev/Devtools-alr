import { form, kv, notice, optCheck, optSelect, optText, table, text, textTool, readText, str, bool, DELIMITERS, readBytes, oneFile } from './kit';
import type { Block, ImplMap } from './types';
import { runJob } from '../workers/client';
import { formatDate, dateToUnix, parseUnixTimestamp, textToBinary, binaryToText, textToHex, hexToText, convertBase, urlEncode, urlDecode, htmlEncode, htmlDecode, encodeBase64, decodeBase64, bytesToBase64, base64ToBytes, inspectUnicode, validateUtf8 } from '../lib/encoding';
import { formatBytes } from '../lib/sniff';

/** Conversions run in a worker so a 20-million-character document does not freeze the page. */
const convert = (op: Parameters<typeof runJob<'convert'>>[1]['op'], text: string, opts?: Record<string, string | number | boolean>, signal?: AbortSignal) =>
  runJob('convert', { op, text, ...(opts ? { opts } : {}) }, signal ? { signal } : {});

const textOrFile = async (t: string, files: File[]): Promise<string> => {
  const f = files[0];
  return f ? readText(f) : t;
};

const modeOpt = optSelect('mode', 'Direction', [['encode', 'Encode'], ['decode', 'Decode']]);

export const IMPL: ImplMap = {
  'json-to-csv': form({
    text: { label: 'JSON (an array of objects)', rows: 8, sample: '[{"name":"Ada","age":36,"address":{"city":"London"}},{"name":"Linus","age":55}]', optional: true },
    files: { label: 'Or choose a JSON file', accept: '.json,application/json', optional: true },
    options: [optSelect('delimiter', 'Delimiter', DELIMITERS)],
    live: false,
    async run({ text: t, files, opts }, ctx) {
      const csv = (await convert('json-csv', await textOrFile(t, files), { delimiter: str(opts, 'delimiter') }, ctx.signal)) as string;
      return [notice('info', 'Cells starting with = + - or @ are prefixed with an apostrophe so spreadsheets do not run them as formulas.'), text(csv, { title: 'CSV', filename: 'data.csv', mime: 'text/csv' })];
    },
  }),

  'csv-to-json': form({
    text: { label: 'CSV (first row is the header)', rows: 8, sample: 'name,age,active\nAda,36,true\nLinus,55,false', optional: true },
    files: { label: 'Or choose a CSV file', accept: '.csv,.tsv,.txt,text/csv', optional: true },
    options: [optSelect('delimiter', 'Delimiter', DELIMITERS), optCheck('inferTypes', 'Detect numbers, true/false and null')],
    live: false,
    async run({ text: t, files, opts }, ctx) {
      const src = await textOrFile(t, files);
      if (src.trim() === '') throw new Error('Paste CSV text or choose a file.');
      const out = (await convert('csv-json', src, { delimiter: str(opts, 'delimiter'), inferTypes: bool(opts, 'inferTypes') }, ctx.signal)) as string;
      return [text(out, { title: 'JSON', filename: 'data.json', mime: 'application/json' })];
    },
  }),

  'json-to-xml': form({
    text: { label: 'JSON', rows: 8, sample: '{"book":{"title":"Dune","year":1965,"tags":["sf","classic"]}}' },
    options: [optText('root', 'Root element name', 'root', { maxLength: 60 })],
    live: true,
    run: async ({ text: t, opts }, ctx) => [text((await convert('json-xml', t, { root: str(opts, 'root') || 'root' }, ctx.signal)) as string, { title: 'XML', filename: 'data.xml', mime: 'application/xml' })],
  }),

  'xml-to-json': form({
    text: { label: 'XML', rows: 8, sample: '<library><book id="1"><title>Dune</title></book><book id="2"><title>Emma</title></book></library>' },
    live: true,
    run: async ({ text: t }, ctx) => [text((await convert('xml-json', t, undefined, ctx.signal)) as string, { title: 'JSON', filename: 'data.json', mime: 'application/json' })],
  }),

  'yaml-to-json': form({
    text: { label: 'YAML', rows: 8, sample: 'name: ALRECT\ntools:\n  - id: yaml-to-json\n    working: true\ncount: 150' },
    live: true,
    run: async ({ text: t }, ctx) => [text((await convert('yaml-json', t, undefined, ctx.signal)) as string, { title: 'JSON', filename: 'data.json', mime: 'application/json' })],
  }),

  'json-to-yaml': form({
    text: { label: 'JSON', rows: 8, sample: '{"name":"ALRECT","tools":[{"id":"json-to-yaml"}],"count":150}' },
    live: true,
    run: async ({ text: t }, ctx) => [text((await convert('json-yaml', t, undefined, ctx.signal)) as string, { title: 'YAML', filename: 'data.yaml', mime: 'application/yaml' })],
  }),

  'unix-timestamp-converter': form({
    text: { label: 'Unix timestamp (seconds or milliseconds) or a date', rows: 2, sample: '1700000000' },
    live: true,
    run({ text: t }) {
      const s = t.trim();
      if (/^-?\d+(\.\d+)?$/u.test(s)) {
        const r = parseUnixTimestamp(s);
        return [kv([['Interpreted as', r.unit], ['ISO 8601 (UTC)', r.iso], ['UTC', r.utc], ['Local time', r.local], ['Relative', r.relative]], 'Timestamp')];
      }
      const r = dateToUnix(s);
      return [kv([['Unix seconds', String(r.seconds)], ['Unix milliseconds', String(r.milliseconds)], ['ISO 8601 (UTC)', r.iso]], 'Date')];
    },
  }),

  'date-format-converter': form({
    text: { label: 'Date (ISO 8601 recommended)', rows: 2, sample: '2026-10-28T12:30:00Z' },
    options: [optSelect('tz', 'Show in', [['UTC', 'UTC'], ['local', 'Your local time zone']])],
    live: true,
    run: ({ text: t, opts }) => [kv(Object.entries(formatDate(t, str(opts, 'tz') === 'local' ? 'local' : 'UTC')), 'Formats'), notice('info', 'Dates without a time zone, such as 2026-10-28, are read as UTC; other forms follow your browser’s parser.')],
  }),

  'binary-converter': form({
    text: { label: 'Input', rows: 4, sample: 'Hi' },
    options: [optSelect('mode', 'Convert', [['text-bin', 'Text → binary (UTF-8)'], ['bin-text', 'Binary → text'], ['int-bin', 'Integer → binary'], ['bin-int', 'Binary → integer']])],
    live: true,
    run({ text: t, opts }) {
      const m = str(opts, 'mode');
      if (m === 'text-bin') return [text(textToBinary(t), { title: 'Binary', filename: 'binary.txt', mime: 'text/plain', wrap: true })];
      if (m === 'bin-text') return [text(binaryToText(t), { title: 'Text', filename: 'text.txt', mime: 'text/plain', wrap: true })];
      if (m === 'int-bin') return [text(convertBase(t.trim(), 10).binary, { title: 'Binary', filename: 'binary.txt', mime: 'text/plain' })];
      const r = convertBase(t.trim(), 2);
      return [kv([['Decimal', r.decimal], ['Hexadecimal', r.hex], ['Octal', r.octal]], 'Integer')];
    },
  }),

  'hexadecimal-converter': form({
    text: { label: 'Input', rows: 4, sample: 'Hello' },
    options: [optSelect('mode', 'Convert', [['text-hex', 'Text → hex (UTF-8)'], ['hex-text', 'Hex → text'], ['int-hex', 'Integer → hex'], ['hex-int', 'Hex → integer']])],
    live: true,
    run({ text: t, opts }) {
      const m = str(opts, 'mode');
      if (m === 'text-hex') return [text(textToHex(t), { title: 'Hex', filename: 'hex.txt', mime: 'text/plain', wrap: true })];
      if (m === 'hex-text') return [text(hexToText(t), { title: 'Text', filename: 'text.txt', mime: 'text/plain', wrap: true })];
      if (m === 'int-hex') return [text(convertBase(t.trim(), 10).hex, { title: 'Hex', filename: 'hex.txt', mime: 'text/plain' })];
      const r = convertBase(t.trim().replace(/^0x/iu, ''), 16);
      return [kv([['Decimal', r.decimal], ['Binary', r.binary], ['Octal', r.octal]], 'Integer')];
    },
  }),

  'decimal-converter': form({
    text: { label: 'Decimal number', rows: 2, sample: '255' },
    live: true,
    run({ text: t }) {
      const s = t.trim();
      const out: Block[] = [];
      if (/^-?\d+$/u.test(s)) {
        const r = convertBase(s.replace(/^-/u, ''), 10);
        const neg = s.startsWith('-') ? '-' : '';
        out.push(kv([['Binary', neg + r.binary], ['Octal', neg + r.octal], ['Hexadecimal', neg + r.hex]], 'Integer bases'));
      }
      if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/u.test(s)) {
        const x = Number(s);
        const f64 = new DataView(new ArrayBuffer(8)); f64.setFloat64(0, x);
        const f32 = new DataView(new ArrayBuffer(4)); f32.setFloat32(0, x);
        const bits = (dv: DataView, n: number) => Array.from({ length: n }, (_, i) => dv.getUint8(i).toString(2).padStart(8, '0')).join('');
        const b64 = bits(f64, 8), b32 = bits(f32, 4);
        out.push(kv([['Value as 64-bit float', String(x)], ['IEEE 754 binary64', `${b64[0]} ${b64.slice(1, 12)} ${b64.slice(12)}`], ['IEEE 754 binary32', `${b32[0]} ${b32.slice(1, 9)} ${b32.slice(9)}`], ['Float32 rounds to', String(f32.getFloat32(0))]], 'Floating point'));
      }
      if (out.length === 0) throw new Error('Enter a decimal number such as 255, -12 or 0.1.');
      return out;
    },
  }),

  'url-encoder-decoder': textTool({
    label: 'Text or URL',
    sample: 'name=Ada Lovelace&city=São Paulo',
    output: { filename: 'url.txt', mime: 'text/plain' },
    options: [modeOpt, optSelect('scope', 'Encode as', [['component', 'URL component (encodes / ? & =)'], ['full', 'Whole URL (keeps / ? & =)']]), optCheck('plus', 'When decoding, treat + as a space')],
    run: (t, o) => (str(o, 'mode') === 'encode' ? urlEncode(t, str(o, 'scope') === 'full' ? 'full' : 'component') : urlDecode(t, bool(o, 'plus'))),
  }),

  'html-entity-encoder-decoder': textTool({
    label: 'Text',
    sample: '<a href="x">Tom & "Jerry" ©</a>',
    output: { filename: 'entities.txt', mime: 'text/plain' },
    options: [modeOpt, optCheck('nonAscii', 'When encoding, also escape non-ASCII characters')],
    run: (t, o) => (str(o, 'mode') === 'encode' ? htmlEncode(t, { nonAscii: bool(o, 'nonAscii') }) : htmlDecode(t)),
  }),

  'base64-encoder-decoder': form({
    text: { label: 'Text', rows: 6, sample: 'Hello, ALRECT! ✓', optional: true },
    files: { label: 'Or choose a file to encode', optional: true },
    options: [modeOpt, optCheck('urlsafe', 'URL-safe alphabet (- and _ , no padding)')],
    live: false,
    async run({ text: t, files, opts }) {
      const enc = str(opts, 'mode') === 'encode';
      if (enc && files[0]) {
        const f = oneFile(files);
        const out = bytesToBase64(await readBytes(f, 64 * 1024 * 1024));
        const s = bool(opts, 'urlsafe') ? out.replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '') : out;
        return [notice('info', `${f.name}: ${formatBytes(f.size)} → ${s.length.toLocaleString('en-US')} characters.`), text(s, { title: 'Base64', filename: `${f.name}.b64.txt`, mime: 'text/plain', wrap: true })];
      }
      if (t === '') throw new Error('Enter text or choose a file.');
      if (enc) return [text(encodeBase64(t, bool(opts, 'urlsafe')), { title: 'Base64', filename: 'encoded.txt', mime: 'text/plain', wrap: true })];
      const bytes = base64ToBytes(t);
      const rep = validateUtf8(bytes);
      const out: Block[] = [];
      if (rep.valid) out.push(text(decodeBase64(t), { title: 'Decoded text', filename: 'decoded.txt', mime: 'text/plain', wrap: true }));
      else out.push(notice('warn', `The decoded data (${formatBytes(bytes.length)}) is not valid UTF-8 text, so it is probably binary. Download it as a file.`));
      out.push({ type: 'download', label: 'Download decoded bytes', filename: 'decoded.bin', mime: 'application/octet-stream', data: bytes });
      return out;
    },
  }),

  'unicode-inspector': form({
    text: { label: 'Text', rows: 4, sample: 'Aé😀​' },
    live: true,
    run({ text: t }) {
      if (t === '') return [notice('info', 'Enter some text.')];
      const info = inspectUnicode(t, 2000);
      const total = Array.from(t).length;
      return [
        ...(total > info.length ? [notice('warn', `Showing the first ${info.length} of ${total} code points.`)] : []),
        table(['Char', 'Code point', 'UTF-8', 'UTF-16', 'Category'], info.map((c) => [/\p{Cc}|\p{Cf}/u.test(c.char) ? '·' : c.char, c.codePoint, c.utf8, c.utf16, c.category]), { title: 'Code points' }),
      ];
    },
  }),
};

