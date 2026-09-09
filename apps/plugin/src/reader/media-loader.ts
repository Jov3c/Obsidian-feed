export interface MediaRequestResponse {
  status: number;
  arrayBuffer: ArrayBuffer;
  headers: Record<string, string>;
}

export class AuthenticatedMediaLoader {
  private readonly urls = new Set<string>();
  private readonly baseUrl: string;

  constructor(
    private readonly dependencies: {
      baseUrl: string;
      token: string;
      request(options: {
        url: string;
        method: string;
        headers: Record<string, string>;
      }): Promise<MediaRequestResponse>;
      createObjectURL?: (blob: Blob) => string;
      revokeObjectURL?: (url: string) => void;
    },
  ) {
    this.baseUrl = dependencies.baseUrl.replace(/\/+$/u, "");
  }

  async load(mediaPath: string): Promise<string> {
    if (!/^\/v1\/media\/[A-Za-z0-9_-]{1,128}$/u.test(mediaPath)) {
      throw new Error("Invalid authenticated media path");
    }
    const response = await this.dependencies.request({
      url: `${this.baseUrl}${mediaPath}`,
      method: "GET",
      headers: { Authorization: `Bearer ${this.dependencies.token}` },
    });
    const mimeType = response.headers["content-type"] ?? "application/octet-stream";
    if (response.status !== 200 || !/^image\/(?:jpeg|png|gif|webp|avif)$/u.test(mimeType)) {
      throw new Error("Media request failed");
    }
    const create = this.dependencies.createObjectURL ?? URL.createObjectURL.bind(URL);
    const url = create(new Blob([response.arrayBuffer], { type: mimeType }));
    this.urls.add(url);
    return url;
  }

  dispose(): void {
    const revoke = this.dependencies.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
    for (const url of this.urls) revoke(url);
    this.urls.clear();
  }
}
