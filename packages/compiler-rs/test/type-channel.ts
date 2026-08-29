/**
 * The TYPE channel's declared reach — `packages/core/src/jsx-types/`.
 *
 * A rule whose falsification procedure is "MUST be a type error" is invisible to
 * every other oracle in this repository, because all of them compile a fixture
 * and RUN it. A type error produces no DOM, no effect count, no ownership edge
 * and no diagnostic; it produces a compile that does not happen.
 *
 * So the channel is `tsc` itself, run over `src/jsx-types` in isolation by
 * `packages/core/src/jsx-types/form-action-types.test.ts`, and it asserts BOTH
 * directions: the positives compile, and every `@ts-expect-error` still FIRES.
 * The second half is what makes such a rule assertable at all — an expectation
 * that quietly stops being an error is exactly the rot this project's registries
 * exist to catch, in the one place none of them can see.
 *
 * What each rule is reported BY:
 *
 * | B8 | `form-action.types.tsx` — the four accepted `action` shapes and the |
 * |    | three refused, with the widening per-TAG so a `<button>` still says no |
 * | C4 | `props-typed-slot.types.tsx` — `props.x` in value position is an error, |
 * |    | and `props.children()` without a Scope is another (C3.8's type half)   |
 *
 * Adding a rule here without a `.types.tsx` that observes it is the same
 * offence as adding one to `SEMANTICS.md` with no fixture, and the bidirectional
 * check in `semantics.test.ts` treats it the same way.
 */
export const TYPE_CHANNEL_RULES: readonly string[] = Object.freeze(["B8", "C4"]);
