/** A video loaded into the browser, ready to preview and clip. */
export interface VideoSource {
  /** The raw bytes — a local File or a Blob downloaded from Drive. */
  file: File | Blob;
  /** Display / output base name, e.g. "vacation.mp4". */
  name: string;
  /** Object URL for the <video> element (created by the loader, revoked on replace). */
  url: string;
}

/**
 * A rectangular crop region, expressed as fractions (0..1) of the source frame.
 * Stored fraction-based so ffmpeg can resolve it against the real pixels
 * (`crop=iw*width:ih*height:iw*x:ih*y`) without any JS pixel-mapping.
 */
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
