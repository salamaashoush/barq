import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ToggleGroupDemo from "./toggle-group-demo.tsx";
import ToggleGroupDisabled from "./toggle-group-disabled.tsx";
import ToggleGroupFontWeightSelector from "./toggle-group-font-weight-selector.tsx";
import ToggleGroupOutline from "./toggle-group-outline.tsx";
import ToggleGroupRtl from "./toggle-group-rtl.tsx";
import ToggleGroupVertical from "./toggle-group-vertical.tsx";

const pressed = (name: string): string | null =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("the toggle group examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("toggle-group")).toEqual([]);
  });

  test("a multiple group keeps each press", async () => {
    render(() => <ToggleGroupDemo />);
    await user.click(screen.getByRole("button", { name: "Toggle bold" }));
    await user.click(screen.getByRole("button", { name: "Toggle italic" }));
    flush();
    expect(pressed("Toggle bold")).toBe("true");
    expect(pressed("Toggle italic")).toBe("true");
    expect(pressed("Toggle strikethrough")).toBe("false");
  });

  test("a single group moves its one choice", async () => {
    render(() => <ToggleGroupOutline />);
    expect(pressed("Toggle all")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Toggle missed" }));
    flush();
    expect(pressed("Toggle missed")).toBe("true");
    expect(pressed("Toggle all")).toBe("false");
  });

  test("a vertical group starts with two pressed", () => {
    render(() => <ToggleGroupVertical />);
    expect(pressed("Toggle bold")).toBe("true");
    expect(pressed("Toggle italic")).toBe("true");
    expect(pressed("Toggle underline")).toBe("false");
  });

  test("a disabled group disables every item", () => {
    render(() => <ToggleGroupDisabled />);
    for (const button of screen.getAllByRole<HTMLButtonElement>("button")) {
      expect(button.disabled).toBe(true);
    }
  });

  test("the chosen weight is written in the description", async () => {
    render(() => <ToggleGroupFontWeightSelector />);
    expect(document.querySelector("code")?.textContent).toBe("font-normal");
    await user.click(screen.getByRole("button", { name: "Bold" }));
    flush();
    expect(document.querySelector("code")?.textContent).toBe("font-bold");
  });

  test("the right-to-left group names its direction", () => {
    render(() => <ToggleGroupRtl />);
    expect(pressed("قائمة")).toBe("true");
    expect(screen.getByRole("button", { name: "شبكة" }).closest('[dir="rtl"]')).not.toBeNull();
  });
});
