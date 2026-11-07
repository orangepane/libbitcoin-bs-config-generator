import { useId, useMemo } from 'react';
import type { StartPanelProps } from './types';
import { networkSetting, sectionList } from '../catalog';
import { PRESETS } from '../config';

// The Start view. One decision, network, then a preset as a starting point.
// Applying is one click and is not confirmed: it is visible in the diff pane
// and reversible with Reset.

export function StartPanel ({
  catalog,
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

  // Reader-facing names for the network ids a preset may declare.
  const networkLabels = useMemo(
    () => new Map((networkDefinition?.values ?? []).map((value) => [value.value, value.label])),
    [networkDefinition],
  );

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
          A preset starts from the defaults and keeps your network choice. Change anything
          afterwards.
        </p>

        <ul className="preset-list">
          {PRESETS.map((preset) => {
            const applied = presetId === preset.id && !modified;
            // A preset may be valid on some networks only. Say so on the card and
            // refuse the click: a file that cannot work for the current chain is
            // worse than a starting point that is missing.
            const scope =
              preset.networks && !preset.networks.includes(network)
                ? preset.networks.map((value) => networkLabels.get(value) ?? value).join(' or ')
                : null;
            const reasonId = `${networkId}-${preset.id}-scope`;

            return (
              <li className="preset-card" key={preset.id} data-applied={applied ? 'true' : 'false'}>
                <h3 className="preset-title">{preset.title}</h3>
                <p className="preset-rationale">{preset.rationale}</p>
                {scope ? (
                  <p className="preset-scope" id={reasonId}>
                    {scope} only.
                  </p>
                ) : null}
                <button
                  className="btn"
                  type="button"
                  disabled={applied || scope !== null}
                  aria-label={applied ? `Applied ${preset.title}` : `Apply ${preset.title}`}
                  aria-describedby={scope ? reasonId : undefined}
                  onClick={() => onPreset(preset.id)}
                >
                  {applied ? 'Applied' : 'Apply'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
