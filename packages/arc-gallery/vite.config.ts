import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    barq({
      ssr: true,
      // The `bun` condition takes every `@barqjs/*` package to its `src`, on
      // both environments, so the gallery shows the code as it is now rather
      // than the last root build.
      conditions: ["bun"],
      start: { verify: true },
      compiler: { strictCss: true },
    }),
  ],
  server: { port: 4700 },
  preview: { port: 4700 },
});
