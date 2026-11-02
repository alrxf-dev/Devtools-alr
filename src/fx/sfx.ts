/**
 * Retro UI sounds synthesised with the Web Audio API (square/triangle oscillators, no audio files).
 * Off by default and only ever started from a user gesture. Failure to create an AudioContext is silent.
 */
export type Sfx = 'click' | 'toggle' | 'ok' | 'err' | 'nav';

const KEY = 'alrect.sfx.v1';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;

export function readSfxPref(): boolean {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}
export function writeSfxPref(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}
export function setSfxEnabled(on: boolean): void {
  enabled = on;
  if (!on && ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
}
export const sfxEnabled = (): boolean => enabled;

function engine(): { c: AudioContext; out: GainNode } | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain();
      master.gain.value = 0.12; // deliberately quiet
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return master ? { c: ctx, out: master } : null;
  } catch { return null; }
}

/** [frequency Hz, start offset s, length s, waveform] */
type Note = [number, number, number, OscillatorType];
const PATTERNS: Record<Sfx, Note[]> = {
  click: [[880, 0, 0.04, 'square']],
  nav: [[523, 0, 0.04, 'square'], [784, 0.045, 0.05, 'square']],
  toggle: [[660, 0, 0.05, 'triangle'], [990, 0.05, 0.06, 'triangle']],
  ok: [[523, 0, 0.07, 'square'], [659, 0.07, 0.07, 'square'], [784, 0.14, 0.12, 'square']],
  err: [[220, 0, 0.1, 'sawtooth'], [165, 0.1, 0.16, 'sawtooth']],
};

export function playSfx(kind: Sfx): void {
  if (!enabled) return;
  const e = engine();
  if (!e) return;
  const t0 = e.c.currentTime + 0.005;
  for (const [f, off, len, wave] of PATTERNS[kind]) {
    const o = e.c.createOscillator();
    const g = e.c.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f, t0 + off);
    g.gain.setValueAtTime(0.0001, t0 + off);
    g.gain.exponentialRampToValueAtTime(1, t0 + off + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + len);
    o.connect(g).connect(e.out);
    o.start(t0 + off);
    o.stop(t0 + off + len + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
}

/** Delegated listener: one handler for the whole app. Returns a cleanup function. */
export function installSfx(root: Document = document): () => void {
  const on = (ev: Event) => {
    if (!enabled) return;
    const t = (ev.target as Element | null)?.closest?.('button, a[href], [role="button"], summary');
    if (!t || (t as HTMLButtonElement).disabled) return;
    playSfx(t.tagName === 'A' ? 'nav' : t.hasAttribute('aria-pressed') ? 'toggle' : 'click');
  };
  const custom = (ev: Event) => playSfx((ev as CustomEvent<Sfx>).detail);
  root.addEventListener('click', on, true);
  window.addEventListener('alrect:sfx', custom);
  return () => { root.removeEventListener('click', on, true); window.removeEventListener('alrect:sfx', custom); if (ctx) { void ctx.close().catch(() => undefined); ctx = null; master = null; } };
}

export const emitSfx = (kind: Sfx): void => { try { window.dispatchEvent(new CustomEvent<Sfx>('alrect:sfx', { detail: kind })); } catch { /* ignore */ } };
