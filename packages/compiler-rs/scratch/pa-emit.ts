import { transform } from "../index.js";
const out = transform(
  `
import { createServerFn } from "@barqjs/start";
import { db } from "./db.ts";
const inner = createServerFn().handler(async () => db.all());
export default createServerFn().handler(async () => db.one());
export { inner as loadThings };
`,
  { filename: "/app/x.ts", root: "/app", env: "client", serverFns: true },
);
console.log(out.code);
