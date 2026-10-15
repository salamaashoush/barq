/**
 * One build of this fixture, in a process of its own: Vite caches how a package
 * resolved for the life of a process, so a development build and a production
 * build in one process can share the development entry. Prints the chunks.
 */

import { fileURLToPath } from "node:url";
import { build } from "vite";

import { barqVitePlugin } from "@barqjs/compiler/vite";

const mode = process.argv[2] === "development" ? "development" : "production";
const ssr = process.argv[3];

const out = (await build({
  root: fileURLToPath(new URL(".", import.meta.url)),
  configFile: false,
  logLevel: "error",
  mode,
  resolve: {
    alias: {
      "@barqjs/start/server": fileURLToPath(new URL("../../src/server.ts", import.meta.url)),
    },
  },
  plugins: [barqVitePlugin({ hydratable: true })],
  // The development build unminified, so its markers read as written.
  build: { write: false, minify: mode === "production", ssr },
})) as { output: { type: string; code?: string }[] };

process.stdout.write(
  out.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code ?? "")
    .join("\n"),
);
