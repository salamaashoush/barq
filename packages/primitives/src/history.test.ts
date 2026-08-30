import { describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
import { history } from "./history.ts";

describe("history", () => {
  test("undoes and redoes through the signal it wraps", () => {
    const text = signal("a");
    const dispose = root((d) => {
      const edits = history(text);
      expect(edits.canUndo()).toBe(false);

      text.set("b");
      flush();
      text.set("c");
      flush();
      expect(edits.canUndo()).toBe(true);

      edits.undo();
      expect(text()).toBe("b");
      edits.undo();
      expect(text()).toBe("a");
      expect(edits.canUndo()).toBe(false);

      edits.redo();
      expect(text()).toBe("b");
      edits.redo();
      expect(text()).toBe("c");
      expect(edits.canRedo()).toBe(false);
      return d;
    });
    dispose();
  });

  test("records a change made in the same tick as the undo", () => {
    const value = signal(0);
    const dispose = root((d) => {
      const edits = history(value);
      value.set(1);
      // No flush: the recording effect has not run yet.
      edits.undo();
      expect(value()).toBe(0);
      return d;
    });
    dispose();
  });

  test("a new change drops the redo stack", () => {
    const value = signal(0);
    const dispose = root((d) => {
      const edits = history(value);
      value.set(1);
      flush();
      edits.undo();
      expect(edits.canRedo()).toBe(true);
      value.set(9);
      flush();
      expect(edits.canRedo()).toBe(false);
      expect(edits.future()).toEqual([]);
      return d;
    });
    dispose();
  });

  test("honours the limit", () => {
    const value = signal(0);
    const dispose = root((d) => {
      const edits = history(value, { limit: 2 });
      for (let i = 1; i <= 5; i++) {
        value.set(i);
        flush();
      }
      expect(edits.past()).toEqual([3, 4]);
      edits.undo();
      edits.undo();
      expect(value()).toBe(3);
      expect(edits.canUndo()).toBe(false);
      return d;
    });
    dispose();
  });

  test("silently keeps a change out of the record", () => {
    const value = signal(0);
    const dispose = root((d) => {
      const edits = history(value);
      edits.silently(() => value.set(7));
      flush();
      expect(value()).toBe(7);
      expect(edits.canUndo()).toBe(false);

      value.set(8);
      flush();
      edits.undo();
      expect(value()).toBe(7);
      return d;
    });
    dispose();
  });

  test("silently holds even when the caller flushes inside it", () => {
    const value = signal(0);
    const dispose = root((d) => {
      const edits = history(value);
      edits.silently(() => {
        value.set(7);
        flush();
      });
      expect(edits.canUndo()).toBe(false);
      return d;
    });
    dispose();
  });

  test("clear forgets both stacks", () => {
    const value = signal(0);
    const dispose = root((d) => {
      const edits = history(value);
      value.set(1);
      flush();
      edits.clear();
      expect(edits.canUndo()).toBe(false);
      expect(edits.canRedo()).toBe(false);
      return d;
    });
    dispose();
  });

  test("undo and redo on an empty stack do nothing", () => {
    const value = signal(0);
    const dispose = root((d) => {
      const edits = history(value);
      edits.undo();
      edits.redo();
      expect(value()).toBe(0);
      return d;
    });
    dispose();
  });
});
