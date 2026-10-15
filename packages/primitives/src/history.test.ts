import { describe, expect, test } from "bun:test";
import { flush, createRoot, createSignal } from "@barqjs/core";
import { history } from "./history.ts";

describe("history", () => {
  test("undoes and redoes through the signal it wraps", () => {
    const source = createSignal("a");
    const [text, setText] = source;
    const [dispose, edits] = createRoot((d) => [d, history(source)] as const);
    expect(edits.canUndo()).toBe(false);

    setText("b");
    flush();
    setText("c");
    flush();
    expect(edits.canUndo()).toBe(true);

    edits.undo();
    flush();
    expect(text()).toBe("b");
    edits.undo();
    flush();
    expect(text()).toBe("a");
    expect(edits.canUndo()).toBe(false);

    edits.redo();
    flush();
    expect(text()).toBe("b");
    edits.redo();
    flush();
    expect(text()).toBe("c");
    expect(edits.canRedo()).toBe(false);
    dispose();
  });

  test("records a change made in the same tick as the undo", () => {
    const source = createSignal(0);
    const [value, setValue] = source;
    const [dispose, edits] = createRoot((d) => [d, history(source)] as const);
    setValue(1);
    // No flush: the recording effect has not run yet.
    edits.undo();
    flush();
    expect(value()).toBe(0);
    dispose();
  });

  test("a new change drops the redo stack", () => {
    const source = createSignal(0);
    const [, setValue] = source;
    const [dispose, edits] = createRoot((d) => [d, history(source)] as const);
    setValue(1);
    flush();
    edits.undo();
    flush();
    expect(edits.canRedo()).toBe(true);
    setValue(9);
    flush();
    expect(edits.canRedo()).toBe(false);
    expect(edits.future()).toEqual([]);
    dispose();
  });

  test("honours the limit", () => {
    const source = createSignal(0);
    const [value, setValue] = source;
    const [dispose, edits] = createRoot((d) => [d, history(source, { limit: 2 })] as const);
    for (let i = 1; i <= 5; i++) {
      setValue(i);
      flush();
    }
    expect(edits.past()).toEqual([3, 4]);
    edits.undo();
    flush();
    edits.undo();
    flush();
    expect(value()).toBe(3);
    expect(edits.canUndo()).toBe(false);
    dispose();
  });

  test("silently keeps a change out of the record", () => {
    const source = createSignal(0);
    const [value, setValue] = source;
    const [dispose, edits] = createRoot((d) => [d, history(source)] as const);
    edits.silently(() => setValue(7));
    flush();
    expect(value()).toBe(7);
    expect(edits.canUndo()).toBe(false);

    setValue(8);
    flush();
    edits.undo();
    flush();
    expect(value()).toBe(7);
    dispose();
  });

  test("silently holds even when the caller flushes inside it", () => {
    const source = createSignal(0);
    const [, setValue] = source;
    const [dispose, edits] = createRoot((d) => [d, history(source)] as const);
    edits.silently(() => {
      setValue(7);
      flush();
    });
    expect(edits.canUndo()).toBe(false);
    dispose();
  });

  test("clear forgets both stacks", () => {
    const source = createSignal(0);
    const [, setValue] = source;
    const [dispose, edits] = createRoot((d) => [d, history(source)] as const);
    setValue(1);
    flush();
    edits.clear();
    flush();
    expect(edits.canUndo()).toBe(false);
    expect(edits.canRedo()).toBe(false);
    dispose();
  });

  test("undo and redo on an empty stack do nothing", () => {
    const source = createSignal(0);
    const [value] = source;
    const [dispose, edits] = createRoot((d) => [d, history(source)] as const);
    edits.undo();
    flush();
    edits.redo();
    flush();
    expect(value()).toBe(0);
    dispose();
  });
});
