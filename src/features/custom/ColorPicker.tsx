import { useEffect, useRef, useState } from 'react';
import type { CustomProps } from '../types';
import { decodeImage } from '../../lib/canvas';
import { parseColor } from '../../lib/devtools';
import { errorMessage } from '../../lib/safe';
import { CopyButton } from '../../components/Bits';
import { announce } from '../../components/Announcer';

interface Picked { hex: string; rgb: string; hsl: string; x: number; y: number }
const MAX_LIST = 24;

export default function ColorPicker({ markUsed }: CustomProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLCanvasElement | null>(null);
  const [name, setName] = useState('');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [picked, setPicked] = useState<Picked[]>([]);

  const read = (x: number, y: number): Picked | null => {
    const s = source.current;
    if (!s) return null;
    const cx = Math.min(s.width - 1, Math.max(0, Math.round(x))), cy = Math.min(s.height - 1, Math.max(0, Math.round(y)));
    const d = (s.getContext('2d') as CanvasRenderingContext2D).getImageData(cx, cy, 1, 1).data;
    const info = parseColor(`rgba(${d[0]}, ${d[1]}, ${d[2]}, ${(d[3] as number) / 255})`);
    return { hex: info.hex, rgb: info.rgb, hsl: info.hsl, x: cx, y: cy };
  };

  const pick = (x: number, y: number) => {
    const p = read(x, y);
    if (!p) return;
    markUsed();
    setPicked((l) => [p, ...l.filter((q) => q.hex !== p.hex)].slice(0, MAX_LIST));
    announce(`Picked ${p.hex} at ${p.x}, ${p.y}`);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    try {
      const bmp = await decodeImage(f);
      const s = document.createElement('canvas');
      s.width = bmp.width; s.height = bmp.height;
      (s.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D).drawImage(bmp, 0, 0);
      bmp.close();
      source.current = s;
      setSize({ w: s.width, h: s.height }); setName(f.name); setPicked([]); setCursor({ x: Math.floor(s.width / 2), y: Math.floor(s.height / 2) });
    } catch (e) { setErr(errorMessage(e)); }
  };

  useEffect(() => {
    const c = canvas.current, s = source.current;
    if (!c || !s || !size) return;
    c.width = s.width; c.height = s.height;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.drawImage(s, 0, 0);
    const r = Math.max(2, Math.round(Math.max(s.width, s.height) / 120));
    g.lineWidth = Math.max(1, r / 2); g.strokeStyle = '#080C16'; g.strokeRect(cursor.x - r * 2, cursor.y - r * 2, r * 4, r * 4);
    g.strokeStyle = '#FFD078'; g.strokeRect(cursor.x - r * 2 + g.lineWidth, cursor.y - r * 2 + g.lineWidth, r * 4 - g.lineWidth * 2, r * 4 - g.lineWidth * 2);
  }, [size, cursor]);

  const toImage = (e: { clientX: number; clientY: number }) => {
    const c = canvas.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const live = read(cursor.x, cursor.y);

  return (
    <div className="tool-panel">
      <div className="field">
        <label htmlFor="cp-file">Image</label>
        <input id="cp-file" className="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" onChange={(e) => void onFile(e.target.files?.[0])} />
        <p className="help">Processed in this browser tab. Nothing is uploaded.</p>
      </div>
      {err ? <div className="notice notice-error" role="alert"><p>{err}</p></div> : null}
      {size ? (
        <>
          <p className="help">{name}, {size.w}×{size.h}. Click the image, or focus it and use the arrow keys (hold Shift for 10 px) and press Enter.</p>
          <div style={{ overflow: 'auto', maxWidth: '100%', border: '2px solid var(--line)' }}>
            <canvas
              ref={canvas}
              tabIndex={0}
              role="img"
              aria-label={`Image ${name}. Cursor at ${cursor.x}, ${cursor.y}${live ? `, colour ${live.hex}` : ''}. Press Enter to pick.`}
              style={{ display: 'block', maxWidth: '100%', height: 'auto', imageRendering: size.w < 200 ? 'pixelated' : 'auto', cursor: 'crosshair' }}
              onClick={(e) => { const p = toImage(e); setCursor({ x: Math.round(p.x), y: Math.round(p.y) }); pick(p.x, p.y); }}
              onMouseMove={(e) => { const p = toImage(e); setCursor({ x: Math.round(p.x), y: Math.round(p.y) }); }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 10 : 1;
                const mv = (dx: number, dy: number) => { e.preventDefault(); setCursor((c) => ({ x: Math.min(size.w - 1, Math.max(0, c.x + dx)), y: Math.min(size.h - 1, Math.max(0, c.y + dy)) })); };
                if (e.key === 'ArrowLeft') mv(-step, 0); else if (e.key === 'ArrowRight') mv(step, 0); else if (e.key === 'ArrowUp') mv(0, -step); else if (e.key === 'ArrowDown') mv(0, step);
                else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(cursor.x, cursor.y); }
              }}
            />
          </div>
          {live ? <p className="help" aria-live="off">Under cursor ({cursor.x}, {cursor.y}): <b>{live.hex}</b></p> : null}
        </>
      ) : null}
      {picked.length ? (
        <div style={{ marginTop: 16 }}>
          <h3>Picked colours</h3>
          <ul className="list-plain" style={{ display: 'grid', gap: 8 }}>
            {picked.map((p) => (
              <li key={p.hex} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span aria-hidden style={{ width: 28, height: 28, background: p.hex, border: '2px solid var(--line-2)' }} />
                <code>{p.hex}</code><code>{p.rgb}</code><code>{p.hsl}</code>
                <CopyButton text={p.hex} label="Copy HEX" />
              </li>
            ))}
          </ul>
          <CopyButton text={() => picked.map((p) => p.hex).join('\n')} label="Copy all HEX" small={false} />
        </div>
      ) : null}
    </div>
  );
}
