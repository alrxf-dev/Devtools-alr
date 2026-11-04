import type { CategoryId, ToolIO, ToolMeta, ToolStatus } from '../types';

type Extra = Partial<Pick<ToolMeta, 'keywords' | 'safety' | 'featured' | 'statusNote' | 'isNew'>> & { status?: ToolStatus };

/** Builds the tool factory for one category so entries stay short and cannot drift in shape. */
export function category(cat: CategoryId) {
  return (id: string, name: string, io: ToolIO, description: string, extra: Extra = {}): ToolMeta => ({
    id,
    name,
    description,
    category: cat,
    io,
    status: extra.status ?? 'working',
    ...(extra.statusNote ? { statusNote: extra.statusNote } : {}),
    ...(extra.keywords ? { keywords: extra.keywords } : {}),
    ...(extra.safety ? { safety: extra.safety } : {}),
    ...(extra.featured ? { featured: true } : {}),
    ...(extra.isNew ? { isNew: true } : {}),
  });
}
