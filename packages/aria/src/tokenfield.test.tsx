import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { accessibleName, render, screen, tick, user } from "@barqjs/testing";
import { Autocomplete } from "./autocomplete.tsx";
import { isMac } from "./platform.ts";
import {
  getTokenFieldSelectedRange,
  SelectedRange,
  setTokenFieldSelection,
  Token,
  TokenDirection,
  TokenField,
  type TokenFieldComponentProps,
  type TokenFieldSegment,
  TokenFieldValue,
  tokenFieldPositionToDOMRange,
  TokenInput,
} from "./tokenfield.tsx";

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const words = new Intl.Segmenter("en", { granularity: "word" });

function valueOf(...segments: TokenFieldSegment[]): TokenFieldValue {
  return new TokenFieldValue(segments);
}

const text = (value: string): TokenFieldSegment => ({ type: "text", text: value });
const mention = (name: string): TokenFieldSegment => ({ type: "token", text: name, value: name });

describe("TokenFieldValue", () => {
  test("inserting text puts the caret after it", () => {
    const next = valueOf(text("hello")).replaceRange(
      { index: 0, offset: 5 },
      { index: 0, offset: 5 },
      " salama",
    );
    expect(next.toString()).toBe("hello salama");
    expect(next.caretPosition).toEqual({ index: 0, offset: 12 });
  });

  test("a token inserted mid-text splits it, and the caret lands after the token", () => {
    const next = valueOf(text("hi there")).replaceRangeWithSegments(
      { index: 0, offset: 3 },
      { index: 0, offset: 8 },
      [mention("@salama")],
    );
    expect(next.segments).toEqual([text("hi "), mention("@salama")]);
    expect(next.caretPosition).toEqual({ index: 2, offset: 0 });
  });

  test("text typed beside text joins it", () => {
    const start = valueOf(text("ab"), mention("@acme"), text("cd"));
    const next = start.replaceRange({ index: 2, offset: 0 }, { index: 2, offset: 0 }, "x");
    expect(next.segments).toEqual([text("ab"), mention("@acme"), text("xcd")]);
  });

  test("Backspace after a token takes the whole token", () => {
    const start = valueOf(text("ab"), mention("@acme"), text("cd"));
    const next = start.delete({ index: 2, offset: 0 }, graphemes, TokenDirection.Backward);
    expect(next.segments).toEqual([text("abcd")]);
    expect(next.caretPosition).toEqual({ index: 0, offset: 2 });
  });

  test("Delete before a token takes the whole token", () => {
    const start = valueOf(text("ab"), mention("@acme"), text("cd"));
    const next = start.delete({ index: 0, offset: 2 }, graphemes, TokenDirection.Forward);
    expect(next.toString()).toBe("abcd");
  });

  test("an emoji is one grapheme", () => {
    const start = valueOf(text("ok👍🏽"));
    const next = start.delete({ index: 0, offset: 6 }, graphemes, TokenDirection.Backward);
    expect(next.toString()).toBe("ok");
  });

  test("a word is deleted whole, and the space before it is left", () => {
    const start = valueOf(text("hello salama"));
    const next = start.delete({ index: 0, offset: 12 }, words, TokenDirection.Backward);
    expect(next.toString()).toBe("hello ");
  });

  test("deleting to the line edge stops at a line break", () => {
    // The boundary behind is the break itself, as Home's is, so it goes too.
    expect(
      valueOf(text("hello\nworld"))
        .deleteLine({ index: 0, offset: 11 }, TokenDirection.Backward)
        .toString(),
    ).toBe("hello");
    expect(
      valueOf(text("one\ntwo three"))
        .deleteLine({ index: 0, offset: 7 }, TokenDirection.Forward)
        .toString(),
    ).toBe("one\ntwo");
  });

  test("line boundaries", () => {
    const start = valueOf(text("one\ntwo"), mention("@acme"));
    expect(start.findLineBoundary({ index: 0, offset: 6 }, TokenDirection.Backward)).toEqual({
      index: 0,
      offset: 3,
    });
    expect(start.findLineBoundary({ index: 0, offset: 6 }, TokenDirection.Forward)).toEqual({
      index: 1,
      offset: 5,
    });
  });

  test("a slice keeps the tokens it covers", () => {
    const start = valueOf(text("ab"), mention("@acme"), text("cd"));
    const slice = start.slice({ index: 0, offset: 1 }, { index: 2, offset: 1 });
    expect(slice.segments).toEqual([text("b"), mention("@acme"), text("c")]);
    expect(slice.toString()).toBe("b@acmec");
  });

  test("typing is one undo step until something ends it", () => {
    let value = valueOf(text(""));
    for (const character of "abc") {
      value = value.replaceRange(value.caretPosition, value.caretPosition, character);
    }
    expect(value.toString()).toBe("abc");
    expect(value.undo().toString()).toBe("");

    value.endCoalescing();
    const more = value.replaceRange(value.caretPosition, value.caretPosition, "d");
    expect(more.undo().toString()).toBe("abc");
    expect(more.undo().redo().toString()).toBe("abcd");
  });

  test("a paste is a step of its own", () => {
    const typed = valueOf(text("")).replaceRange(
      { index: 0, offset: 0 },
      { index: 0, offset: 0 },
      "a",
    );
    const pasted = typed.replaceRange(typed.caretPosition, typed.caretPosition, "bc", false);
    expect(pasted.undo().toString()).toBe("a");
  });

  test("a subclass turns typed text into tokens", () => {
    class Mentions extends TokenFieldValue<string> {
      protected override tokenize(typed: string): TokenFieldSegment<string>[] {
        return typed
          .split(/(@\w+ )/)
          .filter((part) => part !== "")
          .map((part) =>
            part.startsWith("@")
              ? { type: "token", text: part.trim(), value: part.trim() }
              : { type: "text", text: part },
          );
      }
    }
    const next = new Mentions([]).replaceRange(
      { index: 0, offset: 0 },
      { index: 0, offset: 0 },
      "hi @salama ok",
    );
    expect(next).toBeInstanceOf(Mentions);
    expect(next.segments.map((segment) => segment.type)).toEqual(["text", "token", "text"]);
  });

  test("a selected range knows its direction", () => {
    const backwards = new SelectedRange({ index: 1, offset: 2 }, { index: 0, offset: 1 });
    expect(backwards.isCollapsed).toBe(false);
    expect(backwards.start).toEqual({ index: 0, offset: 1 });
    expect(backwards.end).toEqual({ index: 1, offset: 2 });
  });
});

function Field(props: Omit<TokenFieldComponentProps, "children">) {
  return (
    <TokenField
      label="Message"
      description="Mention someone with @"
      defaultValue={valueOf(text("hi "), mention("@salama"), text(" there"))}
      data-testid="field"
      {...props}
    >
      <TokenInput data-testid="input">
        {(segment) => <Token data-testid="token">{segment.text}</Token>}
      </TokenInput>
    </TokenField>
  );
}

function input(): HTMLElement {
  return screen.getByTestId("input");
}

function beforeInput(inputType: string, data: string | null = null): InputEvent {
  const event = new InputEvent("beforeinput", {
    inputType,
    data,
    bubbles: true,
    cancelable: true,
  });
  input().dispatchEvent(event);
  flush();
  return event;
}

function caretAt(index: number, offset: number): void {
  input().focus();
  setTokenFieldSelection(input(), new SelectedRange({ index, offset }), true);
  flush();
}

describe("TokenField", () => {
  test("the editable area is a labelled, described text box", () => {
    render(() => <Field />);

    const box = screen.getByRole("textbox");
    expect(box).toBe(input());
    expect(accessibleName(box)).toBe("Message");
    const described = (box.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(described).toBe("Mention someone with @");
    expect(box.getAttribute("contenteditable")).toBe("true");
    expect(box.getAttribute("aria-multiline")).toBe("false");
    expect(box.getAttribute("tabindex")).toBe("0");
  });

  test("aria-label names it when there is no visible label", () => {
    render(() => <Field label={undefined} aria-label="Prompt" />);
    expect(input().getAttribute("aria-label")).toBe("Prompt");
    expect(input().hasAttribute("aria-labelledby")).toBe(false);
  });

  test("a role of search box or combo box", () => {
    render(() => <Field role="combobox" />);
    expect(screen.getByRole("combobox")).toBe(input());
  });

  test("text is drawn as text and each token in its own wrapper, between zero-width spaces", () => {
    render(() => <Field />);

    const nodes = [...input().childNodes];
    expect(nodes).toHaveLength(3);
    expect(nodes[0]?.textContent).toBe("hi ");
    const wrapper = nodes[1] as HTMLElement;
    expect(wrapper.hasAttribute("data-barq-token")).toBe(true);
    expect(wrapper.textContent).toBe("​@salama​");
    expect(nodes[2]?.textContent).toBe(" there");

    const token = screen.getByTestId("token");
    expect(token.getAttribute("contenteditable")).toBe("false");
    expect(token.style.userSelect).toBe("all");
  });

  test("a trailing line break is drawn, and a position before it can be measured", () => {
    render(() => <Field allowsNewlines defaultValue={valueOf(text("hello\n"))} />);

    const br = input().querySelector("br");
    expect(br).not.toBeNull();
    const index = [...input().childNodes].indexOf(br as HTMLBRElement);
    expect(() => tokenFieldPositionToDOMRange(input(), { index, offset: 0 })).not.toThrow();
  });

  test("typing is applied to the value, not left to the browser", () => {
    const seen: string[] = [];
    render(() => <Field onChange={(value) => seen.push(value.toString())} />);

    caretAt(2, 6);
    const event = beforeInput("insertText", "!");

    expect(event.defaultPrevented).toBe(true);
    expect(seen.at(-1)).toBe("hi @salama there!");
    expect(input().textContent).toBe("hi ​@salama​ there!");
  });

  test("the caret is put back after the edit", () => {
    render(() => <Field />);

    caretAt(0, 3);
    beforeInput("insertText", "x");

    expect(getTokenFieldSelectedRange(input())?.current).toEqual({ index: 0, offset: 4 });
  });

  test("Backspace beside a token deletes the token whole", () => {
    let latest = "";
    render(() => <Field onChange={(value) => (latest = value.toString())} />);

    caretAt(2, 0);
    beforeInput("deleteContentBackward");

    expect(latest).toBe("hi  there");
    expect(screen.queryByTestId("token")).toBeNull();
  });

  test("a selection is replaced by what is typed", () => {
    let latest = "";
    render(() => <Field onChange={(value) => (latest = value.toString())} />);

    input().focus();
    setTokenFieldSelection(
      input(),
      new SelectedRange({ index: 0, offset: 0 }, { index: 2, offset: 6 }),
      true,
    );
    flush();
    beforeInput("insertText", "Z");

    expect(latest).toBe("Z");
  });

  test("Enter submits rather than writing a line", () => {
    let submitted = 0;
    let latest = "";
    render(() => (
      <Field onSubmit={() => submitted++} onChange={(value) => (latest = value.toString())} />
    ));

    caretAt(0, 1);
    beforeInput("insertParagraph");

    expect(submitted).toBe(1);
    expect(latest).toBe("hi @salama there");
  });

  test("one line: a line break is refused and a pasted one becomes a space", () => {
    let latest = "";
    render(() => <Field onChange={(value) => (latest = value.toString())} />);

    caretAt(0, 3);
    beforeInput("insertLineBreak");
    expect(latest).toBe("hi @salama there");

    beforeInput("insertFromPaste", "a\nb");
    expect(latest).toBe("hi a b@salama there");
  });

  test("with newlines allowed, Shift+Enter writes one", () => {
    let latest = "";
    render(() => <Field allowsNewlines onChange={(value) => (latest = value.toString())} />);
    expect(input().getAttribute("aria-multiline")).toBe("true");

    caretAt(0, 3);
    beforeInput("insertLineBreak");
    expect(latest).toBe("hi \n@salama there");
  });

  test("undo and redo walk the value's own history", () => {
    let latest = "";
    render(() => <Field onChange={(value) => (latest = value.toString())} />);
    const mod = isMac() ? { metaKey: true } : { ctrlKey: true };

    caretAt(2, 6);
    beforeInput("insertText", "!");
    beforeInput("insertText", "?");
    expect(latest).toBe("hi @salama there!?");

    user.keyDown("z", mod);
    flush();
    expect(latest).toBe("hi @salama there");

    user.keyDown(
      isMac() ? "z" : "y",
      isMac() ? { metaKey: true, shiftKey: true } : { ctrlKey: true },
    );
    flush();
    expect(latest).toBe("hi @salama there!?");
  });

  test("Home and End go to the line's edges", () => {
    render(() => <Field />);

    caretAt(2, 3);
    user.keyDown("Home");
    flush();
    expect(getTokenFieldSelectedRange(input())?.current).toEqual({ index: 0, offset: 0 });

    user.keyDown("End");
    flush();
    expect(getTokenFieldSelectedRange(input())?.current).toEqual({ index: 2, offset: 6 });
  });

  test("copying writes the tokens and the plain text", () => {
    render(() => <Field />);
    input().focus();
    setTokenFieldSelection(
      input(),
      new SelectedRange({ index: 0, offset: 0 }, { index: 2, offset: 0 }),
      true,
    );
    const written = new Map<string, string>();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { setData: (type: string, data: string) => written.set(type, data) },
    });

    input().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(written.get("text/plain")).toBe("hi @salama");
    expect(JSON.parse(written.get("application/vnd.barq.tokens+json") ?? "[]")).toEqual([
      text("hi "),
      mention("@salama"),
    ]);
  });

  test("pasting copied tokens inserts them as tokens", () => {
    let latest: TokenFieldValue | null = null;
    render(() => <Field onChange={(value) => (latest = value)} />);
    caretAt(0, 0);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    const data = JSON.stringify([mention("@acme")]);
    Object.defineProperty(paste, "clipboardData", {
      value: { types: ["application/vnd.barq.tokens+json"], getData: () => data },
    });
    input().dispatchEvent(paste);

    beforeInput("insertFromPaste", "@acme");

    expect((latest as TokenFieldValue | null)?.segments[0]).toEqual(mention("@acme"));
  });

  test("malformed clipboard data is ignored for its plain text", () => {
    let latest = "";
    render(() => <Field onChange={(value) => (latest = value.toString())} />);
    caretAt(0, 0);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { types: ["application/vnd.barq.tokens+json"], getData: () => "{not json" },
    });
    input().dispatchEvent(paste);

    beforeInput("insertFromPaste", "ok ");
    expect(latest.startsWith("ok hi")).toBe(true);
  });

  test("moving the selection is reported in the value", async () => {
    let latest: TokenFieldValue | null = null;
    render(() => <Field onChange={(value) => (latest = value)} />);

    input().focus();
    setTokenFieldSelection(input(), new SelectedRange({ index: 0, offset: 1 }), true);
    document.dispatchEvent(new Event("selectionchange"));
    await tick();
    flush();

    expect((latest as TokenFieldValue | null)?.caretPosition).toEqual({ index: 0, offset: 1 });
  });

  test("a token in the selection says it is selected", async () => {
    render(() => <Field />);

    input().focus();
    setTokenFieldSelection(
      input(),
      new SelectedRange({ index: 0, offset: 0 }, { index: 2, offset: 2 }),
      true,
    );
    document.dispatchEvent(new Event("selectionchange"));
    await tick();
    flush();

    expect(screen.getByTestId("token").hasAttribute("data-selected")).toBe(true);
  });

  test("controlled, it shows what it is given and only that", () => {
    const [value, setValue] = createSignal(valueOf(text("salama")));
    const seen: string[] = [];
    render(() => <Field value={value()} onChange={(next) => seen.push(next.toString())} />);

    caretAt(0, 6);
    beforeInput("insertText", "!");
    expect(seen).toContain("salama!");
    expect(input().textContent).toBe("salama");

    setValue(valueOf(text("acme")));
    flush();
    expect(input().textContent).toBe("acme");
  });

  test("a value set while the field is not focused does not take the selection", () => {
    const [value, setValue] = createSignal(valueOf(text("salama")));
    render(() => (
      <>
        <Field value={value()} />
        <button type="button">Elsewhere</button>
      </>
    ));
    const elsewhere = screen.getByRole("button");
    elsewhere.focus();

    setValue(valueOf(text("acme")).withCaretPosition({ index: 0, offset: 2 }));
    flush();

    expect(document.activeElement).toBe(elsewhere);
  });

  test("read-only: not editable, and says so", () => {
    let changed = 0;
    render(() => <Field isReadOnly onChange={() => changed++} />);

    expect(input().getAttribute("contenteditable")).toBe("false");
    expect(input().getAttribute("aria-readonly")).toBe("true");
    expect(screen.getByTestId("field").hasAttribute("data-readonly")).toBe(true);
    expect(input().getAttribute("tabindex")).toBe("0");
  });

  test("disabled: neither editable nor focusable", () => {
    render(() => <Field isDisabled />);

    expect(input().getAttribute("contenteditable")).toBe("false");
    expect(input().getAttribute("aria-disabled")).toBe("true");
    expect(input().hasAttribute("tabindex")).toBe(false);
    expect(screen.getByTestId("field").hasAttribute("data-disabled")).toBe(true);
    expect(screen.getByTestId("token").hasAttribute("data-disabled")).toBe(true);
  });

  test("clicking the label focuses the field", () => {
    render(() => <Field />);
    user.click(screen.getByText("Message"));
    flush();
    expect(document.activeElement).toBe(input());
  });

  test("focus and hover are data attributes on the editable area", () => {
    render(() => <Field />);

    user.tab();
    expect(document.activeElement).toBe(input());
    expect(input().hasAttribute("data-focused")).toBe(true);
    expect(input().hasAttribute("data-focus-visible")).toBe(true);

    user.hover(input());
    flush();
    expect(input().hasAttribute("data-hovered")).toBe(true);
  });

  test("a value arriving mid-composition ends the composition and is drawn", () => {
    const [value, setValue] = createSignal(valueOf(text("salama")));
    render(() => <Field value={value()} />);
    caretAt(0, 6);

    input().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    flush();
    setValue(valueOf(text("acme")));
    flush();

    expect(input().textContent).toBe("acme");
  });

  test("what the browser writes while composing is undone when it ends", () => {
    render(() => <Field defaultValue={valueOf(text("salama"))} />);
    caretAt(0, 6);

    input().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    flush();
    input().append(document.createTextNode("か"));
    input().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    flush();

    expect(input().textContent).toBe("salama");
  });

  test("inside an autocomplete, the text is its query and a caret move is not", async () => {
    const queries: string[] = [];
    render(() => (
      <Autocomplete onInputChange={(query) => queries.push(query)}>
        <Field />
      </Autocomplete>
    ));
    expect(input().getAttribute("aria-autocomplete")).toBe("list");
    expect(input().getAttribute("autocomplete")).toBe("off");

    caretAt(2, 6);
    beforeInput("insertText", "!");
    expect(queries).toEqual(["hi @salama there!"]);

    setTokenFieldSelection(input(), new SelectedRange({ index: 0, offset: 1 }), true);
    document.dispatchEvent(new Event("selectionchange"));
    await tick();
    flush();
    expect(queries).toEqual(["hi @salama there!"]);
  });
});
