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
import { contrast } from "./lib/shared-contrast.ts";
import {
  type Breakpoint,
  type ContainerStep,
  breakpointQuery,
  breakpoints,
  containers,
  on,
} from "./lib/conditions.ts";
import { touch } from "./lib/shared-touch.ts";

const sheet = (): string => collectCss();

const GROUPS: Record<string, Record<string, string>> = {
  text,
  box,
  ring,
  ringSlot,
  icon,
  when,
  touch,
  contrast,
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
    // silently take the ring's room away in a forced-colours mode.
    //
    // The tier settles it, and the tier is an ORDER: `collectCss` sorts every
    // rule it holds by tier, and `orderCss` does the same over a built asset,
    // so this holds whatever order the two modules reach the page in. It is
    // deliberately NOT a cascade layer — a layer overrides specificity where a
    // tier only breaks a tie, and one sub-layer per tier moved 289 computed
    // values on the gallery.
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

describe("the conditions", () => {
  test("every viewport and container step is the width its token names", () => {
    for (const step of Object.keys(breakpoints) as Breakpoint[]) {
      expect<string>(on[step]).toBe(`@media ${breakpointQuery(step)}`);
    }
    for (const step of Object.keys(containers) as ContainerStep[]) {
      expect<string>(on[`cq${step[0]?.toUpperCase()}${step.slice(1)}` as "cqSm"]).toBe(
        `@container (width >= ${containers[step]})`,
      );
    }
  });

  test("the steps that end do so where the next one starts", () => {
    expect<string>(on.smOnly).toBe(`@media (${breakpoints.sm} <= width < ${breakpoints.md})`);
    expect<string>(on.lgOnly).toBe(`@media (${breakpoints.lg} <= width < ${breakpoints.xl})`);
    expect<string>(on.cqMdOnly).toBe(`@container (${containers.md} <= width < ${containers.lg})`);
  });

  test("the groups that spell a condition out spell it as the set does", () => {
    // `shared-touch.ts` and `shared-contrast.ts` write their conditions as
    // literals so their own module folds them; this is what keeps them one.
    expect(sheet()).toContain(`${on.coarse}{.${touch.target.split(" ")[0] ?? ""}`);
    expect(sheet()).toContain(`${on.forcedColors}{.${contrast.selected.split(" ")[0] ?? ""}`);
    expect(sheet()).toContain(`${on.moreContrast}{`);
  });
});

describe("touch targets", () => {
  test("under a coarse pointer a control reaches 44px, and under a fine one nothing changes", () => {
    const rules = sheet();
    for (const one of touch.target.split(" ")) {
      const rule = new RegExp(`@media \\(pointer: coarse\\)\\{\\.${one}\\{([^}]*)\\}`).exec(rules);
      expect(rule?.[1]).toMatch(/^min-(block|inline)-size:2\.75rem$/);
    }
    expect(rules).not.toContain("(pointer: fine){.a-min");
  });

  test("a control with a press area past its paint grows that area, not its box", () => {
    const rules = sheet();
    for (const one of touch.hitArea.split(" ")) {
      expect(rules).toMatch(
        new RegExp(`\\.${one}::after\\{inset-(inline|block)-(start|end):min\\(`),
      );
    }
  });

  test("the base components wear it", async () => {
    const { buttonVariants } = await import("./ui/button.tsx");
    const classes = buttonVariants({}).split(" ");
    for (const one of touch.target.split(" ")) expect(classes).toContain(one);
  });
});

describe("forced colours and more contrast", () => {
  test("focus, edges, chosen and disabled states are drawn in system colours", () => {
    const rules = sheet();
    expect(rules).toContain("outline-color:Highlight");
    expect(rules).toContain("border-top-color:ButtonText");
    expect(rules).toContain("background-color:Highlight");
    expect(rules).toContain("color:HighlightText");
    expect(rules).toContain("color:GrayText");
    expect(rules).toContain("forced-color-adjust:none");
  });

  test("more contrast draws a control's edge in the foreground", () => {
    expect(sheet()).toMatch(
      /@media \(prefers-contrast: more\)\{\.[\w-]+\{border-top-color:var\(--foreground\)\}/,
    );
  });

  test("the base components wear it", async () => {
    const { buttonVariants } = await import("./ui/button.tsx");
    const classes = buttonVariants({}).split(" ");
    for (const group of [contrast.focus, contrast.edge, contrast.disabled]) {
      for (const one of group.split(" ")) expect(classes).toContain(one);
    }
  });
});

describe("directional icons", () => {
  test("turn to face a right-to-left reading direction", () => {
    expect(sheet()).toMatch(
      new RegExp(`\\.${icon.directional.split(" ")[0] ?? ""}:dir\\(rtl\\)\\{rotate:180deg\\}`),
    );
  });
});
