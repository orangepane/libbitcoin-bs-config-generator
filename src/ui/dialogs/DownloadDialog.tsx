import { useEffect, useId, useRef } from 'react';
import type { RefObject } from 'react';
import type { Warning } from '../../config';

// Warnings never block the file; they are read once more before it is saved.

export interface DownloadDialogProps {
  open: boolean;
  warnings: Warning[];
  onConfirm: () => void;
  onClose: () => void;
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

function count (n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function DownloadDialog ({ open, warnings, onConfirm, onClose }: DownloadDialogProps) {
  const ref = useModal(open);
  const id = useId();
  const titleId = `${id}-title`;

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose}>
      <h2 className="dialog-title" id={titleId}>
        Download bs.cfg
      </h2>
      <p className="dialog-lead">
        {count(warnings.length, 'warning')} to read before you run this file. The download is
        not blocked.
      </p>

      <ul className="dialog-warning-list">
        {warnings.map((warning, index) => (
          <li className="warning" key={`${warning.id}-${index}`} data-severity={warning.severity}>
            <p className="warning-message">{warning.message}</p>
            {warning.section && warning.key ? (
              <p className="warning-setting">
                {warning.section}.{warning.key}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="dialog-actions">
        <button className="btn" type="button" onClick={onConfirm}>
          Download anyway
        </button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
