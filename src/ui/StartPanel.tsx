import { useId, useMemo } from 'react';
import type { StartPanelProps } from './types';
import { networkSetting, sectionList } from '../catalog';
import { PRESETS, applyPreset, buildArtifact } from '../config';

// The Start view. One decision, network, then a preset as a starting point.
// Applying is one click and is not confirmed: it is visible in the diff pane
// and reversible with Reset.

function changeSentence (count: number): string {
  if (count === 0) return 'Changes nothing from the defaults';
  if (count === 1) return 'Changes 1 setting from the defaults';
  return `Changes ${count} settings from the defaults`;
}

export function StartPanel ({
  catalog,
  defaults,
  settings,
  presetId,
  modified,
  onPreset,
  onChange,
}: StartPanelProps) {
  const networkId = useId();
  const networkDefinition = networkSetting(catalog);
  // The section that owns the network setting, found through the catalog rather
  // than named here: UI code carries no setting names.
  const networkSection = useMemo(
    () =>
      networkDefinition
        ? sectionList(catalog).find((section) =>
            Object.values(section.settings).includes(networkDefinition),
          ) ?? null
        : null,
    [catalog, networkDefinition],
  );

  const selected = networkSection && networkDefinition
    ? settings[networkSection.key]?.[networkDefinition.key]
    : undefined;
  const fallback =
    networkDefinition && typeof networkDefinition.default === 'string' ? networkDefinition.default : 'mainnet';
  const network = typeof selected === 'string' && selected !== '' ? selected : fallback;

  // Each preset's resulting diff, so a starting point can state its cost before
  // it is applied. Derived from the same functions the artifact uses.
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const preset of PRESETS) {
      result[preset.id] = buildArtifact(applyPreset(defaults, preset), defaults, catalog).changedCount;
    }
    return result;
  }, [catalog, defaults]);

  if (!networkDefinition || !networkSection) {
    return (
      <section className="start">
        <h2 className="section-title">Start</h2>
        <p>The catalog does not define a network setting, so there is nothing to choose here.</p>
      </section>
    );
  }

  return (
    <div className="start">
      <section className="start-network" aria-labelledby={`${networkId}-title`}>
        <h2 className="section-title" id={`${networkId}-title`}>
          Network
        </h2>
        <select
          id={networkId}
          aria-labelledby={`${networkId}-title`}
          value={network}
          onChange={(event) => onChange(networkSection.key, networkDefinition.key, event.target.value)}
        >
          {(networkDefinition.values ?? []).map((value) => (
            <option key={value.value} value={value.value}>
              {value.label}
            </option>
          ))}
        </select>
        <p className="row-help">
          Only the values you change are written. The defaults shown here are the mainnet
          values; bs applies the rest for the network you pick.
        </p>
        {network !== 'mainnet' ? (
          <p className="row-help start-network-note">
            Create the store for {network} once before the first start:{' '}
            <code>bs -n {network}</code>. Settings that apply at store creation cannot be
            changed afterwards.
          </p>
        ) : null}
      </section>

      <section className="preset-section" aria-labelledby={`${networkId}-presets`}>
        <h2 className="section-title" id={`${networkId}-presets`}>
          Start from a preset
        </h2>
        <p className="row-help">
          A preset replaces the draft with the defaults plus the settings it needs. You can
          change anything afterwards.
        </p>

        <ul className="preset-list">
          {PRESETS.map((preset) => {
            const applied = presetId === preset.id && !modified;
            const count = counts[preset.id] ?? 0;

            return (
              <li className="preset-card" key={preset.id} data-applied={applied ? 'true' : 'false'}>
                <h3 className="preset-title">{preset.title}</h3>
                <p className="preset-rationale">{preset.rationale}</p>
                <p className="preset-count">
                  {changeSentence(count)}
                  {applied ? '. Applied.' : ''}
                </p>
                <button
                  className="btn"
                  type="button"
                  aria-label={`Apply ${preset.title}`}
                  onClick={() => onPreset(preset.id)}
                >
                  Apply
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
