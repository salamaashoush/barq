/**
 * A modal and the page outside it, checked from `document.body`.
 *
 * The page behind a modal has to be out of reach for everyone: hidden from a
 * screen reader AND out of the Tab order. `aria-hidden` alone does only the
 * first, which leaves a control that takes focus and cannot say what it is,
 * and `ariaViolations` reports it as `aria-hidden-focus`. Each check here is
 * the whole document, because the outside is the part under test.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import { ariaViolations, render, screen, tick, user } from "@barqjs/testing";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog.tsx";
import { Button } from "./ui/button.tsx";
import { Combobox } from "./ui/combobox.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { Select, SelectItem } from "./ui/select.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip.tsx";

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round++) {
    flush();
    await tick();
  }
  flush();
}

function violations(): string[] {
  return ariaViolations(document.body).map(
    (entry) => `[${entry.rule}] ${entry.message} ${entry.html}`,
  );
}

function isInert(element: Element): boolean {
  return element.closest("[inert]") !== null;
}

const OPTIONS = [
  { id: "small", name: "Small" },
  { id: "large", name: "Large" },
];

afterEach(async () => {
  await settle();
});

interface ModalCase {
  name: string;
  render: () => Child;
}

describe("the page outside an open modal", () => {
  const modals: ModalCase[] = [
    {
      name: "Dialog",
      render: () => (
        <Dialog>
          <DialogTrigger>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>Change how it looks.</DialogDescription>
            </DialogHeader>
            <DialogClose>Done</DialogClose>
          </DialogContent>
        </Dialog>
      ),
    },
    {
      name: "AlertDialog",
      render: () => (
        <AlertDialog>
          <AlertDialogTrigger>
            <Button>Open</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete it?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Done</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
    {
      name: "Sheet",
      render: () => (
        <Sheet>
          <SheetTrigger>
            <Button>Open</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Narrow the list.</SheetDescription>
            </SheetHeader>
            <SheetClose>Done</SheetClose>
          </SheetContent>
        </Sheet>
      ),
    },
    {
      name: "Drawer",
      render: () => (
        <Drawer>
          <DrawerTrigger>
            <Button>Open</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Move goal</DrawerTitle>
              <DrawerDescription>Set your daily goal.</DrawerDescription>
            </DrawerHeader>
            <DrawerClose>Done</DrawerClose>
          </DrawerContent>
        </Drawer>
      ),
    },
  ];

  for (const modal of modals) {
    test(`${modal.name}: inert while open, its trigger out of the Tab order, given back on close`, async () => {
      render(() => (
        <>
          <button type="button">Outside</button>
          {modal.render()}
        </>
      ));
      const outside = screen.getByRole("button", { name: "Outside" });
      const trigger = screen.getByRole("button", { name: "Open" });
      await user.click(trigger);
      await settle();

      expect(isInert(trigger)).toBe(true);
      expect(isInert(outside)).toBe(true);
      expect(isInert(screen.getByRole("button", { name: "Done" }))).toBe(false);
      expect(violations()).toEqual([]);

      for (let step = 0; step < 4; step++) {
        user.tab();
        expect(document.activeElement).not.toBe(trigger);
        expect(document.activeElement).not.toBe(outside);
      }

      await user.click(screen.getByRole("button", { name: "Done" }));
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await settle();

      expect(document.querySelector("[inert]")).toBeNull();
      expect(document.querySelector("[aria-hidden=true]")).toBeNull();
      expect(violations()).toEqual([]);
    });
  }
});

describe("a modal opened from inside a modal", () => {
  test("makes the outer one inert while it is open, and gives it back on closing", async () => {
    render(() => (
      <>
        <button type="button">Outside</button>
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Outer</DialogTitle>
            <Dialog>
              <DialogTrigger>
                <Button>Next</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Inner</DialogTitle>
                <DialogClose>Back</DialogClose>
              </DialogContent>
            </Dialog>
          </DialogContent>
        </Dialog>
      </>
    ));
    await settle();
    const outside = screen.getByRole("button", { name: "Outside" });
    const next = screen.getByRole("button", { name: "Next" });
    expect(isInert(outside)).toBe(true);
    expect(isInert(next)).toBe(false);

    await user.click(next);
    await settle();
    expect(isInert(next)).toBe(true);
    expect(isInert(outside)).toBe(true);
    expect(isInert(screen.getByRole("button", { name: "Back" }))).toBe(false);
    expect(violations()).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Back" }));
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await settle();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(isInert(next)).toBe(false);
    expect(isInert(outside)).toBe(true);
    expect(violations()).toEqual([]);
  });
});

interface InModalProps {
  children: Child;
}

describe("a popup opened from inside a modal", () => {
  function InModal(props: InModalProps) {
    return (
      <>
        <button type="button">Outside</button>
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Settings</DialogTitle>
            {props.children}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  test("a Popover stays reachable, and its control takes focus", async () => {
    render(() => (
      <InModal>
        <Popover>
          <PopoverTrigger>
            <Button>Size</Button>
          </PopoverTrigger>
          <PopoverContent>
            <button type="button">Apply</button>
          </PopoverContent>
        </Popover>
      </InModal>
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "Size" }));
    await settle();

    const apply = screen.getByRole("button", { name: "Apply" });
    expect(isInert(apply)).toBe(false);
    apply.focus();
    expect(document.activeElement).toBe(apply);
    expect(isInert(screen.getByRole("button", { name: "Outside" }))).toBe(true);
    expect(violations()).toEqual([]);
  });

  test("a Select's list stays reachable and choosing from it works", async () => {
    const chosen: string[] = [];
    render(() => (
      <InModal>
        <Select
          items={OPTIONS}
          aria-label="Size"
          placeholder="Pick one"
          onSelectionChange={(key) => chosen.push(String(key))}
        >
          {(option: (typeof OPTIONS)[number]) => <SelectItem>{option.name}</SelectItem>}
        </Select>
      </InModal>
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: /Size/ }));
    await settle();

    const large = screen.getByRole("option", { name: "Large" });
    expect(isInert(large)).toBe(false);
    expect(violations()).toEqual([]);
    await user.click(large);
    await settle();
    expect(chosen).toEqual(["large"]);
  });

  test("a Combobox's list stays reachable and choosing from it works", async () => {
    const chosen: (string | null)[] = [];
    render(() => (
      <InModal>
        <Combobox
          items={OPTIONS}
          placeholder="Pick one"
          aria-label="Size"
          label={(option: (typeof OPTIONS)[number]) => option.name}
          onChange={(key) => chosen.push(key === null ? null : String(key))}
        />
      </InModal>
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: /Size|Pick one/ }));
    await settle();

    const large = screen.getByRole("option", { name: "Large" });
    expect(isInert(large)).toBe(false);
    await user.click(large);
    await settle();
    expect(chosen).toEqual(["large"]);
  });

  test("a DropdownMenu stays reachable and its items act", async () => {
    const acted: string[] = [];
    render(() => (
      <InModal>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button>Actions</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            items={OPTIONS}
            aria-label="Actions"
            onAction={(key) => acted.push(String(key))}
          >
            {(option: (typeof OPTIONS)[number]) => (
              <DropdownMenuItem>{option.name}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </InModal>
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await settle();

    const large = screen.getByRole("menuitem", { name: "Large" });
    expect(isInert(large)).toBe(false);
    expect(violations()).toEqual([]);
    await user.click(large);
    await settle();
    expect(acted).toEqual(["large"]);
  });

  test("a Tooltip stays hoverable, so the pointer can travel onto it", async () => {
    render(() => (
      <InModal>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Button>Save</Button>
            </TooltipTrigger>
            <TooltipContent>Saves it</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </InModal>
    ));
    await settle();
    user.hover(screen.getByRole("button", { name: "Save" }));
    await settle();

    const tip = screen.getByRole("tooltip");
    expect(isInert(tip)).toBe(false);
    expect(tip.closest("[aria-hidden=true]")).toBeNull();
    expect(violations()).toEqual([]);
  });
});
