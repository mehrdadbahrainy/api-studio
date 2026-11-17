/**
 * UI-only preferences. Never persist workspace payloads, URLs or credentials
 * here: the browser preview is localStorage-backed and desktop vaults are not.
 */
export const SIDEBAR_PREFS_KEY = 'api-studio.layout.v1';
export const MIN_SIDEBAR_WIDTH = 228;
export const MAX_SIDEBAR_WIDTH = 480;
export const DEFAULT_SIDEBAR_WIDTH = 282;
export const COLLAPSED_SIDEBAR_WIDTH = 68;

export interface SidebarPreferences {
  width: number;
  collapsed: boolean;
  collapsedCollectionIds: string[];
}

export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function clampSidebarWidth(value: number, viewportWidth = 1440): number {
  const safeViewport = Number.isFinite(viewportWidth) ? viewportWidth : 1440;
  const upper = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, safeViewport - 390));
  return Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(upper, Number.isFinite(value) ? value : DEFAULT_SIDEBAR_WIDTH)));
}

export function parseSidebarPreferences(raw: string | null): SidebarPreferences {
  const fallback: SidebarPreferences = {width: DEFAULT_SIDEBAR_WIDTH, collapsed: false, collapsedCollectionIds: []};
  if (!raw || raw.length > 40_000) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    const prefs = value as Record<string, unknown>;
    const width = typeof prefs.width === 'number' ? clampSidebarWidth(prefs.width) : DEFAULT_SIDEBAR_WIDTH;
    const ids = Array.isArray(prefs.collapsedCollectionIds) ? prefs.collapsedCollectionIds : [];
    return {
      width,
      collapsed: prefs.collapsed === true,
      collapsedCollectionIds: [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length < 150))].slice(0, 500)
    };
  } catch { return fallback; }
}

export function readSidebarPreferences(storage?: PreferenceStorage | null): SidebarPreferences {
  try { return parseSidebarPreferences(storage?.getItem(SIDEBAR_PREFS_KEY) ?? null); }
  catch { return parseSidebarPreferences(null); }
}

export function writeSidebarPreferences(storage: PreferenceStorage | null | undefined, preferences: SidebarPreferences): void {
  try {
    storage?.setItem(SIDEBAR_PREFS_KEY, JSON.stringify({
      width: clampSidebarWidth(preferences.width),
      collapsed: preferences.collapsed,
      collapsedCollectionIds: preferences.collapsedCollectionIds.slice(0, 500)
    }));
  } catch { /* non-critical UI state: storage can be blocked or full */ }
}
