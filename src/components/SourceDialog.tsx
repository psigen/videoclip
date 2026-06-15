import { useRef, useState } from 'react';
import { hasPicker } from '../config';
import { browseDrive, fetchPublicDriveFile, parseDriveId } from '../lib/drive';
import type { VideoSource } from '../types';

interface Props {
  onLoaded: (source: VideoSource) => void;
}

export function SourceDialog({ onLoaded }: Props) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<null | string>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function acceptFile(file: File) {
    setError(null);
    onLoaded({ file, name: file.name, url: URL.createObjectURL(file) });
  }

  async function loadFromLink() {
    setError(null);
    const id = parseDriveId(link);
    if (!id) {
      setError('That does not look like a Google Drive link or file id.');
      return;
    }
    setBusy('Downloading from Drive…');
    setProgress(0);
    try {
      const { blob, name } = await fetchPublicDriveFile(id, setProgress);
      onLoaded({ file: blob, name, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that link.');
    } finally {
      setBusy(null);
    }
  }

  async function loadFromPicker() {
    setError(null);
    setBusy('Opening Google Drive…');
    setProgress(0);
    try {
      const picked = await browseDrive(setProgress);
      if (picked) {
        onLoaded({ file: picked.blob, name: picked.name, url: URL.createObjectURL(picked.blob) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Drive browse failed.');
    } finally {
      setBusy(null);
    }
  }

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

      <div className="divider"><span>or from Google Drive</span></div>

      <div className="drive-row">
        <input
          type="url"
          placeholder="Paste a Google Drive share link…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadFromLink();
          }}
          disabled={!!busy}
        />
        <button onClick={loadFromLink} disabled={!!busy || link.trim() === ''}>
          Load link
        </button>
        {hasPicker && (
          <button className="secondary" onClick={loadFromPicker} disabled={!!busy}>
            Browse…
          </button>
        )}
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
      {!hasPicker && (
        <p className="hint">
          Tip: the “Browse” button appears once a Google OAuth client id is configured.
          Pasted links work for files shared “Anyone with the link.” Local files always work.
        </p>
      )}
    </section>
  );
}
