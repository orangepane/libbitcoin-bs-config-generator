// The runtime view of the catalog. Validation lives in catalog.schema.ts and
// runs in tests and in the build script, so zod never ships to the browser.
import type { Catalog, SectionDef, SettingDef } from './catalog.schema';

export type { Catalog, Kind, SectionDef, SettingDef, Tier } from './catalog.schema';

export const TIERS = ['essential', 'service', 'advanced', 'table'] as const;
export const KINDS = ['boolean', 'integer', 'decimal', 'text', 'path', 'list', 'enum'] as const;

/** The catalog is validated at build time; this is the typed accessor. */
export function parseCatalog (input: unknown): Catalog {
  return input as Catalog;
}

/** Sections in catalog (reference) order. */
export function sectionList (catalog: Catalog): SectionDef[] {
  return Object.values(catalog.sections);
}

export function networkSetting (catalog: Catalog): SettingDef | undefined {
  return catalog.sections.bitcoin?.settings.network;
}

export function settingList (section: SectionDef): SettingDef[] {
  return Object.values(section.settings);
}
