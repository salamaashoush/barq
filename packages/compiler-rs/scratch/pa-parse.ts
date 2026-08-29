import { transform } from "../index.js";
const out = transform(
  `
import { createServerFn } from "@barqjs/start";
export default createServerFn().handler(async () => 1);
`,
  { filename: "/app/x.ts", root: "/app", env: "client", serverFns: true },
);
await Bun.write(
  "/tmp/claude-1000/-home-sashoush-Workspace-barq/d0a3611a-aa04-49d1-9e6c-600a04297acf/scratchpad/stub.mjs",
  out.code.replace('"@barqjs/start"', '"data:text/javascript,export const clientRpc=(id)=>id"'),
);
const mod =
  await import("/tmp/claude-1000/-home-sashoush-Workspace-barq/d0a3611a-aa04-49d1-9e6c-600a04297acf/scratchpad/stub.mjs");
console.log("parsed and ran. default =", mod.default);
