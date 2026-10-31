import { useEffect, useState, useSyncExternalStore } from 'react';
import { parseHash, type Route } from '../app/router';
import { stores } from '../app/stores';

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function useFavorites(): readonly string[] {
  const s = stores().favorites;
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}

export function useRecents() {
  const s = stores().recents;
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}

/** An object URL for a Blob that is revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
