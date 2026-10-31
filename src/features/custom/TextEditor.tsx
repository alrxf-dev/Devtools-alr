import { useMemo, useRef, useState } from 'react';
import type { CustomProps } from '../types';
import { textStats, findReplace } from '../../lib/text';
import { readText } from '../kit';
import { triggerDownload } from '../../lib/download';
import { errorMessage } from '../../lib/safe';
import { CopyButton } from '../../components/Bits';
import { announce } from '../../components/Announcer';
import { I } from '../../components/icons';

export default function TextEditor({ markUsed }: CustomProps) {
  const [value, setValue] = useState('');
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const [cs, setCs] = useState(false);
  const [name, setName] = useState('document.txt');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const gutter = useRef<HTMLPreElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => textStats(value), [value]);
  const lineCount = Math.max(1, value.split('\n').length);
  const nums = useMemo(() => Array.from({ length: Math.min(lineCount, 100000) }, (_, i) => i + 1).join('\n'), [lineCount]);
  const matches = useMemo(() => {
    if (!find) return 0;
    try { return findReplace(value, find, '', { caseSensitive: cs }).count; } catch { return 0; }
  }, [value, find, cs]);

  const doReplace = () => {
    setErr(null);
    try {
      const r = findReplace(value, find, repl, { caseSensitive: cs });
      setValue(r.text);
      setMsg(`${r.count} replacement${r.count === 1 ? '' : 's'} made.`);
      announce(`${r.count} replacements made`);
      markUsed();
    } catch (e) { setErr(errorMessage(e)); }
  };

  return (
    <div className="tool-panel">
      <div className="tool-actions" style={{ marginTop: 0, marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => fileIn.current?.click()}><I.upload size={16} aria-hidden /> Open file</button>
        <input ref={fileIn} type="file" className="sr-only" tabIndex={-1} aria-label="Open a text file" accept=".txt,.md,.csv,.json,.xml,.html,.css,.js,.ts,.log,.yml,.yaml,text/*"
          onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try { setValue(await readText(f)); setName(f.name); setErr(null); markUsed(); } catch (x) { setErr(errorMessage(x)); }
          }} />
        <button type="button" className="btn" onClick={() => { triggerDownload(new Blob([value], { type: 'text/plain' }), name); announce('Download started'); markUsed(); }}><I.download size={16} aria-hidden /> Save as {name}</button>
        <CopyButton text={value} label="Copy all" small={false} />
        <button type="button" className="btn btn-ghost" onClick={() => { setValue(''); ta.current?.focus(); }}><I.trash size={16} aria-hidden /> Clear</button>
      </div>
      <div className="field">
        <label htmlFor="ed-name">File name for saving</label>
        <input id="ed-name" className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', border: '2px solid var(--line)', background: 'var(--bg-2)' }}>
        <pre ref={gutter} className="pre" aria-hidden="true" style={{ margin: 0, maxHeight: 420, minHeight: 320, overflow: 'hidden', textAlign: 'right', color: 'var(--muted)', padding: '12px 10px', userSelect: 'none' }}>{nums}</pre>
        <textarea
          ref={ta}
          aria-label="Text editor"
          className="textarea"
          value={value}
          spellCheck={false}
          wrap="off"
          style={{ border: 0, minHeight: 320, maxHeight: 420, whiteSpace: 'pre', overflow: 'auto', lineHeight: '1.5', fontSize: 13.5, padding: 12 }}
          onChange={(e) => { setValue(e.target.value); markUsed(); }}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop; }}
        />
      </div>
      <dl className="kv" style={{ marginTop: 12 }} aria-label="Statistics">
        <dt>Lines / words</dt><dd>{stats.lines} / {stats.words}</dd>
        <dt>Characters</dt><dd>{stats.characters} ({stats.charactersNoSpaces} without spaces) · {stats.bytesUtf8} bytes UTF-8</dd>
      </dl>
      <h2 className="block-title" style={{ margin: '20px 0 8px' }}>Find and replace</h2>
      <div className="field-grid">
        <div className="field"><label htmlFor="ed-find">Find</label><input id="ed-find" className="input" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" /></div>
        <div className="field"><label htmlFor="ed-repl">Replace with</label><input id="ed-repl" className="input" value={repl} onChange={(e) => setRepl(e.target.value)} autoComplete="off" /></div>
      </div>
      <label className="check"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /><span>Match case</span></label>
      <div className="tool-actions">
        <button type="button" className="btn" disabled={!find} onClick={doReplace}>Replace all</button>
        <span role="status" style={{ color: 'var(--muted)', fontSize: 14 }}>{find ? `${matches} match${matches === 1 ? '' : 'es'}` : 'Literal search; no regular expressions here.'} {msg ?? ''}</span>
      </div>
      {err ? <div className="notice notice-error" role="alert" style={{ marginTop: 12 }}><I.err size={18} aria-hidden /><p>{err}</p></div> : null}
    </div>
  );
}
