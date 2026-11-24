import { type Accessor, createSignal, onCleanup } from "@barqjs/core";

/**
 * A signal Lexical's listeners write: they run synchronously wherever an
 * update commits, outside any scope or inside a ref, so it is declared as one
 * an owned scope may write.
 */
export function editorSignal<T>(initial: T): [Accessor<T>, (next: T) => void] {
  const [value, setValue] = createSignal<T>(initial as Exclude<T, Function>, { ownedWrite: true });
  return [value, (next) => setValue(() => next)];
}

/** Runs `register` for the owner this is called under, and undoes it with it. */
export function useRegistration(register: () => () => void): void {
  onCleanup(register());
}
