export interface ImageMime {
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif";
  extension: "jpg" | "png" | "gif" | "webp" | "avif";
}

export function sniffImageMime(bytes: Buffer): ImageMime | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return { mimeType: "image/jpeg", extension: "jpg" };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mimeType: "image/png", extension: "png" };
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")))
    return { mimeType: "image/gif", extension: "gif" };
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return { mimeType: "image/webp", extension: "webp" };
  if (bytes.subarray(4, 12).toString("ascii").includes("ftypavif"))
    return { mimeType: "image/avif", extension: "avif" };
  return null;
}
