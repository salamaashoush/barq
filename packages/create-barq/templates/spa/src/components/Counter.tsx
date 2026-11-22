import { createSignal } from "@barqjs/core";

import { button } from "../styles.ts";

/**
 * `{count()}` is a tracked read, not a snapshot: only that text node updates
 * when the signal changes, and `Counter` does not run again.
 */
export function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <button type="button" class={button} onClick={() => setCount((n) => n + 1)}>
      clicked {count()} times
    </button>
  );
}
