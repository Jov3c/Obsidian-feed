import { build } from "esbuild";

await build({
  entryPoints: {
    server: "src/main.ts",
    "cli/backup": "src/cli/backup.ts",
    "cli/status": "src/cli/status.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  outdir: "dist",
  sourcemap: true,
  logLevel: "info",
});
