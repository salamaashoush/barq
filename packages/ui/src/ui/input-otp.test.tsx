import { describe, expect, test } from "bun:test";
import { flush, signal } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "./input-otp.tsx";

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
    const value = signal("12");
    render(() => <Six value={value()} />);
    expect(shown()).toBe("12");
    value.set("1234");
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
