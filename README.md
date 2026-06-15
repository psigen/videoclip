# VideoClip

A **100% client-side** web app to trim videos into a **high-quality looping GIF or MP4**.
Load a video from a local file or Google Drive, scrub to pick start/end times, and export —
all processing happens in your browser via [ffmpeg.wasm](https://ffmpegwasm.netlify.app/).
**Your video is never uploaded to any server run by this app.**

- 🎞️ Preview + dual-handle in/out selection with loop preview
- 🪄 High-quality GIF (two-pass palette, looping) or H.264 MP4 export
- 📁 Sources: drag/drop local file, paste a Drive link, or Browse Google Drive (optional)
- 🔒 No backend, no uploads, no analytics — see the in-app **Privacy** page
- 🚀 One-click deploy to GitHub Pages

## Quick start

```bash
npm install        # also copies the ffmpeg cores into public/ffmpeg
npm run dev        # http://localhost:5173
```

Using [Nix](https://nixos.org/)? A flake provides the Node toolchain — drop into a dev
shell first, then run the npm commands inside it:

```bash
nix develop        # shell with Node 20 (pinned via flake.lock)
# or, one-off:  nix shell nixpkgs#nodejs_20
```

Then drop in a video, set the start/end, and export. No configuration is required for
local files.

To verify a production build locally:

```bash
npm run build
npm run preview
```

## How it works

| Concern | Approach |
| --- | --- |
| Video processing | `@ffmpeg/ffmpeg` (FFmpeg → WebAssembly) runs in the browser tab |
| GIF quality | Two-pass `palettegen` / `paletteuse` with lanczos scaling; `-loop 0` to loop forever |
| MP4 | `libx264 -crf` re-encode, `yuv420p`, `+faststart` for instant web playback |
| Drive (link) | Browser fetches `files.get?alt=media` directly from Google |
| Drive (Browse) | Google Identity Services token + Google Picker, read-only scope |

### Single-thread vs multi-thread encoder

The app ships **both** ffmpeg cores and picks at runtime:

- **Multi-thread** (faster) loads only when the page is *cross-origin isolated*
  (`crossOriginIsolated === true`), which requires `COOP`/`COEP` response headers.
  `npm run dev` and `npm run preview` set these automatically.
- **Single-thread** is used otherwise — including on **GitHub Pages**, which cannot send
  those headers. This is intentional: cross-origin isolation would block Google's Picker
  scripts, so single-thread keeps Drive Browse working. Short clips encode fine either way.

> If you self-host behind a server that sends `COOP: same-origin` + `COEP: require-corp`
> and you don't need the Picker, you'll automatically get the faster multi-thread core.
> A `public/coi-serviceworker.js`-style shim is intentionally **not** enabled by default
> because it breaks the Picker.

## Google Drive setup (optional)

Local files and drag/drop need no setup. To enable Drive, create credentials in the
[Google Cloud Console](https://console.cloud.google.com/):

1. **Create a project**, then enable the **Google Picker API** and **Google Drive API**
   (APIs & Services → Library).
2. **API key** (APIs & Services → Credentials → Create credentials → API key).
   Restrict it to the Picker + Drive APIs. → `VITE_GOOGLE_API_KEY`
3. **OAuth client id** (Credentials → Create credentials → OAuth client ID → *Web
   application*). Under **Authorized JavaScript origins** add every origin you'll serve
   from, e.g. `http://localhost:5173` and `https://<your-username>.github.io`.
   → `VITE_GOOGLE_CLIENT_ID`
4. Configure the **OAuth consent screen** (External is fine; add yourself as a test user).

Copy `.env.example` to `.env` and fill in what you have:

```bash
cp .env.example .env
```

```ini
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIza............
```

Behavior based on what you provide:

| Configured | Result |
| --- | --- |
| Neither | Local files only; paste box shown but public-link fetches usually blocked by CORS |
| API key only | Paste box can fetch **publicly shared** Drive files; no Browse button |
| Client id (+ key) | **Browse** button appears; OAuth Picker can open any file you can access |

The **Browse button only appears when a client id is set.** The paste-link box is always
present.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. (Optional) Add repo **Secrets** `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY`
   (Settings → Secrets and variables → Actions) to enable Drive in the deployed app.
4. Push to `main` — the included workflow (`.github/workflows/deploy.yml`) builds and
   deploys automatically. Your app will be at `https://<username>.github.io/<repo>/`.
5. If using Drive, add that exact origin to the OAuth client's **Authorized JavaScript
   origins** (step 3 above).

`base` is set to `./` so it works under a project path or a custom domain with no edits.
A `.nojekyll` file is included so the `ffmpeg/` assets are served intact.

## Notes & limits

- ffmpeg.wasm holds the source + output in memory (~2–4 GB ceiling). Very large/long or
  high-resolution sources may fail — use a lower FPS/width, a shorter range, or pre-trim a
  local copy. The UI warns when a GIF clip gets long.
- Pasted Drive links only work for files shared **“Anyone with the link”** and need an API
  key; private files require **Browse**. Drag/drop always works.

## Project layout

```
src/
  lib/ffmpeg.ts      # core loading (mt/st pick) + GIF/MP4 export commands
  lib/drive.ts       # Drive link parsing, API-key fetch, OAuth + Picker
  lib/time.ts        # timecode parsing/formatting
  hooks/useFfmpeg.ts # lazy load, progress, export wrapper
  components/        # SourceDialog, VideoEditor, Timeline, ExportPanel
  App.tsx, Privacy.tsx, main.tsx
scripts/copy-ffmpeg.mjs   # copies cores from node_modules to public/ffmpeg
```
