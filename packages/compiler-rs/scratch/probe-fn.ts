import { transform } from "../index.js";
const mod = `
import { createServerFn } from "@barqjs/start";
import { db } from "./db.ts";
export const getUser = createServerFn().validator("unchecked").handler(async (id) => db.get(id));
const internal = createServerFn().handler(async () => 1);
export const listUsers = createServerFn().handler(async () => db.all());
`;
for (const env of ["client", "server"]) {
  const out = transform(mod, { filename: "/app/server/users.ts", root: "/app", env, serverFns: true });
  console.log(`=== env=${env} ===`);
  console.log(out.code);
  console.log("--- serverFns artefact ---");
  console.log(JSON.stringify(out.serverFns, null, 2));
}
