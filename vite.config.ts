import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP enable cross-origin isolation, which unlocks SharedArrayBuffer and lets the
// app load the faster multi-threaded ffmpeg core during local dev / `vite preview`.
// (GitHub Pages can't send these headers, so production transparently falls back to the
// single-threaded core — see src/lib/ffmpeg.ts and the README.)
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // Relative base so the build works under user.github.io/<repo>/ or a custom domain.
  base: './',
  plugins: [react()],
  // ffmpeg packages ship their own workers/wasm; don't let esbuild pre-bundle them.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  server: { headers: coiHeaders },
  preview: { headers: coiHeaders },
});
