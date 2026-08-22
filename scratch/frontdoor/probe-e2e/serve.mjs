import { createServer } from "vite";
const server = await createServer({
  root: import.meta.dirname,
  configFile: `${import.meta.dirname}/vite.config.mjs`,
  server: { port: 5299, strictPort: true },
});
await server.listen();
console.log("[probe] dev on http://localhost:5299");
