// Google Drive helpers. Everything here talks to Google directly from the browser;
// no app-owned server is involved. The same files.get?alt=media endpoint is used two ways,
// differing only in credentials:
//   1. Public link + API key  -> &key=...           (CORS-friendly, "Anyone with the link" files)
//   2. Private link + OAuth    -> Authorization: Bearer (any file the signed-in user can open)
// A pasted link is classified up front via probeDriveAccess() so the caller knows whether it needs
// the API-key path (#1) or OAuth path (#2) before it acts. A pasted link that isn't a Drive link
// is treated as a plain media URL and fetched directly (fetchDirectUrl), subject to the remote
// server's CORS policy.
import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID, DRIVE_SCOPE } from '../config';

export type DriveAccess = 'public' | 'private' | 'unknown';

export interface DriveFile {
  blob: Blob;
  name: string;
  mimeType?: string;
}

type ProgressFn = (ratio: number) => void;

/** Accept a plain http(s) URL (anything that isn't a Drive link), returning it normalized. */
export function parseHttpUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Best-effort display name from a URL path, e.g. ".../my%20clip.mp4?x=1" -> "my clip.mp4". */
function fileNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'video';
  } catch {
    return 'video';
  }
}

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

function hasAuthHeader(init: RequestInit): boolean {
  const headers = init.headers as Record<string, string> | undefined;
  return !!headers && 'Authorization' in headers;
}

/**
 * Shared media download: resolve a display name, GET `?alt=media` with the supplied credentials
 * (API key via `&key=` unless the init already carries an OAuth `Authorization` header), and read
 * the body into a Blob.
 */
async function downloadDriveMedia(
  id: string,
  init: RequestInit,
  onProgress?: ProgressFn,
): Promise<DriveFile> {
  const name = (await fetchDriveMetaName(id, init)) ?? `drive-${id}`;
  const keyParam =
    GOOGLE_API_KEY && !hasAuthHeader(init) ? `&key=${encodeURIComponent(GOOGLE_API_KEY)}` : '';
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media${keyParam}`,
    init,
  );
  if (!res.ok) {
    throw new Error(
      res.status === 403 || res.status === 404
        ? 'Could not fetch that file. Make sure you have access to it (or that it is shared “Anyone with the link”).'
        : `Drive download failed (HTTP ${res.status}).`,
    );
  }
  const blob = await readResponseAsBlob(res, onProgress);
  return { blob, name };
}

/**
 * Classify a pasted link as public vs private with a key-only metadata probe — no OAuth, no popup.
 * "Public" is defined exactly as "fetchable with just the API key", so 200 = public and 403/404 =
 * private. Runs off the click path (at paste time), so its latency never affects popup reliability.
 */
export async function probeDriveAccess(id: string, signal?: AbortSignal): Promise<DriveAccess> {
  // Without an API key we can't test public access: if OAuth is available, treat as private (it
  // must go through sign-in); otherwise assume public so the existing key-less error surfaces.
  if (!GOOGLE_API_KEY) return GOOGLE_CLIENT_ID ? 'private' : 'public';
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${id}?fields=id&key=${encodeURIComponent(
      GOOGLE_API_KEY,
    )}`;
    const res = await fetch(url, { signal });
    if (res.ok) return 'public';
    if (res.status === 403 || res.status === 404) return 'private';
    return 'unknown';
  } catch {
    return 'unknown'; // network error or aborted request
  }
}

/** Fetch a PUBLIC Drive file using only an API key (requires VITE_GOOGLE_API_KEY). */
export async function fetchPublicDriveFile(id: string, onProgress?: ProgressFn): Promise<DriveFile> {
  if (!GOOGLE_API_KEY) {
    throw new Error(
      'Pasting a Drive link needs a Google API key (VITE_GOOGLE_API_KEY), and the file must be shared publicly. ' +
        'Otherwise download the file and drag it in.',
    );
  }
  return downloadDriveMedia(id, {}, onProgress);
}

/**
 * Fetch a PRIVATE Drive file the signed-in user can access, via OAuth: sign in for a read-only
 * token, then download with an `Authorization: Bearer` header. Needs a client id.
 */
export async function fetchPrivateDriveFile(id: string, onProgress?: ProgressFn): Promise<DriveFile> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      'That file looks private. Set a Google OAuth client id (VITE_GOOGLE_CLIENT_ID) to sign in and open it, ' +
        'or download the file and drag it in.',
    );
  }
  const token = await getAccessToken();
  return downloadDriveMedia(id, { headers: { Authorization: `Bearer ${token}` } }, onProgress);
}

/**
 * Fetch any direct (non-Drive) http(s) URL into a blob. The server must allow cross-origin
 * (CORS) reads — otherwise the browser blocks it and we point the user at drag/drop.
 */
export async function fetchDirectUrl(url: string, onProgress?: ProgressFn): Promise<DriveFile> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      'Could not fetch that URL. The server must allow cross-origin (CORS) requests; ' +
        'otherwise download the file and drag it in.',
    );
  }
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  const blob = await readResponseAsBlob(res, onProgress);
  return { blob, name: fileNameFromUrl(url) };
}

// --- OAuth ----------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyWin = typeof window & { google?: any };

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

