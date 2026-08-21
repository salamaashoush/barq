import { transform } from "../index.js";

function run(label: string, code: string, file: string) {
  for (const env of ["client", "server"] as const) {
    let out: any;
    try {
      out = transform(code, { filename: file, root: "/app", env, serverFns: true });
    } catch (e: any) {
      console.log(`### ${label} [${env}] THREW: ${e.message?.slice(0, 200)}`);
      continue;
    }
    const warns = (out.warnings ?? []).map((w: any) => `${w.code ?? "?"}:${w.severity ?? "?"}:${(w.message||"").slice(0,80)}`);
    console.log(`### ${label} [${env}]`);
    console.log(`  warnings: ${JSON.stringify(warns)}`);
    console.log(`  serverFns: ${JSON.stringify(out.serverFns)}`);
    console.log("  --code--");
    console.log(out.code.split("\n").map((l: string) => "   | " + l).join("\n"));
  }
  console.log("");
}

// A1: route module exporting a component AND a loader (the BARQ012 claim)
run("A1 component+loader in .tsx", `
import { createServerFn } from "@barqjs/start";
import { db } from "./db.ts";
export const loader = createServerFn().validator("unchecked").handler(async () => db.all());
export function Page(_s, props) { return <div>{props.x}</div>; }
`, "/app/routes/users.tsx");

// A2: default-exported loader alone in a .ts
run("A2 export default createServerFn (alone)", `
import { createServerFn } from "@barqjs/start";
import { db } from "./db.ts";
const SECRET = process.env.DB_PASSWORD;
export default createServerFn().validator("unchecked").handler(async () => db.all(SECRET));
`, "/app/routes/users.data.ts");

// A3: default-exported loader + named server fn
run("A3 default + named server fn", `
import { createServerFn } from "@barqjs/start";
export default createServerFn().handler(async () => 1);
export const other = createServerFn().handler(async () => 2);
`, "/app/routes/x.data.ts");

// A4: pure .ts route config (NO JSX) exporting a component ref + loader
run("A4 no-jsx route file w/ loader + other export", `
import { createServerFn } from "@barqjs/start";
export const loader = createServerFn().handler(async () => 1);
export const path = "/users";
`, "/app/routes/users.route.ts");

// A5: re-export barrel of a server fn
run("A5 re-export barrel", `
export { loader } from "./users.data.ts";
`, "/app/routes/index.ts");

// A6: loader that is exported via `export { x }` indirect
run("A6 indirect export of server fn", `
import { createServerFn } from "@barqjs/start";
import { db } from "./db.ts";
const loader = createServerFn().handler(async () => db.all());
export { loader };
`, "/app/routes/y.data.ts");
