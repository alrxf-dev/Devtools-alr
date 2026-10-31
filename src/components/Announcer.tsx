import { useEffect, useState } from 'react';

let listeners: ((m: string) => void)[] = [];

/** Announce a short status message to screen readers (and show it as a toast for sighted users). */
export function announce(message: string): void {
  listeners.forEach((l) => l(message));
}

export function Announcer() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const l = (m: string) => {
      setMsg('');
      // Clearing first makes repeated identical messages announce again.
      setTimeout(() => setMsg(m), 20);
      clearTimeout(t);
      t = setTimeout(() => setMsg(''), 3500);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
      clearTimeout(t);
    };
  }, []);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{msg}</div>
      {msg ? <div className="toast" aria-hidden="true">{msg}</div> : null}
    </>
  );
}
