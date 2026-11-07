import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../../../src/ui/App';

// The All view renders 451 rows, so an unscoped role query costs seconds. Scope
// every assertion to the region it is about.
function rail (): ReturnType<typeof within> {
  return within(screen.getByRole('complementary', { name: 'Views and filters' }));
}

// One step back after the actions that replace the draft wholesale. The rail
// button carries the action in its accessible name, so it says what it will
// undo before it is pressed.

describe('undo', () => {
  it('restores the draft before a preset is applied', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getAllByText(/0 settings changed/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Apply Wallet server' }));
    expect(screen.getAllByText(/2 settings changed/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Undo apply Wallet server' }));
    expect(screen.getAllByText(/0 settings changed/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull();
  });

  it('names the applied preset on its own button', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('button', { name: 'Apply Wallet server' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Apply Wallet server' }));
    expect(screen.getByRole('button', { name: 'Applied Wallet server' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Apply Wallet server' })).toBeNull();

    // An edit leaves the draft no longer equal to the preset, so the card offers
    // the preset again rather than claiming it is applied.
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'verbose');
    await user.click(screen.getByRole('switch', { name: /verbose/i }));
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Apply Wallet server' })).toBeEnabled();
  });

  it('is cleared by the next edit', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Apply Wallet server' }));
    expect(screen.getByRole('button', { name: 'Undo apply Wallet server' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    const search = screen.getByRole('searchbox', { name: 'Search settings' });
    await user.type(search, 'verbose');
    await user.click(screen.getByRole('switch', { name: /verbose/i }));

    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull();
  });
});

describe('views', () => {
  // The view belongs to the reader, not to the draft. Editing a row is not a
  // request to change where the reader is looking.
  it('stays in Essentials when a row there takes focus', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(rail().getByRole('button', { name: 'Essentials' }));
    expect(rail().getByRole('button', { name: 'Essentials' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getAllByRole('switch')[0]);

    expect(rail().getByRole('button', { name: 'Essentials' })).toHaveAttribute('aria-pressed', 'true');
    expect(rail().getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  // The artifact is a map of the file, so a line in it still takes the reader to
  // the All view, which always holds the row it names.
  it('follows a diff entry out of Essentials to All', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Apply Wallet server' }));
    await user.click(rail().getByRole('button', { name: 'Essentials' }));
    await user.click(screen.getByRole('tab', { name: /^Diff/ }));

    const diff = within(screen.getByRole('tabpanel'));
    await user.click(diff.getByRole('button', { name: 'bind' }));

    expect(rail().getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('network and presets', () => {
  // A preset fills the frame the reader chose; it does not replace it.
  it('keeps the selected network when a preset is applied', async () => {
    const user = userEvent.setup();
    render(<App />);

    const network = screen.getByRole('combobox');
    await user.selectOptions(network, 'regtest');
    await user.click(screen.getByRole('button', { name: 'Apply Wallet server' }));

    expect(network).toHaveValue('regtest');
    await user.click(screen.getByRole('tab', { name: /^Diff/ }));
    const diff = within(screen.getByRole('tabpanel'));
    // The network differs from the mainnet default, so it is emitted: the point is
    // that it reads regtest, not that the preset's own settings arrived alone.
    expect(diff.getByRole('button', { name: 'network' })).toBeInTheDocument();
    expect(diff.getByRole('button', { name: 'bind' })).toBeInTheDocument();
    expect(diff.getByText('regtest')).toBeInTheDocument();
  });

  // A card that cannot work for the current chain says so and refuses the click.
  it('disables a mainnet-only preset on another network', async () => {
    const user = userEvent.setup();
    render(<App />);

    const genesis = screen.getByRole('button', { name: 'Apply Full validation from genesis' });
    expect(genesis).toBeEnabled();

    await user.selectOptions(screen.getByRole('combobox'), 'regtest');

    expect(genesis).toBeDisabled();
    expect(genesis).toHaveAccessibleDescription('Mainnet only.');
    // The neutral cards stay available, because their settings carry no network.
    expect(screen.getByRole('button', { name: 'Apply Wallet server' })).toBeEnabled();
  });
});
