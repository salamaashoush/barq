import { signal } from "@barqjs/core";

export const count = signal("1");

/**
 * BARQ001's premise, rendered.
 *
 * `{count}` and `id={count}` are CORRECT barq code and the fine-grained path:
 * `insert()` does `if (typeof value === "function") { renderEffect(…) }`
 * (`dom.ts:954`) and the attribute path does the same. That is why D1 has no JSX
 * arm — eslint-plugin-solid's `badSignal` reports both of those, and porting it
 * would make the rule fire on the framework's own idiom.
 *
 * `` `total: ${count}` `` is the same identifier one syntactic step away, and it
 * renders the accessor's OWN SOURCE TEXT into the DOM. It is not caught by
 * `tsc --strict` — verified zero errors — and it is not caught by any runtime
 * check, because a string is a perfectly good thing to insert.
 *
 * There is no `wins` and no `goesLive` here, and their ABSENCE is the point.
 * `createElement` binds a function-valued child and attribute exactly as the
 * compiled path does, and both paths stringify the same accessor into the
 * coerced hole — so the two frames agree on all three, before and after the
 * update. That is precisely why 115 differential fixtures could never have found
 * this class of bug: only a diagnostic separates the third hole from the first
 * two. `test/diagnostics.test.ts` asserts the codes this file produces.
 */
export default function DiagnosticAccessorCoercion() {
  return (
    <div>
      <p id={count}>live attribute</p>
      <b>{count}</b>
      <span>{`total: ${count}`}</span>
    </div>
  );
}

export const steps = [() => count.set("2")];

export const optimality = {
  target: 1,
  milestone: 3,
  templates: 1,
  patchCalls: 3,
  // Every hole takes the accessor UNWRAPPED, and no thunk is built anywhere.
  // The first two are the fine-grained path: the ATTRIBUTE is now live by the
  // compiler's own effect — with the channel resolved there is no `setProp` left
  // to hand a function to — and the child hole is still the runtime's. The third is the bug — nothing in the
  // template literal is a tracked READ, so the hole is static and the string is
  // applied once. Same emit shape, opposite meaning; only BARQ001 tells them
  // apart.
  emits: ['"id"', "count);", "`total: ${count}`);"],
  // No hole took a thunk: every patch argument is the expression itself.
  absent: [", () =>"],
};
