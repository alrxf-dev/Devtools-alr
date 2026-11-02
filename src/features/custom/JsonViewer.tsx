import { useMemo, useState } from 'react';
import type { CustomProps } from '../types';
import { parseJson } from '../../lib/data';
import { readText } from '../kit';
import { errorMessage } from '../../lib/safe';
import { CopyButton } from '../../components/Bits';
import { I } from '../../components/icons';

const MAX_CHILDREN = 200;
const MAX_DEPTH = 64;

function pathOf(parent: string, key: string | number): string {
  return typeof key === 'number' ? `${parent}[${key}]` : /^[A-Za-z_$][\w$]*$/u.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function Scalar({ v }: { v: unknown }) {
  if (v === null) return <span className="jv-null" style={{ color: 'var(--orange)' }}>null</span>;
  if (typeof v === 'string') return <span style={{ color: 'var(--ok)' }}>{JSON.stringify(v.length > 300 ? v.slice(0, 300) + '…' : v)}</span>;
  if (typeof v === 'number') return <span style={{ color: 'var(--warn)' }}>{String(v)}</span>;
  return <span style={{ color: 'var(--cyan)' }}>{String(v)}</span>;
}

function Node({ k, v, path, depth, open }: { k: string | number | null; v: unknown; path: string; depth: number; open: boolean }) {
  const [shown, setShown] = useState(MAX_CHILDREN);
  const isObj = v !== null && typeof v === 'object';
  const label = k === null ? null : <span style={{ color: 'var(--ice)' }}>{typeof k === 'number' ? k : JSON.stringify(k)}</span>;
  if (!isObj) {
    return <li style={{ listStyle: 'none', padding: '1px 0' }}>{label}{label ? ': ' : ''}<Scalar v={v} /> <PathBtn path={path} /></li>;
  }
  const entries: [string | number, unknown][] = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v as object);
  const summary = Array.isArray(v) ? `Array(${entries.length})` : `Object{${entries.length}}`;
  if (depth >= MAX_DEPTH) return <li style={{ listStyle: 'none' }}>{label}: <em>(nesting deeper than {MAX_DEPTH} not shown)</em></li>;
  return (
    <li style={{ listStyle: 'none' }}>
      <details open={open}>
        <summary style={{ cursor: 'pointer', padding: '2px 0' }}>{label}{label ? ': ' : ''}<span style={{ color: 'var(--muted)' }}>{summary}</span> <PathBtn path={path} /></summary>
        <ul style={{ margin: 0, paddingLeft: 20, borderLeft: '1px dashed var(--line-2)' }}>
          {entries.slice(0, shown).map(([ck, cv]) => <Node key={String(ck)} k={ck} v={cv} path={pathOf(path, ck)} depth={depth + 1} open={false} />)}
          {entries.length > shown ? <li style={{ listStyle: 'none' }}><button type="button" className="btn btn-sm btn-ghost" onClick={() => setShown((s) => s + 500)}>Show {Math.min(500, entries.length - shown)} more of {entries.length - shown} remaining</button></li> : null}
        </ul>
      </details>
    </li>
  );
}

function PathBtn({ path }: { path: string }) {
  return <CopyButton text={path} label="path" small />;
}

export default function JsonViewer({ markUsed }: CustomProps) {
  const [src, setSrc] = useState('{"name":"ALRECT","tools":[{"id":"json-viewer","tags":["json","tree"]},{"id":"hash","tags":[]}],"count":150,"ok":true,"none":null}');
  const [err, setErr] = useState<string | null>(null);
  const parsed = useMemo(() => {
    try { return { v: parseJson(src) as unknown, ok: src.trim() !== '' }; } catch (e) { return { v: undefined, ok: false, e: errorMessage(e) }; }
  }, [src]);
  const error = 'e' in parsed ? parsed.e : null;
  return (
    <div className="tool-panel">
      <div className="field">
        <label htmlFor="jv-in">JSON</label>
        <textarea id="jv-in" className="textarea" rows={8} value={src} spellCheck={false} onChange={(e) => { setSrc(e.target.value); markUsed(); }} />
      </div>
      <div className="field">
        <label htmlFor="jv-file">Or open a JSON file</label>
        <input id="jv-file" className="input" type="file" accept=".json,application/json,.txt" onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          try { setSrc(await readText(f)); markUsed(); } catch (x) { setErr(errorMessage(x)); }
        }} />
      </div>
      {err ? <div className="notice notice-error" role="alert"><I.err size={18} aria-hidden /><p>{err}</p></div> : null}
      {error ? <div className="notice notice-error" role="alert"><I.err size={18} aria-hidden /><p>{error}</p></div> : null}
      {parsed.ok && !error ? (
        <section className="block" style={{ marginTop: 16 }} aria-label="JSON tree">
          <div className="block-head"><h3 className="block-title">Tree</h3></div>
          <ul className="pre" style={{ margin: 0, listStyle: 'none', whiteSpace: 'normal' }} role="tree">
            <Node k={null} v={parsed.v} path="$" depth={0} open />
          </ul>
        </section>
      ) : null}
    </div>
  );
}
