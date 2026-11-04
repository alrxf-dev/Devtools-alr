import { useEffect, useState } from 'react';
import { CATEGORY_BY_ID, TOOLS, type ToolMeta } from '../registry';
import { href } from '../app/router';
import { stores } from '../app/stores';
import { loadImpl } from '../features';
import type { ToolImpl } from '../features/types';
import { FormTool } from '../components/FormTool';
import { FavButton, StatusBadge, NewBadge, ToolCard } from '../components/Bits';
import { I } from '../components/icons';
import { errorMessage } from '../lib/safe';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LazyCustom } from '../components/LazyCustom';

type Load = { s: 'loading' } | { s: 'ready'; impl: ToolImpl } | { s: 'missing' } | { s: 'error'; msg: string };

export function ToolPage({ tool }: { tool: ToolMeta }) {
  const cat = CATEGORY_BY_ID.get(tool.category);
  const [load, setLoad] = useState<Load>({ s: 'loading' });

  useEffect(() => {
    let live = true;
    setLoad({ s: 'loading' });
    loadImpl(tool.category, tool.id)
      .then((impl) => { if (live) setLoad(impl ? { s: 'ready', impl } : { s: 'missing' }); })
      .catch((e: unknown) => { if (live) setLoad({ s: 'error', msg: errorMessage(e) }); });
    return () => { live = false; };
  }, [tool.id, tool.category]);

  const markUsed = useMarkUsed(tool.id);
  const related = TOOLS.filter((t) => t.category === tool.category && t.id !== tool.id).slice(0, 3);

  return (
    <div className="container page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={href.home()}>Home</a><span aria-hidden="true">/</span>
        <a href={href.category(tool.category)}>{cat?.name ?? tool.category}</a><span aria-hidden="true">/</span>
        <span aria-current="page">{tool.name}</span>
      </nav>
      <div className="tool-head">
        <div>
          <h1>{tool.name}</h1>
          <div className="tool-meta"><StatusBadge status={tool.status} />{tool.isNew ? <NewBadge /> : null}<span style={{ color: 'var(--muted)', fontSize: 14 }}>{cat?.name}</span></div>
        </div>
        <FavButton tool={tool} />
      </div>
      <p style={{ color: 'var(--muted)', maxWidth: '70ch', marginTop: 12 }}>{tool.description}</p>

      {tool.statusNote ? <div className={`notice ${tool.status === 'working' ? 'notice-info' : 'notice-warn'}`} style={{ marginTop: 16 }}><I.info size={18} aria-hidden /><p>{tool.statusNote}</p></div> : null}
      {tool.safety ? <div className="notice notice-warn" style={{ marginTop: 12 }}><I.warn size={18} aria-hidden /><p>{tool.safety}</p></div> : null}

      <ErrorBoundary resetKey={tool.id}>
        {load.s === 'loading' ? <div className="tool-panel" role="status">Loading tool…</div> : null}
        {load.s === 'error' ? <div className="notice notice-error" style={{ marginTop: 24 }} role="alert"><I.err size={18} aria-hidden /><p>This tool’s code could not be loaded: {load.msg}. Reload the page and try again.</p></div> : null}
        {load.s === 'missing' ? (
          <div className="notice notice-warn" style={{ marginTop: 24 }} role="status">
            <I.warn size={18} aria-hidden />
            <p>{tool.status === 'backend' || tool.status === 'unsupported' ? 'This tool is listed for completeness, but it is not available in a browser-only app. See the note above for why.' : 'This tool is in the catalogue but has no implementation in this build.'}</p>
          </div>
        ) : null}
        {load.s === 'ready' ? (
          load.impl.kind === 'form'
            ? <FormTool key={tool.id} impl={load.impl} markUsed={markUsed} />
            : <LazyCustom key={tool.id} toolId={tool.id} loader={load.impl.load} markUsed={markUsed} />
        ) : null}
      </ErrorBoundary>

      <p className="privacy-line"><I.lock size={16} aria-hidden /> Runs entirely in this browser tab. Files and text are never uploaded. {cat?.limits}</p>

      {related.length > 0 ? (
        <section className="section" style={{ marginTop: 48 }}>
          <div className="section-head"><h2>More in {cat?.short}</h2></div>
          <div className="grid grid-tools">{related.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
        </section>
      ) : null}
    </div>
  );
}

function useMarkUsed(id: string): () => void {
  return () => stores().markUsed(id);
}
