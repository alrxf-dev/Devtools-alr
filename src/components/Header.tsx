import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { href, type Route } from '../app/router';
import { searchTools } from '../registry/search';
import { Logo } from './PixelSprite';
import { ThemeSwitch } from './ThemeSwitch';
import { I } from './icons';

export function SearchBox({ initial = '' }: { initial?: string }) {
  const id = useId();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const results = useMemo(() => (q.trim() ? searchTools(q).slice(0, 8) : []), [q]);

  useEffect(() => setQ(initial), [initial]);
  useEffect(() => {
    const on = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, []);

  const go = (url: string) => {
    setOpen(false);
    setActive(-1);
    location.hash = url.slice(1);
  };
  const listId = `${id}-list`;
  const showList = open && q.trim() !== '';

  return (
    <div className="combo" ref={box} role="search">
      <label htmlFor={id} className="sr-only">Search 150 tools</label>
      <span className="combo-icon"><I.search size={18} aria-hidden /></span>
      <input
        id={id}
        className="input"
        type="search"
        placeholder="Search 150 tools…"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        {...(active >= 0 ? { 'aria-activedescendant': `${id}-o${active}` } : {})}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
          else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            const r = results[active];
            if (r) go(href.tool(r.id));
            else if (q.trim()) go(href.search(q.trim()));
          }
        }}
      />
      {showList ? (
        <ul className="combo-list" id={listId} role="listbox" aria-label="Search results">
          {results.length === 0 ? <li className="combo-empty" role="presentation">No tools match “{q.trim()}”.</li> : null}
          {results.map((t, i) => (
            <li key={t.id} id={`${id}-o${i}`} role="option" aria-selected={i === active} className="combo-opt" onMouseDown={(e) => { e.preventDefault(); go(href.tool(t.id)); }} onMouseEnter={() => setActive(i)}>
              {t.name}
              <span>{t.description}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Header({ route }: { route: Route }) {
  return (
    <header className="site-header">
      <div className="container header-row">
        <a className="brand" href={href.home()} aria-label="ALRECT FILE TOOLS, home">
          <Logo size={3} />
          <span className="brand-name">Alrect <b>File Tools</b></span>
        </a>
        <div className="header-search"><SearchBox initial={route.name === 'search' ? route.q : ''} /></div>
        <nav className="nav" aria-label="Main">
          <a href={href.tools()} {...(route.name === 'tools' || route.name === 'category' || route.name === 'tool' ? { 'aria-current': 'page' as const } : {})}>Tools</a>
          <a className="nav-extra" href={href.page('favorites')} {...(route.name === 'favorites' ? { 'aria-current': 'page' as const } : {})}>Favorites</a>
          <a href={href.page('donate')} {...(route.name === 'donate' ? { 'aria-current': 'page' as const } : {})}>Donate</a>
          <ThemeSwitch />
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <p className="brand-name" style={{ marginBottom: 12 }}>Alrect <b>File Tools</b></p>
            <p className="footer-note">Small Pixels. Powerful Tools. File tools that run in your browser tab. Your files are not uploaded.</p>
          </div>
          <div>
            <h2>Explore</h2>
            <ul>
              <li><a href={href.tools()}>All tools</a></li>
              <li><a href={href.page('favorites')}>Favorites</a></li>
              <li><a href={href.page('recent')}>Recently used</a></li>
              <li><a href={href.page('help')}>Help</a></li>
              <li><a href={href.page('donate')}>Donate</a></li>
            </ul>
          </div>
          <div>
            <h2>Project</h2>
            <ul>
              <li><a href={href.page('about')}>About</a></li>
              <li><a href={href.page('privacy')}>Privacy</a></li>
              <li><a href={href.page('security')}>Security</a></li>
              <li><a href="mailto:mycontant.gokil@alzvyn.web.id">mycontant.gokil@alzvyn.web.id</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>Created by Alrect and AI</span>
          <span>v{__APP_VERSION__} · MIT licence</span>
        </div>
      </div>
    </footer>
  );
}
