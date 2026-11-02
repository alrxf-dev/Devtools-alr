/** Draws a bitmap given as rows of characters. Each character maps to a colour; '.' is transparent. */
export function PixelSprite({ rows, palette, size = 4, label }: { rows: string[]; palette: Record<string, string>; size?: number; label?: string }) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells: { x: number; y: number; c: string }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = row[x];
      const c = k ? palette[k] : undefined;
      if (c) cells.push({ x, y, c });
    }
  });
  return (
    <svg className="sprite" width={w * size} height={h * size} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {cells.map((p) => (
        <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
      ))}
    </svg>
  );
}

const PAL = { t: '#2EC4B6', d: '#146B66', w: '#FFF8E0', c: '#F2E8CB', k: '#0B1426', n: '#264878', o: '#F27D2D', y: '#F4B942', s: '#B8A87A' };

/** The ALRECT mark: a pixel folder-file with a folded corner. */
export function Logo({ size = 3 }: { size?: number }) {
  return (
    <PixelSprite
      size={size}
      palette={PAL}
      rows={[
        'kkkkkkkk..',
        'kwwwwwwkk.',
        'kwwwwwwkok',
        'kwwwwwwkkk',
        'kwtttwwwwk',
        'kwwwwwwwwk',
        'kwoooooowk',
        'kwwwwwwwwk',
        'kwtttttwwk',
        'kkkkkkkkkk',
      ]}
    />
  );
}

/**
 * Hero scene: a beige CRT computer showing a folder, a keyboard and a floppy slot. Drawn with rects on a 96x80
 * grid so it stays crisp at any size. Decorative only; the blinking cursor is a CSS step animation.
 */
export function HeroScene() {
  return (
    <svg viewBox="0 0 96 80" shapeRendering="crispEdges" aria-hidden="true" focusable="false" role="presentation" className="hero-pc">
      {/* monitor */}
      <rect x="14" y="2" width="62" height="44" fill="#0B1426" />
      <rect x="16" y="4" width="58" height="40" fill="#F2E8CB" />
      <rect x="16" y="4" width="58" height="2" fill="#FFF8E0" />
      <rect x="16" y="42" width="58" height="2" fill="#B8A87A" />
      <rect x="22" y="9" width="46" height="30" fill="#0B1426" />
      <rect x="24" y="11" width="42" height="26" fill="#2EC4B6" />
      <rect x="24" y="11" width="42" height="2" fill="#7FE3D8" />
      {/* folder on screen */}
      <rect x="36" y="18" width="10" height="3" fill="#F4B942" />
      <rect x="34" y="21" width="22" height="13" fill="#F4B942" />
      <rect x="34" y="21" width="22" height="2" fill="#FFE08A" />
      <rect x="34" y="32" width="22" height="2" fill="#C98A1B" />
      <rect x="56" y="24" width="2" height="6" fill="#0B1426" className="hero-cursor" />
      {/* monitor details */}
      <rect x="60" y="42" width="2" height="2" fill="#2EC4B6" />
      <rect x="64" y="42" width="6" height="2" fill="#B8A87A" />
      {/* desktop case */}
      <rect x="6" y="50" width="78" height="14" fill="#0B1426" />
      <rect x="8" y="52" width="74" height="10" fill="#F2E8CB" />
      <rect x="8" y="52" width="74" height="2" fill="#FFF8E0" />
      <rect x="8" y="60" width="74" height="2" fill="#B8A87A" />
      <rect x="12" y="55" width="22" height="3" fill="#0B1426" />
      <rect x="40" y="55" width="22" height="3" fill="#0B1426" />
      <rect x="70" y="56" width="4" height="2" fill="#2EC4B6" />
      {/* keyboard */}
      <rect x="10" y="68" width="76" height="10" fill="#0B1426" />
      <rect x="12" y="70" width="72" height="6" fill="#F2E8CB" />
      <g fill="#B8A87A">{Array.from({ length: 16 }, (_, i) => <rect key={i} x={14 + i * 4.4} y="71" width="3" height="1.5" />)}{Array.from({ length: 14 }, (_, i) => <rect key={i} x={16 + i * 4.4} y="73.6" width="3" height="1.5" />)}</g>
      {/* sparkles */}
      <g fill="#F27D2D"><rect x="2" y="12" width="4" height="4" className="hero-spark" /><rect x="88" y="30" width="3" height="3" className="hero-spark s2" /></g>
      <g fill="#F4B942"><rect x="84" y="8" width="4" height="4" className="hero-spark s2" /><rect x="3" y="40" width="2" height="2" className="hero-spark" /></g>
    </svg>
  );
}
