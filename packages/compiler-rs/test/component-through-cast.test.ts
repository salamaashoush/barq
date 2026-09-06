/**
 * A component referenced through a TYPE CAST is still a component.
 *
 * `{ component: Home as never }` is how a hand-written route table spells this,
 * and `as never` is what `routeTree.gen.ts` itself emits for a route with no
 * component of its own. The scan that marks a binding used-as-a-value matched
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
 * from an undetected one — what still separates them is whether `props.data()`
 * crossed as `() => props.data()` or as its value.
 */

import { describe, expect, it } from "bun:test";

import { compileSource } from "./harness.ts";

// `(props)`, which is both the authored form and the emitted one: ownership is
// ambient, so the parameter list a component declares is the one it keeps.
const component = `function Home(props) { return <h1>{props.data()?.title}</h1>; }`;

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
    });
  }

  /**
   * The other half of the rule, so the fix cannot be "call everything a
   * component". A function nothing references is not one, so its holes stay
   * VALUES — which is the difference the tests above measure from the other
   * side.
   */
  it("but a local function nothing references is still not one", () => {
    const out = compileSource(component, "tree.tsx");
    expect(out).toMatch(/_\$insert\([^,]+, props\.data\(\)/);
    expect(out).not.toMatch(/_\$insert\([^,]+, \(\) =>/);
  });
});
