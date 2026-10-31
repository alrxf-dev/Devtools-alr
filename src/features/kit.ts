import type { Block, CustomToolImpl, FormToolImpl, Opts } from './types';
import type { DownloadData } from '../lib/download';
import { LIMITS, LimitError, assertFileSize } from '../lib/safe';

// ---------- block builders ----------
export const text = (t: string, o: { title?: string; filename?: string; mime?: string; wrap?: boolean } = {}): Block => ({ type: 'text', text: t, ...o });
export const kv = (rows: [string, string][], title?: string): Block => ({ type: 'kv', rows, ...(title ? { title } : {}) });
export const table = (columns: string[], rows: string[][], o: { title?: string; note?: string } = {}): Block => ({ type: 'table', columns, rows, ...o });
export const notice = (level: 'info' | 'warn' | 'error' | 'success', t: string): Block => ({ type: 'notice', level, text: t });
export const download = (label: string, filename: string, mime: string, data: DownloadData, note?: string): Block => ({ type: 'download', label, filename, mime, data, ...(note ? { note } : {}) });
export const list = (items: string[], title?: string): Block => ({ type: 'list', items, ...(title ? { title } : {}) });
export const tree = (t: string, title?: string): Block => ({ type: 'tree', text: t, ...(title ? { title } : {}) });

// ---------- tool builders ----------
export const form = (impl: Omit<FormToolImpl, 'kind'>): FormToolImpl => ({ kind: 'form', ...impl });
export const custom = (load: CustomToolImpl['load']): CustomToolImpl => ({ kind: 'custom', load });

/** A text-in, text-out tool. Output is shown with copy and download buttons. */
export function textTool(o: {
  label: string;
  placeholder?: string;
  sample?: string;
  rows?: number;
  options?: FormToolImpl['options'];
  live?: boolean;
  output: { filename: string; mime: string };
  run: (input: string, opts: Opts) => string | { output: string; notes?: Block[] };
}): FormToolImpl {
  return form({
    text: { label: o.label, ...(o.placeholder ? { placeholder: o.placeholder } : {}), ...(o.sample !== undefined ? { sample: o.sample } : {}), ...(o.rows ? { rows: o.rows } : {}) },
    ...(o.options ? { options: o.options } : {}),
    live: o.live ?? true,
    run: ({ text: input, opts }) => {
      const r = o.run(input, opts);
      const out = typeof r === 'string' ? r : r.output;
      return [...(typeof r === 'string' ? [] : r.notes ?? []), { type: 'text', title: 'Result', text: out, filename: o.output.filename, mime: o.output.mime }];
    },
  });
}

// ---------- shared option helpers ----------
export const optSelect = (key: string, label: string, options: [string, string][], def?: string, help?: string) => ({
  type: 'select' as const, key, label, options: options.map(([value, l]) => ({ value, label: l })), default: def ?? options[0]?.[0] ?? '', ...(help ? { help } : {}),
});
export const optCheck = (key: string, label: string, def = false, help?: string) => ({ type: 'checkbox' as const, key, label, default: def, ...(help ? { help } : {}) });
export const optNum = (key: string, label: string, def: number, o: { min?: number; max?: number; step?: number; help?: string } = {}) => ({ type: 'number' as const, key, label, default: def, ...o });
export const optText = (key: string, label: string, def = '', o: { placeholder?: string; help?: string; maxLength?: number } = {}) => ({ type: 'text' as const, key, label, default: def, ...o });

export const DELIMITERS: [string, string][] = [[',', 'Comma (,)'], [';', 'Semicolon (;)'], ['\t', 'Tab'], ['|', 'Pipe (|)']];

// ---------- file reading ----------
export function str(o: Opts, key: string): string {
  const v = o[key];
  return typeof v === 'string' ? v : String(v ?? '');
}
export function num(o: Opts, key: string): number {
  const v = Number(o[key]);
  if (!Number.isFinite(v)) throw new Error(`"${key}" must be a number.`);
  return v;
}
export function bool(o: Opts, key: string): boolean {
  return o[key] === true;
}

/** Read a whole file into memory after checking size limits. Large inputs fail with a readable message, not a crash. */
export async function readBytes(file: File, max: number = LIMITS.maxFileBytes): Promise<Uint8Array> {
  assertFileSize(file, max);
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new LimitError(`"${file.name}" could not be read. It may be too large for this device's memory, or it was moved or deleted after selection.`);
  }
}

export async function readText(file: File, max: number = LIMITS.maxTextChars): Promise<string> {
  assertFileSize(file, max * 4);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s: string;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Fall back to a lenient decode so a stray invalid byte does not block viewing, but tell the caller.
    s = new TextDecoder('utf-8').decode(bytes);
  }
  if (s.length > max) throw new LimitError(`"${file.name}" has more than ${max.toLocaleString()} characters.`);
  return s;
}

export function oneFile(files: File[]): File {
  const f = files[0];
  if (!f) throw new Error('Choose a file first.');
  return f;
}

export function needFiles(files: File[], min: number, what = 'files'): void {
  if (files.length < min) throw new Error(`Choose at least ${min} ${what}.`);
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
}

/** Yield to the event loop so progress renders and cancel clicks are handled during long loops. */
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export function fmtNum(n: number, digits = 2): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: digits });
}
