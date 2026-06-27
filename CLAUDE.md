# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **100% client-side** React + TypeScript + Vite web app that trims a video into a looping GIF or H.264 MP4 entirely in the browser via ffmpeg.wasm. There is no backend: source bytes come from a local file, drag/drop, or Google Drive (fetched browser→Google directly), and all encoding happens in the tab. It deploys to GitHub Pages.

## Commands

```bash
npm install     # installs deps AND runs scripts/copy-ffmpeg.mjs (postinstall) to stage cores
npm run dev     # vite dev server at http://localhost:5173
npm run build   # tsc typecheck + vite build -> dist/
npm run preview # serve the production build locally
npm run copy-ffmpeg  # re-stage ffmpeg cores into public/ffmpeg (rarely needed by hand)
```

There is no test suite, linter, or formatter configured. `npm run build` (which runs `tsc`) is the only correctness gate — run it after changes. Node 22 is pinned (CI, `flake.nix`); `nix develop` provides the toolchain.

## Critical architectural constraints

These are deliberate decisions enforced across multiple files. Do not "fix" them without understanding why.

- **Single-thread ffmpeg core only.** The multi-thread core was intentionally dropped because it requires cross-origin isolation (COOP/COEP), which (a) GitHub Pages cannot send and (b) breaks the Google Picker's cross-origin scripts. Consequences threaded through the code:
  - [vite.config.ts](vite.config.ts) sends **no** COOP/COEP headers and excludes `@ffmpeg/*` from dep pre-bundling.
  - [scripts/copy-ffmpeg.mjs](scripts/copy-ffmpeg.mjs) copies only the ST core, and only the **ESM** dist build (`dist/esm`) — the UMD build has no `default` export and fails to import in the module worker.
  - Never reintroduce `@ffmpeg/core-mt`, `SharedArrayBuffer`, or isolation headers.
- **Cores are served same-origin, not from a CDN.** `copy-ffmpeg.mjs` stages `ffmpeg-core.js`/`.wasm` into `public/ffmpeg/`; [src/lib/ffmpeg.ts](src/lib/ffmpeg.ts) loads them via `toBlobURL` resolved against `import.meta.env.BASE_URL`. `public/.nojekyll` keeps these assets intact on Pages. These files are generated — do not edit or commit them by hand.
- **Relative base (`base: './'`)** so the build runs unchanged under `user.github.io/<repo>/` or a custom domain.

## Code map & data flow

`src/main.tsx` does minimal hash routing (`#/privacy` → `Privacy`, else `App`) — hash-based so deep links survive a Pages refresh, no server rewrites.

`App.tsx` owns the top-level state: `source`, `duration`, `start`, `end`. Flow is **SourceDialog → VideoEditor → ExportPanel**:
- `src/components/SourceDialog.tsx` produces a `VideoSource` (`{ file, name, url }`, see [src/types.ts](src/types.ts)) from local file / drag-drop / Drive. `url` is an object URL; `App.loadSource` revokes the previous one on replace.
- `src/components/VideoEditor.tsx` + `Timeline.tsx` preview and pick the in/out range, reporting `start`/`end` up to `App`.
- `src/components/ExportPanel.tsx` collects export options and calls the ffmpeg hook.

**ffmpeg layer (two files, keep the split):**
- [src/hooks/useFfmpeg.ts](src/hooks/useFfmpeg.ts) — React surface: `busy`/`progress`/`status`/`error`, `run()`, and `preload()` (warms the ~30MB core in the background once a source loads). The singleton lives in the lib, so the hook is stateless w.r.t. the core.
- [src/lib/ffmpeg.ts](src/lib/ffmpeg.ts) — pure logic, no React. Maintains the lazy `FFmpeg` singleton and `exportClip()`. GIF = two-pass `palettegen`/`paletteuse` with lanczos (`-loop 0` to loop forever); MP4 = `libx264 -crf` + `yuv420p` + `+faststart`. Note `ffmpeg.exec()` resolves with an exit code rather than throwing — `runExec` checks it and surfaces captured log lines; the virtual FS is cleaned in a `finally`.

**Google Drive ([src/lib/drive.ts](src/lib/drive.ts), [src/config.ts](src/config.ts)):** entirely optional and credential-gated. Two paths — public link + API key (`files.get?alt=media&key=`) and Browse via OAuth token + Picker (read-only scope). Credentials come from build-time Vite env vars `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` (see `.env.example`); `hasPicker` (client id present) gates whether the Browse button renders. The app must remain fully functional (local files / drag-drop) with neither var set.

## Deploy

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on push to `main`. Google creds are injected from repo secrets of the same names; the build succeeds without them.
