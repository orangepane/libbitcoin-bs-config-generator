import type { Catalog, SectionDef, SettingDef, Tier } from '../catalog';
import type {
  Artifact,
  ConfigValue,
  RowState,
  Settings,
  UnknownEntry,
  Warning,
} from '../config';

export type TierView = 'start' | 'essentials' | 'all';
export type ArtifactTab = 'file' | 'diff' | 'warnings';
export type CopyState = 'idle' | 'copied' | 'failed';

export interface RowProps {
  section: SectionDef;
  setting: SettingDef;
  value: ConfigValue;
  defaultValue: ConfigValue;
  state: RowState;
  /** Plain-language reason for disabled/fixed rows. */
  reason?: string;
  /** Plain-language validation message for invalid rows. */
  error?: string;
  /** True when the value shown is a mainnet default on another network. */
  networkScoped: boolean;
  onChange: (value: ConfigValue) => void;
  onRevert: () => void;
  /** Bookkeeping only: the row is in the foreground. Must not move the view. */
  onRowFocus?: (section: string, key: string) => void;
}

export interface SettingsListProps {
  catalog: Catalog;
  defaults: Settings;
  settings: Settings;
  view: Exclude<TierView, 'start'>;
  search: string;
  changedOnly: boolean;
  /** `${section}.${key}` -> message */
  errors: Record<string, string>;
  focusKey: string | null;
  onChange: (section: string, key: string, value: ConfigValue) => void;
  onRevert: (section: string, key: string) => void;
  onRowFocus: (section: string, key: string) => void;
}

export interface StartPanelProps {
  catalog: Catalog;
  settings: Settings;
  presetId: string | null;
  modified: boolean;
  onPreset: (id: string) => void;
  onChange: (section: string, key: string, value: ConfigValue) => void;
}

export interface RailProps {
  view: TierView;
  onView: (view: TierView) => void;
  search: string;
  onSearch: (value: string) => void;
  changedOnly: boolean;
  onChangedOnly: (value: boolean) => void;
  changedCount: number;
  warningCount: number;
  network: string;
  onImport: () => void;
  /** Null when there is nothing to undo; otherwise the action being undone. */
  undoLabel: string | null;
  onUndo: () => void;
}

export interface HeaderProps {
  network: string;
  changedCount: number;
  warningCount: number;
  onImport: () => void;
}

export interface ArtifactPaneProps {
  artifact: Artifact;
  warnings: Warning[];
  unknown: UnknownEntry[];
  tab: ArtifactTab;
  onTab: (tab: ArtifactTab) => void;
  focusKey: string | null;
  onFocusKey: (section: string, key: string) => void;
  onCopy: () => void;
  onDownload: () => void;
  onShare: () => void;
  copyState: CopyState;
  compact?: boolean;
}

export interface ImportDialogProps {
  open: boolean;
  errors: string[];
  unknown: UnknownEntry[];
  onApply: (text: string) => void;
  onClose: () => void;
}

export interface ShareDialogProps {
  open: boolean;
  url: string;
  copyState: CopyState;
  onCopy: (url: string) => void;
  onClose: () => void;
}

export type { Tier };

/** Stable DOM id for a setting row. Dots in section names are not selector-safe. */
export function rowDomId (section: string, key: string): string {
  return `row-${section}--${key}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function lineDomId (section: string, key: string): string {
  return `line-${section}--${key}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function settingId (section: string, key: string): string {
  return `set-${section}--${key}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}
