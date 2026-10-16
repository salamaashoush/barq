/**
 * A component referenced through a TYPE CAST is still a component.
 *
 * `{ component: Home as never }` is how a hand-written route table may spell
 * this. The scan that marks a binding used-as-a-value matched
 * `Expression::Identifier` and saw a `TSAsExpression`, so the cast form marked
 * nothing.
 *
 * WHAT AN UNDETECTED COMPONENT COMPILES TO, because nothing reported it: its
 * holes are emitted as VALUES rather than accessors, so nothing is tracked. It
 * renders once and never updates. It surfaced as a route stuck on its
 * `pendingComponent` forever.
 *
 * The hole is the whole symptom now. Ownership is ambient, so a detected
 * component gains no scope parameter and no `block()` wrapper to tell it apart
 * from an undetected one. What still separates them is what the compiler KNOWS
 * about `props.label()`: in a component it is a Cell being read, so the Cell
 * itself is handed over; anywhere else it is a call nothing is known about, and
 * is wrapped so that running it stays the hole's business.
 */

import { describe, expect, it } from "bun:test";

import { compileSource } from "./harness.ts";

// `(props)`, which is both the authored form and the emitted one: ownership is
// ambient, so the parameter list a component declares is the one it keeps.
const component = `function Home(props) { return <h1>{props.data()?.title}{props.label()}</h1>; }`;

const shapes = {
  "a bare reference": `${component}\nexport const tree = [{ component: Home }];`,
  "through `as never`": `${component}\nexport const tree = [{ component: Home as never }];`,
  "through `as Component`": `${component}\nexport const tree = [{ component: Home as Component }];`,
  "through `satisfies`": `${component}\nexport const tree = [{ component: Home satisfies never }];`,
  "through a non-null assertion": `${component}\nexport const tree = [{ component: Home! }];`,
  "through parentheses and a cast": `${component}\nexport const tree = [{ component: (Home as never) }];`,
};

describe("a component referenced through a type cast", () => {
  for (const [name, source] of Object.entries(shapes)) {
    it(`is lowered as a component: ${name}`, () => {
      const out = compileSource(source, "tree.tsx");

      // No scope is threaded anywhere: the uid that named one is gone.
      expect(out).not.toContain("_s$");
      // The hole is an ACCESSOR, so `insert` reads it inside a tracked effect.
      // Eagerly evaluated, it reads the loader's pending value once and never
      // runs again, which is the failure that has no error attached to it.
      expect(out).toMatch(/_\$insert\([^,]+, \(\) =>/);
      expect(out).not.toMatch(/_\$insert\([^,]+, props\.data\(\)/);
      // And the prop read on its own is the Cell, forwarded by identity.
      expect(out).toMatch(/_\$insert\([^,]+, props\.label[,)]/);
    });
  }

  /**
   * The other half of the rule, so the fix cannot be "call everything a
   * component". A function nothing references is not one, so its parameter is
   * not a props object: `props.label()` is an opaque call, wrapped, where the
   * tests above see a Cell handed over as it is.
   */
  it("but a local function nothing references is still not one", () => {
    const out = compileSource(component, "tree.tsx");
    expect(out).toMatch(/_\$insert\([^,]+, \(\) => props\.label\(\)/);
    expect(out).not.toMatch(/_\$insert\([^,]+, props\.label[,)]/);
  });
});
