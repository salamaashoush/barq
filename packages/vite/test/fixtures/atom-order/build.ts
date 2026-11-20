/**
 * One build of this fixture, in a process of its own, as a deploy runs it:
 * `bun build.ts <split|unsplit|lib|legacy> <outDir> [base]`. A stylesheet per
 * chunk is Vite's default; `unsplit` is `build.cssCodeSplit: false`; `lib` is a
 * library build, unsplit by Vite's own default, whose one stylesheet is named
 * after `cssFileName` rather than `style.css`; `legacy` is split, for browsers
 * older than logical properties.
 */

import { fileURLToPath } from "node:url";
import { build } from "vite";

import barq from "../../../src/index.ts";

const [shape, outDir, base = "/"] = process.argv.slice(2);
if (outDir === undefined)
  throw new Error("usage: bun build.ts <split|unsplit|lib|legacy> <outDir> [base]");

const root = fileURLToPath(new URL(".", import.meta.url));

await build({
  root,
  configFile: false,
  logLevel: "error",
  mode: "production",
  base,
  plugins: [await barq()],
  build:
    shape === "lib"
      ? {
          outDir,
          emptyOutDir: true,
          lib: {
            entry: "src/merge/main.ts",
            formats: ["es"],
            fileName: "mylib",
            cssFileName: "mylib",
          },
        }
      : {
          outDir,
          emptyOutDir: true,
          cssCodeSplit: shape !== "unsplit",
          ...(shape === "legacy" ? { cssTarget: ["chrome80", "safari13"] } : {}),
          rollupOptions: { input: { index: `${root}index.html`, merge: `${root}merge.html` } },
        },
});
