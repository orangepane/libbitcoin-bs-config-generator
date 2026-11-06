// The settings surface: search, changed-only, revert, service cards and the
// store blueprint. Rendered against the real catalog, not a fixture.
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import catalogJson from '../../../src/catalog.json';
import { parseCatalog } from '../../../src/catalog';
import { clone, getDefaults } from '../../../src/config';
import type { Settings } from '../../../src/config';
import { SettingsList } from '../../../src/ui/SettingsList';
import type { SettingsListProps } from '../../../src/ui/types';

const catalog = parseCatalog(catalogJson);
const defaults = getDefaults(catalog);

interface HarnessProps {
  initial: Settings;
  view?: SettingsListProps['view'];
  search?: string;
  changedOnly?: boolean;
  errors?: Record<string, string>;
  onFocusKey?: (section: string, key: string) => void;
}

function Harness ({
  initial,
  view = 'essentials',
  search = '',
  changedOnly = false,
  errors = {},
  onFocusKey = () => {},
}: HarnessProps) {
  const [settings, setSettings] = useState(initial);

  return (
    <SettingsList
      catalog={catalog}
      defaults={defaults}
      settings={settings}
      view={view}
      search={search}
      changedOnly={changedOnly}
      errors={errors}
      focusKey={null}
      onChange={(section, key, value) =>
        setSettings((previous) => ({
          ...previous,
          [section]: { ...previous[section], [key]: value },
        }))}
      onRevert={(section, key) =>
        setSettings((previous) => ({
          ...previous,
          [section]: { ...previous[section], [key]: clone(defaults[section][key]) },
        }))}
      onFocusKey={onFocusKey}
    />
  );
}

function row (container: HTMLElement, sectionKey: string, key: string): HTMLElement | null {
  return container.querySelector(`[data-row="${sectionKey}.${key}"]`);
}

describe('SettingsList', () => {
  it('finds a setting by key and ignores the view tiering', async () => {
    const { container } = render(
      <Harness initial={clone(defaults)} view="essentials" search="maximum_height" />,
    );

    expect(row(container, 'node', 'maximum_height')).not.toBeNull();
    expect(row(container, 'log', 'path')).toBeNull();
  });

  it('filters on label and help text as well as the key', async () => {
    const { container } = render(<Harness initial={clone(defaults)} search="SOCKS5" />);

    expect(row(container, 'outbound', 'socks')).not.toBeNull();
  });

  it('shows an empty state when nothing matches', () => {
    render(<Harness initial={clone(defaults)} search="zzzz-not-a-setting" />);
    expect(screen.getByText(/No settings match/)).toBeInTheDocument();
  });

  it('hides defaults with changed-only on', () => {
    const initial = clone(defaults);
    initial.node.maximum_height = 1000;

    const { container, rerender } = render(
      <Harness initial={initial} view="essentials" changedOnly />,
    );

    expect(row(container, 'node', 'maximum_height')).not.toBeNull();
    expect(row(container, 'log', 'path')).toBeNull();

    rerender(<Harness initial={initial} view="essentials" changedOnly={false} />);
    expect(row(container, 'log', 'path')).not.toBeNull();
  });

  it('restores the exact default on revert', async () => {
    const user = userEvent.setup();
    const initial = clone(defaults);
    initial.outbound.connections = 42;

    const { container } = render(<Harness initial={initial} view="essentials" />);
    const target = row(container, 'outbound', 'connections') as HTMLElement;
    const input = within(target).getByRole('textbox', { name: 'Connections' });
    expect(input).toHaveValue('42');

    await user.click(within(target).getByRole('button', { name: 'Revert' }));

    expect(input).toHaveValue(String(defaults.outbound.connections));
  });

  it('renders a service card with bind and connections visible', () => {
    const { container } = render(<Harness initial={clone(defaults)} view="essentials" />);
    const card = container.querySelector('[data-section="electrum"].service-card') as HTMLElement;

    expect(card).not.toBeNull();

    const bind = row(card, 'electrum', 'bind') as HTMLElement;
    const connections = row(card, 'electrum', 'connections') as HTMLElement;
    expect(bind).not.toBeNull();
    expect(connections).not.toBeNull();
    expect(bind.closest('details')).toBeNull();
    expect(connections.closest('details')).toBeNull();

    const advanced = card.querySelector('details.advanced');
    expect(advanced).not.toBeNull();
    const hidden = row(card, 'electrum', 'server_name') as HTMLElement;
    expect(hidden.closest('details')).not.toBeNull();
  });

  it('renders the store blueprint with one details block per table', () => {
    const { container } = render(<Harness initial={clone(defaults)} view="essentials" />);
    const blueprint = container.querySelector('.table-blueprint') as HTMLElement;

    expect(blueprint).not.toBeNull();
    expect(blueprint.querySelector('.table-banner')).toHaveTextContent(/Fixed when the store is created/);
    expect(blueprint.querySelectorAll('details')).toHaveLength(24);
  });

  it('puts advanced settings behind a labelled details in the all view', () => {
    const { container } = render(<Harness initial={clone(defaults)} view="all" />);

    const bitcoin = container.querySelector('[data-section="bitcoin"]') as HTMLElement;
    expect(bitcoin).not.toBeNull();

    const advanced = bitcoin.querySelector('details.advanced') as HTMLDetailsElement;
    expect(advanced).not.toBeNull();
    expect(advanced.querySelector('summary')).toHaveTextContent(/^Advanced \(\d+\)$/);
    expect(row(container, 'bitcoin', 'bip16_activation_time')?.closest('details')).toBe(advanced);
  });

  it('keeps section order with bitcoin first', () => {
    const { container } = render(<Harness initial={clone(defaults)} view="all" />);
    const first = container.querySelector('.section[data-section]') as HTMLElement;
    expect(first).toHaveAttribute('data-section', 'bitcoin');
  });

  it('does not mutate the settings it was given', () => {
    const initial = clone(defaults);
    initial.node.maximum_height = 500;
    const snapshot = JSON.stringify(initial);

    render(<Harness initial={initial} view="all" />);
    expect(JSON.stringify(initial)).toBe(snapshot);
  });

  it('reports the focused section and key', async () => {
    const user = userEvent.setup();
    const onFocusKey = vi.fn();
    const { container } = render(
      <Harness initial={clone(defaults)} search="maximum_height" onFocusKey={onFocusKey} />,
    );

    const target = row(container, 'node', 'maximum_height') as HTMLElement;
    await user.click(within(target).getByRole('textbox'));
    expect(onFocusKey).toHaveBeenCalledWith('node', 'maximum_height');
  });
});
