import { useId } from 'react';
import { useModal } from '../useModal';
import type { CopyState, ShareDialogProps } from '../types';

// The link is built when the button is pressed, never while typing, and shown
// as text so it can be read before it is passed on.

const COPY_LABEL: Record<CopyState, string> = {
  idle: 'Copy link',
  copied: 'Link copied',
  failed: 'Copy failed',
};

export function ShareDialog ({ open, url, copyState, onCopy, onClose }: ShareDialogProps) {
  const ref = useModal(open);
  const id = useId();
  const titleId = `${id}-title`;
  const urlId = `${id}-url`;

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose}>
      <h2 className="dialog-title" id={titleId}>
        Share this configuration
      </h2>
      <p className="dialog-lead">
        The link carries the values you changed and nothing else. Opening it shows that
        configuration without touching the reader&rsquo;s own draft.
      </p>

      <div className="dialog-field">
        <label htmlFor={urlId}>Link</label>
        <input
          id={urlId}
          type="text"
          readOnly
          value={url}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>

      <p className="dialog-note">
        The address bar now holds this link. Editing the configuration afterwards does not
        change it; press Share again for the new state.
      </p>

      {copyState === 'failed' ? (
        <p className="row-error">The browser refused the clipboard. Select the link and copy it.</p>
      ) : null}

      <div className="dialog-actions">
        <button className="btn btn-primary" type="button" onClick={() => onCopy(url)}>
          {COPY_LABEL[copyState]}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
