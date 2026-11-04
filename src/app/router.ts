import { CATEGORY_BY_ID, TOOL_BY_ID } from '../registry';
import type { CategoryId, ToolStatus } from '../registry';

export type Route =
  | { name: 'home' }
  | { name: 'tools'; category?: CategoryId; status?: ToolStatus; onlyNew?: boolean }
  | { name: 'category'; id: CategoryId }
  | { name: 'tool'; id: string }
  | { name: 'favorites' }
  | { name: 'recent' }
  | { name: 'search'; q: string }
  | { name: 'about' }
  | { name: 'privacy' }
  | { name: 'security' }
  | { name: 'donate' }
  | { name: 'help' }
  | { name: 'notfound'; path: string };

const STATUSES = new Set<string>(['working', 'partial', 'backend', 'unsupported']);

/** Parse a location hash such as "#/tool/json-formatter?x=1". Pure, so it is unit-tested. Never throws. */
export function parseHash(hash: string): Route {
  let h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (h === '' || h === '/') return { name: 'home' };
  if (!h.startsWith('/')) h = '/' + h;
  const qi = h.indexOf('?');
  const path = qi >= 0 ? h.slice(0, qi) : h;
  const query = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : '');
  let segs: string[];
  try {
    segs = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { name: 'notfound', path };
  }
  const [a, b, ...rest] = segs;
  if (rest.length > 0) return { name: 'notfound', path };
  switch (a) {
    case 'tools': {
      if (b !== undefined) return { name: 'notfound', path };
      const c = query.get('category');
      const s = query.get('status');
      return {
        name: 'tools',
        ...(c && CATEGORY_BY_ID.has(c) ? { category: c as CategoryId } : {}),
        ...(s && STATUSES.has(s) ? { status: s as ToolStatus } : {}),
        ...(query.get('new') === '1' ? { onlyNew: true } : {}),
      };
    }
    case 'category':
      return b && CATEGORY_BY_ID.has(b) ? { name: 'category', id: b as CategoryId } : { name: 'notfound', path };
    case 'tool':
      return b && TOOL_BY_ID.has(b) ? { name: 'tool', id: b } : { name: 'notfound', path };
    case 'search':
      return b === undefined ? { name: 'search', q: (query.get('q') ?? '').slice(0, 200) } : { name: 'notfound', path };
    case 'favorites':
    case 'recent':
    case 'about':
    case 'privacy':
    case 'security':
    case 'donate':
    case 'help':
      return b === undefined ? ({ name: a } as Route) : { name: 'notfound', path };
    default:
      return { name: 'notfound', path };
  }
}

export const href = {
  home: () => '#/',
  tools: (o: { category?: CategoryId; status?: ToolStatus; onlyNew?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (o.onlyNew) p.set('new', '1');
    if (o.category) p.set('category', o.category);
    if (o.status) p.set('status', o.status);
    const s = p.toString();
    return `#/tools${s ? '?' + s : ''}`;
  },
  category: (id: CategoryId) => `#/category/${id}`,
  tool: (id: string) => `#/tool/${encodeURIComponent(id)}`,
  search: (q: string) => `#/search?q=${encodeURIComponent(q)}`,
  page: (n: 'favorites' | 'recent' | 'about' | 'privacy' | 'security' | 'donate' | 'help') => `#/${n}`,
};

export function routeTitle(r: Route): string {
  switch (r.name) {
    case 'home': return 'ALRECT FILE TOOLS';
    case 'tools': return 'All tools';
    case 'category': return CATEGORY_BY_ID.get(r.id)?.name ?? 'Category';
    case 'tool': return TOOL_BY_ID.get(r.id)?.name ?? 'Tool';
    case 'favorites': return 'Favorites';
    case 'recent': return 'Recently used';
    case 'search': return r.q ? `Search: ${r.q}` : 'Search';
    case 'about': return 'About ALRECT';
    case 'privacy': return 'Privacy';
    case 'security': return 'Security';
    case 'donate': return 'Donate';
    case 'help': return 'Help and troubleshooting';
    case 'notfound': return 'Page not found';
  }
}
