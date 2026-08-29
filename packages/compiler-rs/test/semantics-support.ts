/**
 * Layer L1 of the oracle: absolute expectations, taken from `SEMANTICS.md`.
 *
 * The differential harness (`oracle.test.ts`) cannot see any of the rules
 * pinned through this channel. It asks "do the compiled path and the
 * `createElement` path agree", and for the Provider defect they agree
 * perfectly — both render a blank page. The oracle certified the bug. So this
 * channel asks a different question: **does the observed behaviour match what
 * `SEMANTICS.md` says it must be**, with no second implementation involved.
 *
 * A fixture here is a real, compilable module with two exports:
 *
 * ```ts
 * export const rules: string[]      // rule IDs from SEMANTICS.md this fixture pins
 * export const claims: Claim[]      // one falsification procedure each
 * ```
 *
 * Every claim carries the rule it is about, so a violation is reported as
 * `O2 violated — …` rather than as a DOM diff. The known-failure registry
 * (`known-failures.ts`) then asserts that each expected failure fails *for that
 * rule*, which is what makes the M0 gate mean anything.
 *
 * The compiled path is the only one this channel runs. `CODESIGN.md` §11
 * records the decision that the compiler is a hard dependency and that there is
 * no un-compiled authoring path, so the compiled module is the artefact the
 * rules are about.
 */

export interface Thrown {
  readonly name: string;
  readonly message: string;
}

/**
 * What a claim is handed. Deliberately small: a claim drives the runtime
 * itself, because the constructs under test (`render`'s disposer, a boundary's
 * fallback, `@barqjs/testing`'s wrapper) each mount in a different way and a
 * single `mount()` helper would have to pick one of them.
 */
export interface Kit {
  /** A fresh container, attached to `document.body`, torn down by the runner. */
  container(): HTMLElement;
  /**
   * Run `body` and then settle the scheduler, collecting everything either of
   * them throws instead of letting it escape. A construction throw and a throw
   * that surfaces on the flush are both failures the claim wants to *report*,
   * not failures of the claim.
   *
   * `body` is a BLOCK. M3's `scope` pass rewrites any function containing JSX
   * in value position to take the scope as its first parameter, and a claim's
   * mount helper is one of those, so the runner has to hand it a scope value.
   * It hands `null` — the same value the compiler emits for a module-level
   * root (`const _s$ = null`), which is the position a claim body occupies.
   * `undefined` would be a MISSING argument and `ScopeMissingError` is the
   * correct answer to that, so passing nothing would test the harness rather
   * than the rule.
   */
  attempt(body: (scope: null) => void | Promise<void>): Promise<Thrown[]>;
  /** Flush render effects, user effects and one further microtask turn. */
  settle(): Promise<void>;
  /**
   * The emitted module for this fixture, with every string literal, template
   * literal, regex literal and comment blanked to spaces of the same length.
   * A claim that searches the emitted text for `children: Child({})` would
   * otherwise match the sentence it is about to print.
   */
  readonly emitted: string;
  /** Report the claim's rule as violated. Never returns. */
  fail(observed: string): never;
  /**
   * A positive observation that the construct under test RAN, asserted before
   * anything is concluded from what it did.
   *
   * Without one, "the bug is present" and "the fixture stopped exercising the
   * bug" are the same outcome. Gutting the gate fixture to
   * `function Direct() { return <div /> }` left three of its four claims still
   * "failing as registered", because a claim that observes an absence is
   * satisfied by an absence for any reason at all. A failed precondition
   * CRASHES rather than reporting a violation, so §15.2's third assertion
   * catches it as a wrong reason.
   */
  precondition(ok: boolean, observed: string): void;
}

/**
 * Thrown by `kit.precondition`. Deliberately NOT a `SemanticViolation`: the
 * runner records it as a crash, and a crash is never evidence about a rule.
 */
export class PreconditionFailed extends Error {
  constructor(observed: string) {
    super(`precondition not met: ${observed}`);
    this.name = "PreconditionFailed";
  }
}

export interface Claim {
  /** Stable within the fixture; the registry addresses rows by it. */
  readonly id: string;
  /** The rule ID from `SEMANTICS.md` this claim is a falsification procedure for. */
  readonly rule: string;
  /** What the rule requires, in one line, phrased as the thing that must be true. */
  readonly says: string;
  check(kit: Kit): void | Promise<void>;
}

export class SemanticViolation extends Error {
  constructor(
    readonly rule: string,
    readonly observed: string,
  ) {
    super(`${rule} violated: ${observed}`);
    this.name = "SemanticViolation";
  }
}

export function describeThrown(error: unknown): Thrown {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "non-Error", message: String(error) };
}

export function formatThrown(errors: readonly Thrown[]): string {
  if (errors.length === 0) return "nothing thrown";
  return errors.map((e) => `${e.name}: ${e.message}`).join(" | ");
}
