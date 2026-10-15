import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ToggleDemo from "./toggle-demo.tsx";
import ToggleDisabled from "./toggle-disabled.tsx";
import ToggleOutline from "./toggle-outline.tsx";
import ToggleRtl from "./toggle-rtl.tsx";
import ToggleSizes from "./toggle-sizes.tsx";
import ToggleText from "./toggle-text.tsx";

const pressed = (name: string): string | null =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("the toggle examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("toggle")).toEqual([]);
  });

  test("a press turns the toggle on and a second press turns it off", async () => {
    render(() => <ToggleDemo />);
    const toggle = screen.getByRole("button", { name: "Toggle bookmark" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("data-state")).toBe("off");
    expect(toggle.getAttribute("data-variant")).toBe("outline");
    expect(toggle.getAttribute("data-size")).toBe("sm");

    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.getAttribute("data-state")).toBe("on");

    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  test("two outline toggles hold their own state", async () => {
    render(() => <ToggleOutline />);
    await user.click(screen.getByRole("button", { name: "Toggle bold" }));
    flush();
    expect(pressed("Toggle bold")).toBe("true");
    expect(pressed("Toggle italic")).toBe("false");
  });

  test("the text toggle keeps the default variant", async () => {
    render(() => <ToggleText />);
    const toggle = screen.getByRole("button", { name: "Toggle italic" });
    expect(toggle.getAttribute("data-variant")).toBe("default");
    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  test("each size is named on its toggle", () => {
    render(() => <ToggleSizes />);
    expect(screen.getAllByRole("button").map((toggle) => toggle.getAttribute("data-size"))).toEqual(
      ["sm", "default", "lg"],
    );
  });

  test("a disabled toggle does not turn on", async () => {
    render(() => <ToggleDisabled />);
    const toggle = screen.getByRole("button", { name: "Toggle disabled" }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  test("the right-to-left example names its direction on an element", async () => {
    render(() => <ToggleRtl />);
    const toggle = document.querySelector('[dir="rtl"] [data-slot="toggle"]') as HTMLElement;
    expect(toggle).not.toBeNull();
    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });
});
