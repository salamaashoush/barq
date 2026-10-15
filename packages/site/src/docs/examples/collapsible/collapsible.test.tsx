import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import CollapsibleBasic from "./collapsible-basic.tsx";
import CollapsibleDemo from "./collapsible-demo.tsx";
import CollapsibleFileTree from "./collapsible-file-tree.tsx";
import CollapsibleRtl from "./collapsible-rtl.tsx";
import CollapsibleSettings from "./collapsible-settings.tsx";

describe("the collapsible examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("collapsible")).toEqual([]);
  });

  test("the order's details open from the button and shut again", async () => {
    render(() => <CollapsibleDemo />);
    const toggle = screen.getByRole("button", { name: "Toggle details" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Shipping address")).not.toBeNull();

    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  test("the root says it is open, which is what the panel's fill selects on", async () => {
    render(() => <CollapsibleBasic />);
    const root = document.querySelector('[data-slot="collapsible"]') as HTMLElement;
    expect(root.getAttribute("data-state")).toBe("closed");

    await user.click(screen.getByRole("button", { name: "Product details" }));
    flush();
    expect(root.getAttribute("data-state")).toBe("open");
  });

  test("a folder opens to its children and a nested folder opens inside it", async () => {
    render(() => <CollapsibleFileTree />);
    const components = screen.getByRole("button", { name: "components" });
    expect(components.getAttribute("aria-expanded")).toBe("false");
    await user.click(components);
    flush();
    const ui = screen.getByRole("button", { name: "ui" });
    await user.click(ui);
    flush();
    expect(ui.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "dialog.tsx" })).toBeTruthy();
  });

  test("the settings button reveals the second row of fields and swaps its icon", async () => {
    render(() => <CollapsibleSettings />);
    const toggle = screen.getByRole("button", { name: "More radius fields" });
    const icon = (): string | null | undefined => toggle.querySelector("svg")?.innerHTML;
    const before = icon();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(icon()).not.toBe(before);
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
  });

  test("the right-to-left example names its direction and opens", async () => {
    render(() => <CollapsibleRtl />);
    const toggle = screen.getByRole("button", { name: "تبديل التفاصيل" });
    expect(toggle.closest('[dir="rtl"]')).not.toBeNull();
    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
