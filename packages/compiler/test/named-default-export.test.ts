import { describe, expect, test } from "bun:test";

import { compileSourceRaw } from "./harness.ts";

/**
 * A module with no JSX that default-exports a binding by name, compiled with
 * the css pass and ownership both reading its symbol ids. The output has to be
 * the plain compile's: neither channel adds anything to a module with no JSX.
 */
const SHAPES: ReadonlyArray<readonly [string, string]> = [
  [
    "src/theme.ts",
    `import { installTheme, type ThemeSelection } from "@barqjs/ui";

const theme: ThemeSelection = { base: "neutral", accent: "blue", radius: "0.625rem" };

installTheme(theme);

export default theme;
`,
  ],
  [
    "src/routeTree.gen.ts",
    `import type { AnyRouteDefinition } from "@barqjs/router";

import { Route as rootRoute } from "./routes/__root";
import { Route as IndexRoute } from "./routes/index";

export const routeTree: AnyRouteDefinition[] = [
  {
    ...rootRoute.options,
    id: "__root__",
    path: "/",
    children: [{ ...IndexRoute.options, id: "/", path: "" }],
  },
];

export default routeTree;

export interface FileRoutesById {
  __root__: typeof rootRoute;
  "/": typeof IndexRoute;
}
`,
  ],
];

const OPTION_SETS: ReadonlyArray<Record<string, unknown>> = [
  { ownership: true, cssExports: true },
  { addresses: true, ownership: true, diagnostics: true, cssExports: true, templates: false },
  { sourcemap: true },
  { ownership: true, cssExports: true, sourcemap: true },
];

const EMPTY_FOREST = '{"version":2,"roots":[],"nodes":[],"positions":[],"opaque":[]}';

describe("a named default export outside JSX", () => {
  for (const [filename, source] of SHAPES) {
    const plain = compileSourceRaw(source, filename);
    for (const options of OPTION_SETS) {
      test(`${filename} under ${JSON.stringify(options)}`, () => {
        const out = compileSourceRaw(source, filename, options);
        expect(out.code).toBe(plain.code);
        expect(out.warnings).toEqual([]);
        if (options.ownership) expect(out.ownership).toBe(EMPTY_FOREST);
        if (options.sourcemap) expect(JSON.parse(out.map ?? "null")?.file).toBe(filename);
      });
    }
  }
});
