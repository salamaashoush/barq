/**
 * The editor's UI writes nothing arc or ui already has, and nothing twice.
 *
 * arc's own guard, over this directory: a declaration group is composed from
 * a treatment in `@barqjs/arc/style` or a group in `@barqjs/ui`'s
 * `lib/shared-*.ts` rather than written again, and a group two of the
 * editor's parts share is written once in styles.ts and composed by both.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { Glob } from "bun";

import {
  UI_GROUPS,
  duplicates,
  literalsIn,
  placesIn,
  repeatedLiterals,
  report,
  uiGroups,
} from "../../../arc/src/test-duplication.ts";

const root = import.meta.dir;
const ui = join(dirname(Bun.resolveSync("@barqjs/ui/package.json", root)), "src/lib");
const arc = join(dirname(Bun.resolveSync("@barqjs/arc/package.json", root)), "src");

const ARC_STYLE = "@barqjs/arc/style/";

function modules(): string[] {
  return [...new Glob("**/*.{ts,tsx}").scanSync({ cwd: root })]
    .filter((path) => !path.includes(".test.") && !path.split("/").at(-1)?.startsWith("test-"))
    .toSorted();
}

function treatments() {
  return [...new Glob("style/*.ts").scanSync({ cwd: arc })]
    .filter((path) => !path.includes(".test."))
    .toSorted()
    .flatMap((path) => placesIn(join(arc, path), arc, `${ARC_STYLE}${path.slice(6)}`))
    .filter((place) => place.name !== undefined);
}

describe("duplication", () => {
  test("no declaration group is written twice, or against arc's and ui's treatments", () => {
    const places = modules().flatMap((path) => placesIn(join(root, path), root, path));
    expect(places.length).toBeGreaterThan(100);
    const found = duplicates(places, uiGroups(ui, root, UI_GROUPS), treatments());
    expect(report(found, [ARC_STYLE])).toEqual([]);
  });

  test("no colour, spacing or radius is spelled out twice", () => {
    const literals = modules().flatMap((path) => literalsIn(join(root, path), path));
    expect(repeatedLiterals(literals)).toEqual([]);
  });

  test("and it does fail, naming both places, when a group is written twice", () => {
    const dir = mkdtempSync(join(tmpdir(), "diagram-duplication-"));
    try {
      const layer = relative(dir, join(root, "layer.ts"));
      for (const name of ["one.ts", "two.ts"]) {
        writeFileSync(
          join(dir, name),
          `import { diagramLayer as d } from "${layer}";\n\n` +
            `export const bar = d({ display: "flex", alignItems: "center", padding: "1px" });\n`,
        );
      }
      writeFileSync(
        join(dir, "three.ts"),
        `import { diagramLayer as d } from "${layer}";\n\n` +
          `export const label = d({ fontSize: "var(--text-sm)", lineHeight: "var(--ui-leading, var(--text-sm--line-height))", color: "var(--muted-foreground)" });\n` +
          `export const hint = d({ color: "var(--muted-foreground)" });\n`,
      );
      const places = ["one.ts", "two.ts", "three.ts"].flatMap((name) =>
        placesIn(join(dir, name), root, name),
      );
      const arcTreatments = treatments();
      const found = report(duplicates(places, uiGroups(ui, root, UI_GROUPS), arcTreatments), [
        ARC_STYLE,
      ]);
      const pair = found.find((one) => one.startsWith("one.ts:3 (bar) and two.ts:3 (bar)"));
      expect(pair).toContain("{ display:flex }");
      expect(pair).toContain("{ padding:1px }");
      expect(pair).toContain("move the group into @barqjs/arc/style");
      expect(found).toContain(
        `one.ts:3 (bar) and ${ARC_STYLE}layout.ts:` +
          String(arcTreatments.find((one) => one.name === "layout.row")?.line) +
          " (layout.row) both write & { display:flex }; & { align-items:center }: compose layout.row from @barqjs/arc/style",
      );
      expect(
        found.some(
          (one) =>
            one.startsWith("three.ts:3 (label) and @barqjs/ui/shared-text") &&
            one.endsWith("compose text.sm from @barqjs/ui/shared-text"),
        ),
      ).toBe(true);
      expect(found).toHaveLength(4);

      expect(
        repeatedLiterals(["three.ts"].flatMap((name) => literalsIn(join(dir, name), name))),
      ).toEqual([
        "var(--muted-foreground) is written at three.ts:3 and three.ts:4: use a colour role (fg, bg, edge, surface, interaction) from @barqjs/arc/style",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
