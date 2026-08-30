/**
 * B8's `action` slot, at the TYPE level.
 *
 * The compiler has lowered a non-URL `<form action={fn}>` to `Op::FormAction`
 * since M10, and until M11 the JSX types said `action?: FunctionMaybe<string>`
 * on every element — so the surface M10 built did not typecheck anywhere the
 * fixture corpus does not reach, which is everywhere an application lives.
 * Fixtures are compiled, not typechecked, which is why nothing saw it.
 *
 * This file is COMPILED BY `tsc` AND NOT RUN. `attribute-types.test.ts` is
 * what asserts it, by typechecking this directory in isolation: the positives
 * must compile and every `@ts-expect-error` must fire, which is the half a
 * hand-read cannot do — an expectation that stops being an error is an error
 * itself.
 */

import { action } from "../index.ts";

const withFormData = action(function* (data: FormData) {
  yield Promise.resolve(data);
});

const nullary = action(function* () {
  yield Promise.resolve(1);
});

/** The four shapes the slot accepts. */
export function Accepted() {
  return (
    <div>
      <form action={withFormData}>the action a submission calls with its FormData</form>
      <form action={nullary}>an action taking no arguments at all</form>
      <form action="/submit">a URL, which is what `action` is on the wire</form>
      <form action={() => "/dyn"}>a reactive URL</form>
    </div>
  );
}

/**
 * The three the slot must still refuse. The widening is per-TAG (B8: the slot
 * decides, not the value's shape), so it must not leak onto anything else, and
 * it must not degrade into `unknown`.
 */
export function Refused() {
  return (
    <div>
      {/* @ts-expect-error `action` is a URL on every element that is not a form */}
      <button action={withFormData}>not a form</button>
      {/* @ts-expect-error not a URL and not a function */}
      <form action={42}>a number</form>
      {/* @ts-expect-error a function that returns no promise is not an action */}
      <form action={(n: number) => n}>a plain function</form>
    </div>
  );
}
