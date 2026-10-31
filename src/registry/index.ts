import type { ToolMeta, CategoryId } from './types';
import { CATEGORIES } from './categories';
import { IMAGE_TOOLS } from './catalog/image';
import { PDF_TOOLS } from './catalog/pdf';
import { FILE_TOOLS } from './catalog/files';
import { ARCHIVE_TOOLS } from './catalog/archive';
import { TEXT_TOOLS } from './catalog/text';
import { DATA_TOOLS } from './catalog/data';
import { AUDIO_TOOLS } from './catalog/audio';
import { VIDEO_TOOLS } from './catalog/video';
import { DEVELOPER_TOOLS } from './catalog/developer';
import { SECURITY_TOOLS } from './catalog/security';

export * from './types';
export { CATEGORIES, CATEGORY_BY_ID } from './categories';

/** The single source of truth for the 150-tool catalogue. */
export const TOOLS: readonly ToolMeta[] = [
  ...IMAGE_TOOLS, ...PDF_TOOLS, ...FILE_TOOLS, ...ARCHIVE_TOOLS, ...TEXT_TOOLS,
  ...DATA_TOOLS, ...AUDIO_TOOLS, ...VIDEO_TOOLS, ...DEVELOPER_TOOLS, ...SECURITY_TOOLS,
];

export const TOOL_BY_ID: ReadonlyMap<string, ToolMeta> = new Map(TOOLS.map((t) => [t.id, t]));

export function toolsInCategory(id: CategoryId): ToolMeta[] {
  return TOOLS.filter((t) => t.category === id);
}

export function countByStatus(): Record<ToolMeta['status'], number> {
  const c = { working: 0, partial: 0, backend: 0, unsupported: 0 };
  for (const t of TOOLS) c[t.status]++;
  return c;
}

export function categoryCounts(): { id: CategoryId; count: number }[] {
  return CATEGORIES.map((c) => ({ id: c.id, count: toolsInCategory(c.id).length }));
}
