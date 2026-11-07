import { useId } from 'react';
import { useModal } from '../useModal';
import type { Warning } from '../../config';

// Warnings never block the file; they are read once more before it is saved.

export interface DownloadDialogProps {
  open: boolean;
  warnings: Warning[];
  onConfirm: () => void;
  onClose: () => void;
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
        Read this before you run the file. The download is not blocked.
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
