/**
 * Props are read by CALLING, and the type says so.
 *
 * The rule is checkable only in the type channel: both of its falsification
 * procedures are "MUST be a type error", and a type error is invisible to every
 * other oracle here, all of which compile a fixture and run it.
 *
 * `attribute-types.test.ts` typechecks this whole directory and asserts BOTH
 * directions — the positives compile, and every `@ts-expect-error` still FIRES.
 * The second half is the one that matters here: a rule whose content is "this
 * does not typecheck" is worth nothing if the expectation silently stops being
 * an error.
 */

import type { JSX } from "../jsx-runtime.ts";
import type { Block, Cell, Scope } from "@barqjs/core";

// The three carriers, in the shapes the rules declare them.
declare const cellOfString: Cell<string>;
declare const blockValue: Block<JSX.Element>;
declare const scopeValue: Scope;

/** A component's props, as the compiler hands them over. */
interface Props {
  label: Cell<string>;
  count: Cell<number>;
  children: Block<JSX.Element>;
}

declare const props: Props;

/** C4's rule: a Cell is CALLED. One rule across props, context, rows and slots. */
export function ReadByCalling(): string {
  const label: string = props.label();
  const count: number = props.count();
  return `${label}:${count}`;
}

/**
 * C4's first falsification procedure: `props.x` in VALUE position, where
 * `x: string`, must be a type error rather than a silent `() => string`.
 *
 * This is the whole argument against a compiler rewrite of `props.x` to
 * `props.x()`: a transform is legitimate only when the untransformed code has
 * the same semantics, and here it does not — the untransformed read yields a
 * FUNCTION, and every consumer that stringifies it gets `"() => …"` rather than
 * the value. The type is what stops it at the source.
 */
export function ValuePositionIsRefused(): void {
  // @ts-expect-error a Cell is not its value: `props.label` is `() => string`
  const bad: string = props.label;
  void bad;
}

/**
 * C4's second, inverted by ambient ownership: `props.children()` is now the
 * CORRECT spelling, and a scope in the argument list is the type error.
 *
 * A Block takes only what its construct hands it — a row's item and index, a
 * fallback's error and reset — and every one of those is a Cell. Ownership is
 * established by the runtime before the body is invoked, so there is no scope
 * to supply and nothing left for an entry guard to catch.
 */
export function ABlockTakesOnlyItsConstructsArguments(): void {
  const built: JSX.Element = props.children();
  void built;

  // @ts-expect-error a Block's arguments are Cells, and a Scope is not one
  const wrong: JSX.Element = props.children(scopeValue);
  void wrong;
}

/**
 * `Slot<T>`'s reconciliation, which is why the type is stated at all: a slot
 * whose declared type is renderable accepts a Block OR a Cell, and every other
 * slot accepts a Cell only. A Block landing in a non-renderable slot is a type
 * error in value position — C3.8's rule, seen from the type side rather than
 * from the throw.
 */
export function ABlockIsNotACellOfString(): void {
  const fine: Cell<string> = cellOfString;
  void fine;

  // @ts-expect-error a Block is not a `Cell<string>`: it demands a Scope
  const wrong: Cell<string> = blockValue;
  void wrong;
}
