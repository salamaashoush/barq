import { barqDiagnostics } from "@barqjs/diagnostics/vite";
import barq from "@barqjs/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    // `@barqjs/testing` unmounts after each test through the global `afterEach`.
    globals: true,
  },
  plugins: [
    // Serves `/__barq/diagnostics` from the dev server, which is how a coding
    // agent reads what the running page reported.
    barqDiagnostics(),
    barq({
      ssr: true,
      start: {
        // `/` is the seed. Everything else is found by crawling the links each
        // rendered page produced, and kept only where the route declares
        // `prerender`.
        prerender: { routes: ["/"] },
        // Fails the build when a route reaches a server function that does not
        // carry that route's declared middleware.
        verify: true,
      },
    }),
  ],
});
