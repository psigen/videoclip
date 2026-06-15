import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No COOP/COEP headers: we use the single-thread ffmpeg core, which needs no
// cross-origin isolation. Avoiding isolation also keeps the Google Picker working
// and matches how the app runs on GitHub Pages (which can't send those headers).
export default defineConfig({
  // Relative base so the build works under user.github.io/<repo>/ or a custom domain.
  base: './',
  plugins: [react()],
  // ffmpeg packages ship their own workers/wasm; don't let esbuild pre-bundle them.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
});
