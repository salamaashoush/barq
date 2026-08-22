/**
 * PROBE: what does `sharedDuringBuild: true` actually share, and which INSTANCE
 * of a plugin sees which hook, when a plugin factory is invoked once per
 * environment because the config file is re-evaluated?
 */
let FACTORY = 0;
const LOG = [];
function log(...a) { LOG.push(a.join(" ")); console.log("[probe]", ...a); }

function mk(shared) {
  const nth = `${(globalThis.__PROBE_SEQ__ = (globalThis.__PROBE_SEQ__ ?? 0) + 1)}`;
  let seenConfig = [];                   // closure state written in config()
  let seenConfigResolved = [];           // closure state written in configResolved()
  const found = new Map();               // "server fns discovered", like barqStart's `found`
  return {
    name: "probe-shared",
    ...(shared ? { sharedDuringBuild: true } : {}),
    config(_c, env) {
      seenConfig.push(env.command);
      log(`config()        on instance #${nth}`);
      return {
        builder: {},
        environments: {
          client: { consumer: "client", build: { rollupOptions: { input: { index: "./src/client.js" } }, outDir: "dist/client" } },
          ssr: { consumer: "server", build: { ssr: true, rollupOptions: { input: { server: "./src/server.js" } }, outDir: "dist/server", copyPublicDir: false } },
        },
      };
    },
    configResolved(c) {
      seenConfigResolved.push(c.build.outDir);
      log(`configResolved() on instance #${nth}  outDir=${c.build.outDir}  configSeen=[${seenConfig}] resolvedSeen=[${seenConfigResolved}]`);
    },
    resolveId(id) {
      if (id === "virtual:probe-manifest") return "\0virtual:probe-manifest";
      if (id === "virtual:probe-assets") return "\0virtual:probe-assets";
      return null;
    },
    load(id) {
      if (id === "\0virtual:probe-manifest") {
        log(`load(manifest)  on instance #${nth} env=${this.environment?.name} found.size=${found.size} keys=${[...found.keys()]}`);
        return `export const mounted = ${JSON.stringify([...found.keys()])};`;
      }
      if (id === "\0virtual:probe-assets") {
        log(`load(assets)    on instance #${nth} env=${this.environment?.name} assets=${JSON.stringify(this.__assets ?? null)}`);
        return `export default ${JSON.stringify(this.__assets ?? null)};`;
      }
      return null;
    },
    transform(code, id) {
      if (id.endsWith("fn.js")) {
        found.set(id, true);
        log(`transform(fn.js) on instance #${nth} env=${this.environment?.name} -> found.size=${found.size}`);
      }
      return null;
    },
    buildEnd() {
      log(`buildEnd()      on instance #${nth} env=${this.environment?.name} found.size=${found.size}`);
    },
    generateBundle() {
      log(`generateBundle() on instance #${nth} env=${this.environment?.name}`);
    },
    buildApp: async (builder) => {
      log(`buildApp()      on instance #${nth}`);
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.ssr);
    },
  };
}

const SHARED = process.env.SHARED === "1";
export default { logLevel: "warn", plugins: [mk(SHARED)] };
