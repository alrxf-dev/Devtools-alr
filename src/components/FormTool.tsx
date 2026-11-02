import { emitSfx } from '../fx/sfx';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Block, FormToolImpl, OptionDef, Opts } from '../features/types';
import { defaults } from '../features/types';
import { ResultView } from './ResultView';
import { I } from './icons';
import { formatBytes } from '../lib/sniff';
import { errorMessage, isAbort, LimitError } from '../lib/safe';
import { announce } from './Announcer';

function OptionField({ def, value, onChange }: { def: OptionDef; value: Opts[string]; onChange: (v: string | number | boolean) => void }) {
  const id = useId();
  const helpId = `${id}-h`;
  const help = def.help ? <div className="help" id={helpId}>{def.help}</div> : null;
  const aria = def.help ? { 'aria-describedby': helpId } : {};
  switch (def.type) {
    case 'select':
      return (
        <div className="field">
          <label htmlFor={id}>{def.label}</label>
          <select id={id} className="select" value={String(value)} onChange={(e) => onChange(e.target.value)} {...aria}>
            {def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {help}
        </div>
      );
    case 'checkbox':
      return (
        <div className="field">
          <label className="check" htmlFor={id}>
            <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} {...aria} />
            <span>{def.label}</span>
          </label>
          {help}
        </div>
      );
    case 'number':
      return (
        <div className="field">
          <label htmlFor={id}>{def.label}</label>
          <input id={id} className="input" type="number" inputMode="decimal" value={String(value)} {...(def.min !== undefined ? { min: def.min } : {})} {...(def.max !== undefined ? { max: def.max } : {})} step={def.step ?? 'any'} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...aria} />
          {help}
        </div>
      );
    case 'text':
      return (
        <div className="field">
          <label htmlFor={id}>{def.label}</label>
          <input id={id} className="input" type="text" value={String(value)} {...(def.placeholder ? { placeholder: def.placeholder } : {})} {...(def.maxLength ? { maxLength: def.maxLength } : {})} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} {...aria} />
          {help}
        </div>
      );
  }
}

export function FileDrop({ spec, files, onFiles, invalid }: { spec: NonNullable<FormToolImpl['files']>; files: File[]; onFiles: (f: File[]) => void; invalid?: boolean }) {
  const id = useId();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const multi = spec.multiple === true || spec.directory === true;
  const max = spec.maxFiles ?? 1000;

  const take = (list: FileList | File[] | null) => {
    if (!list) return;
    const arr = Array.from(list);
    if (arr.length === 0) return;
    const next = multi ? [...files, ...arr] : arr.slice(0, 1);
    if (next.length > max) {
      announce(`Only the first ${max} files were kept.`);
    }
    onFiles(next.slice(0, max));
  };
  return (
    <div className="field">
      <span className="label" id={`${id}-l`}>{spec.label ?? (multi ? 'Files' : 'File')}</span>
      <label
        className={`drop ${over ? 'over' : ''}`}
        htmlFor={id}
        aria-describedby={`${id}-d`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      >
        <I.upload size={26} aria-hidden />
        <strong>Choose {multi ? 'files' : 'a file'} or drop {multi ? 'them' : 'it'} here</strong>
        <small id={`${id}-d`}>Processed in this browser tab. Nothing is uploaded.{spec.accept ? ` Accepts ${spec.accept}.` : ''}</small>
        <input
          ref={input}
          id={id}
          type="file"
          aria-labelledby={`${id}-l`}
          aria-invalid={invalid ? true : undefined}
          {...(spec.accept ? { accept: spec.accept } : {})}
          {...(multi ? { multiple: true } : {})}
          {...(spec.directory ? { webkitdirectory: '' } : {})}
          onChange={(e) => { take(e.target.files); e.target.value = ''; }}
        />
      </label>
      {files.length > 0 ? (
        <ul className="file-list" aria-label="Selected files">
          {files.slice(0, 200).map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="name">{(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}</span>
              <span className="size">{formatBytes(f.size)}</span>
              <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label={`Remove ${f.name}`} onClick={() => onFiles(files.filter((_, j) => j !== i))}><I.close size={16} aria-hidden /></button>
            </li>
          ))}
          {files.length > 200 ? <li><span className="name">…and {files.length - 200} more</span></li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function FormTool({ impl, markUsed }: { impl: FormToolImpl; markUsed: () => void }) {
  const [text, setText] = useState(impl.text?.sample ?? '');
  const [text2, setText2] = useState(impl.text2?.sample ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Opts>(() => defaults(impl.options));
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ f: number; label?: string | undefined } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const textId = useId();
  const resultRef = useRef<HTMLDivElement>(null);

  const needsText = !!impl.text && !impl.text.optional;
  const needsFiles = !!impl.files && !impl.files.optional;

  const run = useCallback(async (auto: boolean) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const id = ++runId.current;
    if (needsText && text.trim() === '' && !impl.text?.optional) {
      if (!auto) setError('Enter some text first.');
      else { setBlocks(null); setError(null); }
      setBusy(false);
      return;
    }
    if (needsFiles && files.length === 0) {
      if (!auto) setError('Choose a file first.');
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const out = await impl.run({ text, text2, files, opts }, { signal: ac.signal, progress: (f, label) => { if (id === runId.current) setProgress({ f, label }); } });
      if (id !== runId.current) return;
      setBlocks(out);
      markUsed();
      if (!auto) {
        emitSfx(out.some((b) => b.type === 'notice' && b.level === 'error') ? 'err' : 'ok');
        announce('Result ready');
        requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
    } catch (e) {
      if (id !== runId.current || isAbort(e)) return;
      setBlocks(null);
      if (!auto) emitSfx('err');
      setError(e instanceof LimitError || e instanceof Error ? errorMessage(e) : 'The tool failed unexpectedly.');
      if (!auto) announce('The tool reported an error');
    } finally {
      if (id === runId.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  }, [impl, text, text2, files, opts, needsText, needsFiles, markUsed]);

  // Live tools recompute shortly after the input stops changing.
  useEffect(() => {
    if (!impl.live) return;
    const t = setTimeout(() => { void run(true); }, 250);
    return () => clearTimeout(t);
  }, [impl.live, run]);

  useEffect(() => () => abort.current?.abort(), []);

  const reset = () => {
    abort.current?.abort();
    runId.current++;
    setText(impl.text?.sample ?? '');
    setText2(impl.text2?.sample ?? '');
    setFiles([]);
    setOpts(defaults(impl.options));
    setBlocks(null);
    setError(null);
    setBusy(false);
    setProgress(null);
  };

  const optionFields = useMemo(() => impl.options ?? [], [impl.options]);

  return (
    <form className="tool-panel" onSubmit={(e) => { e.preventDefault(); void run(false); }} noValidate>
      {impl.text ? (
        <div className="field">
          <label htmlFor={textId}>{impl.text.label}</label>
          <textarea
            id={textId}
            className="textarea"
            rows={impl.text.rows ?? 8}
            value={text}
            placeholder={impl.text.placeholder ?? ''}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            onChange={(e) => setText(e.target.value)}
            aria-invalid={error && needsText && text.trim() === '' ? true : undefined}
          />
        </div>
      ) : null}
      {impl.text2 ? (
        <div className="field">
          <label htmlFor={`${textId}-2`}>{impl.text2.label}</label>
          <textarea id={`${textId}-2`} className="textarea" rows={impl.text2.rows ?? 8} value={text2} placeholder={impl.text2.placeholder ?? ''} spellCheck={false} autoComplete="off" autoCapitalize="off" onChange={(e) => setText2(e.target.value)} />
        </div>
      ) : null}
      {impl.files ? <FileDrop spec={impl.files} files={files} onFiles={setFiles} invalid={!!error && needsFiles && files.length === 0} /> : null}
      {optionFields.length > 0 ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Options</legend>
          <div className="field-grid">
            {optionFields.map((d) => <OptionField key={d.key} def={d} value={opts[d.key] ?? d.default} onChange={(v) => setOpts((o) => ({ ...o, [d.key]: v }))} />)}
          </div>
        </fieldset>
      ) : null}
      <div className="tool-actions">
        {!impl.live ? (
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Working…' : impl.runLabel ?? 'Run'}</button>
        ) : null}
        {busy && !impl.live ? <button type="button" className="btn" onClick={() => { abort.current?.abort(); runId.current++; setBusy(false); setProgress(null); announce('Cancelled'); }}>Cancel</button> : null}
        {impl.text?.sample !== undefined && impl.text.sample !== '' && text !== impl.text.sample ? <button type="button" className="btn btn-ghost" onClick={() => setText(impl.text?.sample ?? '')}>Load example</button> : null}
        <button type="button" className="btn btn-ghost" onClick={reset}><I.reset size={16} aria-hidden /> Reset</button>
      </div>
      {busy && progress ? (
        <div className="busy" style={{ marginTop: 16 }} role="status">
          <div className="progress" aria-hidden="true"><i ref={(el) => { if (el) el.style.setProperty('--p', String(Math.max(0, Math.min(1, progress.f)))); }} /></div>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>{Math.round(progress.f * 100)}%{progress.label ? ` · ${progress.label}` : ''}</span>
        </div>
      ) : null}
      <div ref={resultRef} className="tool-result" aria-live="polite">
        {error ? <div className="notice notice-error" role="alert" style={{ marginTop: 16 }}><I.err size={18} aria-hidden /><p>{error}</p></div> : null}
        {blocks ? <ResultView blocks={blocks} /> : null}
      </div>
    </form>
  );
}
