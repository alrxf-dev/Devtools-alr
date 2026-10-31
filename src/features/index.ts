import type { CategoryId } from '../registry';
import type { ImplMap, ToolImpl } from './types';

/** One lazy chunk per category, so a page only downloads the code for the tools it can show. */
const LOADERS: Record<CategoryId, () => Promise<{ IMPL: ImplMap }>> = {
  image: () => import('./image'),
  pdf: () => import('./pdf'),
  files: () => import('./files'),
  archive: () => import('./archive'),
  text: () => import('./text'),
  data: () => import('./data'),
  audio: () => import('./audio'),
  video: () => import('./video'),
  developer: () => import('./developer'),
  security: () => import('./security'),
};

export const CATEGORY_IDS = Object.keys(LOADERS) as CategoryId[];

export async function loadCategory(cat: CategoryId): Promise<ImplMap> {
  return (await LOADERS[cat]()).IMPL;
}

export async function loadImpl(cat: CategoryId, id: string): Promise<ToolImpl | null> {
  const map = await loadCategory(cat);
  return map[id] ?? null;
}
