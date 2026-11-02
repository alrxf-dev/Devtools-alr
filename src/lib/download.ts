import { safeDownloadName } from './safe';

export type DownloadData = Blob | Uint8Array | ArrayBuffer | string;

export function toBlob(data: DownloadData, mime: string): Blob {
  if (data instanceof Blob) return data.type === mime || mime === '' ? data : new Blob([data], { type: mime });
  return new Blob([data as BlobPart], { type: mime });
}

/**
 * Start a download of `blob` as `filename`. The object URL is revoked after the browser has had time to begin the
 * download, so it does not live for the rest of the session.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeDownloadName(filename);
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
