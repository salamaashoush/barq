import { expect, test } from "bun:test";

import {
  bindEffect,
  createMemo,
  createSignal,
  flush,
  getOwner,
  peekNextChildId,
  rootScope,
  runWithOwner,
} from "./index.ts";
import { disposeScope } from "./signals.ts";

test("a binding takes no place in the engine's numbering and allocates no id", () => {
  const root = rootScope();
  const [count, setCount] = createSignal(1);
  try {
    const seen: number[] = [];
    runWithOwner(root, () => {
      const before = peekNextChildId(root);
      bindEffect(
        () => count(),
        (value) => {
          seen.push(value);
        },
      );
      expect(peekNextChildId(root)).toBe(before);

      let memoId: string | undefined;
      createMemo(() => {
        memoId = (getOwner() as { id?: string } | null)?.id;
        return count();
      });
      expect(memoId).toBe(before);
    });
    setCount(2);
    flush();
    expect(seen).toEqual([1, 2]);
  } finally {
    disposeScope(root);
  }
});
