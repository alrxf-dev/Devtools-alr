import type { RegexRequest, RegexResponse } from './regex.worker';

export type RegexResult = { ok: true; data: RegexResponse } | { ok: false; error: string; timedOut?: boolean };

export function runRegex(req: RegexRequest, timeoutMs = 2000): Promise<RegexResult> {
  return new Promise((resolve) => {
    if (typeof Worker === 'undefined' || typeof __WORKER_REGEX__ === 'undefined') {
      resolve({ ok: false, error: 'Web Workers are not available, so regular expressions cannot be run safely in this browser.' });
      return;
    }
    let w: Worker;
    try {
      w = new Worker(new URL(__WORKER_REGEX__, document.baseURI).href, { type: 'module' });
    } catch {
      resolve({ ok: false, error: 'The regex worker could not be started.' });
      return;
    }
    const timer = setTimeout(() => {
      w.terminate();
      resolve({ ok: false, timedOut: true, error: `The pattern ran longer than ${timeoutMs / 1000} seconds and was stopped. It probably has catastrophic backtracking (for example nested quantifiers such as (a+)+).` });
    }, timeoutMs);
    w.onmessage = (e: MessageEvent<RegexResponse | { ok: false; error: string }>) => {
      clearTimeout(timer);
      w.terminate();
      resolve(e.data.ok ? { ok: true, data: e.data } : { ok: false, error: e.data.error });
    };
    w.onerror = () => {
      clearTimeout(timer);
      w.terminate();
      resolve({ ok: false, error: 'The regex worker failed.' });
    };
    w.postMessage(req);
  });
}
