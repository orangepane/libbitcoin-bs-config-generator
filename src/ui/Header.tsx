import { plural } from './plural';
import type { HeaderProps } from './types';

export interface HeaderShellProps extends HeaderProps {
  /** Catalog version string, for example "v4". */
  version: string;
}

export function Header ({
  version,
  network,
  changedCount,
  alertCount,
  noteCount,
  onImport,
}: HeaderShellProps) {
  // A note never outranks a warning, and never shouts when it is alone.
  const notesOnly = alertCount === 0 && noteCount > 0;

  return (
    <header className="site-header">
      <div className="brand">
        <h1 className="brand-name">bs config</h1>
        <p className="brand-note">A bs.cfg for libbitcoin server v4.</p>
      </div>

      <p className="header-meta">
        <span className="meta-chip" title="Target version">
          bs {version}
        </span>
        <span className="meta-chip meta-network" title="Selected network">
          {network}
        </span>
        <span className="meta-chip" title="Settings that differ from the defaults">
          {plural(changedCount, 'setting')} changed
        </span>
        <span
          className="meta-chip"
          title={notesOnly ? 'Notes about this configuration' : 'Checks that name a setting'}
        >
          {notesOnly ? plural(noteCount, 'note') : plural(alertCount, 'warning')}
        </span>
      </p>

      <button className="btn" type="button" onClick={onImport}>
        Import
      </button>
    </header>
  );
}
