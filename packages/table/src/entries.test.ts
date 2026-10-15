import { expect, test } from "bun:test";

import * as worker from "./experimental-worker-plugin.ts";
import * as flex from "./flex-render.ts";
import * as root from "./index.ts";
import * as statics from "./static-functions.ts";

test("the root entry carries the adapter and table-core's public surface", () => {
  for (const name of [
    "createTable",
    "createTableHook",
    "FlexRender",
    "flexRender",
    "tableFeatures",
    "stockFeatures",
    "createColumnHelper",
    "createSortedRowModel",
    "createFilteredRowModel",
    "createPaginatedRowModel",
    "createGroupedRowModel",
    "createExpandedRowModel",
    "createFacetedRowModel",
    "createFacetedUniqueValues",
    "createFacetedMinMaxValues",
    "rowSortingFeature",
    "columnFilteringFeature",
    "rowSelectionFeature",
    "sortFns",
    "filterFns",
    "aggregationFns",
    "constructTable",
  ]) {
    expect(root).toHaveProperty(name);
  }
});

test("the adapter's flexRender replaces table-core's on every entry", () => {
  expect(flex.FlexRender).toBe(root.FlexRender);
  expect(flex.flexRender).toBe(root.flexRender);
});

test("the sub-entries re-export table-core's", () => {
  expect(typeof statics.table_getRowModel).toBe("function");
  expect(typeof statics.column_getIsSorted).toBe("function");
  expect(Object.keys(worker).length).toBeGreaterThan(0);
});

test("the package imports and builds a table where there is no DOM", async () => {
  const script = `
    if (typeof document !== "undefined" || typeof window !== "undefined") throw new Error("a DOM is present");
    const { createRoot, flush } = await import("@barqjs/core");
    const { createTable, createSortedRowModel, rowSortingFeature, sortFns, tableFeatures } = await import(${JSON.stringify(
      new URL("./index.ts", import.meta.url).pathname,
    )});
    const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), sortFns });
    createRoot((dispose) => {
      const table = createTable({
        features,
        columns: [{ accessorKey: "name" }],
        data: [{ name: "salama" }, { name: "ada" }],
        initialState: { sorting: [{ id: "name", desc: false }] },
      });
      flush();
      console.log(table.getRowModel().rows.map((row) => row.original.name).join(","));
      dispose();
    });
  `;
  const child = Bun.spawn(["bun", "-e", script], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(err).toBe("");
  expect(code).toBe(0);
  expect(out.trim()).toBe("ada,salama");
});
