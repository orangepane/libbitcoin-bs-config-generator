import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { RefObject } from 'react';
import catalogJson from '../catalog.json';
import { parseCatalog, sectionList, settingList } from '../catalog';
import type { Catalog } from '../catalog';
import {
  alerts,
  applyPreset,
  buildArtifact,
  clone,
  decodeShared,
  evaluateWarnings,
  getDefaults,
  parseConf,
  presetById,
  readHash,
  shareUrl,
} from '../config';
import type { ConfigValue, Settings, UnknownEntry } from '../config';
import { Header } from './Header';
import { Rail } from './Rail';
import { StartPanel } from './StartPanel';
import { ArtifactPane } from './ArtifactPane';
import { SettingsList } from './SettingsList';
import { ImportDialog } from './dialogs/ImportDialog';
import { ShareDialog } from './dialogs/ShareDialog';
import { DownloadDialog } from './dialogs/DownloadDialog';
import { copyText } from './clipboard';
import type { ArtifactTab, CopyState, TierView } from './types';

// Nothing is written to the URL until Share is pressed.

const catalog: Catalog = parseCatalog(catalogJson);
const defaults: Settings = getDefaults(catalog);

interface Draft {
  settings: Settings;
  presetId: string | null;
  /** True once the draft is no longer exactly the applied preset or the defaults. */
  modified: boolean;
  /** Imported keys the catalog does not know. Kept, emitted as written. */
  unknown: UnknownEntry[];
}

/** One step back, for the actions that replace the draft wholesale. */
interface UndoEntry {
  label: string;
  draft: Draft;
}

interface ShellState extends Draft {
  undo: UndoEntry | null;
}

type Action =
  | { type: 'set'; section: string; key: string; value: ConfigValue }
  | { type: 'revert'; section: string; key: string }
  | { type: 'preset'; id: string }
  | { type: 'import'; settings: Settings; unknown: UnknownEntry[] }
  | { type: 'reset' }
  | { type: 'undo' };

function snapshot (state: ShellState): Draft {
  return {
    settings: state.settings,
    presetId: state.presetId,
    modified: state.modified,
    unknown: state.unknown,
  };
}

function withValue (state: ShellState, section: string, key: string, value: ConfigValue): ShellState {
  const values = { ...(state.settings[section] ?? {}) };
  values[key] = value;
  return { ...state, settings: { ...state.settings, [section]: values } };
}

function reducer (state: ShellState, action: Action): ShellState {
  switch (action.type) {
    case 'set':
      return {
        ...withValue(state, action.section, action.key, action.value),
        modified: true,
        undo: null,
      };

    case 'revert': {
      const fallback = defaults[action.section]?.[action.key];
      if (fallback === undefined) return state;
      return { ...withValue(state, action.section, action.key, clone(fallback)), undo: null };
    }

    case 'preset': {
      const preset = presetById(action.id);
      if (!preset) return state;
      return {
        settings: applyPreset(defaults, preset, state.settings, catalog),
        presetId: action.id,
        modified: false,
        unknown: [],
        undo: { label: `apply ${preset.title}`, draft: snapshot(state) },
      };
    }

    case 'import':
      return {
        settings: action.settings,
        presetId: null,
        modified: true,
        unknown: action.unknown,
        undo: { label: 'import', draft: snapshot(state) },
      };

    case 'reset':
      return {
        settings: clone(defaults),
        presetId: null,
        modified: false,
        unknown: [],
        undo: { label: 'reset', draft: snapshot(state) },
      };

    case 'undo': {
      if (!state.undo) return state;
      return { ...state.undo.draft, undo: null };
    }
  }
}

/**
 * The draft on first paint. A share link is read once, from the hash, and is
 * never written back; a link that does not decode leaves the defaults in place.
 */
function readInitialState (): ShellState {
  const base: ShellState = {
    settings: clone(defaults),
    presetId: null,
    modified: false,
    unknown: [],
    undo: null,
  };

  if (typeof window === 'undefined') return base;

  const payload = readHash(window.location.hash);
  if (!payload) return base;

  const decoded = decodeShared(payload, defaults, catalog);
  if (!decoded) return base;

  return { ...base, settings: decoded.settings, unknown: decoded.unknown, modified: true };
}

/** Bounds and whole-number errors, one message per `${section}.${key}`. */
function deriveErrors (settings: Settings): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const section of sectionList(catalog)) {
    const values = settings[section.key];
    if (!values) continue;

    for (const setting of settingList(section)) {
      const value = values[setting.key];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;

      const id = `${section.key}.${setting.key}`;
      const unit = setting.unit ? ` ${setting.unit}` : '';

      if (setting.kind === 'integer' && !Number.isInteger(value)) {
        errors[id] = 'Whole numbers only.';
      } else if (setting.min !== undefined && value < setting.min) {
        errors[id] = `Must be at least ${setting.min}${unit}.`;
      } else if (setting.max !== undefined && value > setting.max) {
        errors[id] = `Must be at most ${setting.max}${unit}.`;
      }
    }
  }

  return errors;
}

function useModal (open: boolean): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return ref;
}

export function App () {
  const [state, dispatch] = useReducer(reducer, null, readInitialState);

  const [view, setView] = useState<TierView>('start');
  const [search, setSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [tab, setTab] = useState<ArtifactTab>('file');
  const [focus, setFocus] = useState<{ section: string; key: string } | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const [importOpen, setImportOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importUnknown, setImportUnknown] = useState<UnknownEntry[]>([]);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useModal(sheetOpen);

  const artifact = useMemo(
    () => buildArtifact(state.settings, defaults, catalog, state.unknown),
    [state.settings, state.unknown],
  );
  const warnings = useMemo(
    () => evaluateWarnings(state.settings, defaults, catalog),
    [state.settings],
  );
  const named = useMemo(() => alerts(warnings), [warnings]);
  const errors = useMemo(() => deriveErrors(state.settings), [state.settings]);

  const focusKey = focus ? `${focus.section}.${focus.key}` : null;

  const presetLabel = useMemo(() => {
    const preset = state.presetId ? presetById(state.presetId) : undefined;
    if (preset) return state.modified ? `Based on ${preset.title}, modified` : `Based on ${preset.title}`;
    return state.modified ? 'Edited from the defaults' : 'Starting from defaults';
  }, [state.presetId, state.modified]);

  // Copy feedback is a label, not an animation.
  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 3000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const handleChange = useCallback((section: string, key: string, value: ConfigValue) => {
    dispatch({ type: 'set', section, key, value });
  }, []);

  const handleRevert = useCallback((section: string, key: string) => {
    dispatch({ type: 'revert', section, key });
  }, []);

  const handlePreset = useCallback((id: string) => {
    dispatch({ type: 'preset', id });
  }, []);

  // Two intents: navigation may change the view, row focus may not.
  const revealRow = useCallback((section: string, key: string) => {
    setFocus({ section, key });
    setView('all');
  }, []);

  const handleRowFocus = useCallback((section: string, key: string) => {
    setFocus({ section, key });
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (value.trim() !== '') setView((current) => (current === 'start' ? 'all' : current));
  }, []);

  const handleChangedOnly = useCallback((value: boolean) => {
    setChangedOnly(value);
    if (value) setView((current) => (current === 'start' ? 'all' : current));
  }, []);

  const handleView = useCallback((next: TierView) => {
    setView(next);
  }, []);

  const handleReset = useCallback(() => {
    dispatch({ type: 'reset' });
    setFocus(null);
  }, []);

  const handleUndo = useCallback(() => {
    dispatch({ type: 'undo' });
    setFocus(null);
  }, []);

  function openImport () {
    setImportErrors([]);
    setImportUnknown([]);
    setImportOpen(true);
  }

  function applyImport (text: string) {
    const result = parseConf(text, defaults, catalog);
    dispatch({ type: 'import', settings: result.settings, unknown: result.unknown });
    setImportErrors(result.errors);
    setImportUnknown(result.unknown);
    // Stay open only when there is something to read: errors, or unknown keys.
    if (result.errors.length === 0 && result.unknown.length === 0) setImportOpen(false);
  }

  async function copy (text: string) {
    const ok = await copyText(text);
    setCopyState(ok ? 'copied' : 'failed');
  }

  function saveFile () {
    const blob = new Blob([artifact.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'bs.cfg';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setDownloadOpen(false);
  }

  function handleDownload () {
    setCopyState('idle');
    // A note is a fact, not a risk: it does not stand between the reader and the file.
    if (named.length === 0) saveFile();
    else setDownloadOpen(true);
  }

  function handleShare () {
    const url = shareUrl(state.settings, defaults, window.location.href, state.unknown);
    window.history.replaceState(null, '', url);
    setShareLink(url);
    setCopyState('idle');
    setShareOpen(true);
  }

  const canReset =
    state.presetId !== null || state.modified || artifact.changedCount > 0 || state.unknown.length > 0;

  return (
    <div className="app">
      <a className="skip-link" href="#settings">
        Skip to settings
      </a>

      <Header
        version={catalog.meta.version}
        network={artifact.network}
        changedCount={artifact.changedCount}
        alertCount={named.filter((warning) => warning.severity !== 'notice').length}
        noteCount={warnings.length - named.length}
        onImport={openImport}
      />

      <div className="layout">
        <Rail
          view={view}
          onView={handleView}
          search={search}
          onSearch={handleSearch}
          changedOnly={changedOnly}
          onChangedOnly={handleChangedOnly}
          onImport={openImport}
          presetLabel={presetLabel}
          canReset={canReset}
          onReset={handleReset}
          undoLabel={state.undo?.label ?? null}
          onUndo={handleUndo}
        />

        <main className="content" id="settings" tabIndex={-1}>
          {view === 'start' ? (
            <StartPanel
              catalog={catalog}
              settings={state.settings}
              presetId={state.presetId}
              modified={state.modified}
              onPreset={handlePreset}
              onChange={handleChange}
            />
          ) : (
            <SettingsList
              catalog={catalog}
              defaults={defaults}
              settings={state.settings}
              view={view}
              search={search}
              changedOnly={changedOnly}
              errors={errors}
              focusKey={focusKey}
              onChange={handleChange}
              onRevert={handleRevert}
              onRowFocus={handleRowFocus}
            />
          )}
        </main>

        <ArtifactPane
          artifact={artifact}
          defaults={defaults}
          warnings={warnings}
          unknown={state.unknown}
          tab={tab}
          onTab={setTab}
          focusKey={focusKey}
          onFocusKey={revealRow}
          onCopy={() => {
            void copy(artifact.text);
          }}
          onDownload={handleDownload}
          onShare={handleShare}
          copyState={copyState}
        />
      </div>

      <div className="mobile-bar">
        <span className="mobile-count">{artifact.changedCount} changed</span>
        <button
          className="btn btn-primary"
          type="button"
          aria-label="Open bs.cfg to copy or download it"
          onClick={() => setSheetOpen(true)}
        >
          Download
        </button>
      </div>

      <footer className="site-footer">
        <p>
          Community tool for libbitcoin server v4. Not affiliated with or endorsed by the
          libbitcoin project.
        </p>
        <a
          href="https://github.com/orangepane/libbitcoin-bs-config-generator"
          aria-label="Source code on GitHub"
        >
          Source
        </a>
      </footer>

      <ImportDialog
        open={importOpen}
        errors={importErrors}
        unknown={importUnknown}
        onApply={applyImport}
        onClose={() => setImportOpen(false)}
      />

      <ShareDialog
        open={shareOpen}
        url={shareLink}
        copyState={copyState}
        onCopy={(url) => {
          void copy(url);
        }}
        onClose={() => setShareOpen(false)}
      />

      <DownloadDialog
        open={downloadOpen}
        warnings={named}
        onConfirm={saveFile}
        onClose={() => setDownloadOpen(false)}
      />

      {sheetOpen ? (
        <dialog
          ref={sheetRef}
          className="dialog artifact-sheet"
          aria-label="bs.cfg"
          onClose={() => setSheetOpen(false)}
        >
          <div className="sheet-head">
            <button className="btn btn-ghost" type="button" onClick={() => setSheetOpen(false)}>
              Close
            </button>
          </div>
          <ArtifactPane
            artifact={artifact}
            defaults={defaults}
            warnings={warnings}
            unknown={state.unknown}
            tab={tab}
            onTab={setTab}
            focusKey={focusKey}
            onFocusKey={revealRow}
            onCopy={() => {
              void copy(artifact.text);
            }}
            onDownload={handleDownload}
            onShare={handleShare}
            copyState={copyState}
            compact
          />
        </dialog>
      ) : null}
    </div>
  );
}
