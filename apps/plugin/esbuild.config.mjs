import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  platform: "browser",
  target: "es2022",
  outfile: "dist/main.js",
  sourcemap: true,
  logLevel: "info",
});
