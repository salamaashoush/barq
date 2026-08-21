import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { barqStart } from "../src/vite.ts";

const ROOT = fileURLToPath(new URL("./fx", import.meta.url));
const server = await createServer({
  root: ROOT, configFile: false, logLevel: "error", server: { middlewareMode: true },
  resolve: { alias: {
    "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
    "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
  }},
  plugins: barqStart(),
});

const client = server.environments.client;

console.log("=== BEFORE any transform: is route-users.ts in the client graph? ===");
console.log("  getModuleById:", client.moduleGraph.getModuleById(ROOT + "/route-users.ts") ? "PRESENT" : "ABSENT");
console.log("  urlToModule:", await client.moduleGraph.getModuleByUrl("/route-users.ts") ? "PRESENT" : "ABSENT");
console.log("  idToModuleMap size:", (client.moduleGraph as any).idToModuleMap?.size ?? "n/a");

await client.transformRequest("/route-users.ts");
console.log("\n=== AFTER transformRequest('/route-users.ts') ===");
const m = client.moduleGraph.getModuleById(ROOT + "/route-users.ts");
console.log("  module:", m ? "PRESENT" : "ABSENT");
console.log("  importedModules:", m ? [...m.importedModules].map((x: any) => x.id) : []);
for (const im of m?.importedModules ?? []) {
  console.log("    -> ", (im as any).id, " transformResult?", (im as any).transformResult ? "yes" : "NO (not transformed => its own imports unknown)");
  console.log("       its importedModules:", [...(im as any).importedModules].map((x: any) => x.id));
}

console.log("\n=== client transform of users.data.ts (the stub) ===");
const stub = await client.transformRequest("/users.data.ts");
console.log(stub?.code);

console.log("\n=== now re-walk route-users graph after data module transformed ===");
const m2 = client.moduleGraph.getModuleById(ROOT + "/route-users.ts");
for (const im of m2?.importedModules ?? []) {
  console.log("  ->", (im as any).id, "imports:", [...(im as any).importedModules].map((x:any)=>x.id));
}

console.log("\n=== dynamic import route ===");
await client.transformRequest("/route-dyn.ts");
const md = client.moduleGraph.getModuleById(ROOT + "/route-dyn.ts");
console.log("  importedModules:", [...(md?.importedModules ?? [])].map((x:any)=>x.id));
console.log("  clientImportedModules/dynamic?", (md as any)?.clientImportedModules ? "n/a" : "n/a");
console.log("  ssrTransformResult deps:", (md as any)?.ssrTransformResult?.deps, "dynamicDeps:", (md as any)?.ssrTransformResult?.dynamicDeps);

console.log("\n=== barrel route ===");
await client.transformRequest("/route-barrel.ts");
const mb = client.moduleGraph.getModuleById(ROOT + "/route-barrel.ts");
console.log("  importedModules:", [...(mb?.importedModules ?? [])].map((x:any)=>x.id));
const barrel = client.moduleGraph.getModuleById(ROOT + "/barrel.ts");
console.log("  barrel transformed?", barrel?.transformResult ? "yes":"no", " imports:", [...(barrel?.importedModules ?? [])].map((x:any)=>x.id));
console.log("  barrel client code:", (await client.transformRequest("/barrel.ts"))?.code);

console.log("\n=== SSR transform of users.data.ts: can BUILD see middleware? ===");
const ssr = await server.environments.ssr.transformRequest("/users.data.ts");
console.log(ssr?.code);

await server.close();
process.exit(0);
