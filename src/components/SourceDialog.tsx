import { useEffect, useRef, useState } from 'react';
import { hasDriveOAuth } from '../config';
import {
  fetchDirectUrl,
  fetchPrivateDriveFile,
  fetchPublicDriveFile,
  parseDriveId,
  parseHttpUrl,
  probeDriveAccess,
  type DriveAccess,
} from '../lib/drive';
import type { VideoSource } from '../types';

interface Props {
  onLoaded: (source: VideoSource) => void;
}

// Classification of the pasted link, used for both the button label and which download runs:
// 'idle' (empty/unrecognized), 'checking' (Drive probe in flight), a resolved Drive `DriveAccess`,
// or 'direct' (a non-Drive http(s) URL fetched as-is).
type LinkAccess = 'idle' | 'checking' | 'direct' | DriveAccess;

export function SourceDialog({ onLoaded }: Props) {
  const [link, setLink] = useState('');
  const [linkAccess, setLinkAccess] = useState<LinkAccess>('idle');
  const [busy, setBusy] = useState<null | string>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Classify the link (public vs private) at paste time, debounced. Doing this off the click path
  // is what makes the OAuth popup reliable: loadFromLink already knows the answer, so it can call
  // getAccessToken() synchronously within the click (see loadFromLink / lib/drive.ts).
  useEffect(() => {
    setError(null); // a fresh link supersedes any error from a previous attempt
    const id = parseDriveId(link);
    if (!id) {
      // Not a Drive link: a plain media URL needs no probe (no OAuth), anything else is unrecognized.
      setLinkAccess(parseHttpUrl(link) ? 'direct' : 'idle');
      return;
    }
    setLinkAccess('checking');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const access = await probeDriveAccess(id, controller.signal);
      if (!controller.signal.aborted) setLinkAccess(access);
    }, 400);
    // Runs on every link change (and unmount): cancel a not-yet-fired probe and abort an in-flight
    // one, so at most one probe is ever outstanding and a stale response can't win.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [link]);

  function acceptFile(file: File) {
    setError(null);
    onLoaded({ file, name: file.name, url: URL.createObjectURL(file) });
  }

  async function loadFromLink() {
    setError(null);
    const id = parseDriveId(link);
    const url = id ? null : parseHttpUrl(link);
    if (!id && !url) {
      setError('Enter a Google Drive link or a direct video URL.');
      return;
    }
    const isPrivate = linkAccess === 'private';
    setBusy(isPrivate ? 'Signing in to Google Drive…' : 'Downloading…');
    setProgress(0);
    try {
      // Branch synchronously on the pre-computed access so the private path's getAccessToken() is
      // the first await — fresh user activation keeps its sign-in popup from being blocked.
      const { blob, name } = id
        ? isPrivate
          ? await fetchPrivateDriveFile(id, setProgress)
          : await fetchPublicDriveFile(id, setProgress)
        : await fetchDirectUrl(url!, setProgress);
      onLoaded({ file: blob, name, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that link.');
    } finally {
      setBusy(null);
    }
  }

  // A private Drive file was detected but this site has no OAuth client id, so it can't be opened.
  const privateBlocked = linkAccess === 'private' && !hasDriveOAuth;

  return (
    <section className="card source">
      <h2>Add a video</h2>

      <div
        className={`dropzone${dragOver ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) acceptFile(file);
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
        }}
      >
        <strong>Drop a video here</strong>
        <span>or click to choose a file</span>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) acceptFile(file);
          }}
        />
      </div>

      <div className="divider"><span>or from a link</span></div>

      <div className="drive-row">
        <input
          type="url"
          placeholder="Paste a Google Drive link or a direct video URL…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadFromLink();
          }}
          disabled={!!busy}
        />
        <button
          onClick={loadFromLink}
          disabled={!!busy || link.trim() === '' || linkAccess === 'checking' || privateBlocked}
        >
          {linkAccess === 'private' && hasDriveOAuth ? '🔒 Sign in & Load' : 'Load'}
        </button>
      </div>

      {busy && (
        <div className="progress-line">
          <span>{busy}</span>
          {progress > 0 && (
            <progress max={1} value={progress} />
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {privateBlocked && (
        <p className="error">
          That looks like a private Drive file, and this site isn’t set up for Google sign-in.
          Download the file and drag it in, or use a link shared “Anyone with the link.”
        </p>
      )}
      {hasDriveOAuth ? (
        <p className="hint">
          Tip: paste a direct video URL, or a Drive link — Drive links open <strong>private</strong>{' '}
          files you can access too (you’ll sign in to Google once), while public files load without
          signing in.
        </p>
      ) : (
        <p className="hint">
          Tip: paste a direct video URL, or a Drive link shared “Anyone with the link.” Opening
          <strong> private</strong> Drive files needs a Google OAuth client id configured. Local
          files always work.
        </p>
      )}
    </section>
  );
}
