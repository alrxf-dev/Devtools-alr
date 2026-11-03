import { useEffect, useRef, type ReactNode } from 'react';
import { routeTitle } from './app/router';
import { TOOL_BY_ID } from './registry';
import { useRoute } from './hooks/useApp';
import { Header, Footer } from './components/Header';
import { installSfx, setSfxEnabled } from './fx/sfx';
import { FxBackground } from './components/FxBackground';
import { Announcer, announce } from './components/Announcer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToolPage } from './pages/ToolPage';
import { About, Help, Donate, Privacy, SecurityPage } from './pages/Info';
import { AllTools, CategoryPage, FavoritesPage, Home, NotFound, RecentPage, SearchPage } from './pages/Pages';

export function App() {
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // Interface sounds are always on. Browsers keep audio locked until the first click or key press, so the first
  // sound plays on the user's first interaction.
  useEffect(() => { setSfxEnabled(true); return installSfx(); }, []);

  useEffect(() => {
    document.title = route.name === 'home' ? 'ALRECT FILE TOOLS — Small Pixels. Powerful Tools.' : `${routeTitle(route)} · ALRECT FILE TOOLS`;
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
    announce(routeTitle(route));
  }, [route]);

  let page: ReactNode;
  switch (route.name) {
    case 'home': page = <Home />; break;
    case 'tools': page = <AllTools {...(route.category ? { category: route.category } : {})} {...(route.status ? { status: route.status } : {})} />; break;
    case 'category': page = <CategoryPage id={route.id} />; break;
    case 'tool': { const t = TOOL_BY_ID.get(route.id); page = t ? <ToolPage tool={t} /> : <NotFound path={route.id} />; break; }
    case 'favorites': page = <FavoritesPage />; break;
    case 'recent': page = <RecentPage />; break;
    case 'search': page = <SearchPage q={route.q} />; break;
    case 'about': page = <About />; break;
    case 'privacy': page = <Privacy />; break;
    case 'security': page = <SecurityPage />; break;
    case 'donate': page = <Donate />; break;
    case 'help': page = <Help />; break;
    case 'notfound': page = <NotFound path={route.path} />; break;
  }

  return (
    <>
      <FxBackground mode="auto" />
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      <Header route={route} />
      <main id="main" ref={main} tabIndex={-1}>
        <ErrorBoundary resetKey={JSON.stringify(route)}>{page}</ErrorBoundary>
      </main>
      <Footer />
      <Announcer />
    </>
  );
}
