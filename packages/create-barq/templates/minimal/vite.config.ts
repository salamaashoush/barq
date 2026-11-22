/// <reference types="vitest/config" />
import { barqDiagnostics } from "@barqjs/diagnostics/vite";
import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // `barqDiagnostics()` serves `/__barq/diagnostics` from the dev server, which
  // is how a coding agent reads what the running page reported.
  plugins: [barq(), barqDiagnostics()],
  test: {
    environment: "happy-dom",
    // `@barqjs/testing` unmounts after each test through the global `afterEach`.
    globals: true,
  },
});
