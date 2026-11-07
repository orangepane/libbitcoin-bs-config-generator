// Control behaviour: committing on keystroke, emptying a field, and list edits.
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ListField } from '../../../src/ui/controls/ListField';
import { NumberField } from '../../../src/ui/controls/NumberField';
import { Select } from '../../../src/ui/controls/Select';
import { Switch } from '../../../src/ui/controls/Switch';
import { TextField } from '../../../src/ui/controls/TextField';

describe('NumberField', () => {
  it('does not commit while typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField id="n" label="Connections" value={5} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Connections' });
    await user.clear(input);
    await user.type(input, '42');

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('42');
  });

  it('commits on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField id="n" label="Connections" value={5} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Connections' });
    await user.clear(input);
    await user.type(input, '42');
    await user.tab();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it('commits on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField id="n" label="Connections" value={5} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Connections' });
    await user.clear(input);
    await user.type(input, '7{Enter}');

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('commits undefined when cleared and keeps the field empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField id="n" label="Connections" value={5} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Connections' });
    await user.clear(input);
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(input).toHaveValue('');
  });

  it('restores the committed value on Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField id="n" label="Connections" value={5} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Connections' });
    await user.clear(input);
    await user.type(input, '42');
    await user.keyboard('{Escape}');

    expect(input).toHaveValue('5');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits an out-of-range value unchanged and flags it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <NumberField id="n" label="Connections" value={5} min={0} max={10} onChange={onChange} />,
    );

    const input = screen.getByRole('textbox', { name: 'Connections' });
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '10');

    await user.clear(input);
    await user.type(input, '999');
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(999);

    rerender(
      <NumberField
        id="n"
        label="Connections"
        value={5}
        min={0}
        max={10}
        invalid
        describedBy="n-error"
        onChange={onChange}
      />,
    );

    expect(input).toHaveValue('999');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders its unit without making it part of the value', () => {
    render(<NumberField id="n" label="Timeout" value={0} unit="seconds" onChange={vi.fn()} />);
    expect(screen.getByText('seconds')).toBeInTheDocument();
  });
});

function ListHarness ({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return <ListField id="list" label="Bind" value={value} onCommit={setValue} />;
}

describe('ListField', () => {
  it('adds an entry', async () => {
    const user = userEvent.setup();
    render(<ListHarness initial={[]} />);

    await user.click(screen.getByRole('button', { name: 'Add entry' }));

    const entry = screen.getByRole('textbox', { name: 'Entry 1' });
    expect(entry).toHaveValue('');
    await user.type(entry, '127.0.0.1:8333');
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Entry 1' })).toHaveValue('127.0.0.1:8333');
  });

  it('commits an entry on blur, not on every keystroke', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <ListField id="list" label="Bind" value={['a']} onCommit={onCommit} />,
    );

    const entry = screen.getByRole('textbox', { name: 'Entry 1' });
    await user.clear(entry);
    await user.type(entry, 'abc');
    expect(onCommit).not.toHaveBeenCalled();

    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(['abc']);
  });

  it('removes an entry', async () => {
    const user = userEvent.setup();
    render(<ListHarness initial={['a', 'b']} />);

    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));

    expect(screen.queryByRole('textbox', { name: 'Entry 2' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Entry 1' })).toHaveValue('b');
  });

  it('moves an entry up', async () => {
    const user = userEvent.setup();
    render(<ListHarness initial={['a', 'b']} />);

    await user.click(screen.getByRole('button', { name: 'Move entry 2 up' }));

    expect(screen.getByRole('textbox', { name: 'Entry 1' })).toHaveValue('b');
    expect(screen.getByRole('textbox', { name: 'Entry 2' })).toHaveValue('a');
  });

  it('keeps an empty list valid and unset', () => {
    render(<ListHarness initial={[]} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Bind' })).not.toHaveAttribute('aria-invalid');
  });
});

describe('Switch', () => {
  it('is a labelled switch that reports its new state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch id="s" label="Enable logging" checked={false} onChange={onChange} />);

    const control = screen.getByRole('switch', { name: 'Enable logging' });
    expect(control).not.toBeChecked();

    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Select', () => {
  it('lists the catalog values and reports the choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        id="s"
        label="Network"
        value="mainnet"
        values={[
          { label: 'Mainnet', value: 'mainnet' },
          { label: 'Regtest', value: 'regtest' },
        ]}
        onChange={onChange}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Network' });
    await user.selectOptions(select, 'regtest');
    expect(onChange).toHaveBeenCalledWith('regtest');
  });
});

describe('TextField', () => {
  it('commits on blur, not on every keystroke', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TextField id="t" label="SOCKS" value="localhost" example="127.0.0.1:9050" onChange={onChange} />,
    );

    const input = screen.getByRole('textbox', { name: 'SOCKS' });
    expect(input).toHaveAttribute('placeholder', '127.0.0.1:9050');

    await user.clear(input);
    await user.type(input, '127.0.0.1:9050');
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange).toHaveBeenCalledWith('127.0.0.1:9050');
  });
});
