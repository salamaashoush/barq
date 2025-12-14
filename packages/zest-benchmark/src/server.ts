/**
 * Development server for browser benchmarks
 * Builds and serves the benchmark page
 */

import { watch } from "fs";
import { join, dirname } from "path";

const projectRoot = dirname(dirname(import.meta.path));
const distDir = join(projectRoot, "dist");

async function build() {
  console.log("Building browser bundle...");

  const result = await Bun.build({
    entrypoints: [join(projectRoot, "src/browser.ts")],
    outdir: distDir,
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "external",
    external: [],
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  console.log("Build complete!");
  return true;
}

async function main() {
  // Initial build
  const success = await build();
  if (!success) {
    process.exit(1);
  }

  // Start server
  const server = Bun.serve({
    port: 3456,
    async fetch(req) {
      const url = new URL(req.url);
      let path = url.pathname;

      if (path === "/") {
        path = "/index.html";
      }

      // Serve from project root
      const filePath = join(projectRoot, path);

      try {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          const ext = path.split(".").pop();
          const contentTypes: Record<string, string> = {
            html: "text/html",
            js: "application/javascript",
            css: "text/css",
            json: "application/json",
            map: "application/json",
          };

          return new Response(file, {
            headers: {
              "Content-Type": contentTypes[ext || ""] || "application/octet-stream",
              "Cache-Control": "no-cache",
            },
          });
        }
      } catch (e) {
        // File not found
      }

      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`\nBenchmark server running at http://localhost:${server.port}`);
  console.log("Press Ctrl+C to stop\n");

  // Watch for changes and rebuild
  const srcDir = join(projectRoot, "src");
  console.log(`Watching ${srcDir} for changes...`);

  watch(srcDir, { recursive: true }, async (event, filename) => {
    if (filename?.endsWith(".ts")) {
      console.log(`\nFile changed: ${filename}`);
      await build();
    }
  });
}

main();
