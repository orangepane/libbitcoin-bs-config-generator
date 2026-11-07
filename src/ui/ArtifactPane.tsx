import { useId, useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import type { ArtifactTab, ArtifactPaneProps, CopyState } from './types';
import { lineDomId } from './types';
import type { Artifact, ConfigValue, DiffEntry, Settings } from '../config';

// The file, the diff and the checks over one text. Every emitted line knows the
// setting that wrote it, so a line links back to its row.

const TABS: Array<{ id: ArtifactTab; label: string }> = [
  { id: 'file', label: 'File' },
  { id: 'diff', label: 'Diff' },
  { id: 'warnings', label: 'Warnings' },
];

const SEVERITY_LABEL: Record<string, string> = {
  notice: 'Note',
  warning: 'Warning',
  danger: 'Fix before running',
};

const COPY_LABEL: Record<CopyState, string> = {
  idle: 'Copy',
  copied: 'Copied',
  failed: 'Copy failed',
};

export interface ArtifactPaneShellProps extends ArtifactPaneProps {
  /** The defaults the diff is measured against; shown in the Diff tab. */
  defaults: Settings;
}

interface RenderedLine {
  text: string;
  section?: string;
  key?: string;
  /** First line of an entry: the one that carries the DOM id. */
  first: boolean;
}

interface Cursor {
  entries: DiffEntry[];
  entry: number;
  line: number;
  /** A line of this entry has been claimed; later ones are not the first. */
  started: boolean;
}

/** `true`/`false`, joined list elements, `(empty)` for a value that has none. */
function formatValue (value: ConfigValue | undefined): string {
  if (value === undefined) return '(not set)';
  if (Array.isArray(value)) return value.length === 0 ? '(empty)' : value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === '') return '(empty)';
  return String(value);
}

/**
 * Attach each emitted line to the entry that produced it. The serializer emits
 * sections in entry order, so a cursor per section is enough; a line that no
 * entry claims (the header block, an imported key) is rendered as plain text.
 */
function attributeLines (artifact: Artifact): RenderedLine[] {
  const cursors = new Map<string, Cursor>();
  for (const entry of artifact.entries) {
    let cursor = cursors.get(entry.section);
    if (!cursor) {
      cursor = { entries: [], entry: 0, line: 0, started: false };
      cursors.set(entry.section, cursor);
    }
    cursor.entries.push(entry);
  }

  const lines = artifact.text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const rendered: RenderedLine[] = [];
  let cursor: Cursor | undefined;

  for (const text of lines) {
    const header = /^\[(.+)\]$/.exec(text);
    if (header) {
      cursor = cursors.get(header[1]);
      rendered.push({ text, section: header[1], first: false });
      continue;
    }

    const current = cursor?.entries[cursor.entry];
    if (cursor && current) {
      const claimed = text.startsWith('#') || current.lines[cursor.line] === text;
      if (claimed) {
        rendered.push({
          text,
          section: current.section,
          key: current.key,
          first: !cursor.started,
        });
        cursor.started = true;

        if (!text.startsWith('#')) {
          cursor.line += 1;
          if (cursor.line >= current.lines.length) {
            cursor.entry += 1;
            cursor.line = 0;
            cursor.started = false;
          }
        }
        continue;
      }
    }

    rendered.push({ text, first: false });
  }

  return rendered;
}

function count (n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function ArtifactPane ({
  artifact,
  defaults,
  warnings,
  tab,
  onTab,
  focusKey,
  onFocusKey,
  onCopy,
  onDownload,
  onShare,
  copyState,
  compact = false,
}: ArtifactPaneShellProps) {
  const id = useId();
  const lines = useMemo(() => attributeLines(artifact), [artifact]);

  const panelId = (name: ArtifactTab) => `${id}-panel-${name}`;
  const tabId = (name: ArtifactTab) => `${id}-tab-${name}`;

  function moveTab (event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((entry) => entry.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : TABS.length - 1;
    const next = TABS[(index + step) % TABS.length];
    onTab(next.id);
    document.getElementById(tabId(next.id))?.focus();
  }

  function activate (event: KeyboardEvent<HTMLDivElement>, section: string, key: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onFocusKey(section, key);
  }

  return (
    <section className={compact ? 'artifact artifact-compact' : 'artifact'} aria-label="bs.cfg">
      <div className="artifact-head">
        <h2 className="artifact-title">bs.cfg</h2>
        <p className="artifact-count">
          {count(artifact.changedCount, 'setting')} changed, {count(warnings.length, 'warning')}
        </p>
      </div>

      <div className="artifact-tabs" role="tablist" aria-label="bs.cfg views" onKeyDown={moveTab}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            id={tabId(entry.id)}
            className="artifact-tab"
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            aria-controls={panelId(entry.id)}
            onClick={() => onTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'warnings' && warnings.length > 0 ? ` (${warnings.length})` : ''}
            {entry.id === 'diff' && artifact.changedCount > 0 ? ` (${artifact.changedCount})` : ''}
          </button>
        ))}
      </div>

      {tab === 'file' ? (
        <div
          className="artifact-body"
          id={panelId('file')}
          role="tabpanel"
          aria-labelledby={tabId('file')}
          tabIndex={0}
        >
          {lines.map((line, index) => {
            const section = line.section;
            const key = line.key;

            if (section && key) {
              const focused = `${section}.${key}` === focusKey;
              return (
                <div
                  key={index}
                  className="entry-line"
                  id={line.first ? lineDomId(section, key) : undefined}
                  role="button"
                  tabIndex={0}
                  data-section={section}
                  data-key={key}
                  data-focus={focused ? 'true' : 'false'}
                  title={`Show the row for ${section}.${key}`}
                  onClick={() => onFocusKey(section, key)}
                  onKeyDown={(event) => activate(event, section, key)}
                >
                  <code>{line.text}</code>
                </div>
              );
            }

            return (
              <div
                key={index}
                className={line.text === '' ? 'entry-blank' : 'entry-line entry-line-plain'}
              >
                {line.text === '' ? null : <code>{line.text}</code>}
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === 'diff' ? (
        <div
          className="artifact-body"
          id={panelId('diff')}
          role="tabpanel"
          aria-labelledby={tabId('diff')}
          tabIndex={0}
        >
          {artifact.entries.length === 0 ? (
            <p className="artifact-empty">
              Nothing differs from the defaults, so the file holds no settings.
            </p>
          ) : (
            <ul className="diff-list">
              {artifact.entries.map((entry) => (
                <li className="entry" key={`${entry.section}.${entry.key}`} data-tier={entry.tier}>
                  <button
                    className="entry-key"
                    type="button"
                    onClick={() => onFocusKey(entry.section, entry.key)}
                  >
                    {entry.key}
                  </button>
                  <span className="entry-section">{entry.section}</span>
                  <span className="entry-values">
                    <span className="entry-default">
                      {formatValue(defaults[entry.section]?.[entry.key])}
                    </span>
                    <span aria-hidden="true">{' \u2192 '}</span>
                    <span className="entry-value">{formatValue(entry.value)}</span>
                  </span>
                  <span className="row-chip">{entry.tier}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'warnings' ? (
        <div
          className="artifact-body"
          id={panelId('warnings')}
          role="tabpanel"
          aria-labelledby={tabId('warnings')}
          tabIndex={0}
        >
          {warnings.length === 0 ? (
            <p className="artifact-empty">No warnings.</p>
          ) : (
            <ul className="warning-list">
              {warnings.map((warning, index) => {
                const section = warning.section;
                const key = warning.key;
                return (
                  <li
                    className="warning"
                    key={`${warning.id}-${index}`}
                    data-severity={warning.severity}
                  >
                    <p className="warning-head">
                      <span className="row-chip">
                        {SEVERITY_LABEL[warning.severity] ?? warning.severity}
                      </span>
                      {section && key ? (
                        <button
                          className="warning-link"
                          type="button"
                          onClick={() => onFocusKey(section, key)}
                        >
                          {section}.{key}
                        </button>
                      ) : null}
                    </p>
                    <p className="warning-message">{warning.message}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <div className="artifact-actions">
        <button className="btn" type="button" onClick={onCopy}>
          {COPY_LABEL[copyState]}
        </button>
        <button className="btn btn-primary" type="button" onClick={onDownload}>
          Download bs.cfg
        </button>
        <button className="btn btn-ghost" type="button" onClick={onShare}>
          Share
        </button>
      </div>

      <div className="next-steps">
        <h3 className="next-steps-title">Run it</h3>
        {artifact.network !== 'mainnet' ? (
          <p>
            Create the store for {artifact.network} once: <code>bs -n {artifact.network}</code>
          </p>
        ) : null}
        <p>
          Then start bs with this file: <code>bs --config bs.cfg</code>
        </p>
      </div>

      <p className="compat">
        Targets bs v4. A v3.8 configuration is not compatible with v4.
      </p>
    </section>
  );
}
