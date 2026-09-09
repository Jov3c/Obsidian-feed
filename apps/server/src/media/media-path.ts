import { join } from "node:path";

export function mediaPath(dataDir: string, sha256: string, extension: string): string {
  return join(dataDir, "media", sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.${extension}`);
}
