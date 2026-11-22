import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { TextArea } from "./textarea.tsx";

function area(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>("textbox");
}

describe("TextArea", () => {
  test("is a named multi-line text box", () => {
    render(() => <TextArea aria-label="Message" rows={4} placeholder="Say hello" />);

    expect(area().tagName).toBe("TEXTAREA");
    expect(accessibleName(area())).toBe("Message");
    expect(area().getAttribute("rows")).toBe("4");
    expect(area().getAttribute("placeholder")).toBe("Say hello");
    expectNoAriaViolations(document.body);
  });

  test("uncontrolled, it keeps what is typed and reports it", () => {
    const seen: string[] = [];
    render(() => (
      <TextArea aria-label="Message" defaultValue="hi" onChange={(text) => seen.push(text)} />
    ));
    expect(area().value).toBe("hi");

    user.type(area(), "!");
    flush();

    expect(area().value).toBe("hi!");
    expect(seen).toEqual(["hi!"]);
  });

  test("controlled, it shows what it is given and puts back what was declined", () => {
    const [text, setText] = createSignal("salama");
    const seen: string[] = [];
    render(() => <TextArea aria-label="Message" value={text()} onChange={(t) => seen.push(t)} />);

    user.type(area(), "x");
    flush();
    expect(seen).toEqual(["salamax"]);
    expect(area().value).toBe("salama");

    setText("acme");
    flush();
    expect(area().value).toBe("acme");
  });

  test("hover is a data attribute and reaches the callbacks", () => {
    const seen: boolean[] = [];
    render(() => <TextArea aria-label="Message" onHoverChange={(over) => seen.push(over)} />);

    user.hover(area());
    flush();
    expect(area().hasAttribute("data-hovered")).toBe(true);

    user.unhover(area());
    flush();
    expect(area().hasAttribute("data-hovered")).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  test("keyboard focus shows the ring; a click focuses without it", () => {
    render(() => (
      <>
        <TextArea aria-label="Message" />
        <button type="button">Send</button>
      </>
    ));

    user.tab();
    expect(document.activeElement).toBe(area());
    expect(area().hasAttribute("data-focused")).toBe(true);
    expect(area().hasAttribute("data-focus-visible")).toBe(true);

    user.tab();
    expect(area().hasAttribute("data-focused")).toBe(false);

    user.click(area());
    flush();
    expect(area().hasAttribute("data-focused")).toBe(true);
    expect(area().hasAttribute("data-focus-visible")).toBe(false);
  });

  test("disabled is the attribute and the data attribute, and does not hover", () => {
    render(() => <TextArea aria-label="Message" isDisabled />);

    expect(area().disabled).toBe(true);
    expect(area().hasAttribute("data-disabled")).toBe(true);
    user.hover(area());
    flush();
    expect(area().hasAttribute("data-hovered")).toBe(false);
  });

  test("invalid, read-only and required", () => {
    render(() => <TextArea aria-label="Message" isInvalid isReadOnly isRequired />);

    expect(area().getAttribute("aria-invalid")).toBe("true");
    expect(area().hasAttribute("data-invalid")).toBe(true);
    expect(area().readOnly).toBe(true);
    expect(area().required).toBe(true);
  });

  test("submits with a form under its name", () => {
    render(() => (
      <form data-testid="form">
        <TextArea aria-label="Message" name="message" defaultValue="from salama" />
      </form>
    ));

    const data = new FormData(screen.getByTestId<HTMLFormElement>("form"));
    expect(data.get("message")).toBe("from salama");
  });

  test("forwards key handlers, data attributes and the ref", () => {
    const keys: string[] = [];
    let held: HTMLTextAreaElement | null = null;
    render(() => (
      <TextArea
        aria-label="Message"
        data-slot="composer"
        class="acme"
        onKeyDown={(event) => keys.push(event.key)}
        ref={(element) => {
          held = element;
        }}
      />
    ));

    user.focus(area());
    user.keyDown("Enter");

    expect(keys).toEqual(["Enter"]);
    expect(area().getAttribute("data-slot")).toBe("composer");
    expect(area().getAttribute("class")).toBe("acme");
    expect(held === area()).toBe(true);
  });
});
