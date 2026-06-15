import { useCallback, useRef, useState } from 'react';
import {
  coreKind,
  exportClip,
  loadFfmpeg,
  type ExportOptions,
  type ExportResult,
} from '../lib/ffmpeg';

interface ExportArgs {
  file: File | Blob;
  fileName: string;
  start: number;
  end: number;
  options: ExportOptions;
}

export interface UseFfmpeg {
  coreKind: typeof coreKind;
  busy: boolean;
  progress: number; // 0..1
  status: string;
  error: string | null;
  run: (args: ExportArgs) => Promise<ExportResult | null>;
  preload: () => void;
}

export function useFfmpeg(): UseFfmpeg {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const preloaded = useRef(false);

  const preload = useCallback(() => {
    if (preloaded.current) return;
    preloaded.current = true;
    // Warm the ~30MB core in the background so the first export starts fast.
    loadFfmpeg().catch(() => {
      preloaded.current = false;
    });
  }, []);

  const run = useCallback(async (args: ExportArgs): Promise<ExportResult | null> => {
    setBusy(true);
    setError(null);
    setProgress(0);
    setStatus('Loading encoder…');
    try {
      const result = await exportClip({
        ...args,
        onProgress: (ratio) => {
          setStatus('Encoding…');
          setProgress(ratio);
        },
      });
      setProgress(1);
      setStatus('Done');
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
      setStatus('');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { coreKind, busy, progress, status, error, run, preload };
}
