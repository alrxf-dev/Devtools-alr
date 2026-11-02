/** Data conversion helpers: CSV (RFC 4180), JSON, XML, YAML. No eval, no dynamic code. */
import YAML from 'yaml';
import { xml2js, js2xml } from 'xml-js';

export const MAX_TEXT_CHARS = 20_000_000;

function guardSize(text: string): void {
  if (text.length > MAX_TEXT_CHARS) throw new Error(`Input is larger than ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
}

// ---------- CSV ----------

export interface CsvOptions {
  delimiter?: string;
  /** Prefix cells that start with = + - @ so spreadsheets do not run them as formulas. Default true. */
  formulaGuard?: boolean;
}

/** RFC 4180 parser. Handles quoted fields, escaped quotes, embedded delimiters and newlines, CRLF/LF/CR. */
export function parseCsv(text: string, opts: CsvOptions = {}): string[][] {
  guardSize(text);
  const d = opts.delimiter ?? ',';
  if (d.length !== 1) throw new Error('The delimiter must be exactly one character.');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;
  let fieldStarted = false;
  while (i < n) {
    const c = src[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      i++;
    } else if (c === d) {
      row.push(field);
      field = '';
      fieldStarted = false;
      i++;
    } else if (c === '\n' || c === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStarted = false;
      if (c === '\r' && src[i + 1] === '\n') i++;
      i++;
    } else {
      field += c;
      fieldStarted = true;
      i++;
    }
  }
  if (inQuotes) throw new Error('Unterminated quoted field: a double quote was opened but never closed.');
  if (field !== '' || row.length > 0 || fieldStarted) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function stringifyCsv(rows: unknown[][], opts: CsvOptions & { crlf?: boolean; bom?: boolean } = {}): string {
  const d = opts.delimiter ?? ',';
  const nl = opts.crlf ? '\r\n' : '\n';
  const esc = (v: unknown): string => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Neutralise spreadsheet formula injection when opened in Excel/Sheets.
    if (opts.formulaGuard !== false && /^[=+\-@\t\r]/u.test(s) && typeof v === 'string' && !/^-?\d+(\.\d+)?$/u.test(s)) s = "'" + s;
    return s.includes(d) || s.includes('"') || s.includes('\n') || s.includes('\r') ? `"${s.replace(/"/gu, '""')}"` : s;
  };
  return (opts.bom ? '﻿' : '') + rows.map((r) => r.map(esc).join(d)).join(nl);
}

export function csvToObjects(text: string, opts: CsvOptions = {}): Record<string, string>[] {
  const rows = parseCsv(text, opts);
  if (rows.length === 0) return [];
  const header = (rows[0] as string[]).map((h, i) => (h.trim() === '' ? `column_${i + 1}` : h.trim()));
  const dup = header.find((h, i) => header.indexOf(h) !== i);
  if (dup) throw new Error(`Duplicate column name "${dup}" in the header row.`);
  return rows.slice(1).map((r, idx) => {
    if (r.length === 1 && r[0] === '') return null;
    if (r.length > header.length) throw new Error(`Row ${idx + 2} has ${r.length} fields but the header has ${header.length}.`);
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = r[i] ?? ''));
    return o;
  }).filter((x): x is Record<string, string> => x !== null);
}

export function csvToJson(text: string, opts: CsvOptions & { inferTypes?: boolean; pretty?: boolean } = {}): string {
  let objs: Record<string, unknown>[] = csvToObjects(text, opts);
  if (opts.inferTypes) {
    objs = objs.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, inferScalar(v as string)])));
  }
  return JSON.stringify(objs, null, opts.pretty === false ? 0 : 2);
}

function inferScalar(v: string): unknown {
  if (v === '') return '';
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/u.test(v) && Number.isSafeInteger(Number(v)) || /^-?\d+\.\d+$/u.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  return v;
}

function flatten(value: unknown, prefix: string, out: Record<string, unknown>, depth = 0): void {
  if (depth > 20) throw new Error('JSON is nested more than 20 levels deep.');
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
    return;
  }
  out[prefix || 'value'] = value;
}

export function jsonToCsv(text: string, opts: CsvOptions = {}): string {
  guardSize(text);
  const data = parseJson(text);
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return '';
  const flat = arr.map((item) => {
    const o: Record<string, unknown> = {};
    flatten(item, '', o);
    return o;
  });
  const cols: string[] = [];
  for (const o of flat) for (const k of Object.keys(o)) if (!cols.includes(k)) cols.push(k);
  const rows: unknown[][] = [cols, ...flat.map((o) => cols.map((c) => o[c]))];
  return stringifyCsv(rows, opts);
}

export function convertCsvDelimiter(text: string, from: string, to: string, opts: { formulaGuard?: boolean } = {}): string {
  return stringifyCsv(parseCsv(text, { delimiter: from }), { delimiter: to, ...opts });
}

export function formatCsv(text: string, opts: CsvOptions & { alignColumns?: boolean } = {}): string {
  const rows = parseCsv(text, opts);
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array<string>(width - r.length).fill('')]);
  return stringifyCsv(padded, opts);
}

// ---------- JSON ----------

export function parseJson(text: string): unknown {
  guardSize(text);
  if (text.trim() === '') throw new Error('Input is empty.');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(describeJsonError(text, e as Error));
  }
}

/** Turn engine-specific JSON.parse messages into line/column locations where possible. */
export function describeJsonError(text: string, err: Error): string {
  const m = /position (\d+)/iu.exec(err.message);
  if (m) {
    const pos = Number(m[1]);
    const before = text.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    return `Invalid JSON at line ${line}, column ${col}: ${err.message.replace(/ in JSON at position \d+.*$/u, '')}`;
  }
  const lc = /line (\d+) column (\d+)/iu.exec(err.message);
  if (lc) return `Invalid JSON at line ${lc[1]}, column ${lc[2]}.`;
  return `Invalid JSON: ${err.message}`;
}

export function formatJson(text: string, indent: number | 'tab' = 2, sortKeys = false): string {
  const v = parseJson(text);
  const ind = indent === 'tab' ? '\t' : indent;
  return JSON.stringify(sortKeys ? sortDeep(v) : v, null, ind);
}

export function minifyJson(text: string): string {
  return JSON.stringify(parseJson(text));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]));
  }
  return v;
}

export interface JsonValidation {
  valid: boolean;
  message: string;
  type?: string;
  keys?: number;
  depth?: number;
}

export function validateJson(text: string): JsonValidation {
  try {
    const v = parseJson(text);
    return { valid: true, message: 'Valid JSON.', type: Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v, keys: v && typeof v === 'object' ? Object.keys(v).length : 0, depth: jsonDepth(v) };
  } catch (e) {
    return { valid: false, message: (e as Error).message };
  }
}

function jsonDepth(v: unknown): number {
  if (v === null || typeof v !== 'object') return 0;
  let max = 0;
  for (const c of Object.values(v as object)) max = Math.max(max, jsonDepth(c));
  return max + 1;
}

// ---------- NDJSON ----------

export function formatNdjson(text: string, mode: 'pretty' | 'compact' = 'compact'): string {
  const out: string[] = [];
  text.split(/\r?\n/u).forEach((line, i) => {
    if (line.trim() === '') return;
    try {
      out.push(JSON.stringify(JSON.parse(line), null, mode === 'pretty' ? 2 : 0));
    } catch (e) {
      throw new Error(`Line ${i + 1} is not valid JSON: ${(e as Error).message}`);
    }
  });
  return out.join(mode === 'pretty' ? '\n\n' : '\n');
}

// ---------- XML ----------

export function parseXmlStrict(text: string): void {
  guardSize(text);
  if (text.trim() === '') throw new Error('Input is empty.');
  if (/<!DOCTYPE[^>]*\[/iu.test(text) || /<!ENTITY/iu.test(text)) {
    throw new Error('DTD entity declarations are rejected to avoid entity-expansion attacks.');
  }
  // A small well-formedness checker (tag balance, attribute quoting) that works without a DOM.
  const stack: string[] = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<|>/gu;
  let m: RegExpExecArray | null;
  let rootClosed = false;
  let roots = 0;
  const lineOf = (idx: number) => text.slice(0, idx).split('\n').length;
  while ((m = re.exec(text))) {
    const tok = m[0];
    if (tok === '<' || tok === '>') {
      if (tok === '<') throw new Error(`Malformed markup near line ${lineOf(m.index)}: unexpected "<".`);
      continue; // stray ">" inside text is tolerated by the XML spec
    }
    if (m[1]) {
      const top = stack.pop();
      if (top !== m[1]) throw new Error(`Mismatched closing tag </${m[1]}> at line ${lineOf(m.index)}${top ? `; expected </${top}>` : ''}.`);
      if (stack.length === 0) rootClosed = true;
    } else if (m[2]) {
      if (stack.length === 0) {
        if (rootClosed) throw new Error(`Multiple root elements: <${m[2]}> at line ${lineOf(m.index)}.`);
        roots++;
      }
      if (!m[4]) stack.push(m[2]);
      else if (stack.length === 0) rootClosed = true;
    }
  }
  if (stack.length > 0) throw new Error(`Unclosed tag <${stack[stack.length - 1]}>.`);
  if (roots === 0 && !rootClosed) throw new Error('No root element found.');
}

export function xmlToJson(text: string): string {
  parseXmlStrict(text);
  const obj = xml2js(text, { compact: true, trim: true, nativeType: false, alwaysArray: false });
  return JSON.stringify(obj, null, 2);
}

export function jsonToXml(text: string, rootName = 'root'): string {
  const data = parseJson(text);
  if (!/^[A-Za-z_][\w.-]*$/u.test(rootName)) throw new Error('Root element name is not a valid XML name.');
  // Compact xml-js format can round-trip itself; otherwise map plain JSON.
  const compact = isCompactXmlJson(data);
  const obj = compact ? data : { [rootName]: toXmlValue(data) };
  return js2xml(obj as object, { compact: true, spaces: 2, ignoreComment: false });
}

function isCompactXmlJson(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.some((k) => k === '_declaration') && keys.length >= 2;
}

function toXmlValue(v: unknown, depth = 0): unknown {
  if (depth > 100) throw new Error('JSON is nested too deeply for XML conversion.');
  if (Array.isArray(v)) return v.map((x) => toXmlValue(x, depth + 1));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const name = /^[A-Za-z_][\w.-]*$/u.test(k) ? k : 'item_' + k.replace(/[^\w.-]/gu, '_');
      o[name] = toXmlValue(val, depth + 1);
    }
    return o;
  }
  if (v === null) return { _text: '' };
  return { _text: String(v) };
}

export function csvToXml(text: string, opts: CsvOptions & { rootName?: string; rowName?: string } = {}): string {
  const rows = csvToObjects(text, opts);
  const root = opts.rootName ?? 'rows';
  const row = opts.rowName ?? 'row';
  const esc = (s: string) => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
  const tag = (k: string) => (/^[A-Za-z_][\w.-]*$/u.test(k) ? k : 'field_' + k.replace(/[^\w.-]/gu, '_'));
  const body = rows.map((r) => `  <${row}>\n${Object.entries(r).map(([k, v]) => `    <${tag(k)}>${esc(v)}</${tag(k)}>`).join('\n')}\n  </${row}>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body}\n</${root}>`;
}

export function formatXml(text: string, indent = 2): string {
  parseXmlStrict(text);
  const tokens = text.replace(/>\s+</gu, '><').trim().split(/(?=<)|(?<=>)/u).filter((t) => t !== '');
  let depth = 0;
  const lines: string[] = [];
  const pad = (n: number) => ' '.repeat(Math.max(0, n) * indent);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string;
    if (/^<\//u.test(t)) {
      depth--;
      lines.push(pad(depth) + t);
    } else if (/^<[^!?][^>]*[^/]>$/u.test(t) || /^<[A-Za-z_][^>/]*>$/u.test(t)) {
      // Inline simple text content: <a>text</a>
      const next = tokens[i + 1];
      const after = tokens[i + 2];
      if (next && !next.startsWith('<') && after && /^<\//u.test(after)) {
        lines.push(pad(depth) + t + next + after);
        i += 2;
      } else {
        lines.push(pad(depth) + t);
        depth++;
      }
    } else {
      lines.push(pad(depth) + t);
    }
  }
  return lines.join('\n');
}

// ---------- YAML ----------

export function yamlToJson(text: string): string {
  guardSize(text);
  if (text.trim() === '') throw new Error('Input is empty.');
  // The `yaml` package never executes code: unknown tags only produce warnings, and alias bombs are rejected.
  const doc = YAML.parseDocument(text, { uniqueKeys: true });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem) {
    const where = problem.linePos?.[0] ? ` at line ${problem.linePos[0].line}, column ${problem.linePos[0].col}` : '';
    const what = problem.code === 'TAG_RESOLVE_FAILED' ? 'unsupported or custom tag (not executed)' : problem.message.split('\n')[0];
    throw new Error(`Invalid YAML${where}: ${what}`);
  }
  const v = doc.toJS({ maxAliasCount: 100 }) as unknown;
  return JSON.stringify(v === undefined ? null : v, null, 2);
}

export function jsonToYaml(text: string): string {
  const v = parseJson(text);
  return YAML.stringify(v, { indent: 2, lineWidth: 100 });
}
