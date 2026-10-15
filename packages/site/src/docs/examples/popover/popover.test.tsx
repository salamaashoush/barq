import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import PopoverAlignments from "./popover-alignments.tsx";
import PopoverDemo from "./popover-demo.tsx";
import PopoverForm from "./popover-form.tsx";
import PopoverRtl from "./popover-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const content = (): HTMLElement | null => document.querySelector('[data-slot="popover-content"]');

describe("the popover examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("popover")).toEqual([]);
  });

  test("the popover opens its fields and closes on Escape", async () => {
    render(() => <PopoverDemo />);
    expect(content()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open popover" }));
    await settle();
    expect(screen.getByLabelText<HTMLInputElement>("Max. width").value).toBe("300px");
    await user.keyboard("{Escape}");
    await settle();
    expect(content()).toBeNull();
  });

  test("each button aligns its popover", async () => {
    render(() => <PopoverAlignments />);
    await user.click(screen.getByRole("button", { name: "End" }));
    await settle();
    expect(content()?.textContent).toBe("Aligned to end");
    expect(content()?.getAttribute("data-align")).toBe("end");
  });

  test("the form's labels name their inputs", async () => {
    render(() => <PopoverForm />);
    await user.click(screen.getByRole("button", { name: "Open Popover" }));
    await settle();
    expect(screen.getByLabelText<HTMLInputElement>("Height").value).toBe("25px");
  });

  test("the right-to-left popover names its direction", async () => {
    render(() => <PopoverRtl />);
    await user.click(screen.getByRole("button", { name: "أسفل" }));
    await settle();
    expect(content()?.closest('[dir="rtl"]')).not.toBeNull();
    expect(content()?.textContent).toContain("الأبعاد");
  });
});
