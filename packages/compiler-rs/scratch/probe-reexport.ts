import { transform } from "../index.js";

const cases: Record<string, string> = {
  "component + re-export of an imported server fn": `
import { listUsers } from "./users.data.ts";
export const loader = listUsers;
export default function Users(props) { return <ul>{props.x}</ul>; }
`,
  "component + export { listUsers }": `
import { listUsers } from "./users.data.ts";
export { listUsers };
export default function Users(props) { return <ul>{props.x}</ul>; }
`,
  "component + a createServerFn in the same module": `
import { createServerFn } from "@barqjs/start";
export const loader = createServerFn().handler(async () => 1);
export default function Users(props) { return <ul>{props.x}</ul>; }
`,
};

for (const [name, code] of Object.entries(cases)) {
  for (const env of ["client", "server"] as const) {
    let out;
    try {
      out = transform(code, { filename: "/app/routes/users.tsx", root: "/app", env, serverFns: true, diagnostics: true });
    } catch (e) {
      console.log(`--- ${name} [${env}] THREW: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    console.log(`--- ${name} [${env}]`);
    console.log("   warnings:", JSON.stringify(out.warnings?.map((w: any) => `${w.severity} ${w.code}`) ?? []));
    console.log("   serverFns:", out.serverFns ?? "(none)");
  }
}
