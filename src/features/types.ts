import type { ComponentType } from 'react';
import type { DiffOp } from '../lib/text';
import type { DownloadData } from '../lib/download';

export type OptValue = string | number | boolean;
export type Opts = Record<string, OptValue>;

export type OptionDef =
  | { type: 'select'; key: string; label: string; options: { value: string; label: string }[]; default: string; help?: string }
  | { type: 'checkbox'; key: string; label: string; default: boolean; help?: string }
  | { type: 'number'; key: string; label: string; default: number; min?: number; max?: number; step?: number; help?: string }
  | { type: 'text'; key: string; label: string; default: string; placeholder?: string; help?: string; maxLength?: number };

/**
 * Everything a tool can show. Blocks are plain data rendered by ONE component (ResultView) that only ever uses
 * React text nodes, object URLs and a sanitising HTML component, so individual tools never touch the DOM directly.
 */
export type Block =
  | { type: 'text'; title?: string; text: string; filename?: string; mime?: string; wrap?: boolean }
  | { type: 'kv'; title?: string; rows: [string, string][] }
  | { type: 'table'; title?: string; columns: string[]; rows: string[][]; note?: string }
  | { type: 'notice'; level: 'info' | 'warn' | 'error' | 'success'; text: string }
  | { type: 'download'; label: string; filename: string; mime: string; data: DownloadData; note?: string }
  | { type: 'image'; title?: string; blob: Blob; alt: string; pixelated?: boolean }
  | { type: 'images'; title?: string; items: { blob: Blob; alt: string; caption?: string }[] }
  | { type: 'media'; kind: 'audio' | 'video'; blob: Blob; title?: string }
  | { type: 'html'; title?: string; html: string }
  | { type: 'diff'; ops: DiffOp[] }
  | { type: 'list'; title?: string; items: string[] }
  | { type: 'swatches'; title?: string; colors: string[] }
  | { type: 'tree'; title?: string; text: string };

export interface RunCtx {
  signal: AbortSignal;
  progress(fraction: number, label?: string): void;
}

export interface FormInput {
  text: string;
  /** Second text box, when the tool declares one (comparison tools). */
  text2: string;
  files: File[];
  opts: Opts;
}

export interface FormToolImpl {
  kind: 'form';
  text?: { label: string; placeholder?: string; sample?: string; rows?: number; optional?: boolean };
  text2?: { label: string; placeholder?: string; sample?: string; rows?: number };
  files?: { label?: string; accept?: string; multiple?: boolean; directory?: boolean; optional?: boolean; maxFiles?: number };
  options?: OptionDef[];
  /** Recompute automatically (debounced) when the text or options change. Only for cheap, text-only tools. */
  live?: boolean;
  runLabel?: string;
  run(input: FormInput, ctx: RunCtx): Promise<Block[]> | Block[];
}

export interface CustomProps {
  toolId: string;
  /** Call when the user does something meaningful, so the tool appears in "recently used". */
  markUsed(): void;
}

export interface CustomToolImpl {
  kind: 'custom';
  load: () => Promise<{ default: ComponentType<CustomProps> }>;
}

export type ToolImpl = FormToolImpl | CustomToolImpl;
export type ImplMap = Record<string, ToolImpl>;

export function defaults(options: OptionDef[] | undefined): Opts {
  const o: Opts = {};
  for (const d of options ?? []) o[d.key] = d.default;
  return o;
}
