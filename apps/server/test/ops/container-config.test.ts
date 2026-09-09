import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const root = new URL("../../../../", import.meta.url);
const dockerfile = readFileSync(new URL("apps/server/Dockerfile", root), "utf8");
const compose = readFileSync(new URL("docker-compose.yml", root), "utf8");
const environment = readFileSync(new URL(".env.example", root), "utf8");

describe("container configuration", () => {
  it("uses Node 22, a non-root runtime, writable data and health checks", () => {
    expect(dockerfile).toContain("FROM node:22-slim");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain('VOLUME ["/data"]');
    expect(dockerfile).toContain("HEALTHCHECK");
  });

  it("keeps secrets external and documents optional WeRSS networking", () => {
    expect(compose).toContain("env_file:");
    expect(compose).toContain("feed-data:/data");
    expect(compose).not.toMatch(/WERSS_API_KEY:\s*\S+/u);
    expect(environment).toContain("# WERSS_BASE_URL=http://werss:8001");
    expect(environment).not.toMatch(/WERSS_API_KEY=(?!replace)/u);
  });
});
