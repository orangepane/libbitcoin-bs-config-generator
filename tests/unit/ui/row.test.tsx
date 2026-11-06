// Row composition: every kind has an accessible name, revert appears only when
// there is something to revert, and an error is attached to its control.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import catalogJson from '../../../src/catalog.json';
import { parseCatalog } from '../../../src/catalog';
import { getDefaults } from '../../../src/config';
import { Row } from '../../../src/ui/Row';
import { rowDomId } from '../../../src/ui/types';
import type { RowProps } from '../../../src/ui/types';

const catalog = parseCatalog(catalogJson);
const defaults = getDefaults(catalog);

function rowProps (sectionKey: string, key: string, overrides: Partial<RowProps> = {}): RowProps {
  const section = catalog.sections[sectionKey];
  const setting = section.settings[key];
  return {
    section,
    setting,
    value: defaults[sectionKey][key],
    defaultValue: defaults[sectionKey][key],
    state: 'default',
    networkScoped: false,
    onChange: () => {},
    onRevert: () => {},
    ...overrides,
  };
}

function renderRow (sectionKey: string, key: string, overrides: Partial<RowProps> = {}) {
  return render(<Row {...rowProps(sectionKey, key, overrides)} />);
}

describe('Row', () => {
  it('renders the row anchor, state and raw key', () => {
    const { container } = renderRow('bitcoin', 'network');
    const row = container.querySelector('.row') as HTMLElement;

    expect(row).toHaveAttribute('id', rowDomId('bitcoin', 'network'));
    expect(row).toHaveAttribute('data-row', 'bitcoin.network');
    expect(row).toHaveAttribute('data-state', 'default');
    expect(within(row).getByText('network')).toHaveClass('row-key');
  });

  it('names the control for every kind', () => {
    renderRow('log', 'verbose');
    expect(screen.getByRole('switch', { name: 'Verbose' })).toBeInTheDocument();
  });

  it('names an enum control', () => {
    renderRow('bitcoin', 'network');
    expect(screen.getByRole('combobox', { name: 'Network' })).toBeInTheDocument();
  });

  it('names integer, text and path controls', () => {
    const { unmount } = renderRow('outbound', 'connections');
    expect(screen.getByRole('textbox', { name: 'Connections' })).toBeInTheDocument();
    unmount();

    renderRow('outbound', 'socks');
    expect(screen.getByRole('textbox', { name: 'SOCKS' })).toBeInTheDocument();
  });

  it('names a list control as a group and labels each entry', () => {
    renderRow('electrum', 'bind', {
      value: ['0.0.0.0:50001'],
      state: 'changed',
    });

    expect(screen.getByRole('group', { name: 'Bind' })).toBeInTheDocument();
    expect(screen.getByLabelText('Entry 1')).toHaveValue('0.0.0.0:50001');
  });

  it('shows revert only when the value differs from the default', () => {
    const { rerender } = render(<Row {...rowProps('outbound', 'connections')} />);
    expect(screen.queryByRole('button', { name: 'Revert' })).not.toBeInTheDocument();

    rerender(<Row {...rowProps('outbound', 'connections', { value: 101, state: 'changed' })} />);
    const revert = screen.getByRole('button', { name: 'Revert' });
    expect(revert).toBeInTheDocument();
  });

  it('calls onRevert from the revert button', async () => {
    const user = userEvent.setup();
    const onRevert = vi.fn();
    renderRow('outbound', 'connections', { value: 101, state: 'changed', onRevert });

    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(onRevert).toHaveBeenCalledTimes(1);
  });

  it('associates an error with the control and the help text', () => {
    const { container } = renderRow('outbound', 'connections', {
      value: -1,
      state: 'invalid',
      error: 'Connections must be 0 or more.',
    });

    const input = screen.getByRole('textbox', { name: 'Connections' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Connections must be 0 or more\./);
    expect(screen.getByRole('alert')).toHaveTextContent('Connections must be 0 or more.');

    const error = container.querySelector('.row-error') as HTMLElement;
    expect(error.id).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
  });

  it('explains a disabled dependency with its reason', () => {
    renderRow('electrum', 'server_name', {
      state: 'disabled',
      reason: 'Electrum Server is off. Set Bind to turn it on.',
    });

    expect(screen.getByText('Electrum Server is off. Set Bind to turn it on.')).toHaveClass(
      'row-reason',
    );
  });

  it('marks a mainnet default when another network is selected', () => {
    renderRow('network', 'threads', { networkScoped: true });
    expect(screen.getByText('mainnet default')).toBeInTheDocument();
  });

  it('reports focus with section and key', async () => {
    const user = userEvent.setup();
    const onFocusKey = vi.fn();
    renderRow('outbound', 'connections', { onFocusKey });

    await user.click(screen.getByRole('textbox', { name: 'Connections' }));
    expect(onFocusKey).toHaveBeenCalledWith('outbound', 'connections');
  });
});
