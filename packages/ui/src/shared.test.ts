/**
 * The shared treatments, and the one thing composing them across a module
 * boundary can break.
 *
 * A group's rules are registered by `lib/shared.ts`, so they are in the sheet
 * BEFORE any component's own. Specificity settles almost every pair that
 * creates: `[data-disabled]` is 0-2-0 against a base atom's 0-1-0 and wins
 * whatever the order. The pair it does not settle is a rule under an at-rule
 * against a base rule for the same property, because `@media` adds no
 * specificity — which is what the tier order exists for, and tier order holds
 * only within one call.
 *
 * `forcedColors` is the only group that is such a rule, so this pins it.
 */

import { collectCss } from "@barqjs/css";
import { describe, expect, test } from "bun:test";

import { ui } from "./lib/atoms.ts";
import { shared } from "./lib/shared.ts";

const sheet = (): string => collectCss();

/** Where a class's rule sits in the sheet. */
function at(className: string): number {
  const index = sheet().indexOf(`.${className}`);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("shared", () => {
  test("a group is registered once, however many components compose it", () => {
    // The point of a group: `box-shadow: var(--ui-inset-shadow), …` was
    // written into twenty-six components and is one rule, in one place.
    for (const [name, classes] of Object.entries(shared)) {
      expect(classes, name).not.toBe("");
      for (const one of classes.split(" ")) {
        const found = sheet().match(new RegExp(`\\.${one}(?![\\w-])`, "g")) ?? [];
        expect(found.length, `${name}: ${one}`).toBe(1);
      }
    }
  });

  test("a group's rules are in the package's layer", () => {
    expect(sheet()).toContain("@layer barq.ui{");
    for (const classes of Object.values(shared)) {
      for (const one of classes.split(" ")) expect(sheet()).toContain(`.${one}`);
    }
  });

  test("the forced-colours outline still comes after the outline it overrides", () => {
    // `outline: 2px solid transparent` sets `outline-style`, and so does
    // `outline-style: none`. They are different atoms with different keys, so
    // both apply to an element composing both groups and neither is more
    // specific: the later rule wins. Ordering `forcedColors` before
    // `outlineNone` would silently take the ring's room away in a
    // forced-colours mode, and nothing else here would notice.
    const outline = shared.outlineNone.split(" ").find((one) => one.startsWith("a-outline-style"));
    expect(outline).toBeDefined();
    expect(at(shared.forcedColors.split(" ")[0] ?? "")).toBeGreaterThan(at(outline ?? ""));
  });

  test("a group and a component's own declaration merge by property, group first", () => {
    const merged = ui(shared.border, { borderWidth: "2px" }).split(" ");
    // Four longhands out of the shorthand, and the later value wins each.
    expect(merged.filter((one) => one.startsWith("a-border-top-width"))).toHaveLength(1);
    expect(rulesOf(merged, "border-top-width")).toBe("2px");
  });
});

/** The value the sheet gives a property for one of a list's classes. */
function rulesOf(classes: readonly string[], property: string): string {
  for (const one of classes) {
    const found = new RegExp(`\\.${one}\\{${property}:([^}]*)\\}`).exec(sheet());
    if (found !== null) return found[1] ?? "";
  }
  return "";
}
