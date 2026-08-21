/** RED-E2: same call sites on both sides (params only), so the ONLY difference
 * is whether the emitted interface carries `typeof import(...)` fields. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const ROOT = "/tmp/claude-1000/-home-sashoush-Workspace-barq/0b30e953-39d7-416e-9f00-8886a2e0b405/scratchpad/tsc2";
const routeModule = (i: number): string => `export const validateSearch = (raw: Record<string, unknown>) => ({ page: Number(raw.page ?? 1), q${i}: String(raw.q ?? "") });
export const loader = async (ctx: { params: { id: string } }) => ({ n${i}: "x", id: ctx.params.id });
export const Component = () => null;
`;
for (const kind of ["current", "typeof"] as const)
  for (const n of [200, 800, 2000]) {
    const dir = `${ROOT}/${kind}-${n}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(`${dir}/routes`, { recursive: true });
    const rows: string[] = [];
    const uses: string[] = [`import type { RouteMap } from "./gen.d.ts";`];
    for (let i = 0; i < n; i++) {
      writeFileSync(`${dir}/routes/r${i}.ts`, routeModule(i));
      rows.push(
        kind === "current"
          ? `  "/r${i}/$id": { path: "/r${i}/$id"; params: { id: string } };`
          : `  "/r${i}/$id": { path: "/r${i}/$id"; params: { id: string }; search: SearchOf<typeof import("./routes/r${i}.ts")>; data: DataOf<typeof import("./routes/r${i}.ts")> };`,
      );
      // IDENTICAL call sites on both sides.
      uses.push(`declare const p${i}: RouteMap["/r${i}/$id"]["params"]; export const u${i} = p${i}.id;`);
    }
    const header = kind === "typeof"
      ? `type SearchOf<M> = M extends { validateSearch: (raw: never) => infer S } ? S : Record<string, string>;\ntype DataOf<M> = M extends { loader: (...args: never) => infer R } ? Awaited<R> : undefined;\n`
      : "";
    writeFileSync(`${dir}/gen.d.ts`, `${header}export interface RouteMap {\n${rows.join("\n")}\n}\n`);
    writeFileSync(`${dir}/check.ts`, uses.join("\n"));
    writeFileSync(`${dir}/tsconfig.json`, JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: "esnext", target: "esnext", moduleResolution: "bundler", allowImportingTsExtensions: true, skipLibCheck: true } }));
  }
console.log("ok");
