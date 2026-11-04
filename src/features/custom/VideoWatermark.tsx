import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { CustomProps } from '../types';
import type { Block } from '../types';
import { notice, download } from '../kit';
import { FileDrop } from '../../components/FormTool';
import { ResultView } from '../../components/ResultView';
import { announce } from '../../components/Announcer';
import { DEFAULT_SPEC, MAX_TEXT, anchorCentre, clamp, drawWatermark, hitItem, measureItems, type FontKey, type WatermarkSpec } from '../../lib/watermark';
import { parseHexColor } from '../../lib/canvas';
import { errorMessage, safeDownloadName, withExtension } from '../../lib/safe';
import { formatBytes } from '../../lib/sniff';

const VIDEO_ACCEPT = 'video/*,.mp4,.m4v,.mov,.webm,.mkv,.ogv';
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg';
const MAX_SECONDS = 600;
const PREVIEW_W = 960;
type Active = 'text' | 'logo';
type Logo = HTMLImageElement & { width: number; height: number };

function NumRange({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="field wm-num">
      <label htmlFor={id}>{label}{unit ? ` (${unit})` : ''}</label>
      <div className="wm-num-row">
        <input type="range" aria-label={`${label} slider`} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <input id={id} className="input" type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? min : clamp(Number(e.target.value), min, max))} />
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [raw, setRaw] = useState(value);
  useEffect(() => setRaw(value), [value]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="wm-color-row">
        <input type="color" aria-label={`${label} picker`} value={parseHexColor(value, '#ffffff')} onChange={(e) => onChange(e.target.value)} />
        <input id={id} className="input" type="text" spellCheck={false} autoComplete="off" maxLength={7} value={raw} onChange={(e) => { setRaw(e.target.value); if (/^#[0-9a-fA-F]{6}$/u.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} aria-describedby={`${id}-h`} />
      </div>
      <div className="help" id={`${id}-h`}>Hex like #ff7a1a.</div>
    </div>
  );
}

function loadLogo(file: File): Promise<{ img: Logo; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) { URL.revokeObjectURL(url); reject(new Error('This image has no pixel size. For SVG files, give the <svg> a width and height.')); return; }
      Object.defineProperty(img, 'width', { value: img.naturalWidth });
      Object.defineProperty(img, 'height', { value: img.naturalHeight });
      resolve({ img: img as Logo, url });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`"${file.name}" could not be read as an image.`)); };
    img.src = url; // an <img> never runs scripts, even for SVG
  });
}

function seek(el: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { el.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 4000);
    el.addEventListener('seeked', done);
    el.currentTime = clamp(t, 0, Math.max(0, (el.duration || 0) - 0.05));
  });
}

export default function VideoWatermark({ markUsed }: CustomProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const videoUrl = useRef<string | null>(null);
  const logoUrl = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const drag = useRef<Active | null>(null);

  const [video, setVideo] = useState<File | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number; d: number } | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logo, setLogo] = useState<Logo | null>(null);
  const [spec, setSpec] = useState<WatermarkSpec>(DEFAULT_SPEC);
  const [active, setActive] = useState<Active>('text');
  const [time, setTime] = useState(0);
  const [outW, setOutW] = useState('orig');
  const [mbps, setMbps] = useState(4);
  const [keepAudio, setKeepAudio] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ p: number; label: string } | null>(null);
  const [result, setResult] = useState<Block[] | null>(null);

  const patchText = (p: Partial<WatermarkSpec['text']>) => setSpec((s) => ({ ...s, text: { ...s.text, ...p } }));
  const patchLogo = (p: Partial<WatermarkSpec['logo']>) => setSpec((s) => ({ ...s, logo: { ...s.logo, ...p } }));
  const item = spec[active];

  // ---- load files ----
  const onVideo = async (files: File[]) => {
    const f = files[0];
    setResult(null); setErr(null);
    if (!f) return;
    if (videoUrl.current) URL.revokeObjectURL(videoUrl.current);
    const url = URL.createObjectURL(f);
    videoUrl.current = url;
    const el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto';
    try {
      await new Promise<void>((res, rej) => { el.onloadeddata = () => res(); el.onerror = () => rej(new Error(`This browser cannot play "${f.name}" (unsupported codec or damaged file).`)); setTimeout(() => rej(new Error('Reading the video took too long.')), 15000); el.src = url; });
      if (!Number.isFinite(el.duration)) throw new Error('This video has no known length (a live or unfinished stream), so it cannot be rendered.');
      videoEl.current = el; setVideo(f); setDims({ w: el.videoWidth, h: el.videoHeight, d: el.duration }); setTime(Math.min(1, el.duration / 2));
      markUsed();
    } catch (e) { videoEl.current = null; setVideo(null); setDims(null); setErr(errorMessage(e)); URL.revokeObjectURL(url); videoUrl.current = null; }
  };
  const onLogo = async (files: File[]) => {
    const f = files[0];
    setErr(null);
    if (logoUrl.current) { URL.revokeObjectURL(logoUrl.current); logoUrl.current = null; }
    if (!f) { setLogo(null); setLogoFile(null); return; }
    try { const r = await loadLogo(f); logoUrl.current = r.url; setLogo(r.img); setLogoFile(f); setActive('logo'); }
    catch (e) { setLogo(null); setLogoFile(null); setErr(errorMessage(e)); }
  };
  useEffect(() => () => { abort.current?.abort(); if (videoUrl.current) URL.revokeObjectURL(videoUrl.current); if (logoUrl.current) URL.revokeObjectURL(logoUrl.current); }, []);

  // ---- preview ----
  const paint = useCallback(() => {
    const c = canvas.current, v = videoEl.current;
    if (!c || !v || !dims) return;
    const w = Math.min(dims.w, PREVIEW_W), h = Math.round((w * dims.h) / dims.w);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.drawImage(v, 0, 0, w, h);
    drawWatermark(g, w, h, spec, logo);
    if (!busy) {
      // dashed frame around the item being edited (preview only; never part of the render)
      const m = measureItems(g, w, h, spec, logo)[active];
      if (m) {
        g.save(); g.translate(spec[active].x * w, spec[active].y * h); g.rotate((spec[active].rotation * Math.PI) / 180);
        g.setLineDash([6, 4]); g.lineWidth = 2; g.strokeStyle = '#ffd078'; g.strokeRect(-m.w / 2 - 4, -m.h / 2 - 4, m.w + 8, m.h + 8); g.restore();
      }
    }
  }, [spec, logo, dims, active, busy]);
  useEffect(() => {
    const v = videoEl.current;
    if (!v || !dims) return;
    let live = true;
    void seek(v, time).then(() => { if (live) paint(); });
    return () => { live = false; };
  }, [time, dims, paint]);
  useEffect(() => { paint(); }, [paint]);

  // ---- drag on the preview ----
  const toFrame = (e: { clientX: number; clientY: number }) => {
    const c = canvas.current as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, px: ((e.clientX - r.left) / r.width) * c.width, py: ((e.clientY - r.top) / r.height) * c.height };
  };
  const move = (which: Active, fx: number, fy: number) => (which === 'text' ? patchText : patchLogo)({ x: clamp(fx, 0, 1), y: clamp(fy, 0, 1) });
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget, g = c.getContext('2d') as CanvasRenderingContext2D;
    const f = toFrame(e);
    const hit = hitItem(f.px, f.py, c.width, c.height, spec, measureItems(g, c.width, c.height, spec, logo));
    const which = hit ?? active;
    drag.current = which; setActive(which); move(which, f.fx, f.fy);
    c.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => { if (drag.current) { const f = toFrame(e); move(drag.current, f.fx, f.fy); } };
  const onUp = () => { drag.current = null; };
  const onKey = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const s = (e.shiftKey ? 5 : 1) / 100;
    const d = e.key === 'ArrowLeft' ? [-s, 0] : e.key === 'ArrowRight' ? [s, 0] : e.key === 'ArrowUp' ? [0, -s] : e.key === 'ArrowDown' ? [0, s] : null;
    if (d) { e.preventDefault(); move(active, item.x + (d[0] as number), item.y + (d[1] as number)); }
    else if (e.key === 'Tab') return;
  };
  const anchor = (col: 0 | 1 | 2, row: 0 | 1 | 2) => {
    const c = canvas.current;
    if (!c) return;
    const m = measureItems(c.getContext('2d') as CanvasRenderingContext2D, c.width, c.height, spec, logo)[active];
    const p = anchorCentre(col, row, c.width, c.height, m?.w ?? 0, m?.h ?? 0);
    move(active, p.x, p.y);
  };

  // ---- render ----
  const render = async () => {
    if (!video || !dims) return;
    setErr(null); setResult(null);
    if (typeof MediaRecorder === 'undefined') { setErr('This browser has no MediaRecorder, so a watermarked copy cannot be recorded.'); return; }
    if (!(spec.text.enabled && spec.text.text.trim()) && !(spec.logo.enabled && logo)) { setErr('Nothing to draw. Turn on the text (and type something) or add a logo.'); return; }
    if (dims.d > MAX_SECONDS) { setErr(`Rendering runs in real time. Videos longer than ${MAX_SECONDS / 60} minutes are not supported; trim it first.`); return; }
    const ac = new AbortController(); abort.current = ac;
    const scale = outW === 'orig' ? 1 : Math.min(1, Number(outW) / dims.w);
    const W = Math.max(2, Math.round((dims.w * scale) / 2) * 2), H = Math.max(2, Math.round((dims.h * scale) / 2) * 2);
    const v = document.createElement('video');
    v.playsInline = true; v.preload = 'auto'; v.src = videoUrl.current as string; v.muted = !keepAudio;
    v.setAttribute('aria-hidden', 'true');
    v.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:90px;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.appendChild(v);
    let actx: AudioContext | null = null, stream: MediaStream | null = null, timer = 0, rec: MediaRecorder | null = null;
    const notes: string[] = [];
    try {
      setBusy({ p: 0, label: 'Preparing' });
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('The video could not be reopened for rendering.')); });
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d') as CanvasRenderingContext2D;
      const draw = () => { g.drawImage(v, 0, 0, W, H); drawWatermark(g, W, H, spec, logo); };
      draw();
      stream = cv.captureStream(30);
      if (keepAudio) {
        try {
          actx = new AudioContext();
          if (actx.state === 'suspended') await actx.resume();
          const dest = actx.createMediaStreamDestination();
          actx.createMediaElementSource(v).connect(dest); // not connected to the speakers: the render is silent for you
          dest.stream.getAudioTracks().forEach((t) => (stream as MediaStream).addTrack(t));
        } catch { notes.push('Audio could not be captured in this browser, so the copy has no sound.'); }
      }
      const hasAudio = stream.getAudioTracks().length > 0;
      const mime = (hasAudio ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus'] : ['video/webm;codecs=vp8', 'video/webm;codecs=vp9']).concat('video/webm').find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error('This browser cannot record WebM.');
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(clamp(mbps, 0.2, 40) * 1e6) });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { (rec as MediaRecorder).onstop = () => res(); });
      timer = window.setInterval(draw, 1000 / 30);
      rec.start(250);
      v.currentTime = 0;
      await v.play();
      await new Promise<void>((resolve, reject) => {
        const iv = window.setInterval(() => {
          setBusy({ p: Math.min(1, v.currentTime / dims.d), label: 'Recording in real time' });
          if (ac.signal.aborted) { clearInterval(iv); reject(new DOMException('Cancelled', 'AbortError')); }
          else if (v.ended || v.currentTime >= dims.d - 0.03) { clearInterval(iv); resolve(); }
        }, 100);
      });
      draw();
      clearInterval(timer); v.pause();
      if (rec.state !== 'inactive') { rec.requestData(); rec.stop(); }
      await stopped;
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (!blob.size) throw new Error('Nothing was recorded. Try a smaller output width or another browser.');
      const name = safeDownloadName(withExtension(video.name, 'webm', '-watermark'));
      const blocks: Block[] = [
        notice('success', `Rendered ${dims.d.toFixed(1)} s at ${W}×${H}${hasAudio ? ' with audio' : ' without audio'} (${formatBytes(blob.size)}).`),
        { type: 'media', kind: 'video', blob, title: 'Preview' },
        download(`Download ${name}`, name, 'video/webm', blob, formatBytes(blob.size)),
        notice('info', 'The copy is re-encoded in real time by your browser, so quality is lower than the original and timing can drift by a fraction of a second. The original file is untouched.'),
        ...notes.map((n) => notice('warn', n)),
      ];
      setResult(blocks); announce('Watermarked video is ready to download.');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setErr('Rendering was cancelled.'); }
      else setErr(errorMessage(e));
    } finally {
      clearInterval(timer);
      if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* already stopped */ } }
      stream?.getTracks().forEach((t) => t.stop());
      void actx?.close().catch(() => undefined);
      v.pause(); v.remove(); v.removeAttribute('src'); v.load();
      abort.current = null; setBusy(null);
    }
  };

  const textOn = spec.text.enabled;
  return (
    <div className="tool-panel wm">
      <div className="wm-files">
        <FileDrop spec={{ label: 'Video file', accept: VIDEO_ACCEPT }} files={video ? [video] : []} onFiles={(f) => void onVideo(f)} />
        <FileDrop spec={{ label: 'Logo image (optional): PNG, JPG, WebP, GIF or SVG', accept: LOGO_ACCEPT }} files={logoFile ? [logoFile] : []} onFiles={(f) => void onLogo(f)} />
      </div>
      {err ? <div className="notice notice-error" role="alert"><p>{err}</p></div> : null}

      {video && dims ? (
        <div className="wm-grid">
          <div className="wm-preview">
            <p className="help">{video.name}, {dims.w}×{dims.h}, {dims.d.toFixed(1)} s. Drag the {active} on the frame, or focus the frame and use the arrow keys (Shift = 5%).</p>
            <canvas
              ref={canvas} className="wm-canvas" tabIndex={0} role="img"
              aria-label={`Preview frame at ${time.toFixed(1)} seconds. Editing the ${active} at ${Math.round(item.x * 100)}% across and ${Math.round(item.y * 100)}% down. Arrow keys move it.`}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
            />
            <NumRange label="Preview frame" unit="s" value={Number(time.toFixed(1))} min={0} max={Math.max(0.1, Number(dims.d.toFixed(1)))} step={0.1} onChange={setTime} />
          </div>

          <div className="wm-controls">
            <div className="wm-switch" role="group" aria-label="Item to edit">
              <button type="button" className="chip" aria-pressed={active === 'text'} onClick={() => setActive('text')}>Text</button>
              <button type="button" className="chip" aria-pressed={active === 'logo'} onClick={() => setActive('logo')}>Logo</button>
            </div>

            {active === 'text' ? (
              <fieldset className="wm-set">
                <legend>Text</legend>
                <div className="field"><label className="check" htmlFor="wm-text-on"><input id="wm-text-on" type="checkbox" checked={spec.text.enabled} onChange={(e) => patchText({ enabled: e.target.checked })} /><span>Show text</span></label></div>
                <div className="field">
                  <label htmlFor="wm-text">Text (up to {MAX_TEXT} characters, new lines allowed)</label>
                  <textarea id="wm-text" className="textarea" rows={2} maxLength={MAX_TEXT} value={spec.text.text} onChange={(e) => patchText({ text: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="wm-font">Font</label>
                  <select id="wm-font" className="select" value={spec.text.font} onChange={(e) => patchText({ font: e.target.value as FontKey })}>
                    <option value="sans">Sans-serif</option><option value="serif">Serif</option><option value="mono">Monospace</option><option value="pixel">Pixel</option>
                  </select>
                </div>
                <div className="field"><label className="check" htmlFor="wm-bold"><input id="wm-bold" type="checkbox" checked={spec.text.bold} onChange={(e) => patchText({ bold: e.target.checked })} /><span>Bold</span></label></div>
                <NumRange label="Text size" unit="% of height" value={spec.text.size} min={1} max={40} step={0.5} onChange={(v) => patchText({ size: v })} />
                <ColorField label="Text colour" value={spec.text.color} onChange={(v) => patchText({ color: v })} />
                <div className="field"><label className="check" htmlFor="wm-outline"><input id="wm-outline" type="checkbox" checked={spec.text.outline} onChange={(e) => patchText({ outline: e.target.checked })} /><span>Outline (keeps text readable on any background)</span></label></div>
                {spec.text.outline ? <ColorField label="Outline colour" value={spec.text.outlineColor} onChange={(v) => patchText({ outlineColor: v })} /> : null}
              </fieldset>
            ) : (
              <fieldset className="wm-set">
                <legend>Logo</legend>
                {!logo ? <p className="help">Add a logo image above to place it on the video.</p> : null}
                <div className="field"><label className="check" htmlFor="wm-logo-on"><input id="wm-logo-on" type="checkbox" checked={spec.logo.enabled} onChange={(e) => patchLogo({ enabled: e.target.checked })} /><span>Show logo</span></label></div>
                <NumRange label="Logo size" unit="% of width" value={spec.logo.size} min={1} max={90} step={0.5} onChange={(v) => patchLogo({ size: v })} />
                <div className="field"><label className="check" htmlFor="wm-tint"><input id="wm-tint" type="checkbox" checked={spec.logo.tint} onChange={(e) => patchLogo({ tint: e.target.checked })} /><span>Recolour the logo (keeps its shape, replaces its colours)</span></label></div>
                {spec.logo.tint ? <ColorField label="Logo colour" value={spec.logo.tintColor} onChange={(v) => patchLogo({ tintColor: v })} /> : null}
              </fieldset>
            )}

            <fieldset className="wm-set">
              <legend>Position and look: {active}</legend>
              <div className="wm-anchors" role="group" aria-label="Quick positions">
                {([0, 1, 2] as const).flatMap((r) => ([0, 1, 2] as const).map((c) => (
                  <button key={`${r}${c}`} type="button" className="btn btn-sm" aria-label={`Move ${active} to ${['top', 'middle', 'bottom'][r]} ${['left', 'centre', 'right'][c]}`} onClick={() => anchor(c, r)}>{['↖', '↑', '↗', '←', '•', '→', '↙', '↓', '↘'][r * 3 + c]}</button>
                )))}
              </div>
              <NumRange label="Across" unit="%" value={Math.round(item.x * 100)} min={0} max={100} onChange={(v) => move(active, v / 100, item.y)} />
              <NumRange label="Down" unit="%" value={Math.round(item.y * 100)} min={0} max={100} onChange={(v) => move(active, item.x, v / 100)} />
              <NumRange label="Opacity" unit="%" value={Math.round(item.opacity * 100)} min={5} max={100} onChange={(v) => (active === 'text' ? patchText : patchLogo)({ opacity: v / 100 })} />
              <NumRange label="Rotation" unit="degrees" value={item.rotation} min={-180} max={180} onChange={(v) => (active === 'text' ? patchText : patchLogo)({ rotation: v })} />
            </fieldset>

            <fieldset className="wm-set">
              <legend>Repeat</legend>
              <div className="field"><label className="check" htmlFor="wm-tile"><input id="wm-tile" type="checkbox" checked={spec.tile} onChange={(e) => setSpec((s) => ({ ...s, tile: e.target.checked }))} /><span>Tile across the whole video (harder to crop out)</span></label></div>
              {spec.tile ? <NumRange label="Gap between tiles" unit="% of item size" value={Math.round(spec.tileGap * 100)} min={0} max={400} step={10} onChange={(v) => setSpec((s) => ({ ...s, tileGap: v / 100 }))} /> : null}
            </fieldset>

            <fieldset className="wm-set">
              <legend>Output</legend>
              <div className="field">
                <label htmlFor="wm-outw">Output width</label>
                <select id="wm-outw" className="select" value={outW} onChange={(e) => setOutW(e.target.value)}>
                  <option value="orig">Same as the video ({dims.w} px)</option><option value="1920">At most 1920 px</option><option value="1280">At most 1280 px</option><option value="854">At most 854 px</option><option value="640">At most 640 px</option>
                </select>
              </div>
              <NumRange label="Video bitrate" unit="Mbit/s" value={mbps} min={0.2} max={40} step={0.2} onChange={setMbps} />
              <div className="field"><label className="check" htmlFor="wm-audio"><input id="wm-audio" type="checkbox" checked={keepAudio} onChange={(e) => setKeepAudio(e.target.checked)} /><span>Keep the audio (silent while rendering)</span></label></div>
            </fieldset>
          </div>
        </div>
      ) : null}

      {video && dims ? (
        <div className="wm-actions">
          <button type="button" className="btn btn-primary" disabled={busy !== null || (!textOn && !logo)} onClick={() => void render()}>{busy ? 'Rendering…' : 'Render watermarked video'}</button>
          {busy ? <button type="button" className="btn" onClick={() => abort.current?.abort()}>Cancel</button> : null}
          <p className="help">Rendering plays the video once in real time, so a {dims.d.toFixed(0)}-second video takes about {dims.d.toFixed(0)} seconds. Keep this tab open.</p>
        </div>
      ) : null}
      {busy ? (
        <div role="status" aria-live="polite">
          <div className="progress" aria-hidden="true"><i style={{ width: `${Math.round(busy.p * 100)}%` }} /></div>
          <p className="help">{busy.label}: {Math.round(busy.p * 100)}%</p>
        </div>
      ) : null}
      {result ? <div className="result"><ResultView blocks={result} /></div> : null}
    </div>
  );
}
