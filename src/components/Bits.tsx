import { useState } from 'react';
import { STATUS_HELP, STATUS_LABEL, type CategoryMeta, type ToolMeta, type ToolStatus } from '../registry';
import { href } from '../app/router';
import { stores } from '../app/stores';
import { useFavorites } from '../hooks/useApp';
import { CATEGORY_ICONS, I } from './icons';
import { announce } from './Announcer';
import { copyText } from '../lib/download';

export function StatusBadge({ status }: { status: ToolStatus }) {
  return <span className={`badge badge-${status}`} title={STATUS_HELP[status]}>{STATUS_LABEL[status]}</span>;
}

export function FavButton({ tool }: { tool: ToolMeta }) {
  const favs = useFavorites();
  const on = favs.includes(tool.id);
  return (
    <button
      type="button"
      className="fav-btn"
      aria-pressed={on}
      aria-label={on ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`}
      onClick={() => {
        const now = stores().toggleFavorite(tool.id);
        announce(now ? `${tool.name} added to favorites` : `${tool.name} removed from favorites`);
      }}
    >
      <I.star size={20} aria-hidden />
    </button>
  );
}

export function ToolCard({ tool }: { tool: ToolMeta }) {
  const cat = CATEGORY_ICONS[tool.category];
  const Icon = cat ?? I.zap;
  return (
    <div className="card-wrap">
      <a className="card" href={href.tool(tool.id)}>
        <div className="card-top">
          <span className="cat-icon cat-cyan" style={{ width: 32, height: 32 }}><Icon size={18} aria-hidden /></span>
        </div>
        <h3>{tool.name}</h3>
        <p>{tool.description}</p>
        <div className="card-foot"><StatusBadge status={tool.status} /></div>
      </a>
      <FavButton tool={tool} />
    </div>
  );
}

export function CategoryCard({ cat, count }: { cat: CategoryMeta; count: number }) {
  const Icon = CATEGORY_ICONS[cat.icon] ?? I.zap;
  return (
    <a className="card" href={href.category(cat.id)}>
      <span className={`cat-icon cat-${cat.accent}`}><Icon size={24} aria-hidden /></span>
      <h3>{cat.name}</h3>
      <p>{cat.description.split('. ')[0]}.</p>
      <div className="card-foot"><span style={{ color: 'var(--muted)', fontSize: 13 }}>{count} tools</span></div>
    </a>
  );
}

export function CopyButton({ text, label = 'Copy', small = true }: { text: string | (() => string); label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${small ? 'btn-sm' : ''}`}
      onClick={async () => {
        const ok = await copyText(typeof text === 'function' ? text() : text);
        announce(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy it manually.');
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? <I.check size={16} aria-hidden /> : <I.copy size={16} aria-hidden />}
      {done ? 'Copied' : label}
    </button>
  );
}
