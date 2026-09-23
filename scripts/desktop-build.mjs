import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { mkdir } from "node:fs/promises";

await mkdir("dist-desktop/main", { recursive: true });
await build({
  entryPoints: ["src/desktop/main.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist-desktop/main/main.js",
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: ["src/desktop/preload.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist-desktop/main/preload.cjs",
  external: ["electron"],
});
if (!process.argv.includes("--main-only")) await viteBuild();
