import { describe, expect, it, vi } from "vitest";

import { fetchSystemStatus } from "../../src/cli/status.js";

describe("status CLI", () => {
  it("requests the authenticated operational status endpoint", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: 1, database: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchSystemStatus("https://feed.test/", "secret", request)).resolves.toEqual({
      version: 1,
      database: "ok",
    });
    expect(request).toHaveBeenCalledWith("https://feed.test/v1/system/status", {
      headers: { Authorization: "Bearer secret" },
    });
  });
});
