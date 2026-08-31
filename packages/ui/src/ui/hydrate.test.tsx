/**
 * The markup the server wrote, claimed by the client that follows it.
 *
 * SSR is only half the claim: a page whose server markup the client cannot
 * claim is a page that renders twice, throws away every node the server sent
 * and loses the focus, the scroll position and the selection with them. That
 * failure looks identical to a working page in a screenshot and identical to a
 * working page in `ssr.test.ts`, which only ever reads the string.
 *
 * The server half is BUNDLED for the string backend, exactly as in
 * `ssr.test.ts`; the client half is this package compiled for the DOM by the
 * suite's own loader. One source, two backends, which is what a real
 * application does.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { flush } from "@barqjs/core";
import { renderAndHydrate } from "@barqjs/testing";
import { cssRegistration } from "@barqjs/compiler/vite";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string; css?: string };
};

/**
 * The same source through one backend or the other, both hydratable.
 *
 * `hydratable` is off by default — a page that is never hydrated pays neither
 * the wire bytes nor the work — so BOTH halves have to ask for it: the server
 * writes the range markers and the client walk reads them.
 */
function halfPlugin(ssr: boolean) {
  return {
    name: ssr ? "barq-ssr" : "barq-dom",
    setup(build: {
      onLoad(
        filter: { filter: RegExp },
        load: (args: { path: string }) => { contents: string; loader: "ts" | "tsx" },
      ): void;
    }) {
      build.onLoad({ filter: /\.tsx?$/ }, (args) => {
        const result = native.transform(readFileSync(args.path, "utf8"), {
          filename: args.path,
          ssr,
          hydratable: true,
          strictCss: true,
        });
        const contents =
          result.css === undefined || result.css === ""
            ? result.code
            : result.code + cssRegistration(args.path, result.css);
        return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" } as const;
      });
    },
  };
}

const root = fileURLToPath(new URL("../index.ts", import.meta.url));
const workspace = mkdtempSync(
  join(fileURLToPath(new URL("../../node_modules/", import.meta.url)), "barq-ui-hydrate-"),
);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let probes = 0;

async function half(source: string, ssr: boolean): Promise<() => never> {
  const at = probes++;
  const entry = join(workspace, `probe${String(at)}.tsx`);
  writeFileSync(entry, source.replaceAll("<root>", root));

  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    plugins: [halfPlugin(ssr)],
    external: ["@barqjs/core", "@barqjs/css", "@barqjs/server"],
  });
  if (!result.success)
    throw new AggregateError(result.logs, `the ${ssr ? "server" : "client"} half did not build`);

  const file = join(workspace, `built${String(at)}-${ssr ? "ssr" : "dom"}.mjs`);
  writeFileSync(file, await (result.outputs[0] as { text(): Promise<string> }).text());
  const mod = (await import(file)) as { Page: () => never };
  return mod.Page;
}

/** One fixture, both backends, which is what a real application ships. */
async function halves(source: string): Promise<{ server: () => never; client: () => never }> {
  return { server: await half(source, true), client: await half(source, false) };
}

describe("hydration", () => {
  test("a card the server wrote is CLAIMED, not rebuilt", async () => {
    const { server, client } = await halves(`
      import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "<root>";
      export function Page() {
        return (
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <Badge>New</Badge>
            </CardHeader>
            <CardContent>Twelve, four of them unpaid.</CardContent>
            <Button>Export</Button>
          </Card>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.claimed).toBeGreaterThan(0);
    // By REFERENCE: every node in the tree is one the server sent.
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="badge"]')?.textContent).toBe("New");
    result.unmount();
  });

  test("a control the server wrote still works after the walk", async () => {
    // Claiming a node and never binding its handler is the failure that looks
    // like a working page until somebody presses the thing.
    const { server, client } = await halves(`
      import { Checkbox } from "<root>";
      export function Page() {
        return <Checkbox>Accept the terms</Checkbox>;
      }
    `);

    const result = renderAndHydrate({ server, client });
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);

    // The control the server wrote responds: claiming a node and never binding
    // its handler is the failure that looks like a working page until somebody
    // presses the thing.
    const input = result.container.querySelector("input") as HTMLInputElement;
    const label = result.container.querySelector("label") as HTMLElement;
    expect(label.hasAttribute("data-selected")).toBe(false);
    input.click();
    flush();
    expect(label.hasAttribute("data-selected")).toBe(true);
    result.unmount();
  });

  test("a table the server wrote keeps its rows rather than writing them again", async () => {
    const { server, client } = await halves(`
      import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "<root>";
      export function Page() {
        return (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Invoice</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell>INV-001</TableCell></TableRow>
              <TableRow><TableCell>INV-002</TableCell></TableRow>
            </TableBody>
          </Table>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelectorAll("tbody tr")).toHaveLength(2);
    result.unmount();
  });

  test("the identifiers agree, or the label names nothing after the walk", async () => {
    // `id()` numbers from the owner's position in the scope tree, so the two
    // halves have to compute the same string from the same shape.
    const { server, client } = await halves(`
      import { Checkbox } from "<root>";
      export function Page() {
        return <Checkbox>Accept</Checkbox>;
      }
    `);
    const result = renderAndHydrate({ server, client });

    const before = /<label[^>]*\\bid="([^"]+)"/.exec(result.html)?.[1];
    const after = result.container.querySelector("label")?.getAttribute("id");
    if (before !== undefined) expect(after).toBe(before);
    expect(result.mismatches).toEqual([]);
    result.unmount();
  });
});
