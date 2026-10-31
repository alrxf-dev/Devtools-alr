import { useMemo, type ReactNode } from 'react';
import type { Block } from '../features/types';
import { SafeHtml } from './SafeHtml';
import { CopyButton } from './Bits';
import { I } from './icons';
import { toBlob, triggerDownload } from '../lib/download';
import { safeDownloadName } from '../lib/safe';
import { announce } from './Announcer';
import { useObjectUrl } from '../hooks/useApp';

const SHOW_CHARS = 200_000;

function Head({ title, children }: { title?: string | undefined; children?: ReactNode }) {
  if (!title && !children) return null;
  return (
    <div className="block-head">
      <h3 className="block-title">{title ?? ''}</h3>
      <div className="block-actions">{children}</div>
    </div>
  );
}

export function DownloadButton({ label, filename, mime, data, small = true, primary = false }: { label: string; filename: string; mime: string; data: Parameters<typeof toBlob>[0]; small?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      className={`btn ${small ? 'btn-sm' : ''} ${primary ? 'btn-primary' : ''}`}
      onClick={() => {
        try {
          triggerDownload(toBlob(data, mime), filename);
          announce(`Download started: ${safeDownloadName(filename)}`);
        } catch {
          announce('The download could not be created.');
        }
      }}
    >
      <I.download size={16} aria-hidden /> {label}
    </button>
  );
}

function TextBlock({ b }: { b: Extract<Block, { type: 'text' }> }) {
  const shown = b.text.length > SHOW_CHARS ? b.text.slice(0, SHOW_CHARS) : b.text;
  return (
    <section className="block">
      <Head title={b.title ?? 'Result'}>
        <CopyButton text={b.text} />
        {b.filename ? <DownloadButton label="Download" filename={b.filename} mime={b.mime ?? 'text/plain'} data={b.text} /> : null}
      </Head>
      {b.text.length > SHOW_CHARS ? (
        <div className="notice notice-warn" style={{ border: 0, borderBottom: '2px solid var(--line)' }}><I.warn size={18} aria-hidden /><p>Showing the first {SHOW_CHARS.toLocaleString('en-US')} of {b.text.length.toLocaleString('en-US')} characters. Copy and download use the full text.</p></div>
      ) : null}
      <pre className={`pre ${b.wrap ? 'wrap' : ''}`} tabIndex={0} aria-label={b.title ?? 'Result'}>{shown === '' ? '(empty)' : shown}</pre>
    </section>
  );
}

function ImageBlock({ blob, alt, pixelated, caption }: { blob: Blob; alt: string; pixelated?: boolean | undefined; caption?: string | undefined }) {
  const url = useObjectUrl(blob);
  if (!url) return null;
  return (
    <figure style={{ margin: 0 }}>
      <img className={`img-preview ${pixelated ? 'pixelated' : ''}`} src={url} alt={alt} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function MediaBlock({ b }: { b: Extract<Block, { type: 'media' }> }) {
  const url = useObjectUrl(b.blob);
  if (!url) return null;
  return (
    <section className="block">
      <Head title={b.title ?? (b.kind === 'audio' ? 'Audio preview' : 'Video preview')} />
      <div className="block-body">
        {b.kind === 'audio' ? <audio controls src={url} style={{ width: '100%' }} /> : <video controls playsInline src={url} style={{ width: '100%', maxHeight: 480 }} />}
      </div>
    </section>
  );
}

const NOTICE_ICON = { info: I.info, warn: I.warn, error: I.err, success: I.ok } as const;

export function ResultView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="result" aria-label="Result">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  const diffClass = useMemo(() => ({ add: 'add', remove: 'del', equal: '' }), []);
  switch (b.type) {
    case 'text':
      return <TextBlock b={b} />;
    case 'kv':
      return (
        <section className="block">
          <Head title={b.title} />
          <dl className="kv">{b.rows.map(([k, v], i) => (<Row key={i} k={k} v={v} />))}</dl>
        </section>
      );
    case 'table':
      return (
        <section className="block">
          <Head title={b.title}>{b.rows.length > 0 ? <CopyButton label="Copy TSV" text={() => [b.columns, ...b.rows].map((r) => r.join('\t')).join('\n')} /> : null}</Head>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={b.title ?? 'Table'}>
            <table>
              <thead><tr>{b.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
              <tbody>{b.rows.slice(0, 2000).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {b.rows.length > 2000 ? <p className="help" style={{ padding: '0 12px 8px' }}>Showing the first 2,000 of {b.rows.length.toLocaleString('en-US')} rows.</p> : null}
          {b.note ? <p className="help" style={{ padding: '0 12px 8px' }}>{b.note}</p> : null}
        </section>
      );
    case 'notice': {
      const Icon = NOTICE_ICON[b.level];
      return (
        <div className={`notice notice-${b.level}`} role={b.level === 'error' ? 'alert' : 'status'}>
          <Icon size={18} aria-hidden />
          <p>{b.text}</p>
        </div>
      );
    }
    case 'download':
      return (
        <div className="block" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <DownloadButton label={b.label} filename={b.filename} mime={b.mime} data={b.data} small={false} primary />
          <span style={{ color: 'var(--muted)', fontSize: 14, overflowWrap: 'anywhere' }}>{safeDownloadName(b.filename)}{b.data instanceof Blob ? ` · ${(b.data.size).toLocaleString('en-US')} bytes` : ''}{b.note ? ` · ${b.note}` : ''}</span>
        </div>
      );
    case 'image':
      return (
        <section className="block">
          <Head title={b.title} />
          <div className="block-body"><ImageBlock blob={b.blob} alt={b.alt} pixelated={b.pixelated} /></div>
        </section>
      );
    case 'images':
      return (
        <section className="block">
          <Head title={b.title} />
          <div className="block-body img-grid">{b.items.map((it, i) => <ImageBlock key={i} blob={it.blob} alt={it.alt} caption={it.caption} />)}</div>
        </section>
      );
    case 'media':
      return <MediaBlock b={b} />;
    case 'html':
      return (
        <section className="block">
          <Head title={b.title ?? 'Preview'} />
          <SafeHtml className="rendered" html={b.html} />
        </section>
      );
    case 'diff':
      return (
        <section className="block">
          <Head title="Differences" />
          <div className="diff" tabIndex={0} role="region" aria-label="Line differences">
            {b.ops.slice(0, 5000).map((o, i) => (
              <div key={i} className={diffClass[o.type]}>
                <span aria-hidden="true">{o.type === 'add' ? '+ ' : o.type === 'remove' ? '- ' : '  '}</span>
                <span className="sr-only">{o.type === 'add' ? 'Added: ' : o.type === 'remove' ? 'Removed: ' : 'Unchanged: '}</span>
                {o.text}
              </div>
            ))}
          </div>
        </section>
      );
    case 'list':
      return (
        <section className="block">
          <Head title={b.title} />
          <div className="block-body"><ul className="list">{b.items.slice(0, 5000).map((s, i) => <li key={i}>{s}</li>)}</ul></div>
        </section>
      );
    case 'swatches':
      return (
        <section className="block">
          <Head title={b.title} />
          <div className="block-body swatches">{b.colors.map((c, i) => (<span className="swatch" key={i}><SwatchChip color={c} />{c}</span>))}</div>
        </section>
      );
    case 'tree':
      return (
        <section className="block">
          <Head title={b.title ?? 'Tree'}><CopyButton text={b.text} /></Head>
          <pre className="pre" tabIndex={0}>{b.text}</pre>
        </section>
      );
  }
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function SwatchChip({ color }: { color: string }) {
  // Colour comes from a validated parse, but is still applied via the CSSOM and not through markup.
  return <i ref={(el) => { if (el) el.style.background = /^#[0-9a-f]{3,8}$/i.test(color) || /^(rgb|hsl)a?\([\d\s.,%/-]+\)$/i.test(color) ? color : 'transparent'; }} />;
}
