/**
 * The address channel's declared REACH — `SEMANTICS.md` §14.2's H5 row.
 *
 * Stated here rather than inside `addresses.test.ts` so that `semantics.test.ts`
 * can compute what the whole oracle covers without importing a suite. A rule
 * leaves this list only when the check that can report it is deleted, which is
 * the same contract `ownership.ts`'s `CHANNEL_RULES` states for L2b.
 */
export const ADDRESS_CHANNEL_RULES: readonly string[] = Object.freeze(["H5"])
