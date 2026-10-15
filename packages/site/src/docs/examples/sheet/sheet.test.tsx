import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import SheetDemo from "./sheet-demo.tsx";
import SheetNoCloseButton from "./sheet-no-close-button.tsx";
import SheetRtl from "./sheet-rtl.tsx";
import SheetSide from "./sheet-side.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const content = (): HTMLElement | null => document.querySelector('[data-slot="sheet-content"]');

describe("the sheet examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("sheet")).toEqual([]);
  });

  test("the sheet opens the profile and its close part closes it", async () => {
    render(() => <SheetDemo />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    expect(screen.getByRole("dialog", { name: "Edit profile" })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Username").value).toBe("@salama");
    await user.click(screen.getAllByRole("button", { name: "Close" }).at(-1) as HTMLElement);
    await settle();
    expect(content()).toBeNull();
  });

  test("each side opens from its edge", async () => {
    render(() => <SheetSide />);
    await user.click(screen.getByRole("button", { name: "top" }));
    await settle();
    expect(content()?.getAttribute("data-side")).toBe("top");
    await user.keyboard("{Escape}");
    await settle();
  });

  test("a sheet can go without its close button", async () => {
    render(() => <SheetNoCloseButton />);
    await user.click(screen.getByRole("button", { name: "Open Sheet" }));
    await settle();
    expect(content()?.querySelector('[data-slot="sheet-close"]')).toBeNull();
    await user.keyboard("{Escape}");
    await settle();
  });

  test("the right-to-left sheet opens from the left and names its direction", async () => {
    render(() => <SheetRtl />);
    await user.click(screen.getByRole("button", { name: "فتح" }));
    await settle();
    expect(content()?.getAttribute("data-side")).toBe("left");
    expect(content()?.closest('[dir="rtl"]')).not.toBeNull();
    await user.keyboard("{Escape}");
    await settle();
  });
});
