import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const cursorSchema = z
  .object({
    publishedAtFallback: z.iso.datetime({ offset: true }),
    id: z.string().min(1),
    sourceId: z.string().optional(),
  })
  .strict();
export type CursorPayload = z.infer<typeof cursorSchema>;

export class CursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "CursorError";
  }
}

export class CursorService {
  private readonly key: Buffer;
  constructor(secret: string) {
    this.key = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(secret),
        Buffer.from("obsidian-feed-v1"),
        Buffer.from("article-cursor"),
        32,
      ),
    );
  }
  issue(payload: CursorPayload): string {
    const encoded = Buffer.from(JSON.stringify(cursorSchema.parse(payload))).toString("base64url");
    return `${encoded}.${this.sign(encoded).toString("base64url")}`;
  }
  verify(cursor: string, sourceId?: string): CursorPayload {
    try {
      const [encoded, supplied, extra] = cursor.split(".");
      if (!encoded || !supplied || extra) throw new CursorError();
      const expected = this.sign(encoded);
      const signature = Buffer.from(supplied, "base64url");
      if (signature.length !== expected.length || !timingSafeEqual(signature, expected))
        throw new CursorError();
      const payload = cursorSchema.parse(
        JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
      );
      if (payload.sourceId !== sourceId) throw new CursorError();
      return payload;
    } catch (error) {
      if (error instanceof CursorError) throw error;
      throw new CursorError();
    }
  }
  private sign(value: string): Buffer {
    return createHmac("sha256", this.key).update(value).digest();
  }
}
