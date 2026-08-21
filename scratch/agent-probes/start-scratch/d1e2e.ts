import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { barqStart } from "../src/vite.ts";
const ROOT = fileURLToPath(new URL("./fx", import.meta.url));
const server = await createServer({
  root: ROOT, configFile: false, logLevel: "silent", server: { middlewareMode: true },
  resolve: { alias: {
    "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
    "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
  }},
  plugins: barqStart(),
});
const c = server.environments.client;
for (const f of ["/default.data.ts", "/indirect.data.ts"]) {
  const r = await c.transformRequest(f);
  const code = r?.code ?? "";
  console.log(`\n=== CLIENT transform of ${f} ===`);
  console.log(code);
  console.log(`  >>> leaks './db' into client graph: ${code.includes("db.ts") || code.includes("/db")}`);
  console.log(`  >>> synthesized a stub:            ${code.includes("clientRpc")}`);
}
await c.transformRequest("/default.data.ts");
await c.transformRequest("/indirect.data.ts");
const man = await server.environments.ssr.transformRequest("virtual:barq-server-fns");
console.log("\n=== MANIFEST ===");
console.log(man?.code);
await server.close(); process.exit(0);
