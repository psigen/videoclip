// Optional Google credentials, supplied at build time via Vite env vars.
// Empty string when unset (Vite inlines `undefined` for missing vars).
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
export const GOOGLE_API_KEY = (import.meta.env.VITE_GOOGLE_API_KEY ?? '').trim();

// Opening PRIVATE Drive links (via OAuth sign-in) is only possible when a client id is configured.
export const hasDriveOAuth = GOOGLE_CLIENT_ID.length > 0;

// OAuth scope: read-only access, just enough to download the chosen file.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
