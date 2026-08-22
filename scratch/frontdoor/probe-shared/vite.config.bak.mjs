import { defineConfig } from "vite";

// Does a plugin closure survive across environments during `vite build`?
function probe(shared) {
  let seen = [];
  const state = { assets: null };
  return {
    name: "probe",
    ...(shared ? { sharedDuringBuild: true } : {}),
    config() {
      return {
        environments: {
          client: { consumer: "client", build: { rollupOptions: { input: "src/client.js" }, outDir: "dist/client" } },
          ssr: { consumer: "server", build: { ssr: true, rollupOptions: { input: "src/server.js" }, outDir: "dist/server", copyPublicDir: false } },
        },
      };
    },
    resolveId(id) { return id === "virtual:probe" ? "\0virtual:probe" : null },
    load(id) {
      if (id !== "\0virtual:probe") return null;
      const env = this.environment?.name;
      seen.push(`load in ${env}: assets=${JSON.stringify(state.assets)}`);
      console.log(`[probe] load in ${env}: assets=${JSON.stringify(state.assets)}`);
      return `export default ${JSON.stringify(state.assets)};`;
    },
    generateBundle() {
      const env = this.environment?.name;
      if (env === "client") { state.assets = { "/a": ["index.js"] }; console.log("[probe] client generateBundle set assets"); }
      else console.log(`[probe] generateBundle in ${env}, assets=${JSON.stringify(state.assets)}`);
    },
    buildApp: async (builder) => {
      console.log("[probe] buildApp order: client then ssr");
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.ssr);
    },
  };
}

export default defineConfig({
  logLevel: "warn",
  plugins: [probe(process.env.SHARED === "1")],
  builder: {},
});
