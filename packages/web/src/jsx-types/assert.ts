/** Type-level equality, for a test that has to state what was inferred. */
export type Equal<A, B> =
  (<G>() => G extends (A & G) | G ? 1 : 2) extends <G>() => G extends (B & G) | G ? 1 : 2
    ? true
    : false;

/**
 * The call is the assertion: it compiles only when `T` is exactly `true`.
 * Nothing here is run, so the body only has to typecheck.
 */
export function assertType<T extends true>(proof?: T): T | undefined {
  return proof;
}
