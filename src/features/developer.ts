import { form, kv, notice, optCheck, optNum, optSelect, optText, table, text, textTool, readText, str, bool, num, needFiles } from './kit';
import type { Block, ImplMap } from './types';
import { validateJson } from '../lib/data';
import { parseXmlStrict } from '../lib/data';
import { formatCss, minifyCss, formatJsBasic, minifyJsConservative, formatHtml, minifyHtml, parseUrl, decodeJwt, parseColor, contrastRatio, parseHttpHeaders, languageForExt, countSourceLines } from '../lib/devtools';
import { generateUuidV4, generateUuidV7 } from '../lib/security';
import { runRegex } from '../workers/regex';
import { assertSafeRegex } from '../lib/text';
import { extensionOf } from '../lib/sniff';

const HEADER_SAMPLE = 'HTTP/1.1 200 OK\nContent-Type: text/html\nServer: Apache/2.4.1\nX-Powered-By: PHP/5.6\nSet-Cookie: sid=abc123\nSet-Cookie: pref=1; Secure; HttpOnly; SameSite=Lax';

export const IMPL: ImplMap = {
  'json-validator': form({
    text: { label: 'JSON', rows: 8, sample: '{"a": 1, "b": [true, null]}', optional: true },
    files: { label: 'Or choose a JSON file', accept: '.json,application/json,.txt', optional: true },
    live: true,
    async run({ text: t, files }) {
      const src = files[0] ? await readText(files[0]) : t;
      const r = validateJson(src);
      if (!r.valid) return [notice('error', r.message)];
      return [notice('success', 'Valid JSON.'), kv([['Top-level type', r.type ?? ''], ['Keys / items at top level', String(r.keys ?? 0)], ['Maximum nesting depth', String(r.depth ?? 0)]])];
    },
  }),

  'xml-validator': form({
    text: { label: 'XML', rows: 8, sample: '<?xml version="1.0"?>\n<root><item id="1"/></root>', optional: true },
    files: { label: 'Or choose an XML file', accept: '.xml,.svg,.xhtml,.rss,.atom,text/xml,application/xml', optional: true },
    live: true,
    async run({ text: t, files }) {
      const src = files[0] ? await readText(files[0]) : t;
      parseXmlStrict(src);
      return [notice('success', 'The XML is well-formed. (No schema or DTD validation is performed; DTDs are rejected on purpose.)')];
    },
  }),

  'html-formatter': textTool({ label: 'HTML', sample: '<div><p>Hello <b>world</b></p><ul><li>a</li><li>b</li></ul><pre>  keep\n  this</pre></div>', output: { filename: 'formatted.html', mime: 'text/html' }, options: [optNum('indent', 'Indent (spaces)', 2, { min: 1, max: 8, step: 1 })], run: (t, o) => formatHtml(t, Math.max(1, Math.min(8, num(o, 'indent')))) }),
  'css-formatter': textTool({ label: 'CSS', sample: 'a{color:red;background:url(a;b.png)}@media(min-width:600px){.x{margin:0 auto}}', output: { filename: 'formatted.css', mime: 'text/css' }, options: [optNum('indent', 'Indent (spaces)', 2, { min: 1, max: 8, step: 1 })], run: (t, o) => formatCss(t, Math.max(1, Math.min(8, num(o, 'indent')))) }),
  'javascript-formatter': textTool({ label: 'JavaScript (never executed)', sample: 'function f(a,b){if(a){return "}"}else{return `x${b}`}}', output: { filename: 'formatted.js', mime: 'text/javascript' }, options: [optNum('indent', 'Indent (spaces)', 2, { min: 1, max: 8, step: 1 })], run: (t, o) => ({ output: formatJsBasic(t, Math.max(1, Math.min(8, num(o, 'indent')))), notes: [notice('info', 'Brace-based re-indentation. It does not parse JavaScript, so unusual syntax (regex literals containing quotes, ASI-dependent code) may indent imperfectly. The output is never run.')] }) }),
  'css-minifier': textTool({ label: 'CSS', sample: '/* c */\na {\n  color: red;\n  margin: 0 auto;\n}\n/*! keep */', output: { filename: 'min.css', mime: 'text/css' }, run: (t) => { const o = minifyCss(t); return { output: o, notes: [notice('info', `${t.length} → ${o.length} characters.`)] }; } }),
  'javascript-minifier': textTool({ label: 'JavaScript (never executed)', sample: '// comment\nfunction add(a, b) {\n  /* sum */\n  return a + b;\n}', output: { filename: 'min.js', mime: 'text/javascript' }, run: (t) => { const o = minifyJsConservative(t); return { output: o, notes: [notice('warn', 'Conservative: removes comments and unnecessary whitespace only. No renaming or tree-shaking, and it does not parse JavaScript. Test the result before shipping.'), notice('info', `${t.length} → ${o.length} characters.`)] }; } }),
  'html-minifier': textTool({ label: 'HTML', sample: '<div>\n  <!-- c -->\n  <p>  Hello   <b>world</b>  </p>\n  <pre>  keep  </pre>\n</div>', output: { filename: 'min.html', mime: 'text/html' }, run: (t) => { const o = minifyHtml(t); return { output: o, notes: [notice('info', `${t.length} → ${o.length} characters.`)] }; } }),

  'url-parser': form({
    text: { label: 'URL', rows: 2, sample: 'https://user:pw@example.com:8443/a/b%20c?x=1&y=two&x=3#frag' },
    live: true,
    run({ text: t }) {
      const u = parseUrl(t);
      return [kv([['Protocol', u.protocol], ['Username', u.username || '—'], ['Password', u.password ? '(present)' : '—'], ['Host', u.host], ['Hostname', u.hostname], ['Port', u.port || '(default)'], ['Path', u.pathname], ['Query', u.search || '—'], ['Fragment', u.hash || '—'], ['Origin', u.origin]], 'Parts'), ...(u.params.length ? [table(['Parameter', 'Value'], u.params.map(([k, v]) => [k, v]), { title: 'Query parameters' })] : []), ...u.warnings.map((w) => notice('warn', w))];
    },
  }),

  'regex-tester': form({
    text: { label: 'Test text', rows: 6, sample: 'Order #123 shipped to ada@example.com on 2026-10-28.\nOrder #456 pending.' },
    options: [optText('pattern', 'Pattern (JavaScript syntax, without slashes)', '#(\\d+)', { maxLength: 500 }), optCheck('g', 'Global (g)', true), optCheck('i', 'Ignore case (i)'), optCheck('m', 'Multiline (m)'), optCheck('s', 'Dot matches newline (s)'), optCheck('u', 'Unicode (u)'), optText('replacement', 'Replacement (optional, supports $1 and $<name>)', '', { maxLength: 500 })],
    live: false,
    runLabel: 'Test',
    async run({ text: t, opts }) {
      const pattern = str(opts, 'pattern');
      if (pattern === '') throw new Error('Enter a pattern.');
      const flags = ['g', 'i', 'm', 's', 'u'].filter((f) => bool(opts, f)).join('');
      try { new RegExp(pattern, flags); } catch (e) { throw new Error(`Invalid pattern: ${(e as Error).message}`); }
      const warn: Block[] = [];
      try { assertSafeRegex(pattern); } catch (e) { warn.push(notice('warn', (e as Error).message + ' It will still run, in a worker that is stopped after 2 seconds.')); }
      const r = await runRegex({ pattern, flags, text: t, replacement: str(opts, 'replacement'), maxMatches: 1000 });
      if (!r.ok) throw new Error(r.error);
      const d = r.data;
      const out: Block[] = [...warn, notice(d.matches.length ? 'success' : 'info', `${d.matches.length}${d.truncated ? '+' : ''} match${d.matches.length === 1 ? '' : 'es'} in ${d.ms.toFixed(1)} ms.`)];
      if (d.matches.length) out.push(table(['#', 'Index', 'Match', 'Groups'], d.matches.slice(0, 500).map((m, i) => [String(i + 1), String(m.index), m.text, [...m.groups.map((g, j) => `$${j + 1}=${g ?? '∅'}`), ...Object.entries(m.named).map(([k, v]) => `${k}=${v ?? '∅'}`)].join('  ')])));
      if (d.replaced !== null) out.push(text(d.replaced, { title: 'After replacement', filename: 'replaced.txt', mime: 'text/plain', wrap: true }));
      return out;
    },
  }),

  'uuid-generator': form({
    options: [optSelect('ver', 'Version', [['v4', 'v4 (random)'], ['v7', 'v7 (time-ordered)']]), optNum('count', 'How many', 5, { min: 1, max: 1000, step: 1 }), optSelect('fmt', 'Format', [['plain', 'lowercase with hyphens'], ['upper', 'UPPERCASE'], ['nodash', 'no hyphens'], ['braces', '{braces}']])],
    live: false,
    runLabel: 'Generate',
    run({ opts }) {
      const n = Math.max(1, Math.min(1000, Math.floor(num(opts, 'count'))));
      const f = str(opts, 'fmt');
      const items = Array.from({ length: n }, () => { const u = str(opts, 'ver') === 'v7' ? generateUuidV7() : generateUuidV4(); return f === 'upper' ? u.toUpperCase() : f === 'nodash' ? u.replace(/-/gu, '') : f === 'braces' ? `{${u}}` : u; });
      return [text(items.join('\n'), { title: `${n} UUID${n === 1 ? '' : 's'}`, filename: 'uuids.txt', mime: 'text/plain' })];
    },
  }),

  'jwt-decoder': form({
    text: { label: 'JWT (decoded locally; the signature is not verified)', rows: 4, sample: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSIsImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxNTE2MjQyNjIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
    live: true,
    run({ text: t }) {
      const j = decodeJwt(t);
      return [...j.warnings.map((w, i) => notice(i === 0 ? 'warn' : 'info', w)), text(JSON.stringify(j.header, null, 2), { title: 'Header', filename: 'jwt-header.json', mime: 'application/json' }), text(JSON.stringify(j.payload, null, 2), { title: 'Payload', filename: 'jwt-payload.json', mime: 'application/json' }), kv([['Signature present', j.signaturePresent ? `yes (${j.signatureBytes} bytes)` : 'no'], ['Claims', j.claims.join(', ') || '—']])];
    },
  }),

  'http-header-inspector': form({
    text: { label: 'Raw HTTP headers', rows: 8, sample: HEADER_SAMPLE },
    live: true,
    run({ text: t }) {
      const r = parseHttpHeaders(t);
      return [table(['Header', 'Value'], r.headers.map((h) => [h.name, h.value]), { title: `${r.headers.length} headers` }), ...r.duplicates.map((d) => notice('info', `Header sent more than once: ${d}`)), ...(r.notes.length ? [{ type: 'list', title: 'Observations', items: r.notes } as Block] : [])];
    },
  }),

  'color-converter': form({
    text: { label: 'Colour (HEX, rgb() or hsl())', rows: 1, sample: '#59D8FF' },
    live: true,
    run({ text: t }) {
      const c = parseColor(t);
      const w = parseColor('#ffffff'), k = parseColor('#000000');
      const cw = contrastRatio(c, w), ck = contrastRatio(c, k);
      const verdict = (r: number) => `${r.toFixed(2)}:1 (${r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large text only' : 'fails'})`;
      return [{ type: 'swatches', title: 'Preview', colors: [c.hex] }, kv([['HEX', c.hex], ['RGB', c.rgb], ['HSL', c.hsl], ['Contrast against white', verdict(cw)], ['Contrast against black', verdict(ck)]], 'Values')];
    },
  }),

  'source-code-line-counter': form({
    files: { label: 'Source files', multiple: true, maxFiles: 500 },
    live: false,
    runLabel: 'Count',
    async run({ files }) {
      needFiles(files, 1, 'source files');
      const per = new Map<string, { files: number; total: number; code: number; comment: number; blank: number }>();
      const rows: string[][] = [];
      for (const f of files) {
        if (f.size > 20 * 1024 * 1024) { rows.push([f.name, '—', 'skipped (over 20 MiB)', '', '', '']); continue; }
        const src = await readText(f);
        const lang = languageForExt(extensionOf(f.name));
        const c = countSourceLines(src, lang);
        rows.push([f.name, lang, String(c.total), String(c.code), String(c.comment), String(c.blank)]);
        const p = per.get(lang) ?? { files: 0, total: 0, code: 0, comment: 0, blank: 0 };
        p.files++; p.total += c.total; p.code += c.code; p.comment += c.comment; p.blank += c.blank; per.set(lang, p);
      }
      const sum = [...per.values()].reduce((a, p) => ({ total: a.total + p.total, code: a.code + p.code, comment: a.comment + p.comment, blank: a.blank + p.blank }), { total: 0, code: 0, comment: 0, blank: 0 });
      return [kv([['Files', String(files.length)], ['Total lines', String(sum.total)], ['Code', String(sum.code)], ['Comments', String(sum.comment)], ['Blank', String(sum.blank)]], 'Totals'), table(['Language', 'Files', 'Total', 'Code', 'Comment', 'Blank'], [...per.entries()].map(([l, p]) => [l, String(p.files), String(p.total), String(p.code), String(p.comment), String(p.blank)]), { title: 'By language' }), table(['File', 'Language', 'Total', 'Code', 'Comment', 'Blank'], rows, { title: 'By file' })];
    },
  }),
};
