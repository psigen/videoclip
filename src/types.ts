/** A video loaded into the browser, ready to preview and clip. */
export interface VideoSource {
  /** The raw bytes — a local File or a Blob downloaded from Drive. */
  file: File | Blob;
  /** Display / output base name, e.g. "vacation.mp4". */
  name: string;
  /** Object URL for the <video> element (created by the loader, revoked on replace). */
  url: string;
}
