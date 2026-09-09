import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { ResolvedSource } from "../providers/types.js";

const candidateSchema = z
  .object({
    type: z.enum(["rss", "wechat"]),
    providerKey: z.string().min(1),
    externalId: z.string().nullable(),
    name: z.string().min(1),
    canonicalUrl: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    providerMeta: z.record(z.string(), z.unknown()),
  })
  .strict();

const payloadSchema = z
  .object({
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    provider: z.string().min(1),
    candidate: candidateSchema,
  })
  .strict()
  .refine((payload) => payload.provider === payload.candidate.providerKey)
  .refine((payload) => payload.expiresAt > payload.issuedAt);

export type ResolutionTokenPayload = z.infer<typeof payloadSchema>;

export class ResolutionTokenError extends Error {
  constructor(readonly code: "INVALID_RESOLUTION_TOKEN" | "RESOLUTION_TOKEN_EXPIRED") {
    super(
      code === "RESOLUTION_TOKEN_EXPIRED" ? "Resolution token expired" : "Invalid resolution token",
    );
    this.name = "ResolutionTokenError";
  }
}

export class ResolutionTokenService {
  private readonly key: Buffer;
  private readonly now: () => Date;
  private readonly ttlMs: number;

  constructor(options: { secret: string; now?: () => Date; ttlMs?: number }) {
    this.key = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(options.secret),
        Buffer.from("obsidian-feed-v1"),
        Buffer.from("resolution-token"),
        32,
      ),
    );
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  }

  issue(candidate: ResolvedSource): string {
    const issuedAt = this.now().getTime();
    const encoded = Buffer.from(
      JSON.stringify({
        issuedAt,
        expiresAt: issuedAt + this.ttlMs,
        provider: candidate.providerKey,
        candidate,
      }),
    ).toString("base64url");
    return `${encoded}.${this.sign(encoded).toString("base64url")}`;
  }

  verify(token: string): ResolutionTokenPayload {
    try {
      const parts = token.split(".");
      if (parts.length !== 2) throw new ResolutionTokenError("INVALID_RESOLUTION_TOKEN");
      const [encoded, signatureText] = parts;
      if (!encoded || !signatureText) throw new ResolutionTokenError("INVALID_RESOLUTION_TOKEN");
      const signature = Buffer.from(signatureText);
      const expected = Buffer.from(this.sign(encoded).toString("base64url"));
      if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
        throw new ResolutionTokenError("INVALID_RESOLUTION_TOKEN");
      }
      const payload = payloadSchema.parse(
        JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
      );
      if (this.now().getTime() > payload.expiresAt) {
        throw new ResolutionTokenError("RESOLUTION_TOKEN_EXPIRED");
      }
      return payload;
    } catch (error) {
      if (error instanceof ResolutionTokenError) throw error;
      throw new ResolutionTokenError("INVALID_RESOLUTION_TOKEN");
    }
  }

  private sign(encodedPayload: string): Buffer {
    return createHmac("sha256", this.key).update(encodedPayload).digest();
  }
}
