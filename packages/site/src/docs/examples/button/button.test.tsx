import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ButtonAsChild from "./button-aschild.tsx";
import ButtonGroupDemo from "./button-group-demo.tsx";
import ButtonRtl from "./button-rtl.tsx";
import ButtonSize from "./button-size.tsx";
import ButtonSpinner from "./button-spinner.tsx";
import ButtonWithIcon from "./button-with-icon.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the button examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("button")).toEqual([]);
  });

  test("each size is a text button beside an icon button of the same size", () => {
    render(() => <ButtonSize />);
    const sizes = screen.getAllByRole("button").map((button) => button.getAttribute("data-size"));
    expect(sizes).toEqual(["xs", "icon-xs", "sm", "icon-sm", "default", "icon", "lg", "icon-lg"]);
  });

  test("the icon says which side of the label it is on", () => {
    render(() => <ButtonWithIcon />);
    const button = screen.getByRole("button", { name: "New Branch" });
    expect(button.querySelector('svg[data-icon="inline-start"]')).not.toBeNull();
  });

  test("a button holding a spinner is disabled", () => {
    render(() => <ButtonSpinner />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull();
    }
  });

  test("a button given an href is a link wearing the button's slot", () => {
    render(() => <ButtonAsChild />);
    const link = screen.getByRole("link", { name: "Login" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("#");
    expect(link.getAttribute("data-slot")).toBe("button");
  });

  test("the button group's menu opens with its items and closes on Escape", async () => {
    render(() => <ButtonGroupDemo />);
    expect(document.querySelectorAll('[data-slot="button-group"]')).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "More Options" }));
    await settle();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Mark as Read",
      "Archive",
      "Snooze",
      "Add to Calendar",
      "Add to List",
      "Label As...",
      "Trash",
    ]);

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <ButtonRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="button"]')).toHaveLength(5);
  });
});
