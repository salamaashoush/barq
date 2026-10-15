import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@barqjs/testing";

import { Spinner } from "./spinner.tsx";

afterEach(cleanup);

describe("Spinner", () => {
  test("aria-label names it, as it does upstream", () => {
    render(() => <Spinner aria-label="Saving" />);
    expect(screen.getByRole("status", { name: "Saving" })).toBeTruthy();
  });

  test("beside text that already says it, it can be hidden from a screen reader", () => {
    render(() => <Spinner aria-hidden="true" role="presentation" />);
    const icon = document.querySelector('[data-slot="spinner"]') as SVGElement;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.getAttribute("role")).toBe("presentation");
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("the slot can be renamed by a component that wraps it", () => {
    render(() => <Spinner data-slot="button-spinner" />);
    expect(document.querySelector('[data-slot="button-spinner"]')).not.toBeNull();
  });
});

describe("Spinner, with what a caller writes on it", () => {
  test("data-icon and every other data attribute reach the svg", () => {
    const { container } = render(() => (
      <Spinner data-icon="inline-start" data-caller="yes" id="saving" style={{ "--caller": "1" }} />
    ));
    const icon = container.querySelector('[data-slot="spinner"]') as SVGElement;
    // A button pads the side its icon is on by finding `[data-icon]` inside it.
    expect(icon.getAttribute("data-icon")).toBe("inline-start");
    expect(icon.getAttribute("data-caller")).toBe("yes");
    expect(icon.id).toBe("saving");
    expect(icon.style.getPropertyValue("--caller")).toBe("1");
    expect(icon.getAttribute("data-slot")).toBe("spinner");
  });
});
