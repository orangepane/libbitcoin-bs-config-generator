import type { HeaderProps } from './types';

export interface HeaderShellProps extends HeaderProps {
  /** Catalog version string, for example "v4". */
  version: string;
}

function count (n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function Header ({ version, network, changedCount, warningCount, onImport }: HeaderShellProps) {
  return (
    <header className="site-header">
      <div className="brand">
        <h1 className="brand-name">bs config</h1>
        <p className="brand-note">A bs.cfg for libbitcoin server. Nothing leaves your browser.</p>
      </div>

      <p className="header-meta">
        <span className="meta-chip" title="Target version">
          bs {version}
        </span>
        <span className="meta-chip meta-network" title="Selected network">
          {network}
        </span>
        <span className="meta-chip" title="Settings that differ from the defaults">
          {count(changedCount, 'setting')} changed
        </span>
        <span className="meta-chip" title="Checks that name a setting">
          {count(warningCount, 'warning')}
        </span>
      </p>

      <button className="btn" type="button" onClick={onImport}>
        Import
      </button>
    </header>
  );
}
