import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { withModuleUrls } from "../src/router.ts";

const root = "/home/salama/app";
const resolveIn = (spec: string): Promise<{ id: string }> =>
  Promise.resolve({ id: join(root, "src", `${spec.replace("./", "")}.tsx`) });

describe("clientOnly() module URLs", () => {
  test("a literal clientOnly import is given the URL of the module it loads", async () => {
    const code = [
      'const Chart = clientOnly(() => import("./Chart"));',
      'const Map = clientOnly(() => import("./Map"), { lazy: true, export: "WorldMap" });',
      "const Other = clientOnly(() => import(name));",
    ].join("\n");
    const out = await withModuleUrls(code, `${root}/src/page.tsx`, root, resolveIn);

    expect(out).toContain('clientOnly(() => import("./Chart"), undefined, "/src/Chart.tsx")');
    expect(out).toContain(
      'clientOnly(() => import("./Map"), { lazy: true, export: "WorldMap" }, "/src/Map.tsx")',
    );
    expect(out).toContain("clientOnly(() => import(name))");
  });
});
