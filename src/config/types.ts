import type { Tier } from '../catalog';

export type ConfigValue = boolean | number | string | string[];

/** Full settings tree: every catalog section and key, plus any imported extras. */
export type Settings = Record<string, Record<string, ConfigValue>>;

/** Settings with values equal to the default removed. */
export type SparseSettings = Settings;

/** A key from an imported file that the catalog does not know. Kept, not dropped. */
export interface UnknownEntry {
  section: string;
  key: string;
  values: string[];
}

/** One emitted setting, with the lines and comment that render it. */
export interface DiffEntry {
  section: string;
  key: string;
  value: ConfigValue;
  /** Emitted lines, already formatted: `key = value`, one per list element. */
  lines: string[];
  /** Catalog description, with values interpolated. */
  comment: string;
  tier: Tier;
  changed: boolean;
  networkScoped: boolean;
  fixedAtCreation: boolean;
}

export interface Artifact {
  text: string;
  entries: DiffEntry[];
  changedCount: number;
  network: string;
}

export interface ParseResult {
  settings: Settings;
  unknown: UnknownEntry[];
  errors: string[];
}

export interface Preset {
  id: string;
  title: string;
  rationale: string;
  config: SparseSettings;
  /**
   * Networks this preset is valid on. Absent means every network the catalog
   * offers. A preset that names the network itself must leave this out: one
   * question, one answer.
   */
  networks?: string[];
}

export interface Warning {
  id: string;
  severity: 'notice' | 'warning' | 'danger';
  /** Plain language: what is wrong, what happens, what to do. */
  message: string;
  section?: string;
  key?: string;
}

export type RowState = 'default' | 'changed' | 'invalid' | 'disabled' | 'fixed';
