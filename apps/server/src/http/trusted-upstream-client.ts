import { AppError } from "./errors.js";
import {
  nodeRequestOnce,
  readLimitedBody,
  responseHeaders,
  type HttpLimits,
  type HttpTextResponse,
  type RequestOnce,
} from "./safe-http-client.js";

export class TrustedUpstreamClient {
  private readonly baseUrl: URL;
  private readonly requestOnce: RequestOnce;

  constructor(baseUrl: string, options: { requestOnce?: RequestOnce } = {}) {
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    if (!new Set(["http:", "https:"]).has(this.baseUrl.protocol)) {
      throw new TypeError("Trusted upstream must use HTTP or HTTPS");
    }
    this.requestOnce = options.requestOnce ?? nodeRequestOnce;
  }

  async getText(path: string, limits: HttpLimits): Promise<HttpTextResponse> {
    return this.requestText("GET", path, limits);
  }

  async postJson(path: string, value: unknown, limits: HttpLimits): Promise<HttpTextResponse> {
    return this.requestText("POST", path, limits, JSON.stringify(value));
  }

  private async requestText(
    method: "GET" | "POST",
    path: string,
    limits: HttpLimits,
    bodyText?: string,
  ): Promise<HttpTextResponse> {
    if (/^[a-z][a-z\d+.-]*:/iu.test(path) || path.startsWith("//")) {
      throw new TypeError("Trusted upstream request path must be relative");
    }

    const url = new URL(path.replace(/^\//u, ""), this.baseUrl);
    if (url.origin !== this.baseUrl.origin) {
      throw new TypeError("Trusted upstream request must remain on the configured origin");
    }

    const requestBody = bodyText === undefined ? undefined : Buffer.from(bodyText);
    const raw = await this.requestOnce({
      url,
      method,
      timeoutMs: limits.timeoutMs ?? 15_000,
      headers: {
        ...limits.headers,
        ...(requestBody
          ? {
              "content-type": "application/json",
              "content-length": String(requestBody.byteLength),
            }
          : {}),
      },
      ...(requestBody ? { body: requestBody } : {}),
    });
    const headers = responseHeaders(raw.headers);
    if (new Set([301, 302, 303, 307, 308]).has(raw.statusCode)) {
      raw.body.resume();
      throw new AppError("UPSTREAM_UNAVAILABLE", 502, true, "Trusted upstream redirect rejected");
    }
    const responseBody = await readLimitedBody(raw.body, limits.maxBytes);
    return {
      statusCode: raw.statusCode,
      headers,
      finalUrl: url.href,
      body: responseBody.toString("utf8"),
    };
  }
}
