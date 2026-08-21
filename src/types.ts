/**
 * Shared app-level types.
 */

import type { GpxFile } from "./gpx";

export interface LoadedFile {
  id: string;
  gpx: GpxFile;
}

export interface LoadError {
  fileName: string;
  message: string;
}
