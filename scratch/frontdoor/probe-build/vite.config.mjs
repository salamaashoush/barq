import { barqStart } from "@barqjs/start/vite";

export default {
  appType: "custom",
  logLevel: "warn",
  builder: {},
  resolve: { conditions: ["import", "module", "browser", "default"] },
  environments: {
    client: { build: { rollupOptions: { input: { index: "./src/entry-client.tsx" } }, outDir: "dist/client" } },
    ssr: {
      resolve: { noExternal: [/@barqjs\//], conditions: ["import", "module", "node", "default"], externalConditions: ["import", "module", "node", "default"] },
      build: { ssr: true, rollupOptions: { input: { server: "./src/entry-server.tsx" } }, outDir: "dist/server", copyPublicDir: false },
    },
  },
  plugins: [barqStart({ compiler: { hydratable: true } })],
};
