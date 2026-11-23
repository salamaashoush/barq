import { join } from "node:path";

import barq from "@barqjs/vite";
import { type ViteUserConfig, defineConfig } from "vitest/config";

// `bun conformance/upstream.ts` checks the suite out here before vitest starts.
const UPSTREAM = join(
  import.meta.dirname,
  "..",
  "node_modules",
  ".cache",
  "tanstack-db-tests",
  "packages",
  "db",
  "tests",
);

// `BARQ_ENGINE=production` runs the suite against the engine's production
// build; by default vitest serves the strict development build, as `vite dev`
// does. `bun` resolves the workspace packages to their source, as `bun test`
// does. `browser` is the environment happy-dom stands in for: without it
// `@barqjs/web` resolves `#env` under `node` and reports a server.
const production = process.env.BARQ_ENGINE === "production";

const config: ViteUserConfig = defineConfig({
  plugins: [barq({ dev: !production, conditions: ["browser", "bun"] })],
  resolve: {
    alias: { "@tanstack-db-tests": UPSTREAM },
  },
  test: {
    root: import.meta.dirname,
    include: ["**/*.vitest.ts"],
    environment: "happy-dom",
    // Upstream's suite is TypeScript under `node_modules`, which vitest would
    // otherwise hand to Node untransformed.
    server: { deps: { inline: [/tanstack-db-tests/] } },
    testTimeout: 120_000,
  },
});

export default config;
