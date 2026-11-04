import { useMemo } from 'react';
import { CATEGORIES, TOOLS, TOOL_BY_ID, categoryCounts, countByStatus, toolsInCategory, STATUS_LABEL, type CategoryId, type ToolStatus } from '../registry';
import { href } from '../app/router';
import { stores } from '../app/stores';
import { searchTools } from '../registry/search';
import { CategoryCard, ToolCard } from '../components/Bits';
import { HeroScene } from '../components/PixelSprite';
import { SearchBox } from '../components/Header';
import { useFavorites, useRecents } from '../hooks/useApp';
import { I } from '../components/icons';

export function Home() {
  const status = countByStatus();
  const counts = categoryCounts();
  const featured = TOOLS.filter((t) => t.featured).slice(0, 8);
  const shown = featured.length >= 4 ? featured : TOOLS.slice(0, 8);
  return (
    <div className="container">
      <section className="hero" aria-labelledby="hero-h">
        <div>
          <h1 id="hero-h">Alrect<b>File Tools</b></h1>
          <p className="tagline caret">Small Pixels. Powerful Tools.</p>
          <p className="hero-lead">{TOOLS.length} tools for files, text, data, images, PDFs, audio, video, code and security. Everything runs inside your browser tab, so your files stay on your device.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={href.tools()}>Browse all tools</a>
            <a className="btn" href={href.page('privacy')}><I.lock size={16} aria-hidden /> How privacy works</a>
          </div>
          <div style={{ marginTop: 28, maxWidth: 480 }}><SearchBox /></div>
        </div>
        <div className="hero-art"><HeroScene /></div>
      </section>

      <div className="stats" role="list" aria-label="Catalogue summary">
        <div className="stat" role="listitem"><b>{TOOLS.length}</b><span>tools in the catalogue</span></div>
        <div className="stat" role="listitem"><b>{CATEGORIES.length}</b><span>categories</span></div>
        <div className="stat" role="listitem"><b>{status.working + status.partial}</b><span>run in your browser ({status.partial} with documented limits)</span></div>
        <div className="stat" role="listitem"><b>0</b><span>files uploaded by this app</span></div>
      </div>

      <section className="section" aria-labelledby="cats-h">
        <div className="section-head"><div><h2 id="cats-h">Categories</h2><p>Ten groups of fifteen tools.</p></div></div>
        <div className="grid grid-cats">
          {CATEGORIES.map((c) => <CategoryCard key={c.id} cat={c} count={counts.find((x) => x.id === c.id)?.count ?? 0} />)}
        </div>
      </section>

      <section className="section" aria-labelledby="feat-h">
        <div className="section-head"><div><h2 id="feat-h">Popular tools</h2></div><a href={href.tools()}>See all {TOOLS.length}</a></div>
        <div className="grid grid-tools">{shown.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
      </section>

      <section className="section" aria-labelledby="trust-h">
        <div className="section-head"><h2 id="trust-h">What you can rely on</h2></div>
        <div className="trust">
          <div><h3>Local by design</h3><p>Files are read with browser APIs and processed in memory. A Content-Security-Policy blocks the page from contacting other servers.</p></div>
          <div><h3>Honest status labels</h3><p>Every tool says whether it is Working, Partial, or not possible in a browser. Limits are shown where they apply.</p></div>
          <div><h3>Safe by default</h3><p>Archives are checked for path traversal and decompression bombs. Pasted markup is sanitised before it is shown.</p></div>
        </div>
      </section>
    </div>
  );
}

function Filters({ category, status, onlyNew, q }: { category: CategoryId | undefined; status: ToolStatus | undefined; onlyNew?: boolean | undefined; q?: string | undefined }) {
  const statuses: ToolStatus[] = ['working', 'partial', 'backend', 'unsupported'];
  const present = new Set(TOOLS.map((t) => t.status));
  const hasNew = TOOLS.some((t) => t.isNew);
  const go = (c: CategoryId | undefined, s: ToolStatus | undefined, n: boolean | undefined = onlyNew) => { location.hash = href.tools({ ...(c ? { category: c } : {}), ...(s ? { status: s } : {}), ...(n ? { onlyNew: true } : {}) }).slice(1); };
  return (
    <div className="filters" role="group" aria-label="Filters">
      <button type="button" className="chip" aria-pressed={!category} onClick={() => go(undefined, status)}>All categories</button>
      {CATEGORIES.map((c) => <button key={c.id} type="button" className="chip" aria-pressed={category === c.id} onClick={() => go(category === c.id ? undefined : c.id, status)}>{c.short}</button>)}
      <span style={{ width: 16 }} />
      {hasNew ? <button type="button" className="chip chip-new" aria-pressed={onlyNew === true} onClick={() => go(category, status, !onlyNew)}>New</button> : null}
      {statuses.filter((s) => present.has(s)).map((s) => <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => go(category, status === s ? undefined : s)}>{STATUS_LABEL[s]}</button>)}
      {q ? null : null}
    </div>
  );
}

export function AllTools({ category, status, onlyNew }: { category?: CategoryId; status?: ToolStatus; onlyNew?: boolean }) {
  const list = useMemo(() => TOOLS.filter((t) => (!category || t.category === category) && (!status || t.status === status) && (!onlyNew || t.isNew === true)), [category, status, onlyNew]);
  return (
    <div className="container page">
      <div className="page-head"><h1>All tools</h1><p>{list.length} of {TOOLS.length} tools shown.</p></div>
      <Filters category={category} status={status} onlyNew={onlyNew} />
      {list.length === 0 ? <p>No tools match these filters. <a href={href.tools()}>Clear filters</a></p> : <div className="grid grid-tools">{list.map((t) => <ToolCard key={t.id} tool={t} />)}</div>}
    </div>
  );
}

export function CategoryPage({ id }: { id: CategoryId }) {
  const cat = CATEGORIES.find((c) => c.id === id);
  const list = toolsInCategory(id);
  if (!cat) return null;
  return (
    <div className="container page">
      <nav className="crumbs" aria-label="Breadcrumb"><a href={href.home()}>Home</a><span aria-hidden="true">/</span><span aria-current="page">{cat.name}</span></nav>
      <div className="page-head"><h1>{cat.name}</h1><p>{cat.description}</p><p style={{ fontSize: 14 }}><strong>Limits:</strong> {cat.limits}</p></div>
      <div className="grid grid-tools">{list.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
    </div>
  );
}

export function SearchPage({ q }: { q: string }) {
  const list = useMemo(() => searchTools(q), [q]);
  return (
    <div className="container page">
      <div className="page-head"><h1>Search</h1><p>{q ? `${list.length} result${list.length === 1 ? '' : 's'} for “${q}”.` : 'Type to search tool names, descriptions and keywords.'}</p></div>
      <div style={{ maxWidth: 520, marginBottom: 24 }}><SearchBox initial={q} /></div>
      {q && list.length === 0 ? <p>Nothing matched. Try a file type (pdf, zip, png), an action (merge, convert, hash) or a format (json, csv).</p> : <div className="grid grid-tools">{list.map((t) => <ToolCard key={t.id} tool={t} />)}</div>}
    </div>
  );
}

export function FavoritesPage() {
  const favs = useFavorites();
  const tools = favs.map((id) => TOOL_BY_ID.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
  return (
    <div className="container page">
      <div className="page-head"><h1>Favorites</h1><p>Stored only in this browser. Clearing site data removes them.</p></div>
      {tools.length === 0 ? <p>No favorites yet. Use the star on any tool card to add one.</p> : (
        <>
          <div className="grid grid-tools">{tools.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
          <p style={{ marginTop: 24 }}><button type="button" className="btn btn-ghost" onClick={() => stores().clearFavorites()}><I.trash size={16} aria-hidden /> Clear favorites</button></p>
        </>
      )}
    </div>
  );
}

export function RecentPage() {
  const recents = useRecents();
  const tools = recents.map((r) => TOOL_BY_ID.get(r.id)).filter((t): t is NonNullable<typeof t> => !!t);
  return (
    <div className="container page">
      <div className="page-head"><h1>Recently used</h1><p>Tools you have run. Only tool names are stored, never file names or contents, and only in this browser.</p></div>
      {tools.length === 0 ? <p>Nothing here yet. Run a tool and it will show up.</p> : (
        <>
          <div className="grid grid-tools">{tools.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
          <p style={{ marginTop: 24 }}><button type="button" className="btn btn-ghost" onClick={() => stores().clearRecents()}><I.trash size={16} aria-hidden /> Clear history</button></p>
        </>
      )}
    </div>
  );
}

export function NotFound({ path }: { path: string }) {
  return (
    <div className="container page">
      <div className="page-head"><h1>Page not found</h1><p>There is no page at <code>{path}</code>.</p></div>
      <p><a className="btn btn-primary" href={href.home()}>Back to home</a> <a className="btn" href={href.tools()}>Browse tools</a></p>
    </div>
  );
}
