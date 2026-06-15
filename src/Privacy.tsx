import { hasPicker } from './config';

export function Privacy() {
  return (
    <div className="app privacy">
      <header>
        <h1>Privacy</h1>
        <p className="tagline">Short version: your video never leaves your device.</p>
      </header>

      <section className="card prose">
        <h2>No uploads, ever</h2>
        <p>
          VideoClip is a <strong>static web app with no backend of its own</strong>. When you open a
          video — whether by dragging in a local file, pasting a Google Drive link, or using the
          Browse button — the file is loaded directly into your browser's memory. All trimming and
          encoding to GIF or MP4 happens locally using <em>ffmpeg.wasm</em> (FFmpeg compiled to
          WebAssembly) running inside this browser tab. The resulting file is created on your device
          and offered to you as a download. At no point is your video, or the clip you create, sent
          to any server operated by this app.
        </p>

        <h2>The only network requests</h2>
        <ul>
          <li>
            <strong>Loading the app itself</strong> — its HTML, JavaScript, and the FFmpeg engine
            files are served from wherever the app is hosted (e.g. GitHub Pages).
          </li>
          <li>
            <strong>Google Drive (only if you use it)</strong> — if you paste a Drive link or use
            Browse, your browser talks <em>directly to Google's APIs</em> to download the file you
            chose. This traffic goes between you and Google; it does not pass through any server
            belonging to this app. {hasPicker
              ? 'Authorization uses Google Identity Services; the access token is held only in memory for the current session and is requested with read-only Drive scope.'
              : 'Drive Browse is currently disabled because no Google client id is configured.'}
          </li>
        </ul>

        <h2>What we don't do</h2>
        <ul>
          <li>No analytics, tracking pixels, or third-party telemetry.</li>
          <li>No cookies set by the app.</li>
          <li>No storage of your video or clips anywhere off your device.</li>
        </ul>

        <h2>Verify it yourself</h2>
        <p>
          Open your browser's developer tools, go to the Network tab, and watch while you load a
          local file and export a clip: you will see no upload of your media. The source code is
          available for inspection in the project repository.
        </p>
      </section>

      <footer>
        <a href="#/">← Back to the app</a>
      </footer>
    </div>
  );
}
