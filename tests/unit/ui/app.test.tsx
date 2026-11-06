import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '../../../src/ui/App';

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
