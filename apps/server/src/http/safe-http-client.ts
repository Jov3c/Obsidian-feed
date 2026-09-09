import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { AppError } from "./errors.js";
import { assertSafeExternalUrl, type HostLookup, type SafeExternalTarget } from "./safe-url.js";

export interface RawHttpResponse {
  statusCode: number;
  headers: IncomingHttpHeaders | Record<string, string>;
  body: Readable;
}

export interface RequestTarget {
  url: URL;
  pinned?: Pick<SafeExternalTarget, "address" | "family">;
  timeoutMs: number;
  headers?: Record<string, string>;
}

export type RequestOnce = (target: RequestTarget) => Promise<RawHttpResponse>;

export interface HttpLimits {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface HttpTextResponse {
  statusCode: number;
  headers: Record<string, string>;
  finalUrl: string;
  body: string;
}

export interface HttpStreamResponse extends Omit<HttpTextResponse, "body"> {
  body: Readable;
}

function normalizedHeaders(headers: RawHttpResponse["headers"]): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined)
      normalized[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return normalized;
}

async function collectBody(body: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.byteLength;
    if (size > maxBytes) {
      body.destroy();
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        502,
        false,
        "Upstream response exceeded size limit",
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export const nodeRequestOnce: RequestOnce = async ({ url, pinned, timeoutMs, headers }) =>
  new Promise((resolve, reject) => {
    const requester = url.protocol === "https:" ? requestHttps : requestHttp;
    const request = requester(
      url,
      {
        method: "GET",
        headers,
        ...(pinned
          ? {
              lookup: (_hostname, _options, callback) =>
                callback(null, pinned.address, pinned.family),
            }
          : {}),
      },
      (response: IncomingMessage) => {
        resolve({
          statusCode: response.statusCode ?? 502,
          headers: response.headers,
          body: response,
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Upstream request timed out"));
    });
    request.once("error", reject);
    request.end();
  });

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export class SafeExternalHttpClient {
  private readonly lookup: HostLookup | undefined;
  private readonly requestOnce: RequestOnce;

  constructor(options: { lookup?: HostLookup; requestOnce?: RequestOnce } = {}) {
    this.lookup = options.lookup;
    this.requestOnce = options.requestOnce ?? nodeRequestOnce;
  }

  async getText(input: string, limits: HttpLimits): Promise<HttpTextResponse> {
    const response = await this.fetchBuffer(input, limits);
    return { ...response, body: response.body.toString("utf8") };
  }

  async getStream(input: string, limits: HttpLimits): Promise<HttpStreamResponse> {
    const response = await this.fetchBuffer(input, limits);
    return { ...response, body: Readable.from(response.body) };
  }

  private async fetchBuffer(
    input: string,
    limits: HttpLimits,
  ): Promise<Omit<HttpTextResponse, "body"> & { body: Buffer }> {
    let currentUrl = input;
    const maxRedirects = limits.maxRedirects ?? 5;

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const target = await assertSafeExternalUrl(currentUrl, this.lookup);
      const raw = await this.requestOnce({
        url: target.url,
        pinned: target,
        timeoutMs: limits.timeoutMs ?? 10_000,
        ...(limits.headers ? { headers: limits.headers } : {}),
      });
      const headers = normalizedHeaders(raw.headers);

      if (redirectStatuses.has(raw.statusCode) && headers.location !== undefined) {
        raw.body.resume();
        if (redirectCount === maxRedirects) {
          throw new AppError("UPSTREAM_UNAVAILABLE", 502, true, "Too many upstream redirects");
        }
        currentUrl = new URL(headers.location, target.url).href;
        continue;
      }

      return {
        statusCode: raw.statusCode,
        headers,
        finalUrl: target.url.href,
        body: await collectBody(raw.body, limits.maxBytes),
      };
    }

    throw new AppError("UPSTREAM_UNAVAILABLE", 502, true, "Too many upstream redirects");
  }
}

export async function readLimitedBody(body: Readable, maxBytes: number): Promise<Buffer> {
  return collectBody(body, maxBytes);
}

export function responseHeaders(headers: RawHttpResponse["headers"]): Record<string, string> {
  return normalizedHeaders(headers);
}
