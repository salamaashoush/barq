import { barqDiagnostics } from "@barqjs/diagnostics/vite";
import barq from "@barqjs/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // No `ssr`: `index.html` is the document and the router renders into it in
  // the browser. `start` keeps the server functions and the API routes.
  // `barqDiagnostics()` serves `/__barq/diagnostics` from the dev server, which
  // is how a coding agent reads what the running page reported.
  plugins: [barq({ start: true }), barqDiagnostics()],
  test: {
    environment: "happy-dom",
    // `@barqjs/testing` unmounts after each test through the global `afterEach`.
    globals: true,
  },
});
