import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import DrawerDemo from "./drawer-demo.tsx";
import DrawerDialog from "./drawer-dialog.tsx";
import DrawerRtl from "./drawer-rtl.tsx";
import DrawerSides from "./drawer-sides.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the drawer examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("drawer")).toEqual([]);
  });

  test("the goal moves in tens and stops at its bounds", async () => {
    render(() => <DrawerDemo />);
    await user.click(screen.getByRole("button", { name: "Open Drawer" }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Move Goal" });
    expect(dialog.textContent).toContain("350");
    const increase = screen.getByRole<HTMLButtonElement>("button", { name: "Increase" });
    for (let step = 0; step < 6; step++) {
      await user.click(increase);
      await settle();
    }
    expect(dialog.textContent).toContain("400");
    expect(increase.disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("each side opens a drawer from that edge", async () => {
    render(() => <DrawerSides />);
    await user.click(screen.getByRole("button", { name: "left" }));
    await settle();
    expect(
      document.querySelector('[data-slot="drawer-content"]')?.getAttribute("data-direction"),
    ).toBe("left");
    await user.keyboard("{Escape}");
    await settle();
  });

  test("a wide viewport gets the dialog", async () => {
    render(() => <DrawerDialog />);
    await user.click(screen.getByRole("button", { name: "Edit Profile" }));
    await settle();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe("salama@example.com");
    await user.keyboard("{Escape}");
    await settle();
  });

  test("the right-to-left drawer names its direction", async () => {
    render(() => <DrawerRtl />);
    await user.click(screen.getByRole("button", { name: "فتح الدرج" }));
    await settle();
    expect(screen.getByRole("dialog").closest('[dir="rtl"]')).not.toBeNull();
    await user.keyboard("{Escape}");
    await settle();
  });
});
