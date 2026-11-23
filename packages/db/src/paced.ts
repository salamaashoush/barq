import { type PacedMutationsConfig, type Transaction, createPacedMutations } from "@tanstack/db";

/**
 * Optimistic mutations whose persistence a strategy paces: `debounceStrategy`,
 * `throttleStrategy` or `queueStrategy`. `onMutate` applies each call at once;
 * `mutationFn` persists the merged transaction when the strategy says so.
 *
 * A barq component runs once, so the returned function is stable for its
 * life without the callback refs React's hook needs.
 */
export function usePacedMutations<TVariables = unknown, T extends object = Record<string, unknown>>(
  config: PacedMutationsConfig<TVariables, T>,
): (variables: TVariables) => Transaction<T> {
  return createPacedMutations<TVariables, T>(config);
}
