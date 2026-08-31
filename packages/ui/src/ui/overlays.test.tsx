import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { render, screen, tick, user } from "@barqjs/testing";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog.tsx";
import { Button } from "./button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet.tsx";

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function rulesFor(className: string): string {
  const mentions = new RegExp(`\\.${className}(?![\\w-])`);
  return collectCss()
    .split("@layer barq.ui{")
    .filter((chunk) => mentions.test(chunk))
    .join("\n");
}

describe("Sheet", () => {
  function Fixture(props: Incoming<{ side?: "top" | "right" | "bottom" | "left" }>) {
    return (
      <Sheet>
        <SheetTrigger>
          <Button>Filters</Button>
        </SheetTrigger>
        <SheetContent side={props.side?.()}>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <SheetClose>Done</SheetClose>
        </SheetContent>
      </Sheet>
    );
  }

  test("opens from the right by default and says which side it is on", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await settle();

    const sheet = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
    expect(sheet).not.toBeNull();
    expect(sheet.getAttribute("data-side")).toBe("right");
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeTruthy();
  });

  test("the side chooses a different class, and it slides from that side", async () => {
    render(() => <Fixture side="left" />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await settle();

    const sheet = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
    expect(sheet.getAttribute("data-side")).toBe("left");
    const side = sheet.className.split(" ")[1] ?? "";
    expect(rulesFor(side)).toContain("--ui-enter-translate-x: -100%");
  });

  test("SheetClose closes it", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("AlertDialog", () => {
  function Fixture(props: Incoming<{ onConfirm?: () => void }>) {
    return (
      <AlertDialog>
        <AlertDialogTrigger>
          <Button variant="destructive">Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the project?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onPress={() => props.onConfirm?.()?.()}>
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  test("is an alertdialog, not a dialog", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    expect(screen.getByRole("alertdialog", { name: "Delete the project?" })).toBeTruthy();
  });

  test("Escape closes it, and a press outside does not", async () => {
    // This asserted the opposite. Radix prevents `onPointerDownOutside` and
    // `onInteractOutside` on an alert dialog and leaves Escape alone, which
    // shadcn's own demo does too, and the APG asks for Escape on every dialog.
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await settle();
    expect(screen.queryByRole("alertdialog")).not.toBeNull();

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("the action runs and then closes", async () => {
    const done: string[] = [];
    render(() => <Fixture onConfirm={() => done.push("deleted")} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await settle();
    expect(done).toEqual(["deleted"]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("cancel closes without running the action", async () => {
    const done: string[] = [];
    render(() => <Fixture onConfirm={() => done.push("deleted")} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(done).toEqual([]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("there is no ✕ in the corner", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    expect(document.querySelector('[data-slot="alert-dialog-close"]')).toBeNull();
  });
});

describe("Popover", () => {
  function Fixture() {
    return (
      <Popover>
        <PopoverTrigger>
          <Button variant="outline">Open</Button>
        </PopoverTrigger>
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Dimensions</PopoverTitle>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    );
  }

  test("nothing until the trigger is pressed", () => {
    render(() => <Fixture />);
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  test("opening it puts it in the document, placed", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();

    const popover = document.querySelector('[data-slot="popover-content"]') as HTMLElement;
    expect(popover).not.toBeNull();
    expect(popover.getAttribute("data-placement")).toBeTruthy();
    expect(popover.getAttribute("style")).toContain("position");
  });

  test("the trigger says it is expanded", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Open" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  test("Escape closes it", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    await user.keyboard("{Escape}");
    await settle();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  });
});
