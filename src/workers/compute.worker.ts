/// <reference lib="webworker" />
import { jobs, type JobName } from './jobs';

interface Req { name: JobName; args: unknown }

self.onmessage = async (e: MessageEvent<Req>) => {
  const { name, args } = e.data;
  try {
    const fn = jobs[name] as (a: unknown, p: (f: number, l?: string) => void) => unknown;
    const result = await fn(args, (fraction, label) => self.postMessage({ type: 'progress', fraction, label }));
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : 'Job failed.', name: err instanceof Error ? err.name : 'Error' });
  }
};
