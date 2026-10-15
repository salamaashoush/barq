import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import CommandBasic from "./command-basic.tsx";
import CommandDemo from "./command-demo.tsx";
import CommandDialogDemo from "./command-dialog.tsx";
import CommandRtl from "./command-rtl.tsx";
import CommandScrollable from "./command-scrollable.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const visible = (): string[] =>
  screen
    .getAllByRole("option")
    .filter((option) => !option.hidden)
    .map((option) => option.textContent ?? "");

describe("the command examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("command")).toEqual([]);
  });

  test("the palette lists its groups and filters as you type", async () => {
    render(() => <CommandDemo />);
    expect(visible()).toEqual([
      "Calendar",
      "Search Emoji",
      "Calculator",
      "Profile⌘P",
      "Billing⌘B",
      "Settings⌘S",
    ]);
    expect(screen.getByRole("option", { name: "Calculator" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await user.type(screen.getByRole("combobox"), "bill");
    await settle();
    expect(visible()).toEqual(["Billing⌘B"]);
  });

  test("the dialog opens from its button with the palette inside", async () => {
    render(() => <CommandBasic />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    await settle();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(visible()).toEqual(["Calendar", "Search Emoji", "Calculator"]);
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the scrollable palette holds five groups", async () => {
    render(() => <CommandScrollable />);
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    await settle();
    expect(visible()).toHaveLength(23);
    expect(document.querySelectorAll('[data-slot="command-group"]')).toHaveLength(5);
    await user.keyboard("{Escape}");
    await settle();
  });

  test("Ctrl+J opens and closes the dialog", async () => {
    render(() => <CommandDialogDemo />);
    await settle();
    user.key("j", { ctrlKey: true, target: document.body });
    await settle();
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the right-to-left palette names its direction on an element", () => {
    render(() => <CommandRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="command"]')).not.toBeNull();
  });
});
