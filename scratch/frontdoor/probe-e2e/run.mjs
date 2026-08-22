import { createServer } from "vite";

const server = await createServer({
  root: import.meta.dirname,
  configFile: `${import.meta.dirname}/vite.config.mjs`,
  server: { middlewareMode: true },
});

const env = server.environments.ssr;
console.log("[probe] ssr runnable:", typeof env.runner?.import === "function");

const mod = await env.runner.import("/src/entry-server.tsx");
console.log("[probe] server entry exports:", Object.keys(mod));

for (const stream of [false, true]) {
  const handler = mod.makeHandler(stream, "/src/entry-client.tsx");
  const res = await handler(new Request("http://localhost/users/7"));
  const html = await res.text();
  console.log(`\n===== stream=${stream} status=${res.status} =====`);
  console.log(html);
}
await server.close();
