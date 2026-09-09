import { describe, expect, it, vi } from "vitest";

import { AuthenticatedMediaLoader } from "../../src/reader/media-loader.js";

describe("AuthenticatedMediaLoader", () => {
  it("loads bytes with bearer auth and revokes every object URL", async () => {
    const request = vi.fn(async () => ({
      status: 200,
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
      headers: { "content-type": "image/png" },
    }));
    const createObjectURL = vi.fn(() => "blob:media-1");
    const revokeObjectURL = vi.fn();
    const loader = new AuthenticatedMediaLoader({
      baseUrl: "https://feed.example/",
      token: "secret",
      request,
      createObjectURL,
      revokeObjectURL,
    });
    await expect(loader.load("/v1/media/med_1")).resolves.toBe("blob:media-1");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://feed.example/v1/media/med_1",
        headers: { Authorization: "Bearer secret" },
      }),
    );
    loader.dispose();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:media-1");
  });

  it("rejects paths outside the authenticated media endpoint", async () => {
    const loader = new AuthenticatedMediaLoader({
      baseUrl: "https://feed.example",
      token: "secret",
      request: vi.fn(),
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
    });
    await expect(loader.load("https://evil.example/image")).rejects.toThrow("media path");
  });
});
