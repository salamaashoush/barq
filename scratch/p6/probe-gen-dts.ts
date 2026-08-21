/**
 * The EMITTED `.d.ts`, run through `tsc` against real route modules.
 *
 * The type helpers were proved in a hand-written mock; this proves the thing
 * `routes.rs` actually writes.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as {
  routeTree(root: string, dir: string, typesDir?: string): { types: string };
};

const root = mkdtempSync(join(tmpdir(), "barq-dts-"));
mkdirSync(join(root, "src/routes"), { recursive: true });

const write = (path: string, text: string): void => writeFileSync(join(root, path), text);

write("src/routes/users.route.tsx", `
export const validateSearch = {
  "~standard": {
    version: 1,
    vendor: "zod",
    validate: (_v: unknown): { value: { tenant: string } } | { issues: readonly unknown[] } => ({ value: { tenant: "acme" } }),
  },
  parse: (_i: unknown): { wrong: true } => ({ wrong: true }),
};
export const loader = async () => ({ orgs: [1, 2] });
export const Component = () => null;
`);
write("src/routes/users.$id.tsx", `
export const validateSearch = { parse: (_i: unknown): { q: string } => ({ q: "" }) };
export const loader = async (ctx: { params: { id: string } }) => ({ name: "Ada", id: ctx.params.id });
export const Component = () => null;
`);
write("src/routes/index.tsx", `export const Component = () => null;\n`);

const { types } = native.routeTree(root, "src/routes", "src");
write("src/routes.gen.d.ts", types);
write("tsconfig.json", JSON.stringify({
  compilerOptions: { strict: true, noEmit: true, module: "esnext", target: "esnext", moduleResolution: "bundler", allowImportingTsExtensions: true, skipLibCheck: true, jsx: "preserve" },
}));
write("src/check.ts", `
import type { RouteMap, RouteData } from "virtual:barq-routes";

// A Standard Schema WINS over the \`.parse\` sitting beside it.
const tenant: RouteData["/users"]["search"] = { tenant: "acme" };
// A layout has a row, which leaf-only typing did not give it.
const orgs: RouteData["/users"]["data"] = { orgs: [1, 2] };
// A \`.parse\` object types the search.
const q: RouteData["/users/$id"]["search"] = { q: "hi" };
const user: RouteData["/users/$id"]["data"] = { name: "Ada", id: "7" };
// No validator, no loader.
const raw: RouteData["/"]["search"] = { anything: 1 };
const none: RouteData["/"]["data"] = undefined;
// Params still come from the path.
const params: RouteMap["/users/$id"]["params"] = { id: "7" };

// @ts-expect-error the Standard Schema arm won, so \`wrong\` is not a key
const bad: RouteData["/users"]["search"] = { wrong: true };
// @ts-expect-error the loader's return type is enforced
const badData: RouteData["/users/$id"]["data"] = { nope: true };

export { tenant, orgs, q, user, raw, none, params, bad, badData };
`);

console.log(types.split("\n").slice(0, 22).join("\n"));
console.log("\n--- project at", root);
