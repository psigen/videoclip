// Copies the ffmpeg.wasm core assets out of node_modules into public/ffmpeg/{st,mt}
// so they are served same-origin (required for toBlobURL + cross-origin isolation),
// rather than pulled from a CDN. Runs on postinstall and prebuild.
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const nm = join(root, 'node_modules');

// Single-thread core -> public/ffmpeg/. (We don't ship the multi-thread core: it
// needs cross-origin isolation, which breaks the Google Picker, and loaded
// unreliably — see src/lib/ffmpeg.ts.)
const cores = [
  { pkg: '@ffmpeg/core', dest: '.', files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'] },
];

// Serve the ESM build: @ffmpeg/ffmpeg runs its worker as a module worker, where
// importScripts() is unavailable, so it loads the core via `await import(coreURL)`
// and reads the `default` export — which only the ESM build provides (the UMD build
// has no default export, causing "failed to import ffmpeg-core.js").
function findDistDir(pkgDir) {
  for (const candidate of ['dist/esm', 'dist/umd', 'dist']) {
    const p = join(pkgDir, candidate);
    if (existsSync(p)) return p;
  }
  return null;
}

let copied = 0;
let missing = [];
for (const { pkg, dest, files } of cores) {
  const pkgDir = join(nm, pkg);
  if (!existsSync(pkgDir)) {
    missing.push(pkg);
    continue;
  }
  const dist = findDistDir(pkgDir);
  if (!dist) {
    missing.push(`${pkg} (no dist dir; saw: ${readdirSync(pkgDir).join(', ')})`);
    continue;
  }
  const outDir = join(root, 'public', 'ffmpeg', dest);
  mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    const src = join(dist, f);
    if (!existsSync(src)) {
      missing.push(`${pkg}/${f}`);
      continue;
    }
    copyFileSync(src, join(outDir, f));
    copied++;
  }
}

console.log(`[copy-ffmpeg] copied ${copied} core file(s) into public/ffmpeg`);
if (missing.length) {
  console.warn('[copy-ffmpeg] WARNING: missing files (run `npm install` first):\n  - ' + missing.join('\n  - '));
}
