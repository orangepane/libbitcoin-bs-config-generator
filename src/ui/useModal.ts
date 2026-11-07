import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** One dialog, opened and closed by the caller. Native, no polyfill. */
export function useModal (open: boolean): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return ref;
}
