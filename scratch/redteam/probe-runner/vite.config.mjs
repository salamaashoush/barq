import { defineConfig } from "vite";

// Module scope of the CONFIG FILE. Is this one binding for the whole build, or
// one per environment? (`sharedConfigBuild` is false by default.)
globalThis.__CONFIG_EVALS__ = (globalThis.__CONFIG_EVALS__ ?? 0) + 1;
const evalId = globalThis.__CONFIG_EVALS__;
let reachability;

const routerLike = () => ({
  name: "router-like",
  sharedDuringBuild: true,
  buildEnd() {
    if (this.environment?.name !== "client") return;
    reachability = `set-by-client-buildEnd(config-eval#${evalId})`;
    console.log(`[router-like buildEnd] wrote reachability in config-eval#${evalId}`);
  },
});

const startLike = () => ({
  name: "start-like",
  sharedDuringBuild: true,
  config() { return { builder: {} }; },
  async buildApp(builder) {
    console.log(`[start-like buildApp] running in config-eval#${evalId}; reachability BEFORE builds = ${reachability}`);
    await builder.build(builder.environments.client);
    await builder.build(builder.environments.ssr);
    console.log(`[start-like buildApp] AFTER builds, reachability = ${reachability}`);
    console.log(`[start-like buildApp] total config evaluations so far = ${globalThis.__CONFIG_EVALS__}`);
  },
});

export default defineConfig({
  plugins: [routerLike(), startLike()],
  environments: {
    client: { build: { outDir: "dist/client", rollupOptions: { input: { index: "src/main.js" } } } },
    ssr: { build: { ssr: true, outDir: "dist/server", rollupOptions: { input: { server: "src/server.js" } } } },
  },
});
