# VideoClip

A **100% client-side** web app to trim videos into a **high-quality looping GIF or MP4**.
Load a video from a local file or Google Drive, scrub to pick start/end times, and export —
all processing happens in your browser via [ffmpeg.wasm](https://ffmpegwasm.netlify.app/).
**Your video is never uploaded to any server run by this app.**

- 🎞️ Preview + dual-handle in/out selection with loop preview
- 🪄 High-quality GIF (two-pass palette, looping) or H.264 MP4 export
- 📁 Sources: drag/drop local file, or paste a Google Drive link (public or private) or direct video URL
- 🔒 No backend, no uploads, no analytics — see the in-app **Privacy** page
- 🚀 One-click deploy to GitHub Pages

<p align="center">
   <img width="600" alt="image" src="https://github.com/user-attachments/assets/ed56d00d-17e0-49c5-a619-03befd5ee042" />
</p>

## Quick start

```bash
npm install        # also copies the ffmpeg cores into public/ffmpeg
npm run dev        # http://localhost:5173
```

Using [Nix](https://nixos.org/)? A flake provides the Node toolchain — drop into a dev
shell first, then run the npm commands inside it:

```bash
nix develop        # shell with Node 22 (pinned via flake.lock)
# or, one-off:  nix shell nixpkgs#nodejs_22
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
| Public link | Browser fetches `files.get?alt=media&key=` (Drive) or the URL directly |
| Private Drive link | Google Identity Services token + `files.get?alt=media` with `Bearer`, read-only scope |

### Encoder core

The app uses the **single-thread** ffmpeg core. It needs no `SharedArrayBuffer` /
cross-origin isolation, so it runs anywhere — including **GitHub Pages**, which can't
send `COOP`/`COEP` headers. Short clips encode in a few seconds.

> The multi-thread core was intentionally dropped: it requires cross-origin isolation
> (which GitHub Pages can't provide) and loaded unreliably across browser/worker environments.

## Google Drive setup (optional)

Local files and drag/drop need no setup. To enable Drive, create credentials in the
[Google Cloud Console](https://console.cloud.google.com/):

1. **Create a project**, then enable the **Google Drive API** (APIs & Services → Library).
2. **API key** (APIs & Services → Credentials → Create credentials → API key).
   Restrict it to the Drive API. → `VITE_GOOGLE_API_KEY` (lets pasted links fetch public files).
3. **OAuth client id** (Credentials → Create credentials → OAuth client ID → *Web
   application*) — only needed to open **private** Drive files. Under **Authorized JavaScript
   origins** add every origin you'll serve from, e.g. `http://localhost:5173` and
   `https://<your-username>.github.io`. → `VITE_GOOGLE_CLIENT_ID`
4. If you added a client id, configure the **OAuth consent screen** (External is fine; add
   yourself as a test user).

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
| Neither | Local files + direct video URLs; **publicly shared** Drive links usually blocked by CORS |
| API key only | Paste box also fetches **publicly shared** Drive files |
| Client id (+ key) | Paste box also opens **private** Drive files you can access (sign in once) |

The paste-link box is always present and accepts a **direct video URL** (any `http(s)` link the
host serves with CORS enabled) as well as Google Drive links — no Google credentials needed for
direct URLs. When a client id is configured, a pasted Drive link is checked the moment you paste
it: public files load straight away, while a **private** file flips the button to “🔒 Sign in &
load,” so one click signs you in (once per session) and downloads it.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. (Optional) Add repo **Secrets** `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY`
   (Settings → Secrets and variables → Actions) to enable Drive in the deployed app.
4. Push to `main` — the included workflow (`.github/workflows/deploy.yml`) builds and
   deploys automatically. Your app will be at `https://<username>.github.io/<repo>/`.
5. If using Drive, add that exact origin to the OAuth client's **Authorized JavaScript
   origins** (step 3 above).

### Setting the `VITE_*` env vars on Pages

1. Go to **Settings → Secrets and variables → Actions → New repository secret**.
2. Add each value as a secret using the **exact** name: `VITE_GOOGLE_CLIENT_ID` and/or
   `VITE_GOOGLE_API_KEY`. (Only `VITE_`-prefixed names reach the app.)
3. Trigger a build — push to `main`, or run the workflow manually (Actions → Deploy to
   GitHub Pages → Run workflow). The workflow passes the secrets to `npm run build`.
4. To change a value later, edit the secret and **re-run the workflow** — values are
   baked in at build time, so they don't update without a rebuild.

> ⚠️ These values are **inlined into the public JS bundle**. That's fine for a Google API
> key / OAuth client id (domain-restricted, not secret) — never put a real secret here.

`base` is set to `./` so it works under a project path or a custom domain with no edits.
A `.nojekyll` file is included so the `ffmpeg/` assets are served intact.

## Notes & limits

- ffmpeg.wasm holds the source + output in memory (~2–4 GB ceiling). Very large/long or
  high-resolution sources may fail — use a lower FPS/width, a shorter range, or pre-trim a
  local copy. The UI warns when a GIF clip gets long.
- Pasted **public** Drive links need an API key; **private** Drive links need an OAuth client id
  (you sign in once). Direct video URLs need the host to allow CORS. Drag/drop always works.

## Project layout

```
src/
  lib/ffmpeg.ts      # single-thread core loading + GIF/MP4 export commands
  lib/drive.ts       # Drive/URL link parsing, public (API-key) + private (OAuth) downloads
  lib/time.ts        # timecode parsing/formatting
  hooks/useFfmpeg.ts # lazy load, progress, export wrapper
  components/        # SourceDialog, VideoEditor, Timeline, ExportPanel
  App.tsx, Privacy.tsx, main.tsx
scripts/copy-ffmpeg.mjs   # copies cores from node_modules to public/ffmpeg
```
