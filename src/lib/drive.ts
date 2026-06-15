// Google Drive helpers. Everything here talks to Google directly from the browser;
// no app-owned server is involved. Two paths:
//   1. Public link + API key  -> files.get?alt=media&key=...  (CORS-friendly, public files)
//   2. Browse (OAuth Picker)  -> files.get?alt=media + Bearer (any file the user can open)
import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID, DRIVE_SCOPE } from '../config';

export interface DriveFile {
  blob: Blob;
  name: string;
  mimeType?: string;
}

type ProgressFn = (ratio: number) => void;

/** Extract a Drive file id from a pasted URL, or accept a bare id. */
export function parseDriveId(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;

  const byPath = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(text);
  if (byPath) return byPath[1];

  const byQuery = /[?&]id=([a-zA-Z0-9_-]+)/.exec(text);
  if (byQuery) return byQuery[1];

  // A bare id (Drive ids are typically 25+ url-safe chars).
  if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) return text;

  return null;
}

/** Read a fetch Response body into a Blob, reporting progress when possible. */
async function readResponseAsBlob(res: Response, onProgress?: ProgressFn): Promise<Blob> {
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body || !total || !onProgress) {
    return res.blob();
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress(Math.min(1, received / total));
    }
  }
  const type = res.headers.get('content-type') ?? 'application/octet-stream';
  return new Blob(chunks as BlobPart[], { type });
}

async function fetchDriveMetaName(id: string, init: RequestInit): Promise<string | undefined> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType${
      GOOGLE_API_KEY ? `&key=${encodeURIComponent(GOOGLE_API_KEY)}` : ''
    }`;
    const res = await fetch(url, init);
    if (!res.ok) return undefined;
    const json = (await res.json()) as { name?: string };
    return json.name;
  } catch {
    return undefined;
  }
}

/** Fetch a PUBLIC Drive file using only an API key (requires VITE_GOOGLE_API_KEY). */
export async function fetchPublicDriveFile(id: string, onProgress?: ProgressFn): Promise<DriveFile> {
  if (!GOOGLE_API_KEY) {
    throw new Error(
      'Pasting a Drive link needs a Google API key (VITE_GOOGLE_API_KEY), and the file must be shared publicly. ' +
        'Otherwise use the Browse button or drag in a downloaded file.',
    );
  }
  const name = (await fetchDriveMetaName(id, {})) ?? `drive-${id}`;
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${encodeURIComponent(
    GOOGLE_API_KEY,
  )}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      res.status === 403 || res.status === 404
        ? 'Could not fetch that file. Make sure it is shared as “Anyone with the link”. For private files, use Browse.'
        : `Drive download failed (HTTP ${res.status}).`,
    );
  }
  const blob = await readResponseAsBlob(res, onProgress);
  return { blob, name };
}

// --- OAuth + Picker -------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyWin = typeof window & { google?: any; gapi?: any };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  await loadScript('https://accounts.google.com/gsi/client');
  const win = window as AnyWin;

  return new Promise<string>((resolve, reject) => {
    try {
      const client = win.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error || 'Authorization was cancelled.'));
            return;
          }
          cachedToken = {
            token: resp.access_token,
            expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
          };
          resolve(resp.access_token);
        },
      });
      client.requestAccessToken();
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to start Google authorization.'));
    }
  });
}

async function loadPicker(): Promise<any> {
  await loadScript('https://apis.google.com/js/api.js');
  const win = window as AnyWin;
  await new Promise<void>((resolve) => win.gapi.load('picker', () => resolve()));
  return win.google.picker;
}

interface PickedFile {
  id: string;
  name: string;
}

function showPicker(token: string): Promise<PickedFile | null> {
  return loadPicker().then(
    (picker) =>
      new Promise<PickedFile | null>((resolve) => {
        const view = new picker.DocsView(picker.ViewId.DOCS_VIDEOS).setMode(
          picker.DocsViewMode.LIST,
        );
        const builder = new picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setCallback((data: any) => {
            if (data.action === picker.Action.PICKED) {
              const doc = data.docs?.[0];
              resolve(doc ? { id: doc.id, name: doc.name } : null);
            } else if (data.action === picker.Action.CANCEL) {
              resolve(null);
            }
          });
        if (GOOGLE_API_KEY) builder.setDeveloperKey(GOOGLE_API_KEY);
        builder.build().setVisible(true);
      }),
  );
}

/** Full Browse flow: authorize, show the Picker, download the chosen file. */
export async function browseDrive(onProgress?: ProgressFn): Promise<DriveFile | null> {
  const token = await getAccessToken();
  const picked = await showPicker(token);
  if (!picked) return null; // user cancelled

  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${picked.id}?alt=media`,
    auth,
  );
  if (!res.ok) throw new Error(`Drive download failed (HTTP ${res.status}).`);
  const blob = await readResponseAsBlob(res, onProgress);
  return { blob, name: picked.name };
}
