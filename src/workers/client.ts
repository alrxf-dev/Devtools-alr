import type { JobName, Jobs, Progress } from './jobs';

export interface JobOptions {
  signal?: AbortSignal;
  onProgress?: Progress;
}

type Arg<K extends JobName> = Parameters<Jobs[K]>[0];
type Ret<K extends JobName> = Awaited<ReturnType<Jobs[K]>>;

function workerUrl(): string | null {
  if (typeof Worker === 'undefined' || typeof document === 'undefined') return null;
  if (typeof __WORKER_COMPUTE__ === 'undefined') return null;
  return new URL(__WORKER_COMPUTE__, document.baseURI).href;
}

/**
 * Run a heavy job in a fresh module worker, which is terminated when the job finishes or is cancelled.
 * If workers are unavailable or fail to start, the job runs on the main thread instead of failing.
 */
export async function runJob<K extends JobName>(name: K, args: Arg<K>, opts: JobOptions = {}): Promise<Ret<K>> {
  if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const url = workerUrl();
  if (url) {
    try {
      return await runInWorker(url, name, args, opts);
    } catch (e) {
      if (!(e instanceof WorkerStartError)) throw e;
    }
  }
  const { jobs } = await import('./jobs');
  const fn = jobs[name] as (a: unknown, p: Progress) => unknown;
  return (await fn(args, opts.onProgress ?? (() => undefined))) as Ret<K>;
}

class WorkerStartError extends Error {}

function runInWorker<K extends JobName>(url: string, name: K, args: Arg<K>, opts: JobOptions): Promise<Ret<K>> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(url, { type: 'module' });
    } catch {
      reject(new WorkerStartError('worker unavailable'));
      return;
    }
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener('abort', onAbort);
      w.terminate();
      fn();
    };
    const onAbort = () => finish(() => reject(new DOMException('Cancelled', 'AbortError')));
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    w.onmessage = (e: MessageEvent<{ type: string; result?: unknown; fraction?: number; label?: string; message?: string; name?: string }>) => {
      const m = e.data;
      if (m.type === 'progress') opts.onProgress?.(m.fraction ?? 0, m.label);
      else if (m.type === 'done') finish(() => resolve(m.result as Ret<K>));
      else if (m.type === 'error') {
        const err = new Error(m.message ?? 'Job failed.');
        err.name = m.name ?? 'Error';
        finish(() => reject(err));
      }
    };
    w.onerror = () => finish(() => reject(new WorkerStartError('worker failed to start')));
    w.postMessage({ name, args });
  });
}
