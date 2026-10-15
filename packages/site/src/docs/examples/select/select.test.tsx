import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import SelectDemo from "./select-demo.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the select examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("select")).toEqual([]);
  });

  test("the list opens under a group label, and a choice lands in the trigger", async () => {
    render(() => <SelectDemo />);
    const trigger = document.querySelector('[data-slot="select-trigger"]') as HTMLElement;
    expect(trigger.textContent).toContain("Select a fruit");

    await user.click(trigger);
    await settle();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Apple",
      "Banana",
      "Blueberry",
      "Grapes",
      "Pineapple",
    ]);
    expect(document.querySelector('[data-slot="select-label"]')?.textContent).toBe("Fruits");

    await user.click(screen.getByRole("option", { name: "Banana" }));
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.textContent).toContain("Banana");
  });
});
