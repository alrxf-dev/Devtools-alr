import { CATEGORY_BY_ID, TOOLS } from './index';
import type { CategoryId, ToolMeta, ToolStatus } from './types';

export interface SearchFilters {
  category?: CategoryId | undefined;
  status?: ToolStatus | undefined;
}

/** Lowercase, strip diacritics, and collapse punctuation so "PDF-Tools" and "pdf tools" match. */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

interface Indexed {
  tool: ToolMeta;
  name: string;
  id: string;
  keywords: string;
  description: string;
  category: string;
}

const INDEX: Indexed[] = TOOLS.map((tool) => ({
  tool,
  name: normalize(tool.name),
  id: normalize(tool.id),
  keywords: normalize((tool.keywords ?? []).join(' ')),
  description: normalize(tool.description),
  category: normalize(CATEGORY_BY_ID.get(tool.category)?.name ?? ''),
}));

function scoreToken(ix: Indexed, tok: string): number {
  let s = 0;
  if (ix.name.split(' ').some((w) => w.startsWith(tok))) s += 8;
  else if (ix.name.includes(tok)) s += 5;
  if (ix.id.includes(tok)) s += 2;
  if (ix.keywords.split(' ').some((w) => w.startsWith(tok))) s += 4;
  else if (ix.keywords.includes(tok)) s += 2;
  if (ix.description.includes(tok)) s += 2;
  if (ix.category.includes(tok)) s += 1;
  return s;
}

/** AND-match every query word; rank by where it matched. An empty query returns everything in catalogue order. */
export function searchTools(query: string, filters: SearchFilters = {}): ToolMeta[] {
  const toks = normalize(query).split(' ').filter(Boolean);
  const out: { tool: ToolMeta; score: number; order: number }[] = [];
  INDEX.forEach((ix, order) => {
    if (filters.category && ix.tool.category !== filters.category) return;
    if (filters.status && ix.tool.status !== filters.status) return;
    let total = 0;
    for (const tok of toks) {
      const s = scoreToken(ix, tok);
      if (s === 0) return;
      total += s;
    }
    out.push({ tool: ix.tool, score: total, order });
  });
  if (toks.length === 0) return out.map((o) => o.tool);
  return out.sort((a, b) => b.score - a.score || a.order - b.order).map((o) => o.tool);
}
