import { useEffect, useState, type ComponentType } from 'react';
import type { CustomProps } from '../features/types';
import { errorMessage } from '../lib/safe';
import { I } from './icons';

export function LazyCustom({ toolId, loader, markUsed }: { toolId: string; loader: () => Promise<{ default: ComponentType<CustomProps> }>; markUsed: () => void }) {
  const [C, setC] = useState<ComponentType<CustomProps> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loader().then((m) => { if (live) setC(() => m.default); }).catch((e: unknown) => { if (live) setErr(errorMessage(e)); });
    return () => { live = false; };
  }, [loader]);
  if (err) return <div className="notice notice-error" style={{ marginTop: 24 }} role="alert"><I.err size={18} aria-hidden /><p>The tool could not be loaded: {err}</p></div>;
  if (!C) return <div className="tool-panel" role="status">Loading tool…</div>;
  return <C toolId={toolId} markUsed={markUsed} />;
}
