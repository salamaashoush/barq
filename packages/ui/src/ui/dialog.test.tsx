import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import { Button } from "./button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog.tsx";

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function Fixture() {
  return (
    <Dialog>
      <DialogTrigger>
        <Button>Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete the project?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  test("the description describes it, rather than sitting there unread", async () => {
    // Radix wires `aria-describedby` from `<DialogDescription>`; without it
    // the paragraph under the title is read by whoever goes looking and by
    // nobody else.
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    const dialog = screen.getByRole("dialog");
    const described = dialog.getAttribute("aria-describedby");
    expect(described).not.toBeNull();
    expect(document.getElementById(described ?? "")?.textContent).toBe("This cannot be undone.");
  });

  test("nothing is in the document until it opens", () => {
    render(() => <Fixture />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  test("the trigger is the button itself", () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // `aria-haspopup` is deliberately absent for a dialog: screen readers
    // announce every value but "menu" and "listbox" as "menu".
    expect(trigger.hasAttribute("aria-haspopup")).toBe(false);
  });

  test("pressing it opens a named dialog", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Delete the project?").getAttribute("data-slot")).toBe("dialog-title");
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      screen.getByText("Delete the project?").getAttribute("id"),
    );
  });

  test("the close button closes it", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a DialogClose in the footer closes it too", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Escape closes it", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the close button can be turned off", async () => {
    render(() => (
      <Dialog>
        <DialogTrigger>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Plain</DialogTitle>
        </DialogContent>
      </Dialog>
    ));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  test("the underlay is styled and is not the dialog", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    const underlay = document.querySelector("[data-barq-underlay]") as HTMLElement;
    expect(underlay).not.toBeNull();
    expect(underlay.className).not.toBe("");
    const rules = rulesFor(underlay.className);
    expect(rules).toContain("position: fixed");
    // Atoms expand a shorthand, so `inset: 0` is its four sides.
    expect(rules).toContain("top: 0px");
  });

  test("role can be alertdialog", async () => {
    render(() => (
      <Dialog>
        <DialogTrigger>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent role="alertdialog">
          <DialogTitle>Careful</DialogTitle>
        </DialogContent>
      </Dialog>
    ));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
