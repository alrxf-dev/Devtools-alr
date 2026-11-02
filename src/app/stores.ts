import { TOOL_BY_ID } from '../registry';
import { browserStorage, type KV } from './storage';

/** Minimal observable store compatible with React's useSyncExternalStore. Snapshots are immutable arrays. */
export class ListStore<T> {
  private snapshot: readonly T[];
  private listeners = new Set<() => void>();

  constructor(private readonly key: string, private readonly kv: KV, private readonly parse: (raw: unknown) => T | null, private readonly max: number) {
    this.snapshot = this.load();
  }

  private load(): readonly T[] {
    try {
      const raw = this.kv.getItem(this.key);
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr.map((x) => this.parse(x)).filter((x): x is T => x !== null).slice(0, this.max);
    } catch {
      return [];
    }
  }

  get = (): readonly T[] => this.snapshot;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  set(next: readonly T[]): void {
    this.snapshot = next.slice(0, this.max);
    try {
      this.kv.setItem(this.key, JSON.stringify(this.snapshot));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
    this.listeners.forEach((l) => l());
  }

  /** Re-read from storage, e.g. after another tab changed it. */
  refresh(): void {
    this.snapshot = this.load();
    this.listeners.forEach((l) => l());
  }
}

export interface RecentEntry {
  id: string;
  at: number;
}

const parseId = (x: unknown): string | null => (typeof x === 'string' && TOOL_BY_ID.has(x) ? x : null);
const parseRecent = (x: unknown): RecentEntry | null => {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  return typeof o['id'] === 'string' && TOOL_BY_ID.has(o['id']) && typeof o['at'] === 'number' ? { id: o['id'], at: o['at'] } : null;
};

export function createStores(kv: KV = browserStorage()) {
  const favorites = new ListStore<string>('alrect.favorites.v1', kv, parseId, 200);
  const recents = new ListStore<RecentEntry>('alrect.recent.v1', kv, parseRecent, 12);
  return {
    favorites,
    recents,
    isFavorite: (id: string) => favorites.get().includes(id),
    toggleFavorite(id: string): boolean {
      if (!TOOL_BY_ID.has(id)) return false;
      const cur = favorites.get();
      const on = !cur.includes(id);
      favorites.set(on ? [id, ...cur] : cur.filter((x) => x !== id));
      return on;
    },
    clearFavorites: () => favorites.set([]),
    /** Called only when the user actually runs or uses a tool, never merely on viewing its page. */
    markUsed(id: string, now = Date.now()): void {
      if (!TOOL_BY_ID.has(id)) return;
      const cur = recents.get();
      if (cur[0]?.id === id && now - cur[0].at < 60_000) return; // avoid rewriting on every keystroke
      recents.set([{ id, at: now }, ...cur.filter((r) => r.id !== id)]);
    },
    clearRecents: () => recents.set([]),
    kv,
  };
}

export type Stores = ReturnType<typeof createStores>;

let shared: Stores | null = null;
export function stores(): Stores {
  if (!shared) {
    shared = createStores();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'alrect.favorites.v1') shared?.favorites.refresh();
        if (e.key === 'alrect.recent.v1') shared?.recents.refresh();
      });
    }
  }
  return shared;
}

// ---- effects preference ----
export type FxPref = 'auto' | 'off';
const FX_KEY = 'alrect.fx.v1';

export function readFxPref(kv: KV = browserStorage()): FxPref {
  try {
    return kv.getItem(FX_KEY) === 'off' ? 'off' : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeFxPref(v: FxPref, kv: KV = browserStorage()): void {
  try {
    kv.setItem(FX_KEY, v);
  } catch {
    /* ignore */
  }
}
