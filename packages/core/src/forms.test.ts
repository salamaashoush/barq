import { describe, expect, test } from "bun:test";

import { captureCaret, coerceLive, holdsLive, restoreCaret, writeLive } from "./forms.ts";

/**
 * CODESIGN §3.10's two halves at the level of the function, beside the L1
 * fixtures that drive them through a compiled module. Both are kept: the
 * fixtures say what the CHANNEL does, and these say what the arithmetic does
 * on the cases a fixture would need a whole component to reach.
 */

function attach(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as T;
}

describe("coerceLive — the value the DOM would hold", () => {
  test("value is a DOMString and nullish is the empty one, not `null`", () => {
    expect(coerceLive("value", null)).toBe("");
    expect(coerceLive("value", undefined)).toBe("");
    expect(coerceLive("value", 7)).toBe("7");
    expect(coerceLive("value", "x")).toBe("x");
  });

  test("the boolean properties are booleans, whatever arrived", () => {
    expect(coerceLive("checked", 1)).toBe(true);
    expect(coerceLive("checked", "")).toBe(false);
    expect(coerceLive("open", null)).toBe(false);
    expect(coerceLive("indeterminate", "no")).toBe(true);
  });

  test("the numeric ones are numbers, and nullish is NaN — which is what an empty field reads", () => {
    expect(coerceLive("valueAsNumber", "3")).toBe(3);
    expect(Number.isNaN(coerceLive("valueAsNumber", null) as number)).toBe(true);
    expect(coerceLive("scrollTop", "12")).toBe(12);
  });

  test("a name the set does not cover is passed through untouched", () => {
    const files = { length: 0 };
    expect(coerceLive("files", files)).toBe(files);
  });
});

describe("holdsLive — the compare against the element", () => {
  test("NaN equals itself, or an empty number field is cleared on every run", () => {
    const input = attach<HTMLInputElement>(`<input type="number">`);
    expect(Number.isNaN(input.valueAsNumber)).toBe(true);
    expect(holdsLive(input, "valueAsNumber", Number.NaN)).toBe(true);
    expect(holdsLive(input, "valueAsNumber", 3)).toBe(false);
  });

  test("two Dates are compared by their time, not by identity", () => {
    const el = attach<HTMLInputElement>(`<input type="date">`) as unknown as Element &
      Record<string, unknown>;
    el.valueAsDate = new Date(0);
    expect(holdsLive(el, "valueAsDate", new Date(0))).toBe(true);
    expect(holdsLive(el, "valueAsDate", new Date(1000))).toBe(false);
  });

  test("everything else is identity", () => {
    const input = attach<HTMLInputElement>(`<input type="text" value="a">`);
    expect(holdsLive(input, "value", "a")).toBe(true);
    expect(holdsLive(input, "value", "b")).toBe(false);
  });
});

describe("writeLive — the write, and the write that does not happen", () => {
  test("reports whether it wrote, and does not write what is already there", () => {
    const input = attach<HTMLInputElement>(`<input type="text" value="a">`);
    expect(writeLive(input, "value", "a")).toBe(false);
    expect(writeLive(input, "value", "b")).toBe(true);
    expect(input.value).toBe("b");
    // Through the coercion: the element holds the DOMString "7" already.
    expect(writeLive(input, "value", 7)).toBe(true);
    expect(writeLive(input, "value", "7")).toBe(false);
  });

  test("a write that lands on a focused control restores the range and the direction", () => {
    const input = attach<HTMLInputElement>(`<input type="text" value="hello world">`);
    input.focus();
    input.setSelectionRange(2, 7, "backward");
    writeLive(input, "value", "hello there world");
    expect(input.value).toBe("hello there world");
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
    expect(input.selectionDirection).toBe("backward");
    expect(document.activeElement).toBe(input);
  });

  test("and clamps the restore to the text that is now there", () => {
    const input = attach<HTMLInputElement>(`<input type="text" value="hello world">`);
    input.focus();
    input.setSelectionRange(6, 11);
    writeLive(input, "value", "hi");
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
  });

  test("an UNFOCUSED control is not touched — the caret work is only for the field the user is in", () => {
    const input = attach<HTMLInputElement>(`<input type="text" value="hello">`);
    const other = attach<HTMLInputElement>(`<input type="text">`);
    other.focus();
    expect(captureCaret(input)).toBeNull();
    writeLive(input, "value", "goodbye");
    expect(document.activeElement).toBe(other);
  });

  test("a type with no selection API is written without one", () => {
    // `setSelectionRange` throws InvalidStateError on these, so the membership
    // test has to be the guard rather than a try/catch around the write.
    const input = attach<HTMLInputElement>(`<input type="number">`);
    input.focus();
    expect(() => writeLive(input, "valueAsNumber", 42)).not.toThrow();
    expect(input.valueAsNumber).toBe(42);
  });

  test("a contenteditable caret is saved by offset and survives its text node being replaced", () => {
    const editor = attach<HTMLElement>(`<div contenteditable="true">editable text</div>`);
    const first = editor.firstChild!;
    editor.focus();
    const range = document.createRange();
    range.setStart(first, 4);
    range.setEnd(first, 9);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    writeLive(editor, "textContent", "editable words here");

    expect(editor.textContent).toBe("editable words here");
    const after = window.getSelection()!.getRangeAt(0);
    expect([after.startOffset, after.endOffset]).toEqual([4, 9]);
    expect(editor.contains(after.startContainer)).toBe(true);
  });

  test("the offset walk crosses element children, and a caret placed on the ELEMENT counts the text before it", () => {
    const editor = attach<HTMLElement>(`<div contenteditable="true">one <b>two</b> three</div>`);
    editor.focus();
    const selection = window.getSelection()!;
    const range = document.createRange();
    // Inside the <b>, which is 4 characters into the element's text.
    const bold = editor.querySelector("b")!.firstChild!;
    range.setStart(bold, 1);
    range.setEnd(bold, 3);
    selection.removeAllRanges();
    selection.addRange(range);
    const saved = captureCaret(editor);
    expect(saved).not.toBeNull();

    // The write flattens the whole subtree into one text node, which is the
    // case the offset — rather than the node — exists for.
    writeLive(editor, "textContent", "one XYZ three");
    const after = window.getSelection()!.getRangeAt(0);
    expect([after.startOffset, after.endOffset]).toEqual([5, 7]);

    // And a caret anchored on the ELEMENT rather than on a text node.
    const onElement = document.createRange();
    onElement.setStart(editor, 1);
    onElement.setEnd(editor, 1);
    selection.removeAllRanges();
    selection.addRange(onElement);
    expect(captureCaret(editor)).not.toBeNull();
  });

  test("a caret past the end of the new text is placed at the end rather than nowhere", () => {
    const editor = attach<HTMLElement>(`<div contenteditable="true">a long piece of text</div>`);
    editor.focus();
    const range = document.createRange();
    range.setStart(editor.firstChild!, 18);
    range.setEnd(editor.firstChild!, 20);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    writeLive(editor, "textContent", "short");
    const after = window.getSelection()!.getRangeAt(0);
    expect(after.startOffset).toBe(5);
    expect(after.endOffset).toBe(5);
  });

  test("restoreCaret with nothing saved is a no-op rather than a throw", () => {
    const input = attach<HTMLInputElement>(`<input type="text">`);
    expect(() => restoreCaret(input, null)).not.toThrow();
  });
});
