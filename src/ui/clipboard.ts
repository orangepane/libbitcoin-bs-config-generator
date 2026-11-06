// Copy to clipboard. The async Clipboard API where the browser allows it, a
// hidden textarea otherwise, so Copy works on an insecure origin too. No
// third-party code, no permissions prompt of our own.

/** Last-resort copy: select a hidden textarea and ask the browser to copy it. */
function legacyCopy (text: string): boolean {
  if (typeof document === 'undefined') return false;

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.width = '1px';
  area.style.height = '1px';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';

  document.body.appendChild(area);

  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Copy `text` and report whether the browser accepted it. Never throws: a
 * refused permission is a `false`, which the caller renders as a failure.
 */
export async function copyText (text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, or the document is not focused. Fall through.
    }
  }

  return legacyCopy(text);
}
