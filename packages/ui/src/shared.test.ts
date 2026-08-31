/**
 * The shared treatments, and the two things splitting them across modules can
 * break.
 *
 * A group's rules are registered by the module that declares it, so they are in
 * the sheet BEFORE any component's own. Specificity settles almost every pair
 * that creates: `[data-disabled]` is 0-2-0 against a base atom's 0-1-0 and wins
 * whatever the order. The pair it does not settle is a rule under an at-rule
 * against a base rule for the same property, because `@media` adds no
 * specificity — which is what the tier order exists for, and tier order holds
 * only within one call. `box.forcedColors` is the only group that is such a
 * rule, so its order against `box.outline` is pinned here.
 *
 * And a file is a unit of shipping: a bundler drops a module nothing imports,
 * so a group reaches an application only through a file something kept. One
 * file holding all twenty-two cost an application importing a single `Button`
 * 3.19 KB of CSS it never used.
 */

import { collectCss } from "@barqjs/css";
import { describe, expect, test } from "bun:test";

import { ui } from "./lib/atoms.ts";
import { box } from "./lib/shared-box.ts";
import { icon } from "./lib/shared-icon.ts";
import { ringSlot } from "./lib/shared-ring-slot.ts";
import { ring } from "./lib/shared-ring.ts";
import { when } from "./lib/shared-when.ts";
import { text } from "./lib/shared-text.ts";

const sheet = (): string => collectCss();

const GROUPS: Record<string, Record<string, string>> = {
  text,
  box,
  ring,
  ringSlot,
  icon,
  when,
};

/** Where a class's rule sits in the sheet. */
function at(className: string): number {
  const index = sheet().indexOf(`.${className}`);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("the shared groups", () => {
  test("each is registered once, however many components compose it", () => {
    // The point of a group: `box-shadow: var(--ui-inset-shadow), …` was
    // written into twenty-six components and is one rule, in one place.
    for (const [module, groups] of Object.entries(GROUPS)) {
      for (const [name, classes] of Object.entries(groups)) {
        expect(classes, `${module}.${name}`).not.toBe("");
        for (const one of classes.split(" ")) {
          const found = sheet().match(new RegExp(`\\.${one}(?![\\w-])`, "g")) ?? [];
          expect(found.length, `${module}.${name}: ${one}`).toBe(1);
        }
      }
    }
  });

  test("and lands in the package's layer, where a caller's rule can beat it", () => {
    expect(sheet()).toContain("@layer barq.ui{");
    for (const groups of Object.values(GROUPS)) {
      for (const classes of Object.values(groups)) {
        for (const one of classes.split(" ")) expect(sheet()).toContain(`.${one}`);
      }
    }
  });

  test("the forced-colours outline still comes after the outline it overrides", () => {
    // `outline: 2px solid transparent` sets `outline-style`, and so does
    // `outline-style: none`. They are different atoms with different keys, so
    // both apply to an element composing both and neither is more specific:
    // the later rule wins. Declaring `forcedColors` before `outline` would
    // silently take the ring's room away in a forced-colours mode, and nothing
    // else here would notice.
    const none = box.outline.split(" ").find((one) => one.startsWith("a-outline-style"));
    expect(none).toBeDefined();
    expect(at(box.forcedColors.split(" ")[0] ?? "")).toBeGreaterThan(at(none ?? ""));
  });

  test("a group and a component's own declaration merge by property, group first", () => {
    const merged = ui(box.border, { borderWidth: "2px" }).split(" ");
    // Four longhands out of the shorthand, and the later value wins each.
    expect(merged.filter((one) => one.startsWith("a-border-top-width"))).toHaveLength(1);
    expect(valueOf(merged, "border-top-width")).toBe("2px");
  });

  test("the browser's rings and the ones aria marks are separate files", () => {
    // A button ships `ring.ts` and a menu item `ring-slot.ts`; a file holding
    // both would put 956 bytes of the other's rules in every bundle.
    expect(ring.focus).not.toBe(ringSlot.focus);
    expect(icon.sized).not.toBe(when.disabled);
  });
});

/** The value the sheet gives a property for one of a list's classes. */
function valueOf(classes: readonly string[], property: string): string {
  for (const one of classes) {
    const found = new RegExp(`\\.${one}\\{${property}:([^}]*)\\}`).exec(sheet());
    if (found !== null) return found[1] ?? "";
  }
  return "";
}
