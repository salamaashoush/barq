import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { ariaViolations, render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

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
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog.tsx";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "./drawer.tsx";
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

interface SheetFixtureProps {
  side?: "top" | "right" | "bottom" | "left";
}

describe("Sheet", () => {
  function Fixture(props: SheetFixtureProps) {
    return (
      <Sheet>
        <SheetTrigger>
          <Button>Filters</Button>
        </SheetTrigger>
        <SheetContent side={props.side}>
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

  // The side is an ATTRIBUTE, not a class. One class list carries all four,
  // keyed off `data-side`, which is what lets the eight styles reach the rule
  // that decides which edge the sheet comes from.
  test("the side is an attribute the class list selects on", async () => {
    render(() => <Fixture side="left" />);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await settle();

    const sheet = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
    expect(sheet.getAttribute("data-side")).toBe("left");
    const rules = rulesFor(sheet.className);
    expect(rules).toContain('[data-side="left"]');
    expect(rules).toContain('[data-side="right"]');
    expect(rules).toContain("--ui-enter-translate-x: calc(.1*-100%)");
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

interface AlertDialogFixtureProps {
  onConfirm?: () => void;
}

describe("AlertDialog", () => {
  function Fixture(props: AlertDialogFixtureProps) {
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
            <AlertDialogAction variant="destructive" onPress={() => props.onConfirm?.()}>
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

  test("the description describes it, rather than sitting there unread", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    const dialog = screen.getByRole("alertdialog");
    const described = dialog.getAttribute("aria-describedby");
    expect(described).not.toBeNull();
    expect(document.getElementById(described ?? "")?.textContent).toBe("This cannot be undone.");
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

describe("a trigger controls the overlay it opens", () => {
  test("aria-controls names the element that is the overlay, in every family", async () => {
    render(() => (
      <>
        <Popover>
          <PopoverTrigger>
            <Button>Popover</Button>
          </PopoverTrigger>
          <PopoverContent>Popover body</PopoverContent>
        </Popover>
        <Dialog>
          <DialogTrigger>
            <Button>Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Dialog title</DialogTitle>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger>
            <Button>Sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle>Sheet title</SheetTitle>
          </SheetContent>
        </Sheet>
        <AlertDialog>
          <AlertDialogTrigger>
            <Button>Alert</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Alert title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
        <Drawer>
          <DrawerTrigger>
            <Button>Drawer</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerTitle>Drawer title</DrawerTitle>
          </DrawerContent>
        </Drawer>
      </>
    ));
    for (const name of ["Popover", "Dialog", "Sheet", "Alert", "Drawer"]) {
      const trigger = screen.getByRole("button", { name });
      await user.click(trigger);
      await settle();
      const controlled = trigger.getAttribute("aria-controls") ?? "";
      const overlay = document.getElementById(controlled);
      expect(overlay).not.toBeNull();
      expect(overlay?.textContent).toContain(name === "Alert" ? "Alert title" : name);
      if (name === "Popover") {
        const broken = (await ariaViolations(document.body)).filter(
          (one) => one.rule === "aria-referenced-id-exists",
        );
        expect(broken).toEqual([]);
      }
      await user.keyboard("{Escape}");
      await settle();
    }
  });
});

describe("a popover given an id of its own", () => {
  test("keeps it, and the trigger's aria-controls names it", async () => {
    render(() => (
      <Popover>
        <PopoverTrigger>
          <Button>Open</Button>
        </PopoverTrigger>
        <PopoverContent id="details">Body</PopoverContent>
      </Popover>
    ));
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    await settle();
    expect(trigger.getAttribute("aria-controls")).toBe("details");
    expect(document.getElementById("details")?.textContent).toBe("Body");
  });
});
