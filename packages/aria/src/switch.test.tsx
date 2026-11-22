import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import {
  accessibleDescription,
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
} from "@barqjs/testing";
import { Form } from "./form.tsx";
import { Switch, useSwitch } from "./switch.tsx";

function Thumb() {
  const control = useSwitch();
  return (
    <span
      data-testid="thumb"
      data-state={() => (control.isSelected() ? "checked" : "unchecked")}
      data-disabled={() => (control.isDisabled() ? "" : undefined)}
    />
  );
}

describe("Switch", () => {
  test("says checked or unchecked as an attribute, beside data-selected", () => {
    render(() => <Switch>Wi-Fi</Switch>);
    const label = screen.getByRole("switch").parentElement as HTMLElement;
    expect(label.getAttribute("data-state")).toBe("unchecked");
    expect(label.hasAttribute("data-selected")).toBe(false);

    user.click(screen.getByRole("switch"));
    flush();
    expect(label.getAttribute("data-state")).toBe("checked");
    expect(label.getAttribute("data-selected")).toBe("");
  });

  test("a part drawn inside it reads the same state", () => {
    render(() => (
      <Switch aria-label="Wi-Fi">
        <Thumb />
      </Switch>
    ));
    const thumb = screen.getByTestId("thumb");
    expect(thumb.getAttribute("data-state")).toBe("unchecked");

    user.click(screen.getByRole("switch"));
    flush();
    expect(thumb.getAttribute("data-state")).toBe("checked");
  });

  test("a disabled switch tells its parts", () => {
    render(() => (
      <Switch aria-label="Wi-Fi" isDisabled>
        <Thumb />
      </Switch>
    ));
    expect(screen.getByTestId("thumb").getAttribute("data-disabled")).toBe("");
  });

  test("a part outside a switch says what is wrong", () => {
    expect(() => render(() => <Thumb />)).toThrow("inside a Switch");
  });
});

describe("Switch, with nothing of its own to say", () => {
  const control = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("switch");

  test("with label content it is the label", () => {
    render(() => <Switch>Wi-Fi</Switch>);
    expect(control().parentElement?.tagName).toBe("LABEL");
  });

  test("without any it renders no label, so it can sit inside one", () => {
    render(() => <Switch aria-label="Wi-Fi" />);
    expect(control().parentElement?.tagName).toBe("SPAN");
    expect(document.querySelectorAll("label")).toHaveLength(0);
  });

  test("on its own, a press on its body toggles it once and takes focus", () => {
    const changes: boolean[] = [];
    render(() => <Switch aria-label="Wi-Fi" onChange={(on) => changes.push(on)} />);
    user.click(control().parentElement as HTMLElement);
    flush();
    expect(changes).toEqual([true]);
    expect(control().checked).toBe(true);
    expect(document.activeElement).toBe(control());
    expect(control().parentElement?.getAttribute("data-state")).toBe("checked");
  });

  function InALabel(props: { onChange?: (on: boolean) => void; isDisabled?: boolean }) {
    return (
      <label>
        <span data-testid="text">Wi-Fi</span>
        <Switch onChange={props.onChange} isDisabled={props.isDisabled} />
      </label>
    );
  }

  test("inside a caller's label there is one label, and it names the switch", () => {
    render(() => <InALabel />);
    expect(document.querySelectorAll("label")).toHaveLength(1);
    expect(accessibleName(control())).toBe("Wi-Fi");
  });

  test("a press on the label's text toggles it once", () => {
    const changes: boolean[] = [];
    render(() => <InALabel onChange={(on) => changes.push(on)} />);
    user.click(screen.getByTestId("text"));
    flush();
    expect(changes).toEqual([true]);
    expect(control().checked).toBe(true);
  });

  test("a press on the switch's own body toggles it once, not once for each", () => {
    const changes: boolean[] = [];
    render(() => <InALabel onChange={(on) => changes.push(on)} />);
    user.click(control().parentElement as HTMLElement);
    flush();
    expect(changes).toEqual([true]);
    expect(control().checked).toBe(true);
  });

  test("the keyboard's activation of the input toggles it once", () => {
    const changes: boolean[] = [];
    render(() => <InALabel onChange={(on) => changes.push(on)} />);
    control().focus();
    // What the platform does for Space on a focused checkbox.
    control().click();
    flush();
    expect(changes).toEqual([true]);
  });

  test("children that are a drawing, not a name, are said to be so", () => {
    const changes: boolean[] = [];
    render(() => (
      <label>
        Wi-Fi
        <Switch elementType="span" onChange={(on) => changes.push(on)}>
          <Thumb />
        </Switch>
      </label>
    ));
    expect(document.querySelectorAll("label")).toHaveLength(1);
    expect(accessibleName(control())).toBe("Wi-Fi");
    user.click(screen.getByTestId("thumb"));
    flush();
    expect(changes).toEqual([true]);
    expect(screen.getByTestId("thumb").getAttribute("data-state")).toBe("checked");
  });

  test("a disabled one does not answer a press on its body", () => {
    const changes: boolean[] = [];
    render(() => <Switch aria-label="Wi-Fi" isDisabled onChange={(on) => changes.push(on)} />);
    user.click(control().parentElement as HTMLElement);
    flush();
    expect(changes).toEqual([]);
    expect(control().checked).toBe(false);
  });

  test("a label elsewhere still reaches it by id", () => {
    const changes: boolean[] = [];
    render(() => (
      <>
        <label for="wifi">Wi-Fi</label>
        <Switch id="wifi" onChange={(on) => changes.push(on)} />
      </>
    ));
    expect(accessibleName(control())).toBe("Wi-Fi");
    user.click(document.querySelector("label") as HTMLElement);
    flush();
    expect(changes).toEqual([true]);
  });

  test("has no ARIA violations inside a label", () => {
    const { container } = render(() => <InALabel />);
    expectNoAriaViolations(container);
  });
});

describe("Switch, help text and state", () => {
  test("a description describes it and does not name it", () => {
    render(() => <Switch description="Uses more battery">Wi-Fi</Switch>);
    const control = screen.getByRole("switch");
    expect(accessibleName(control)).toBe("Wi-Fi");
    expect(accessibleDescription(control)).toBe("Uses more battery");
  });

  test("an error message describes it while it is invalid", () => {
    render(() => (
      <Switch isInvalid errorMessage="Turn this on to continue">
        Notifications
      </Switch>
    ));
    expect(accessibleDescription(screen.getByRole("switch"))).toBe("Turn this on to continue");
  });

  test("a press on its label focuses it, as WebKit does not", () => {
    render(() => (
      <>
        <button type="button">Before</button>
        <Switch>Wi-Fi</Switch>
      </>
    ));
    screen.getByRole("button").focus();
    const control = screen.getByRole("switch");

    user.click(control.parentElement as HTMLElement);
    flush();

    expect(document.activeElement).toBe(control);
  });

  test("required says so to a stylesheet", () => {
    render(() => <Switch isRequired>Terms</Switch>);
    const control = screen.getByRole("switch");
    expect(control.parentElement?.hasAttribute("data-required")).toBe(true);
    expect(control.getAttribute("aria-required")).toBe("true");
  });

  test("blocks a submit only under native", () => {
    render(() => (
      <>
        <Form aria-label="Aria">
          <Switch isRequired>Terms</Switch>
        </Form>
        <Form aria-label="Native" validationBehavior="native">
          <Switch isRequired>Terms</Switch>
        </Form>
      </>
    ));
    const [aria, native] = screen.getAllByRole<HTMLInputElement>("switch");
    expect(aria?.required).toBe(false);
    expect(native?.required).toBe(true);
    expect(native?.hasAttribute("aria-required")).toBe(false);
    expect(screen.getByRole<HTMLFormElement>("form", { name: "Aria" }).checkValidity()).toBe(true);
    expect(screen.getByRole<HTMLFormElement>("form", { name: "Native" }).checkValidity()).toBe(
      false,
    );
  });
});

describe("Switch, required said by the caller", () => {
  test("an aria-required the caller writes stays under native validation", () => {
    render(() => (
      <Switch aria-label="Terms" isRequired validationBehavior="native" aria-required>
        Terms
      </Switch>
    ));
    const input = screen.getByRole<HTMLInputElement>("switch");
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-required")).toBe("true");
  });
});
