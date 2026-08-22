import { defineConfig } from "vite";

// Can a VIRTUAL module id be a build input, per environment?
function probe() {
  return {
    name: "probe-virtual-entry",
    sharedDuringBuild: true,
    config() {
      return {
        builder: {},
        environments: {
          client: { consumer: "client", build: { rollupOptions: { input: { index: "virtual:entry-client" } }, outDir: "dist2/client" } },
          ssr: { consumer: "server", build: { ssr: true, rollupOptions: { input: { server: "virtual:entry-server" } }, outDir: "dist2/server", copyPublicDir: false } },
        },
      };
    },
    resolveId(id) {
      if (id === "virtual:entry-client" || id === "virtual:entry-server") return "\0" + id;
      return null;
    },
    load(id) {
      if (id === "\0virtual:entry-client") return `import "./src/client.js"; console.log("virtual client entry");`;
      if (id === "\0virtual:entry-server") return `export { default } from "./src/server.js";`;
      return null;
    },
    buildApp: async (builder) => {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.ssr);
    },
  };
}
export default defineConfig({ logLevel: "info", plugins: [probe()] });
