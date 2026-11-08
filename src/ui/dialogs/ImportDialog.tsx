import { useId, useState } from 'react';
import { plural } from '../plural';
import { useModal } from '../useModal';
import type { ImportDialogProps } from '../types';
import { MAX_IMPORT_BYTES } from '../../config';

// Nothing replaces the draft until Apply. Unknown keys survive the import.

/** Open a native dialog on mount, close it when the caller says so. */
export function ImportDialog ({ open, errors, unknown, onApply, onClose }: ImportDialogProps) {
  const ref = useModal(open);
  const id = useId();
  const textId = `${id}-text`;
  const fileId = `${id}-file`;
  const titleId = `${id}-title`;

  const [text, setText] = useState('');
  const [readError, setReadError] = useState<string | null>(null);

  // A closed dialog starts empty next time: a stale file is never applied twice.
  function close () {
    setText('');
    setReadError(null);
    onClose();
  }

  async function readFile (file: File | null) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setText('');
      setReadError(
        `That file is ${Math.ceil(file.size / 1024)} KB. The import limit is ${Math.round(MAX_IMPORT_BYTES / 1024)} KB, because a bs.cfg is normally a few KB.`,
      );
      return;
    }
    try {
      const contents = await file.text();
      setText(contents);
      setReadError(null);
    } catch {
      setReadError('That file could not be read. Paste its contents instead.');
    }
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={close}>
      <h2 className="dialog-title" id={titleId}>
        Import a bs.cfg
      </h2>
      <p className="dialog-lead">
        Paste a configuration or choose a file, up to 512 KB. Nothing is replaced until you
        apply it, and the file is read in the browser without being uploaded.
      </p>

      <div className="dialog-field">
        <label htmlFor={fileId}>Configuration file</label>
        <input
          id={fileId}
          type="file"
          accept=".cfg,.conf,.txt,.text,text/plain"
          onChange={(event) => {
            void readFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
      </div>

      <div className="dialog-field">
        <label htmlFor={textId}>Configuration text</label>
        <textarea
          id={textId}
          value={text}
          rows={12}
          spellCheck={false}
          placeholder={'[electrum]\nbind = 127.0.0.1'}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {readError ? <p className="row-error">{readError}</p> : null}

      {errors.length > 0 ? (
        <section className="dialog-report" role="status" aria-label="Import report">
          <h3 className="dialog-report-title">
            {plural(errors.length, 'problem')} in this file
          </h3>
          <p>
            Everything else was applied. The settings named below are at their catalog defaults.
          </p>
          <ul className="dialog-report-list">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {unknown.length > 0 ? (
        <p className="dialog-report-note">
          {plural(unknown.length, 'key')} not in this catalog. Kept as written and emitted after
          the sections this tool knows.
        </p>
      ) : null}

      <div className="dialog-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => onApply(text)}
          disabled={text.trim() === ''}
        >
          Apply
        </button>
        <button className="btn btn-ghost" type="button" onClick={close}>
          Close
        </button>
      </div>
    </dialog>
  );
}
