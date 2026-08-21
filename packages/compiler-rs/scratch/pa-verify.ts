import { transform } from "../index.js";

const cases: Record<string, string> = {
  "export default <chain>": `
import { createServerFn } from "@barqjs/start";
import { db, SECRET } from "./db.ts";
export default createServerFn().validator("unchecked").handler(async () => db.all(SECRET));
`,
  "export default <local ident>": `
import { createServerFn } from "@barqjs/start";
import { db } from "./db.ts";
const loadThings = createServerFn().handler(async () => db.all());
export default loadThings;
`,
  "export { local }": `
import { createServerFn } from "@barqjs/start";
import { db } from "./db.ts";
const loadThings = createServerFn().handler(async () => db.all());
export { loadThings };
`,
  "export { local as renamed }": `
import { createServerFn } from "@barqjs/start";
import { db } from "./db.ts";
const inner = createServerFn().handler(async () => db.all());
export { inner as loadThings };
`,
  "MUST STAY OTHER: re-export of an IMPORTED fn": `
import { listUsers } from "./users.data.ts";
export { listUsers };
`,
  "MUST STAY OTHER: export default a component": `
export default function Page(props) { return null; }
`,
  "MUST STAY MIXED: default fn + named component": `
import { createServerFn } from "@barqjs/start";
export default createServerFn().handler(async () => 1);
export function Page() { return null; }
`,
};

for (const [name, code] of Object.entries(cases)) {
  const out = transform(code, {
    filename: "/app/x.ts",
    root: "/app",
    env: "client",
    serverFns: true,
  });
  const artefact = JSON.parse(out.serverFns ?? '{"exports":[]}') as {
    exports: Array<{ name: string; serverFn: boolean }>;
  };
  const stubbed = out.code.includes("clientRpc");
  const leaks = out.code.includes("./db.ts") || out.code.includes("SECRET");
  console.log(`--- ${name}`);
  console.log(
    `    exports: ${JSON.stringify(artefact.exports.map((e) => `${e.name}:${e.serverFn}`))}`,
  );
  console.log(`    stub synthesized: ${stubbed}   leaks server import: ${leaks}`);
  console.log(`    diagnostics: ${JSON.stringify(out.warnings ?? [])}`);
}
