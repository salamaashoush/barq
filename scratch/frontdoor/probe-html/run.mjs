import { createServer } from "vite";

const server = await createServer({
  root: import.meta.dirname,
  logLevel: "warn",
  appType: "custom",
  server: { middlewareMode: true },
});

const cases = {
  "full document": `<!doctype html><html><head><title>t</title></head><body><div id="app">MARKUP</div><script type="module" src="/src/entry-client.js"></script></body></html>`,
  "head fragment incl. <body> open": `<!doctype html><html><head><title>t</title></head><body><div id="app">`,
  "head only, unclosed": `<!doctype html><html><head><title>t</title>`,
  "no head at all": `<!doctype html><html><body><div id="app">`,
};

for (const [name, html] of Object.entries(cases)) {
  const out = await server.transformIndexHtml("/", html, "/");
  console.log(`--- ${name} ---`);
  console.log(out);
  console.log();
}
await server.close();
