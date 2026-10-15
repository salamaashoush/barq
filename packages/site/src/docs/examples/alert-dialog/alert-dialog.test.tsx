import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import AlertDialogDemo from "./alert-dialog-demo.tsx";
import AlertDialogDestructive from "./alert-dialog-destructive.tsx";
import AlertDialogRtl from "./alert-dialog-rtl.tsx";
import AlertDialogSmallMedia from "./alert-dialog-small-media.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const content = (): HTMLElement | null =>
  document.querySelector('[data-slot="alert-dialog-content"]');

async function open(name: string): Promise<void> {
  await user.click(screen.getByRole("button", { name }));
  await settle();
}

async function press(name: string): Promise<void> {
  await user.click(screen.getByRole("button", { name }));
  await settle();
}

describe("the alert dialog examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("alert-dialog")).toEqual([]);
  });

  test("the trigger opens a named alert dialog and Cancel closes it", async () => {
    render(() => <AlertDialogDemo />);
    expect(content()).toBeNull();

    await open("Show Dialog");
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      screen.getByText("Are you absolutely sure?").getAttribute("id"),
    );
    expect(content()?.getAttribute("data-size")).toBe("default");
    expect(content()?.textContent).toContain("This action cannot be undone.");

    await press("Cancel");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("the small alert dialog with media says its size and draws the icon", async () => {
    render(() => <AlertDialogSmallMedia />);
    await open("Show Dialog");
    expect(content()?.getAttribute("data-size")).toBe("sm");
    expect(document.querySelector('[data-slot="alert-dialog-media"] svg')).not.toBeNull();

    await press("Allow");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("the destructive action is a destructive button, and it closes the dialog", async () => {
    render(() => <AlertDialogDestructive />);
    await open("Delete Chat");
    const action = screen.getByRole("button", { name: "Delete" });
    expect(action.getAttribute("data-slot")).toBe("alert-dialog-action");
    expect(action.getAttribute("data-variant")).toBe("destructive");
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();

    await press("Delete");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("the right-to-left example names its direction around the triggers and inside the dialog", async () => {
    render(() => <AlertDialogRtl />);
    expect(document.querySelectorAll('[dir="rtl"] > [data-slot="button"]')).toHaveLength(2);

    await open("إظهار الحوار");
    expect(content()?.querySelector('[dir="rtl"] [data-slot="alert-dialog-title"]')).not.toBeNull();

    await press("إلغاء");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
