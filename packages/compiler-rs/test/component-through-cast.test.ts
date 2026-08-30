/**
 * A component referenced through a TYPE CAST is still a component.
 *
 * `{ component: Home as never }` is how a hand-written route table spells this,
 * and `as never` is what `routeTree.gen.ts` itself emits for a route with no
 * component of its own. The scan that marks a binding used-as-a-value matched
 * `Expression::Identifier` and saw a `TSAsExpression`, so the cast form marked
 * nothing.
 *
 * WHAT AN UNDETECTED COMPONENT COMPILES TO, because nothing reported it: the
 * authored parameter list is kept, so no scope parameter is threaded; its JSX
 * lowers against a module-level `const _s$ = null`; its holes are emitted as
 * VALUES rather than accessors, so nothing is tracked; and no `block()` wraps
 * it. It renders once, against no scope, and never updates. It surfaced as a
 * route stuck on its `pendingComponent` forever.
 */

import { describe, expect, it } from "bun:test";

import { compileSource } from "./harness.ts";

// `(props)`, which is the AUTHORED form: the compiler threads the scope in
// front of it. Writing `(scope, props)` by hand is a different thing and a
// silently broken one, because the scope is prepended regardless and `props`
// lands third, where nothing recognises it as the props parameter.
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

      // The three symptoms, each asserted rather than inferred from the others.
      expect(out).not.toContain("const _s$ = null");
      expect(out).toContain("Home = _$block(Home)");
      // The hole is an ACCESSOR, so `insert` reads it inside a tracked effect.
      // Eagerly evaluated, it reads the loader's pending value once and never
      // runs again, which is the failure that has no error attached to it.
      expect(out).toMatch(/_\$insert\([^,]+, [^,]+, \(\) =>/);
      expect(out).not.toMatch(/_\$insert\([^,]+, [^,]+, props\.data\(\)/);
    });
  }

  /**
   * The other half of the rule, so the fix cannot be "call everything a
   * component". A function nothing references is not one, and its JSX has no
   * scope to be lowered against.
   */
  it("but a local function nothing references is still not one", () => {
    const out = compileSource(component, "tree.tsx");
    expect(out).toContain("const _s$ = null");
    expect(out).not.toContain("Home = _$block(Home)");
  });
});
