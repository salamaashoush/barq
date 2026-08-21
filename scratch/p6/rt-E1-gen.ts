/** RED-E1: generate N-route corpora for both emit shapes and time tsc. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const ROOT = "/tmp/claude-1000/-home-sashoush-Workspace-barq/0b30e953-39d7-416e-9f00-8886a2e0b405/scratchpad/tsc";

const tsconfig = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    compilerOptions: {
      strict: true, noEmit: true, module: "esnext", target: "esnext",
      moduleResolution: "bundler", allowImportingTsExtensions: true, skipLibCheck: true,
      ...extra,
    },
  });

function routeModule(i: number): string {
  return `export const validateSearch = (raw: Record<string, unknown>) => ({
  page: Number(raw.page ?? 1),
  q${i}: String(raw.q ?? ""),
});
export const loader = async (ctx: { params: { id: string } }) => ({ n${i}: "x", id: ctx.params.id });
export const Component = () => null;
`;
}

function build(kind: "current" | "typeof", n: number, extra: Record<string, unknown> = {}): string {
  const dir = `${ROOT}/${kind}-${n}${Object.keys(extra).length > 0 ? "-" + Object.keys(extra).join("-") : ""}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/routes`, { recursive: true });
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    writeFileSync(`${dir}/routes/r${i}.ts`, routeModule(i));
    if (kind === "current") {
      rows.push(`  "/r${i}/$id": { path: "/r${i}/$id"; params: { id: string } };`);
    } else {
      rows.push(
        `  "/r${i}/$id": { path: "/r${i}/$id"; params: { id: string }; search: SearchOf<typeof import("./routes/r${i}.ts")>; data: DataOf<typeof import("./routes/r${i}.ts")> };`,
      );
    }
  }
  const header =
    kind === "typeof"
      ? `type SearchOf<M> = M extends { validateSearch: (raw: never) => infer S } ? S : Record<string, string>;
type DataOf<M> = M extends { loader: (...args: never) => infer R } ? Awaited<R> : undefined;
`
      : "";
  writeFileSync(`${dir}/gen.d.ts`, `${header}export interface RouteMap {\n${rows.join("\n")}\n}\n`);
  // N call sites, exactly M3's methodology: every row is typechecked.
  const uses: string[] = [`import type { RouteMap } from "./gen.d.ts";`];
  for (let i = 0; i < n; i++) {
    uses.push(`declare const p${i}: RouteMap["/r${i}/$id"]["params"]; export const u${i} = p${i}.id;`);
    if (kind === "typeof") {
      uses.push(`declare const s${i}: RouteMap["/r${i}/$id"]["search"]; export const v${i} = s${i}.page;`);
      uses.push(`declare const d${i}: RouteMap["/r${i}/$id"]["data"]; export const w${i} = d${i}.n${i};`);
    }
  }
  writeFileSync(`${dir}/check.ts`, uses.join("\n"));
  writeFileSync(`${dir}/tsconfig.json`, tsconfig(extra));
  return dir;
}

const dirs: string[] = [];
for (const n of [200, 800, 2000]) {
  dirs.push(build("current", n));
  dirs.push(build("typeof", n));
}
dirs.push(build("typeof", 200, { verbatimModuleSyntax: true }));
dirs.push(build("typeof", 200, { isolatedDeclarations: true, declaration: true, noEmit: false, emitDeclarationOnly: true }));
console.log(dirs.join("\n"));
