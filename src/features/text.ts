import { marked } from 'marked';
import { custom, form, kv, notice, optCheck, optSelect, table, text, textTool, readText, str, bool, optNum } from './kit';
import type { Block, ImplMap } from './types';
import { cleanWhitespace, convertCase, diffLines, diffSummary, textStats, toUnifiedDiff, countGraphemes, type CaseMode } from '../lib/text';
import { formatCsv, formatJson, formatXml, parseCsv, validateJson, parseJson } from '../lib/data';
import { sanitizeHtml } from '../components/SafeHtml';
import { htmlToText } from '../lib/htmltext';
import { DELIMITERS } from './kit';

const WPM = 200;

function topWords(t: string, n = 15): [string, number][] {
  const m = new Map<string, number>();
  for (const w of t.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) m.set(w, (m.get(w) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

export function mdToHtml(src: string): string {
  const raw = marked.parse(src, { async: false, gfm: true, breaks: false }) as string;
  return sanitizeHtml(raw);
}

export const IMPL: ImplMap = {
  'text-editor': custom(() => import('./custom/TextEditor')),

  'text-diff-checker': form({
    text: { label: 'Original text', rows: 8, sample: 'alpha\nbeta\ngamma', optional: true },
    text2: { label: 'Changed text', rows: 8, sample: 'alpha\nbeta changed\ngamma\ndelta' },
    live: true,
    run({ text: a, text2: b }) {
      const ops = diffLines(a, b);
      const s = diffSummary(ops);
      const same = s.added === 0 && s.removed === 0;
      return [
        notice(same ? 'success' : 'info', same ? 'The two texts are identical.' : `${s.added} line(s) added, ${s.removed} removed, ${s.unchanged} unchanged.`),
        ...(same ? [] : [{ type: 'diff', ops } as Block, text(toUnifiedDiff(ops), { title: 'Unified diff', filename: 'changes.diff', mime: 'text/x-diff' })]),
      ];
    },
  }),

  'word-counter': form({
    text: { label: 'Text', rows: 10, sample: 'The quick brown fox jumps over the lazy dog. The dog sleeps.' },
    live: true,
    run({ text: t }) {
      const s = textStats(t);
      const sentences = (t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/gu) ?? []).filter((x) => x.trim() !== '').length;
      const words = t.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
      const mins = s.words / WPM;
      return [
        kv([
          ['Words', String(s.words)], ['Unique words', String(new Set(words).size)], ['Sentences', String(sentences)],
          ['Paragraphs', String(t.split(/\n\s*\n/u).filter((p) => p.trim()).length)],
          ['Reading time', s.words === 0 ? '0 sec' : mins < 1 ? `${Math.max(1, Math.round(mins * 60))} sec` : `${Math.ceil(mins)} min (at ${WPM} words/min)`],
        ], 'Counts'),
        table(['Word', 'Count'], topWords(t).map(([w, c]) => [w, String(c)]), { title: 'Most frequent words' }),
      ];
    },
  }),

  'character-counter': form({
    text: { label: 'Text', rows: 10, sample: 'Héllo wörld 👋🏽 — naïve café' },
    live: true,
    run({ text: t }) {
      const s = textStats(t);
      const cps = Array.from(t).length;
      const enc = new TextEncoder().encode(t).length;
      return [kv([
        ['Characters (user-perceived)', String(s.characters)], ['Characters without whitespace', String(s.charactersNoSpaces)],
        ['Unicode code points', String(cps)], ['UTF-16 code units (JavaScript length)', String(t.length)], ['UTF-8 bytes', String(enc)],
        ['Letters', String((t.match(/\p{L}/gu) ?? []).length)], ['Digits', String((t.match(/\p{Nd}/gu) ?? []).length)],
        ['Whitespace', String((t.match(/\s/gu) ?? []).length)], ['Punctuation', String((t.match(/\p{P}/gu) ?? []).length)],
      ], 'Counts')];
    },
  }),

  'line-counter': form({
    text: { label: 'Text', rows: 10, sample: 'first line\n\nthird line is longer\nfourth' },
    live: true,
    run({ text: t }) {
      if (t === '') return [notice('info', 'No text.')];
      const lines = t.split(/\r\n|\r|\n/u);
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      let longest = 0, at = 0, total = 0;
      lines.forEach((l, i) => { const n = countGraphemes(l); total += n; if (n > longest) { longest = n; at = i + 1; } });
      const blank = lines.filter((l) => l.trim() === '').length;
      const buckets = [[0, 0], [1, 20], [21, 40], [41, 80], [81, 120], [121, Infinity]] as const;
      const rows = buckets.map(([lo, hi]) => [hi === Infinity ? `${lo}+` : lo === hi ? '0 (empty)' : `${lo}–${hi}`, String(lines.filter((l) => { const n = countGraphemes(l); return n >= lo && n <= hi; }).length)]);
      return [kv([['Lines', String(lines.length)], ['Blank lines', String(blank)], ['Non-blank lines', String(lines.length - blank)], ['Longest line', `${longest} characters (line ${at})`], ['Average length', (total / lines.length).toFixed(1) + ' characters']], 'Counts'), table(['Line length', 'Lines'], rows, { title: 'Distribution' })];
    },
  }),

  'whitespace-cleaner': textTool({
    label: 'Text',
    sample: '  too   many    spaces  \n\n\n\nand​ zero-width\ttabs  ',
    output: { filename: 'cleaned.txt', mime: 'text/plain' },
    options: [
      optCheck('trimLines', 'Trim each line', true), optCheck('collapseSpaces', 'Collapse repeated spaces', true), optCheck('collapseBlankLines', 'Collapse multiple blank lines into one', true),
      optCheck('removeBlankLines', 'Remove all blank lines'), optCheck('normalizeLineEndings', 'Normalise line endings to LF', true), optCheck('stripZeroWidth', 'Remove zero-width characters', true), optCheck('tabsToSpaces', 'Convert tabs to two spaces'),
    ],
    run: (t, o) => {
      const out = cleanWhitespace(t, { trimLines: bool(o, 'trimLines'), collapseSpaces: bool(o, 'collapseSpaces'), removeBlankLines: bool(o, 'removeBlankLines'), collapseBlankLines: bool(o, 'collapseBlankLines'), normalizeLineEndings: bool(o, 'normalizeLineEndings'), stripZeroWidth: bool(o, 'stripZeroWidth'), tabsToSpaces: bool(o, 'tabsToSpaces') });
      return { output: out, notes: [notice('info', `${t.length.toLocaleString('en-US')} → ${out.length.toLocaleString('en-US')} characters.`)] };
    },
  }),

  'text-case-converter': textTool({
    label: 'Text',
    sample: 'hello wORLD from alrect file tools',
    output: { filename: 'converted.txt', mime: 'text/plain' },
    options: [optSelect('mode', 'Convert to', [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['sentence', 'Sentence case'], ['camel', 'camelCase'], ['pascal', 'PascalCase'], ['snake', 'snake_case'], ['kebab', 'kebab-case'], ['constant', 'CONSTANT_CASE']])],
    run: (t, o) => convertCase(t, str(o, 'mode') as CaseMode),
  }),

  'markdown-previewer': form({
    text: { label: 'Markdown', rows: 12, sample: '# Hello\n\nThis is **Markdown** with a [link](https://example.com) and `code`.\n\n- item one\n- item two\n\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>' },
    live: true,
    run: ({ text: t }) => [notice('info', 'Preview is sanitised: scripts, event handlers, forms, styles, frames and remote images are removed.'), { type: 'html', title: 'Preview', html: mdToHtml(t) }],
  }),

  'markdown-to-html-converter': form({
    text: { label: 'Markdown', rows: 12, sample: '# Title\n\nSome *emphasis* and a list:\n\n1. one\n2. two' },
    options: [optCheck('wrap', 'Wrap in a complete HTML document', false)],
    live: true,
    run({ text: t, opts }) {
      const body = mdToHtml(t);
      const doc = bool(opts, 'wrap') ? `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Document</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n` : body;
      return [notice('info', 'Output is sanitised with DOMPurify. If you need raw HTML passed through, this is the wrong tool.'), text(doc, { title: 'HTML source', filename: 'output.html', mime: 'text/html' })];
    },
  }),

  'html-to-plain-text-converter': form({
    text: { label: 'HTML', rows: 10, sample: '<h1>Title</h1><p>Hello <b>world</b> and <a href="https://example.com">a link</a>.</p><ul><li>one</li><li>two</li></ul><script>alert(1)</script>' },
    options: [optCheck('links', 'Append link targets in parentheses', true)],
    live: true,
    run: ({ text: t, opts }) => [text(htmlToText(t, { links: bool(opts, 'links') }), { title: 'Plain text', filename: 'output.txt', mime: 'text/plain', wrap: true })],
  }),

  'csv-viewer': form({
    text: { label: 'CSV text', rows: 8, sample: 'name,age,city\nAda,36,London\n"Smith, J",41,"New York"', optional: true },
    files: { label: 'Or choose a CSV file', accept: '.csv,.tsv,.txt,text/csv', optional: true },
    options: [optSelect('delimiter', 'Delimiter', DELIMITERS), optCheck('header', 'First row is a header', true)],
    live: false,
    async run({ text: t, files, opts }) {
      const src = files[0] ? await readText(files[0]) : t;
      if (src.trim() === '') throw new Error('Paste CSV text or choose a file.');
      const rows = parseCsv(src, { delimiter: str(opts, 'delimiter') });
      const widths = new Set(rows.map((r) => r.length));
      const hdr = bool(opts, 'header');
      const head = hdr ? (rows[0] ?? []) : Array.from({ length: Math.max(...rows.map((r) => r.length)) }, (_, i) => `Column ${i + 1}`);
      const body = hdr ? rows.slice(1) : rows;
      const out: Block[] = [kv([['Rows', String(body.length)], ['Columns', String(head.length)]])];
      if (widths.size > 1) out.push(notice('warn', `Rows have different numbers of fields (${[...widths].sort((a, b) => a - b).join(', ')}). Short rows are shown with empty cells.`));
      out.push(table(head, body.map((r) => head.map((_, i) => r[i] ?? '')), { title: 'Table' }));
      return out;
    },
  }),

  'csv-formatter': form({
    text: { label: 'CSV', rows: 8, sample: 'a,b,c\n1,"two, 2"\n3,4,5,6' },
    options: [optSelect('delimiter', 'Delimiter', DELIMITERS), optCheck('formulaGuard', 'Neutralise cells that start with = + - @ (spreadsheet formula injection)', false, 'Off by default so your data is not altered. Turn on before opening untrusted CSV in a spreadsheet.')],
    live: true,
    run: ({ text: t, opts }) => [text(formatCsv(t, { delimiter: str(opts, 'delimiter'), formulaGuard: bool(opts, 'formulaGuard') }), { title: 'Formatted CSV', filename: 'formatted.csv', mime: 'text/csv' })],
  }),

  'json-viewer': custom(() => import('./custom/JsonViewer')),

  'json-formatter': form({
    text: { label: 'JSON', rows: 10, sample: '{"b":2,"a":[1,2,{"c":null}],"name":"ALRECT"}' },
    files: { label: 'Or choose a JSON file', accept: '.json,application/json,.txt', optional: true },
    options: [optSelect('mode', 'Mode', [['pretty', 'Pretty-print'], ['minify', 'Minify']]), optSelect('indent', 'Indent', [['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tab']]), optCheck('sort', 'Sort keys alphabetically')],
    live: true,
    async run({ text: t, files, opts }) {
      const src = files[0] ? await readText(files[0]) : t;
      const v = validateJson(src);
      if (!v.valid) throw new Error(v.message);
      const out = str(opts, 'mode') === 'minify' ? JSON.stringify(bool(opts, 'sort') ? parseJson(formatJson(src, 0, true)) : parseJson(src)) : formatJson(src, str(opts, 'indent') === 'tab' ? 'tab' : Number(str(opts, 'indent')), bool(opts, 'sort'));
      return [notice('success', `Valid JSON (${v.type}, depth ${v.depth}).`), text(out, { title: 'Result', filename: 'formatted.json', mime: 'application/json' })];
    },
  }),

  'xml-formatter': textTool({
    label: 'XML',
    sample: '<root><item id="1">One</item><item id="2"><child/></item></root>',
    output: { filename: 'formatted.xml', mime: 'application/xml' },
    options: [optNum('indent', 'Indent (spaces)', 2, { min: 0, max: 8, step: 1 })],
    run: (t, o) => formatXml(t, Math.max(0, Math.min(8, Number(o['indent']) || 0))),
  }),
};

