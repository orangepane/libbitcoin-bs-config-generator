// Preset integrity.
//
// A preset is shipped data applied over the catalog defaults, so it must name
// real settings, keep their types, and stay a starting point rather than a
// mode. Every key and value has to exist in the catalog.
import { describe, expect, it } from 'vitest';

import catalogJson from '../../src/catalog.json';
import { PRESETS, applyPreset, presetById } from '../../src/config/presets';
import { clone, getDefaults } from '../../src/config/defaults';
import { validateCatalog } from '../../src/catalog.schema';
import type { Catalog, Kind } from '../../src/catalog.schema';
import type { ConfigValue, Preset } from '../../src/config/types';

const catalog: Catalog = validateCatalog(catalogJson);

// Read the shipped files too, so a preset that exists but is never registered
// is caught, and a registry entry that drifts from its file is caught.
const presetFiles = import.meta.glob('../../src/presets/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function fileId (path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.json$/, '');
}

function presetEntries (preset: Preset): Array<[string, string, ConfigValue]> {
  return Object.entries(preset.config).flatMap(([section, values]) =>
    Object.entries(values).map(
      ([key, value]) => [section, key, value] as [string, string, ConfigValue]
    )
  );
}

function valueMatchesKind (kind: Kind, value: ConfigValue): boolean {
  switch (kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'decimal':
      return typeof value === 'number';
    case 'text':
    case 'path':
    case 'enum':
      return typeof value === 'string';
    case 'list':
      return Array.isArray(value) && value.every((element) => typeof element === 'string');
  }
}

function sentenceCount (text: string): number {
  return (text.match(/[.!?](?:\s|$)/g) ?? []).length;
}

describe('preset registry', () => {
  it('has unique ids and a complete entry per preset', () => {
    const ids = PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const preset of PRESETS) {
      expect(preset.id.trim().length > 0, 'id').toBe(true);
      expect(preset.title.trim().length > 0, `${preset.id} title`).toBe(true);
      expect(preset.rationale.trim().length > 0, `${preset.id} rationale`).toBe(true);
      expect(Object.keys(preset.config).length > 0, `${preset.id} config is not empty`).toBe(true);
      for (const [section, values] of Object.entries(preset.config)) {
        expect(section.trim().length > 0, `${preset.id} section key`).toBe(true);
        expect(Object.keys(values).length > 0, `${preset.id} ${section} is not empty`).toBe(true);
      }
    }
  });

  it('writes rationales as shipped copy: at most two sentences, ending in a full stop', () => {
    for (const preset of PRESETS) {
      const rationale = preset.rationale.trim();
      expect(rationale.endsWith('.'), `${preset.id} ends in a full stop`).toBe(true);
      expect(rationale.includes('!'), `${preset.id} has no exclamation mark`).toBe(false);
      expect(rationale.includes('?'), `${preset.id} has no question mark`).toBe(false);
      expect(rationale[0], `${preset.id} starts with a capital`).toBe(
        rationale[0]?.toUpperCase()
      );
      expect(sentenceCount(rationale), `${preset.id} sentence count`).toBeLessThanOrEqual(2);
    }
  });

  it('registers every preset file in src/presets, and no phantom ids', () => {
    const registered = PRESETS.map((preset) => preset.id).sort();
    const shipped = Object.keys(presetFiles).map(fileId).sort();
    expect(shipped).toHaveLength(8);
    expect(registered).toEqual(shipped);
  });

  it('ships the same content the registry loads', () => {
    for (const [path, raw] of Object.entries(presetFiles)) {
      const id = fileId(path);
      const preset = presetById(id);
      expect(preset, `${id}.json is registered`).toBeDefined();
      expect(preset?.config, `${id}.json content`).toEqual(raw);
    }
  });
});

describe('preset contents', () => {
  it('names only catalog sections and keys', () => {
    for (const preset of PRESETS) {
      for (const [sectionKey, key] of presetEntries(preset)) {
        const section = catalog.sections[sectionKey];
        expect(section, `${preset.id}: section ${sectionKey} is in the catalog`).toBeDefined();
        if (!section) continue;
        expect(
          section.settings[key],
          `${preset.id}: ${sectionKey}.${key} is in the catalog`
        ).toBeDefined();
      }
    }
  });

  it('gives every value the type its catalog kind requires', () => {
    for (const preset of PRESETS) {
      for (const [sectionKey, key, value] of presetEntries(preset)) {
        const setting = catalog.sections[sectionKey]?.settings[key];
        expect(setting, `${preset.id}: ${sectionKey}.${key} is in the catalog`).toBeDefined();
        if (!setting) continue;
        const where = `${preset.id}: ${sectionKey}.${key} (${setting.kind})`;
        expect(valueMatchesKind(setting.kind, value), where).toBe(true);
      }
    }
  });
});

describe('preset scope', () => {
  it('names only networks the catalog offers', () => {
    const offered = new Set(
      (catalog.sections.bitcoin.settings.network.values ?? []).map((value) => value.value)
    );
    for (const preset of PRESETS) {
      for (const network of preset.networks ?? []) {
        expect(offered.has(network), `${preset.id}: ${network} is a catalog network`).toBe(true);
      }
    }
  });

  it('never both declares a scope and switches network', () => {
    for (const preset of PRESETS) {
      if (preset.config.bitcoin?.network === undefined) continue;
      expect(preset.networks, `${preset.id} sets the network, so it declares no scope`).toBeUndefined();
    }
  });

  it('marks the genesis milestone preset as mainnet only', () => {
    expect(presetById('genesis-validation')?.networks).toEqual(['mainnet']);
  });
});

describe('applyPreset', () => {
  it('does not mutate the defaults or the preset', () => {
    const defaults = getDefaults(catalog);
    for (const preset of PRESETS) {
      const defaultsBefore = JSON.parse(JSON.stringify(defaults)) as typeof defaults;
      const presetBefore = JSON.parse(JSON.stringify(preset)) as Preset;

      applyPreset(defaults, preset);

      expect(defaults, `${preset.id} leaves defaults untouched`).toEqual(defaultsBefore);
      expect(preset, `${preset.id} leaves the preset untouched`).toEqual(presetBefore);
    }
  });

  it('returns a fresh tree, not the frozen defaults', () => {
    const defaults = getDefaults(catalog);
    for (const preset of PRESETS) {
      const applied = applyPreset(defaults, preset);
      expect(applied, `${preset.id} result is a new object`).not.toBe(defaults);
      for (const [sectionKey, values] of Object.entries(defaults)) {
        expect(applied[sectionKey], `${preset.id}: ${sectionKey} is a new object`).not.toBe(values);
      }
    }
  });

  it('lays the preset values over every catalog default', () => {
    const defaults = getDefaults(catalog);
    for (const preset of PRESETS) {
      const applied = applyPreset(defaults, preset);

      for (const [sectionKey, key, value] of presetEntries(preset)) {
        expect(applied[sectionKey][key], `${preset.id}: ${sectionKey}.${key}`).toEqual(value);
      }
      for (const [sectionKey, values] of Object.entries(defaults)) {
        expect(Object.keys(applied[sectionKey]).sort(), `${preset.id}: ${sectionKey} keys`).toEqual(
          Object.keys(values).sort()
        );
      }
    }
  });

  // The network is the frame the preset fills, so a preset that says nothing
  // about it must not be able to undo the reader's choice.
  it('keeps the selected network when the preset does not name one', () => {
    const defaults = getDefaults(catalog);
    const current = { ...clone(defaults), bitcoin: { ...defaults.bitcoin, network: 'testnet4' } };

    for (const preset of PRESETS) {
      if (preset.config.bitcoin?.network !== undefined) continue;
      const applied = applyPreset(defaults, preset, current, catalog);
      expect(applied.bitcoin.network, `${preset.id} keeps testnet4`).toBe('testnet4');
    }
  });

  it('lets a preset that names a network switch to it', () => {
    const defaults = getDefaults(catalog);
    const current = { ...clone(defaults), bitcoin: { ...defaults.bitcoin, network: 'signet' } };
    const switching: Preset = {
      id: 'switcher',
      title: 'Switcher',
      rationale: 'Sets the network.',
      config: { bitcoin: { network: 'regtest' } },
    };

    expect(applyPreset(defaults, switching, current, catalog).bitcoin.network).toBe('regtest');
  });

  it('falls back to the defaults when no catalogue or draft is given', () => {
    const defaults = getDefaults(catalog);
    const preset = PRESETS[0];
    expect(applyPreset(defaults, preset)).toEqual(applyPreset(defaults, preset, undefined, catalog));
  });
});
