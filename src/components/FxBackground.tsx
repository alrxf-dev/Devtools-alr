import { useEffect, useRef } from 'react';
import { PixelField, type FieldState } from '../fx/field';

declare global {
  interface Window {
    /** Test hook, set only when the page is opened with ?perf. */
    __alrectFx?: { state: string; fps: number };
  }
}

export type FxMode = 'auto' | 'off';

function setFxAttr(v: string): void {
  document.documentElement.setAttribute('data-fx', v);
}

/**
 * Decorative WebGL background. Falls back to the CSS layer when WebGL2 is missing, the user turned effects off,
 * or the context is lost; shows one still frame when the user prefers reduced motion.
 */
export function FxBackground({ mode }: { mode: FxMode }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || mode === 'off') {
      setFxAttr('off');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    el.append(canvas);
    const perf = new URLSearchParams(location.search).has('perf');
    let badge: HTMLDivElement | null = null;
    if (perf) {
      badge = document.createElement('div');
      badge.className = 'perf-badge';
      badge.textContent = 'fps: …';
      document.body.append(badge);
      window.__alrectFx = { state: 'init', fps: 0 };
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const label: Record<FieldState, string> = { running: 'webgl', static: 'static', lost: 'css', unsupported: 'css' };
    const field = new PixelField(canvas, {
      onState: (s) => {
        setFxAttr(label[s]);
        if (window.__alrectFx) window.__alrectFx.state = s;
        canvas.style.visibility = s === 'lost' || s === 'unsupported' ? 'hidden' : 'visible';
      },
      onFps: (fps) => {
        if (badge) badge.textContent = `fps: ${fps.toFixed(0)}`;
        if (window.__alrectFx) window.__alrectFx.fps = fps;
      },
    });
    field.setAnimate(!mq.matches);
    const onMq = () => field.setAnimate(!mq.matches);
    mq.addEventListener('change', onMq);
    return () => {
      mq.removeEventListener('change', onMq);
      field.destroy();
      canvas.remove();
      badge?.remove();
    };
  }, [mode]);

  return (
    <div className="fx" aria-hidden="true">
      <div className="fx-fallback" />
      <div ref={host} />
    </div>
  );
}
