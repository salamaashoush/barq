import { barqStart } from "@barqjs/start/vite";
const raw = barqStart({ compiler: { hydratable: true } });
console.log("[probe] barqStart returned", raw.length, "plugins:", raw.map(p => p?.name ?? typeof p));
const plugins = raw.map((p) => Array.isArray(p) ? p : { ...p, sharedDuringBuild: true });
const spy = {
  name: "spy",

  transform: { order: "post", handler(code, id) {
      if (id.includes("data.ts")) console.log("[probe] transformed data.ts in env", this.environment?.name);
      if (id.includes("barq-server-fns")) console.log("[probe] MANIFEST CODE in", this.environment?.name, "=", JSON.stringify(code));
      return null;
  } },
  load: { order: "pre", handler(id) {
      if (id.includes("barq-server-fns")) console.log("[probe] load(barq-server-fns) in env", this.environment?.name);
      return null;
  } },
};
export default {
  appType: "custom", logLevel: "warn", builder: {},
  resolve: { conditions: ["import", "module", "browser", "default"] },
  environments: {
    client: { build: { rollupOptions: { input: { index: "./src/entry-client.tsx" } }, outDir: "dist-shared/client" } },
    ssr: { resolve: { noExternal: [/@barqjs\//], conditions: ["import","module","node","default"], externalConditions: ["import","module","node","default"] },
           build: { ssr: true, rollupOptions: { input: { server: "./src/entry-server.tsx" } }, outDir: "dist-shared/server", copyPublicDir: false } },
  },
  plugins: [spy, ...plugins],
};
