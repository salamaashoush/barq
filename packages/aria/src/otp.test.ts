import { afterEach, describe, expect, test } from "bun:test";
import { createRoot, createSignal, flush } from "@barqjs/core";

import {
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
  otpField,
  otpSelection,
  type OtpField,
  type OtpFieldOptions,
} from "./otp.ts";

describe("the exported patterns", () => {
  test("each tests a whole value, which is what `pattern` on an input means", () => {
    expect(new RegExp(REGEXP_ONLY_DIGITS).test("123")).toBe(true);
    expect(new RegExp(REGEXP_ONLY_DIGITS).test("12a")).toBe(false);
    expect(new RegExp(REGEXP_ONLY_CHARS).test("abC")).toBe(true);
    expect(new RegExp(REGEXP_ONLY_CHARS).test("ab1")).toBe(false);
    expect(new RegExp(REGEXP_ONLY_DIGITS_AND_CHARS).test("a1B2")).toBe(true);
    expect(new RegExp(REGEXP_ONLY_DIGITS_AND_CHARS).test("a-1")).toBe(false);
  });
});

describe("otpSelection", () => {
  const none = { start: null, end: null } as const;

  test("an empty field keeps its caret", () => {
    expect(
      otpSelection({ value: "", maxLength: 6, start: 0, end: 0, previous: none }),
    ).toMatchObject({ start: 0, end: 0 });
  });

  test("a caret at the end of a partial value is where the next character goes", () => {
    expect(
      otpSelection({ value: "12", maxLength: 6, start: 2, end: 2, previous: none }),
    ).toMatchObject({ start: 2, end: 2 });
  });

  test("a caret at the start selects the first character, so typing replaces it", () => {
    expect(otpSelection({ value: "123", maxLength: 6, start: 0, end: 0, previous: none })).toEqual({
      start: 0,
      end: 1,
      direction: "forward",
    });
  });

  test("a caret past a full value selects the last character", () => {
    expect(
      otpSelection({ value: "123456", maxLength: 6, start: 6, end: 6, previous: none }),
    ).toEqual({ start: 5, end: 6, direction: "backward" });
  });

  test("a caret in the middle selects the character after it", () => {
    expect(
      otpSelection({ value: "1234", maxLength: 6, start: 2, end: 2, previous: none }),
    ).toMatchObject({ start: 2, end: 3 });
  });

  test("moving left from a selected character selects the one before it", () => {
    // ArrowLeft collapses [2, 3] to a caret at 2, and the character the person
    // was heading for is the one at 1.
    expect(
      otpSelection({
        value: "1234",
        maxLength: 6,
        start: 2,
        end: 2,
        previous: { start: 2, end: 3 },
      }),
    ).toEqual({ start: 1, end: 2, direction: "backward" });
  });

  test("moving left out of the insert position selects the last character", () => {
    expect(
      otpSelection({
        value: "1234",
        maxLength: 6,
        start: 3,
        end: 3,
        previous: { start: 4, end: 4 },
      }),
    ).toEqual({ start: 3, end: 4, direction: "backward" });
  });

  test("a range the person made is left alone", () => {
    expect(
      otpSelection({ value: "1234", maxLength: 6, start: 1, end: 3, previous: none }),
    ).toMatchObject({ start: 1, end: 3 });
  });
});

interface Mounted {
  field: OtpField;
  input: HTMLInputElement;
  container: HTMLElement;
  dispose: () => void;
}

const mountedFields: Mounted[] = [];

afterEach(() => {
  for (const each of mountedFields.splice(0)) {
    each.dispose();
    each.container.remove();
  }
});

/** The field on a real input, wired the way a component wires it. */
function mount(options: Partial<OtpFieldOptions> = {}): Mounted {
  const container = document.createElement("div");
  const input = document.createElement("input");
  container.append(input);
  document.body.append(container);

  let field!: OtpField;
  const dispose = createRoot((done) => {
    field = otpField(
      { maxLength: 6, ...options },
      () => input,
      () => container,
    );
    return done;
  });
  input.value = field.value();
  input.addEventListener("input", (event) => field.inputProps.onInput(event));
  input.addEventListener("paste", (event) => field.inputProps.onPaste(event));
  input.addEventListener("focus", () => field.inputProps.onFocus());
  input.addEventListener("blur", () => field.inputProps.onBlur());
  const made = { field, input, container, dispose };
  mountedFields.push(made);
  return made;
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}

function pasteInto(input: HTMLInputElement, text: string): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  input.dispatchEvent(event);
  flush();
  return event;
}

describe("otpField", () => {
  test("a value is cut to maxLength", () => {
    const { field, input } = mount();
    typeInto(input, "1234567890");
    expect(field.value()).toBe("123456");
    expect(input.value).toBe("123456");
  });

  test("a change the pattern refuses does not arrive, and the field keeps what it had", () => {
    const seen: string[] = [];
    const { field, input } = mount({
      pattern: REGEXP_ONLY_DIGITS,
      onChange: (value) => seen.push(value),
    });
    typeInto(input, "12");
    typeInto(input, "12a");
    expect(field.value()).toBe("12");
    expect(input.value).toBe("12");
    expect(seen).toEqual(["12"]);
  });

  test("a RegExp is accepted as the pattern too", () => {
    const { field, input } = mount({ pattern: /^[a-f0-9]+$/ });
    typeInto(input, "c0ffee");
    expect(field.value()).toBe("c0ffee");
    typeInto(input, "c0ffeg");
    expect(field.value()).toBe("c0ffee");
  });

  test("emptying the field is never refused", () => {
    const { field, input } = mount({ pattern: REGEXP_ONLY_DIGITS });
    typeInto(input, "1");
    typeInto(input, "");
    expect(field.value()).toBe("");
  });

  test("sanitize runs before the pattern, so separators can be dropped rather than refused", () => {
    const { field, input } = mount({
      pattern: REGEXP_ONLY_DIGITS,
      sanitize: (raw) => raw.replaceAll("-", ""),
    });
    typeInto(input, "12-34");
    expect(field.value()).toBe("1234");
    expect(input.value).toBe("1234");
  });

  test("onComplete fires when the value becomes full, and not again while it stays full", () => {
    const done: string[] = [];
    const { input } = mount({ onComplete: (value) => done.push(value) });
    typeInto(input, "12345");
    expect(done).toEqual([]);
    typeInto(input, "123456");
    expect(done).toEqual(["123456"]);
    typeInto(input, "123457");
    expect(done).toEqual(["123456"]);
    typeInto(input, "12345");
    typeInto(input, "123459");
    expect(done).toEqual(["123456", "123459"]);
  });

  test("a controlled value that becomes full completes as well", () => {
    const done: string[] = [];
    const [value, setValue] = createSignal("12");
    mount({ value, onComplete: (next) => done.push(next) });
    flush();
    setValue("123456");
    flush();
    expect(done).toEqual(["123456"]);
  });

  test("a full initial value is not a completion", () => {
    const done: string[] = [];
    mount({ defaultValue: "123456", onComplete: (value) => done.push(value) });
    flush();
    expect(done).toEqual([]);
  });

  test("a paste goes through the transformer before it is judged", () => {
    const seen: string[] = [];
    const { field, input } = mount({
      pattern: REGEXP_ONLY_DIGITS,
      pasteTransformer: (text) => text.replaceAll("-", ""),
      onChange: (value) => seen.push(value),
    });
    input.focus();
    const event = pasteInto(input, "12-34-56");
    expect(event.defaultPrevented).toBe(true);
    expect(field.value()).toBe("123456");
    expect(input.value).toBe("123456");
    expect(seen).toEqual(["123456"]);
  });

  test("a transformed paste the pattern still refuses changes nothing", () => {
    const { field, input } = mount({
      pattern: REGEXP_ONLY_DIGITS,
      pasteTransformer: (text) => text.trim(),
    });
    input.focus();
    pasteInto(input, " 12ab ");
    expect(field.value()).toBe("");
  });

  test("a paste replaces the selection it lands on", () => {
    const { field, input } = mount({ pasteTransformer: (text) => text });
    input.focus();
    typeInto(input, "1234");
    input.setSelectionRange(1, 3);
    pasteInto(input, "99");
    expect(field.value()).toBe("1994");
  });

  test("without a transformer the paste is the browser's, and arrives as input", () => {
    const { input } = mount();
    input.focus();
    const event = pasteInto(input, "123456");
    expect(event.defaultPrevented).toBe(false);
  });

  test("each slot says its character, and the active one where the caret is", () => {
    const { field, input } = mount();
    input.focus();
    flush();
    expect(field.slots()).toHaveLength(6);
    expect(field.slots()[0]).toEqual({
      char: null,
      placeholderChar: null,
      isActive: true,
      hasFakeCaret: true,
    });
    typeInto(input, "12");
    expect(field.slots()[0]).toMatchObject({ char: "1", isActive: false, hasFakeCaret: false });
    expect(field.slots()[2]).toMatchObject({ char: null, isActive: true, hasFakeCaret: true });
  });

  test("a full field holds its last character selected, so typing replaces it", () => {
    const { field, input } = mount();
    input.focus();
    typeInto(input, "123456");
    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(6);
    expect(field.slots()[5]).toMatchObject({ char: "6", isActive: true, hasFakeCaret: false });
  });

  test("nothing is active once focus leaves", () => {
    const { field, input } = mount();
    input.focus();
    flush();
    input.blur();
    flush();
    expect(field.isFocused()).toBe(false);
    expect(field.slots().some((slot) => slot.isActive)).toBe(false);
  });

  test("the placeholder is drawn slot by slot, and only while the field is empty", () => {
    const { field, input } = mount({ placeholder: "000000" });
    expect(field.slots()[3]?.placeholderChar).toBe("0");
    typeInto(input, "1");
    expect(field.slots()[3]?.placeholderChar).toBeNull();
  });

  test("a password manager's badge is pushed past the last slot once the field is focused", async () => {
    const { field, input } = mount();
    expect(field.willPushPasswordManagerBadge()).toBe(false);
    const badge = document.createElement("div");
    badge.setAttribute("data-lastpass-icon-root", "");
    document.body.append(badge);
    input.focus();
    flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    flush();
    expect(field.willPushPasswordManagerBadge()).toBe(true);
    badge.remove();
  });

  test("the strategy `none` leaves the badge where the manager put it", async () => {
    const { field, input } = mount({ pushPasswordManagerStrategy: "none" });
    const badge = document.createElement("div");
    badge.setAttribute("data-lastpass-icon-root", "");
    document.body.append(badge);
    input.focus();
    flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    flush();
    expect(field.willPushPasswordManagerBadge()).toBe(false);
    badge.remove();
  });
});
