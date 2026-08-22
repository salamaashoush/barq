import { defineConfig } from "vite";

const probe = () => ({
  name: "probe-runner",
  config() {
    return { builder: {} };
  },
  buildStart() {
    const env = this.environment;
    console.log("[buildStart] env.name=", env?.name,
      "ctor=", env?.constructor?.name,
      "has runner=", env ? ("runner" in env) : "no-env",
      "runner typeof=", typeof env?.runner);
  },
  async buildEnd() {
    const env = this.environment;
    console.log("[buildEnd] env.name=", env?.name,
      "ctor=", env?.constructor?.name,
      "has runner=", env ? ("runner" in env) : "no-env",
      "mode=", env?.mode,
      "runner typeof=", typeof env?.runner);
    try {
      const m = await env.runner.import("/src/probe-target.js");
      console.log("[buildEnd] runner.import OK", m);
    } catch (e) {
      console.log("[buildEnd] runner.import THREW:", e.constructor.name, e.message);
    }
  },
});

export default defineConfig({
  logLevel: "info",
  plugins: [probe()],
  environments: {
    client: { build: { outDir: "dist/client", rollupOptions: { input: { index: "src/main.js" } } } },
    ssr: { build: { ssr: true, outDir: "dist/server", rollupOptions: { input: { server: "src/server.js" } } } },
  },
});
