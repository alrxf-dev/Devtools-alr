export type CategoryId = 'image' | 'pdf' | 'files' | 'archive' | 'text' | 'data' | 'audio' | 'video' | 'developer' | 'security';

/**
 * working     - implemented and exercised by automated tests.
 * partial     - implemented, but with a documented functional limit (see statusNote).
 * backend     - needs a server that this project does not ship.
 * unsupported - cannot be done reliably in a browser; listed so the gap is visible.
 */
export type ToolStatus = 'working' | 'partial' | 'backend' | 'unsupported';

/** What the user gives the tool. Used for cards and filters; the real inputs are defined by the implementation. */
export type ToolIO = 'text' | 'file' | 'files' | 'text+file' | 'none';

export interface ToolMeta {
  /** Stable kebab-case identifier. Never change it once released; favourites and history are keyed by it. */
  id: string;
  name: string;
  description: string;
  category: CategoryId;
  status: ToolStatus;
  /** Required unless status is "working". For working tools it may carry a short usage caveat. */
  statusNote?: string;
  io: ToolIO;
  keywords?: string[];
  /** Tool-specific safety or privacy caveat shown on the tool page. */
  safety?: string;
  /** Surfaced on the home page. */
  featured?: boolean;
}

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  short: string;
  description: string;
  /** Typical limits shown on every tool page in the category. */
  limits: string;
  /** Key into the icon map in components/icons.ts. */
  icon: string;
  /** CSS custom-property name suffix for the accent colour. */
  accent: string;
}

export const STATUS_LABEL: Record<ToolStatus, string> = {
  working: 'Working',
  partial: 'Partial',
  backend: 'Needs backend',
  unsupported: 'Unsupported',
};

export const STATUS_HELP: Record<ToolStatus, string> = {
  working: 'Fully implemented in the browser and covered by automated tests.',
  partial: 'Implemented, with a limitation described on the tool page.',
  backend: 'Needs a server component this project does not include.',
  unsupported: 'Not possible to do reliably in a browser.',
};
