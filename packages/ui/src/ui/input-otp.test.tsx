import { describe, expect, test } from "bun:test";
import { flush, createSignal } from "@barqjs/core";
import { cleanup, render, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
  type InputOTPProps,
} from "./input-otp.tsx";

function Six(props: {
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
}) {
  return (
    <InputOTP
      maxLength={6}
      value={props.value}
      onChange={props.onChange}
      onComplete={props.onComplete}
      isDisabled={props.isDisabled}
      isInvalid={props.isInvalid}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
}

const field = (): HTMLInputElement =>
  document.querySelector('[data-slot="input-otp"]') as HTMLInputElement;
const slots = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="input-otp-slot"]'),
];

/** What the row reads, slot by slot, ignoring the caret. */
function shown(): string {
  return slots()
    .map((each) => (each.firstChild?.nodeType === 3 ? (each.textContent ?? "").trim() : ""))
    .join("");
}

describe("InputOTP", () => {
  test("one real input behind six drawn boxes", () => {
    render(() => <Six />);
    expect(field()).not.toBeNull();
    expect(field().maxLength).toBe(6);
    expect(slots()).toHaveLength(6);
    // The boxes draw; the field is what a screen reader meets.
    expect(
      document.querySelector('[data-slot="input-otp-group"]')?.closest("[aria-hidden]"),
    ).not.toBeNull();
  });

  test("typing fills the slots left to right", async () => {
    render(() => <Six />);
    await user.type(field(), "123");
    flush();
    expect(shown()).toBe("123");
  });

  test("a paste fills every slot at once, which is why there is one input", async () => {
    // An input per character cannot do this: each would take one character and
    // the other five would be dropped.
    const seen: string[] = [];
    render(() => <Six onChange={(v) => seen.push(v)} />);
    const input = field();
    input.focus();
    input.value = "123456";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(shown()).toBe("123456");
    expect(seen.at(-1)).toBe("123456");
  });

  test("what the pattern rejects never arrives", async () => {
    render(() => <Six />);
    const input = field();
    input.focus();
    input.value = "1a2b3c";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(shown()).toBe("123");
  });

  test("more than maxLength is cut rather than accepted", () => {
    render(() => <Six />);
    const input = field();
    input.focus();
    input.value = "1234567890";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(shown()).toBe("123456");
  });

  test("onComplete fires on the last character and not before", () => {
    const done: string[] = [];
    render(() => <Six onComplete={(v) => done.push(v)} />);
    const input = field();
    input.focus();

    input.value = "12345";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(done).toHaveLength(0);

    input.value = "123456";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(done).toEqual(["123456"]);
  });

  test("a controlled value is the one drawn", () => {
    const [value, setValue] = createSignal("12");
    render(() => <Six value={value()} />);
    expect(shown()).toBe("12");
    setValue("1234");
    flush();
    expect(shown()).toBe("1234");
  });

  test("the slot the caret is in is the active one", () => {
    render(() => <Six />);
    const input = field();
    input.focus();
    flush();
    // Empty and focused: the caret is at 0, so the first slot is active.
    expect(slots()[0]?.getAttribute("data-active")).toBe("true");
    expect(slots()[1]?.getAttribute("data-active")).toBe("false");

    input.value = "12";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    // Two characters in, the caret is before the third box.
    expect(slots()[2]?.getAttribute("data-active")).toBe("true");
    expect(slots()[0]?.getAttribute("data-active")).toBe("false");
  });

  test("the caret names itself, because a style draws it", () => {
    // `cn-input-otp-caret-line` is the blink; without the slot the rule has no
    // element and the active box shows nothing where the caret should be.
    render(() => <Six />);
    field().focus();
    flush();
    expect(document.querySelector('[data-slot="input-otp-caret"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="input-otp-caret-line"]')).not.toBeNull();
  });

  test("a full field keeps the LAST slot active, not one past the end", () => {
    render(() => <Six />);
    const input = field();
    input.focus();
    input.value = "123456";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    // The caret sits at 6 and there is no seventh box, so it belongs to the
    // sixth. Off-by-one here draws a ring on nothing.
    expect(slots()[5]?.getAttribute("data-active")).toBe("true");
  });

  test("nothing is active while the field is not focused", () => {
    render(() => <Six />);
    flush();
    for (const each of slots()) expect(each.getAttribute("data-active")).toBe("false");
  });

  test("the caret is drawn in the active slot only while it is empty", () => {
    render(() => <Six />);
    const input = field();
    input.focus();
    flush();
    const drawn = (): number =>
      slots().filter((each) => each.querySelector("div div") !== null).length;
    expect(drawn()).toBe(1);

    input.value = "123456";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    // Every slot has a character now, so the blinking bar belongs nowhere.
    expect(drawn()).toBe(0);
  });

  test("invalid marks the slots, which is what the ring reads", () => {
    render(() => <Six isInvalid />);
    flush();
    expect(slots()[0]?.getAttribute("aria-invalid")).toBe("true");
    expect(field().getAttribute("aria-invalid")).toBe("true");
  });

  test("disabled reaches the real control, and the container dims from it", () => {
    render(() => <Six isDisabled />);
    expect(field().disabled).toBe(true);
    const container = document.querySelector('[data-slot="input-otp-container"]');
    const rules = rulesFor([...(container?.classList ?? [])].join(" "));
    // `has-disabled:opacity-50` — the container reads the control's state
    // rather than being told it separately.
    expect(rules).toContain(":has(:disabled)");
  });

  test("the drawn row takes no pointer events, or a click reaches no control", () => {
    // A browser is the only thing that could have found this, and this test
    // pins the RULE rather than reproducing the symptom: happy-dom has no
    // opinion about which of two overlapping boxes a click lands on.
    //
    // Every slot is `position: relative`, so the row is POSITIONED and paints
    // above the absolutely positioned input behind it. A click on a box landed
    // on the box: `document.activeElement` stayed `BODY` and nothing focused,
    // while all fifteen tests here passed.
    render(() => <Six />);
    const row = document.querySelector('[data-slot="input-otp-slot"]')?.closest("[aria-hidden]");
    const rules = rulesFor([...(row?.classList ?? [])].join(" "));
    expect(rules).toContain("pointer-events: none");
  });

  test("the separator is one, and says so", () => {
    render(() => <Six />);
    const separator = document.querySelector('[data-slot="input-otp-separator"]');
    expect(separator?.getAttribute("role")).toBe("separator");
  });

  test("a slot outside an InputOTP says what is wrong", () => {
    expect(() => render(() => <InputOTPSlot index={0} />)).toThrow("inside an <InputOTP>");
  });
});

function Four(props: InputOTPProps) {
  return (
    <InputOTP
      maxLength={4}
      id={props.id}
      class={props.class}
      containerClassName={props.containerClassName}
      inputMode={props.inputMode}
      pattern={props.pattern}
      pasteTransformer={props.pasteTransformer}
      textAlign={props.textAlign}
      placeholder={props.placeholder}
      disabled={props.disabled}
      aria-invalid={props["aria-invalid"]}
      aria-label={props["aria-label"]}
      pushPasswordManagerStrategy={props.pushPasswordManagerStrategy}
      onChange={props.onChange}
      onComplete={props.onComplete}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
      </InputOTPGroup>
    </InputOTP>
  );
}

const box = (): HTMLElement =>
  document.querySelector('[data-slot="input-otp-container"]') as HTMLElement;

function enter(value: string): void {
  const input = field();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}

function paste(text: string): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  field().dispatchEvent(event);
  flush();
  return event;
}

describe("InputOTP keyboard and pattern", () => {
  test("the keyboard is numeric unless the caller says otherwise", () => {
    render(() => <Four />);
    expect(field().getAttribute("inputmode")).toBe("numeric");
  });

  test("inputMode reaches the control, and a text keyboard takes letters", () => {
    render(() => <Four inputMode="text" />);
    expect(field().getAttribute("inputmode")).toBe("text");
    field().focus();
    enter("ab1");
    expect(shown()).toBe("ab1");
  });

  test("the three patterns are exported, and are what an input's pattern attribute takes", () => {
    expect(REGEXP_ONLY_DIGITS).toBe("^\\d+$");
    expect(REGEXP_ONLY_CHARS).toBe("^[a-zA-Z]+$");
    expect(REGEXP_ONLY_DIGITS_AND_CHARS).toBe("^[a-zA-Z0-9]+$");
    render(() => <Four pattern={REGEXP_ONLY_DIGITS_AND_CHARS} />);
    expect(field().getAttribute("pattern")).toBe("^[a-zA-Z0-9]+$");
  });

  test("a string pattern judges the whole value and refuses a change that fails it", () => {
    const seen: string[] = [];
    render(() => <Four pattern={REGEXP_ONLY_DIGITS_AND_CHARS} onChange={(v) => seen.push(v)} />);
    field().focus();
    enter("a1");
    expect(shown()).toBe("a1");
    enter("a1-");
    expect(shown()).toBe("a1");
    expect(field().value).toBe("a1");
    expect(seen).toEqual(["a1"]);
  });

  test("a RegExp pattern is still the characters to drop", () => {
    render(() => <Four pattern={/[^a-z]/g} />);
    field().focus();
    enter("a1b2");
    expect(shown()).toBe("ab");
  });
});

describe("InputOTP paste and completion", () => {
  test("pasteTransformer cleans a code copied with its separators", () => {
    const done: string[] = [];
    render(() => (
      <Four
        pattern={REGEXP_ONLY_DIGITS}
        pasteTransformer={(text) => text.replaceAll("-", "")}
        onComplete={(v) => done.push(v)}
      />
    ));
    field().focus();
    const event = paste("12-34");
    expect(event.defaultPrevented).toBe(true);
    expect(shown()).toBe("1234");
    expect(done).toEqual(["1234"]);
  });

  test("onComplete may write state of the caller's own", () => {
    // It is called from an effect, which is the one place the strict build
    // could have refused a handler that writes.
    const [code, setCode] = createSignal("");
    render(() => <Four onComplete={setCode} />);
    field().focus();
    enter("1234");
    flush();
    expect(code()).toBe("1234");
  });

  test("onComplete fires once when the field fills, not on every edit of a full one", () => {
    const done: string[] = [];
    render(() => <Four onComplete={(v) => done.push(v)} />);
    field().focus();
    enter("1234");
    enter("1235");
    expect(done).toEqual(["1234"]);
  });
});

describe("InputOTP selection", () => {
  test("a click on a filled box selects its character, so typing replaces it", () => {
    render(() => <Four />);
    const input = field();
    input.focus();
    enter("123");
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flush();
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(2);
    expect(slots()[1]?.getAttribute("data-active")).toBe("true");
    expect(slots()[3]?.getAttribute("data-active")).toBe("false");
  });

  test("focusing a full field selects its last character", () => {
    render(() => <Four />);
    const input = field();
    input.focus();
    enter("1234");
    input.blur();
    flush();
    input.focus();
    flush();
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(4);
    expect(slots()[3]?.getAttribute("data-active")).toBe("true");
  });
});

describe("InputOTP parts and attributes", () => {
  test("containerClassName styles the row, and the id names the control alone", () => {
    render(() => <Four id="code" containerClassName="row" class="control" />);
    expect(box().classList.contains("row")).toBe(true);
    expect(field().classList.contains("row")).toBe(false);
    expect(field().classList.contains("control")).toBe(true);
    expect(document.querySelectorAll("#code")).toHaveLength(1);
    expect(field().id).toBe("code");
  });

  test("upstream's markers are on the container and the control", () => {
    render(() => <Four />);
    expect(box().hasAttribute("data-input-otp-container")).toBe(true);
    expect(field().hasAttribute("data-input-otp")).toBe(true);
  });

  test("disabled and aria-invalid are accepted under their HTML names", () => {
    render(() => <Four disabled aria-invalid />);
    flush();
    expect(field().disabled).toBe(true);
    expect(box().getAttribute("data-disabled")).toBe("true");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(slots()[0]?.getAttribute("aria-invalid")).toBe("true");
  });

  test("the field is one labelled text input a screen reader meets once", () => {
    render(() => <Four aria-label="Verification code" />);
    const input = field();
    expect(input.getAttribute("aria-label")).toBe("Verification code");
    expect(box().hasAttribute("aria-label")).toBe(false);
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("spellcheck")).toBe("false");
  });

  test("textAlign is the control's, for where the platform puts its own caret", () => {
    render(() => <Four textAlign="center" />);
    expect(field().style.textAlign).toBe("center");
    cleanup();
    render(() => <Four />);
    expect(field().style.textAlign).toBe("left");
  });

  test("the placeholder reaches the control", () => {
    render(() => <Four placeholder="0000" />);
    expect(field().getAttribute("placeholder")).toBe("0000");
  });

  test("the separator lays its icon out, and the boxes round their outer corners in either direction", () => {
    render(() => <Four />);
    const separator = document.querySelector('[data-slot="input-otp-separator"]');
    expect(rulesFor([...(separator?.classList ?? [])].join(" "))).toContain("display: flex");
    const rules = rulesFor([...(slots()[0]?.classList ?? [])].join(" "));
    expect(rules).toContain("border-inline-end-width: 1px");
    expect(rules).toContain("border-start-start-radius");
    // The colour is the same on all four sides, so only the width and the
    // radii have a side to get wrong.
    expect(rules).not.toContain("border-right-width");
    expect(rules).not.toContain("border-left-width");
    expect(rules).not.toContain("border-top-left-radius");
  });
});

describe("InputOTP and password managers", () => {
  test("the control is invisible by colour, because a manager skips a field with no opacity", () => {
    render(() => <Four />);
    const rules = rulesFor([...field().classList].join(" "));
    expect(rules).toContain("color: transparent");
    expect(rules).toContain("caret-color: transparent");
    expect(rules).not.toContain("opacity: 0");
  });

  test("a manager's badge is moved out beside the boxes", async () => {
    render(() => <Four />);
    const input = field();
    expect(input.style.width).toBe("");
    const badge = document.createElement("div");
    badge.setAttribute("data-lastpass-icon-root", "");
    document.body.append(badge);
    input.focus();
    flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    flush();
    expect(input.style.width).toBe("calc(100% + 40px)");
    expect(input.style.clipPath).toBe("inset(0 40px 0 0)");
    badge.remove();
  });

  test("pushPasswordManagerStrategy none leaves the control its own width", async () => {
    render(() => <Four pushPasswordManagerStrategy="none" />);
    const input = field();
    const badge = document.createElement("div");
    badge.setAttribute("data-lastpass-icon-root", "");
    document.body.append(badge);
    input.focus();
    flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    flush();
    expect(input.style.width).toBe("");
    badge.remove();
  });
});
