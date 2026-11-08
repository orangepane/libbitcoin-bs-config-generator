import { useEffect } from 'react';

import type { SectionDef, SettingDef } from '../catalog';
import { sectionList, settingList } from '../catalog';
import type { ConfigValue, RowState, Settings } from '../config';
import { valuesEqual } from '../config';
import { Row } from './Row';
import { rowDomId } from './types';
import type { SettingsListProps } from './types';

interface RowModel {
  section: SectionDef;
  setting: SettingDef;
  value: ConfigValue;
  defaultValue: ConfigValue;
  state: RowState;
  reason?: string;
  error?: string;
}

interface SectionBlock {
  section: SectionDef;
  rows: RowModel[];
  advanced: RowModel[];
  variant: 'section' | 'service';
  enabled: boolean;
}

interface BlueprintBlock {
  tables: Array<{ section: SectionDef; rows: RowModel[] }>;
}

/** Visible on a service card; everything else waits behind "Advanced". */
function serviceVisibleKeys (section: SectionDef): Set<string> {
  return new Set([section.enableKey ?? 'bind', 'connections']);
}

function isEmptyValue (value: ConfigValue | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function matchesQuery (setting: SettingDef, query: string): boolean {
  if (query === '') return true;
  return (
    setting.label.toLowerCase().includes(query) ||
    setting.key.toLowerCase().includes(query) ||
    setting.help.toLowerCase().includes(query)
  );
}

function rowState (
  section: SectionDef,
  setting: SettingDef,
  value: ConfigValue,
  defaultValue: ConfigValue,
  settings: Settings,
  errors: Record<string, string>,
): RowState {
  const values = settings[section.key] ?? {};
  const enableEmpty =
    section.service === true &&
    section.enableKey !== undefined &&
    isEmptyValue(values[section.enableKey]);

  if (enableEmpty && setting.key !== section.enableKey) return 'disabled';
  if (setting.fixedAtCreation === true) return 'fixed';
  if (errors[`${section.key}.${setting.key}`] !== undefined) return 'invalid';
  return valuesEqual(value, defaultValue) ? 'default' : 'changed';
}

function rowReason (section: SectionDef, state: RowState): string | undefined {
  if (state === 'disabled') {
    const enable = section.enableKey ? section.settings[section.enableKey] : undefined;
    return `${section.title} is off. Set ${enable?.label ?? 'Bind'} to turn it on.`;
  }
  if (state === 'fixed') return 'Fixed when the store is created.';
  return undefined;
}

/** bitcoin first: the network is the first decision. Everything else keeps catalog order. */
function orderSections (sections: SectionDef[]): SectionDef[] {
  const bitcoin = sections.find((section) => section.key === 'bitcoin');
  if (!bitcoin) return sections;
  return [bitcoin, ...sections.filter((section) => section.key !== 'bitcoin')];
}

function sectionDomId (section: SectionDef): string {
  return `section-${section.key}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function SettingsList ({
  catalog,
  defaults,
  settings,
  view,
  search,
  changedOnly,
  errors,
  focusKey,
  onChange,
  onRevert,
  onRowFocus,
}: SettingsListProps) {
  const ordered = orderSections(sectionList(catalog));
  const query = search.trim().toLowerCase();
  const searching = query !== '';

  // Scroll the linked row into view when the artifact points at it. Keys cannot
  // contain dots, so the last dot separates section from key.
  useEffect(() => {
    if (!focusKey) return;
    const index = focusKey.lastIndexOf('.');
    if (index < 0) return;
    const target = document.getElementById(rowDomId(focusKey.slice(0, index), focusKey.slice(index + 1)));
    target?.scrollIntoView?.({ block: 'nearest' });
  }, [focusKey]);

  const rowsBySection = new Map<string, RowModel[]>();
  for (const section of ordered) {
    const sectionValues = settings[section.key] ?? {};
    const sectionDefaults = defaults[section.key] ?? {};
    const models: RowModel[] = [];
    for (const setting of settingList(section)) {
      // A value the user cleared stays cleared; the default returns on reset.
      const value = Object.prototype.hasOwnProperty.call(sectionValues, setting.key)
        ? sectionValues[setting.key]
        : sectionDefaults[setting.key];
      const defaultValue = sectionDefaults[setting.key];
      const state = rowState(section, setting, value, defaultValue, settings, errors);
      models.push({
        section,
        setting,
        value,
        defaultValue,
        state,
        reason: rowReason(section, state),
        error: errors[`${section.key}.${setting.key}`],
      });
    }
    rowsBySection.set(section.key, models);
  }

  function keep (model: RowModel): boolean {
    if (changedOnly && valuesEqual(model.value, model.defaultValue)) return false;
    if (searching && !matchesQuery(model.setting, query)) return false;
    return true;
  }

  function rowsOf (section: SectionDef): RowModel[] {
    return (rowsBySection.get(section.key) ?? []).filter(keep);
  }

  const sectionBlocks: SectionBlock[] = [];
  let blueprint: BlueprintBlock | null = null;

  if (searching) {
    // Search ignores tiering: a match is shown wherever it lives.
    for (const section of ordered) {
      const rows = rowsOf(section);
      if (rows.length === 0) continue;
      sectionBlocks.push({ section, rows, advanced: [], variant: 'section', enabled: false });
    }
  } else if (view === 'all') {
    for (const section of ordered) {
      const all = rowsOf(section);
      if (section.service === true) {
        const visibleKeys = serviceVisibleKeys(section);
        const rows = all.filter((model) => visibleKeys.has(model.setting.key));
        const advanced = all.filter((model) => !visibleKeys.has(model.setting.key));
        if (rows.length + advanced.length === 0) continue;
        sectionBlocks.push({
          section,
          rows,
          advanced,
          variant: 'service',
          enabled: !isEmptyValue(settings[section.key]?.[section.enableKey ?? '']),
        });
      } else {
        const rows = all.filter(
          (model) => model.setting.tier !== 'advanced' && model.setting.tier !== 'table',
        );
        const advanced = all.filter(
          (model) => model.setting.tier === 'advanced' || model.setting.tier === 'table',
        );
        if (rows.length + advanced.length === 0) continue;
        sectionBlocks.push({ section, rows, advanced, variant: 'section', enabled: false });
      }
    }
  } else {
    // Essentials: the tier's own rows, then service cards, then the store blueprint.
    for (const section of ordered) {
      if (section.service === true || section.tier === 'table') continue;
      const rows = rowsOf(section).filter((model) => model.setting.tier === 'essential');
      if (rows.length === 0) continue;
      sectionBlocks.push({ section, rows, advanced: [], variant: 'section', enabled: false });
    }
    for (const section of ordered) {
      if (section.service !== true) continue;
      const all = rowsOf(section);
      const visibleKeys = serviceVisibleKeys(section);
      const rows = all.filter((model) => visibleKeys.has(model.setting.key));
      const advanced = all.filter((model) => !visibleKeys.has(model.setting.key));
      if (rows.length + advanced.length === 0) continue;
      sectionBlocks.push({
        section,
        rows,
        advanced,
        variant: 'service',
        enabled: !isEmptyValue(settings[section.key]?.[section.enableKey ?? '']),
      });
    }
    const tables = ordered
      .filter((section) => section.tier === 'table')
      .map((section) => ({ section, rows: rowsOf(section) }))
      .filter((table) => table.rows.length > 0);
    if (tables.length > 0) blueprint = { tables };
  }

  const total =
    sectionBlocks.reduce((count, block) => count + block.rows.length + block.advanced.length, 0) +
    (blueprint ? blueprint.tables.reduce((count, table) => count + table.rows.length, 0) : 0);

  if (total === 0) {
    const message = searching
      ? `No settings match “${search.trim()}”.`
      : changedOnly
        ? 'No settings differ from this network’s defaults.'
        : 'No settings to show.';
    return (
      <div className="settings-list">
        <p className="empty-state">{message}</p>
      </div>
    );
  }

  function renderRow (model: RowModel) {
    return (
      <Row
        key={`${model.section.key}.${model.setting.key}`}
        section={model.section}
        setting={model.setting}
        value={model.value}
        defaultValue={model.defaultValue}
        state={model.state}
        reason={model.reason}
        error={model.error}
        onChange={(value) => onChange(model.section.key, model.setting.key, value)}
        onRevert={() => onRevert(model.section.key, model.setting.key)}
        onRowFocus={onRowFocus}
      />
    );
  }

  function renderAdvanced (block: SectionBlock) {
    if (block.advanced.length === 0) return null;
    return (
      <details className="advanced">
        <summary>{`Advanced (${block.advanced.length})`}</summary>
        <div className="rows">{block.advanced.map(renderRow)}</div>
      </details>
    );
  }

  function renderSection (block: SectionBlock) {
    const { section } = block;
    const titleId = `${sectionDomId(section)}-title`;
    const shown = block.rows.length + block.advanced.length;
    const totalInSection = rowsBySection.get(section.key)?.length ?? shown;
    const service = block.variant === 'service';

    return (
      <section
        key={section.key}
        className={service ? 'section service-card' : 'section'}
        data-section={section.key}
        data-enabled={service ? (block.enabled ? 'true' : 'false') : undefined}
        aria-labelledby={titleId}
      >
        <div className="section-head">
          <h2 className="section-title" id={titleId}>
            {section.title}
          </h2>
          {service ? <span className="row-chip">{block.enabled ? 'On' : 'Off'}</span> : null}
          <span className="section-count">
            {shown === totalInSection ? `${shown}` : `${shown} of ${totalInSection}`}
          </span>
        </div>
        <p className="section-summary">{section.summary}</p>
        {block.rows.length > 0 ? <div className="rows">{block.rows.map(renderRow)}</div> : null}
        {renderAdvanced(block)}
      </section>
    );
  }

  function renderBlueprint (block: BlueprintBlock) {
    const derived = block.tables.some((table) =>
      table.rows.some((model) => model.setting.derived === true),
    );

    return (
      <section
        className="section table-blueprint"
        aria-labelledby="table-blueprint-title"
      >
        <div className="section-head">
          <h2 className="section-title" id="table-blueprint-title">
            Store blueprint
          </h2>
          <span className="section-count">{block.tables.length}</span>
        </div>
        <p className="section-summary">
          The store tables and their sizing. bs allocates these when it creates the store.
          {derived
            ? " A bucket count marked derived is computed by bs from the table's Expected count" +
              ' and the installed memory.'
            : null}
        </p>
        <p className="table-banner">
          Fixed when the store is created. Editing these values now does not resize an existing
          store; delete it and create a new one to apply them.
          {derived ? ' Leave a derived bucket count unset unless you are sizing that table.' : null}
        </p>
        {block.tables.map((table) => (
          <details
            className="advanced table-section"
            key={table.section.key}
            data-section={table.section.key}
          >
            <summary>{`${table.section.title} (${table.rows.length})`}</summary>
            <p className="section-summary">{table.section.summary}</p>
            <div className="rows">{table.rows.map(renderRow)}</div>
          </details>
        ))}
      </section>
    );
  }

  return (
    <div className="settings-list">
      {sectionBlocks.map(renderSection)}
      {blueprint ? renderBlueprint(blueprint) : null}
    </div>
  );
}
