import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../../../src/ui/App';

// The All view renders 451 rows, so an unscoped role query costs seconds. Scope
// every assertion to the region it is about.
function rail (): ReturnType<typeof within> {
  return within(screen.getByRole('complementary', { name: 'Views and filters' }));
}

// One step back after the actions that replace the draft wholesale.

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

    // An edit leaves the draft unequal to the preset, so the card offers it again.
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
  // Editing a row must not change the view.
  it('stays in Essentials when a row there takes focus', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(rail().getByRole('button', { name: 'Essentials' }));
    expect(rail().getByRole('button', { name: 'Essentials' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getAllByRole('switch')[0]);

    expect(rail().getByRole('button', { name: 'Essentials' })).toHaveAttribute('aria-pressed', 'true');
    expect(rail().getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  // A line in the artifact still reaches the All view, which holds its row.
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
    // The network differs from the mainnet default, so it is emitted.
    expect(diff.getByRole('button', { name: 'network' })).toBeInTheDocument();
    expect(diff.getByRole('button', { name: 'bind' })).toBeInTheDocument();
    expect(diff.getByText('regtest', { selector: '.entry-value' })).toBeInTheDocument();
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

  // A note is a fact about the store's lifecycle. It never borrows the word
  // "warning", and it never stands between the reader and the file.
  it('counts notes as notes, not as warnings', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Apply Full validation from genesis' }));

    expect(screen.getByText('2 notes')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ warnings?$/)).toBeNull();
  });

  it('counts a real check as a warning', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Apply Wallet server' }));

    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ notes?$/)).toBeNull();
  });

  // The store command lives in the panel, not in a warning.
  it('states the store command in the panel, not as a warning', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByRole('combobox'), 'testnet3');
    const panel = within(screen.getByRole('region', { name: 'Network' }));
    expect(panel.getByText(/bs -n testnet3/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Warnings/ }));
    const warnings = within(screen.getByRole('tabpanel'));
    expect(warnings.queryByText(/store for testnet3/i)).toBeNull();
    expect(warnings.queryByText(/bs -n testnet3/)).toBeNull();
  });
});
