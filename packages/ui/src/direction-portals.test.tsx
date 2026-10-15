/**
 * A portalled part is drawn outside the element that carries `dir`.
 *
 * `DirectionProvider` declares a direction and the page puts `dir` on some
 * element around the application. A dialog, a sheet or a menu is appended to
 * the body instead, where nothing says which way the text runs: its content
 * lays out left to right and its close button stays in the wrong corner. So
 * each one carries the direction declared where it was written.
 */

import { describe, expect, test } from "bun:test";
import { flush, untrack, type JSXElement } from "@barqjs/core";
import { render, tick, user } from "@barqjs/testing";

import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "./ui/alert-dialog.tsx";
import { Button } from "./ui/button.tsx";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "./ui/combobox.tsx";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog.tsx";
import { DirectionProvider } from "./ui/direction.tsx";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "./ui/drawer.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card.tsx";
import { Popover, PopoverContent } from "./ui/popover.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";
import { Command, CommandDialog, CommandInput, CommandItem, CommandList } from "./ui/command.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu.tsx";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "./ui/menubar.tsx";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet.tsx";
import { Toaster as Sonner, toast as sonner } from "./ui/sonner.tsx";
import { Toaster, toast } from "./ui/toast.tsx";
import { Tooltip, TooltipContent } from "./ui/tooltip.tsx";

interface Row {
  readonly part: string;
  readonly slot: string;
  readonly tree: () => JSXElement;
  readonly reveal?: () => Promise<void>;
  /** What it carries with nothing declared. Sonner's list always says, as upstream's does. */
  readonly undeclared?: string;
}

const press = async (name: string): Promise<void> => {
  const found = [...document.querySelectorAll<HTMLElement>("button")].find(
    (each) => each.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`nothing to press named ${name}`);
  await user.click(found);
  flush();
  await tick();
};

const openContextMenu = async (): Promise<void> => {
  const region = document.querySelector('[data-slot="context-menu-trigger"]') as HTMLElement;
  user.rightClick(region, { clientX: 40, clientY: 30 });
  flush();
  await tick();
};

const ROWS: readonly Row[] = [
  {
    part: "DialogContent",
    slot: "dialog-content",
    tree: () => (
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Details</DialogTitle>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    part: "AlertDialogContent",
    slot: "alert-dialog-content",
    tree: () => (
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogTitle>Delete the project?</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
  {
    part: "SheetContent",
    slot: "sheet-content",
    tree: () => (
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Details</SheetTitle>
        </SheetContent>
      </Sheet>
    ),
  },
  {
    part: "DrawerContent",
    slot: "drawer-content",
    tree: () => (
      <Drawer>
        <DrawerTrigger>
          <Button>Open</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Details</DrawerTitle>
        </DrawerContent>
      </Drawer>
    ),
    reveal: () => press("Open"),
  },
  {
    part: "PopoverContent",
    slot: "popover-content",
    tree: () => (
      <Popover defaultOpen>
        <PopoverContent aria-label="Details">Body</PopoverContent>
      </Popover>
    ),
  },
  {
    part: "HoverCardContent",
    slot: "hover-card-content",
    tree: () => (
      <HoverCard defaultOpen>
        <HoverCardTrigger>
          <Button>salama</Button>
        </HoverCardTrigger>
        <HoverCardContent>Joined in 2021.</HoverCardContent>
      </HoverCard>
    ),
  },
  {
    part: "TooltipContent",
    slot: "tooltip-content",
    tree: () => (
      <Tooltip defaultOpen>
        <Button>Save</Button>
        <TooltipContent>Saves the draft</TooltipContent>
      </Tooltip>
    ),
  },
  {
    part: "DropdownMenuContent",
    slot: "dropdown-menu-content",
    tree: () => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Open</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="Account">
          <DropdownMenuItem>Profile</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    reveal: () => press("Open"),
  },
  {
    part: "SelectContent",
    slot: "select-content",
    tree: () => (
      <Select aria-label="Fruit" defaultOpen>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
        </SelectContent>
      </Select>
    ),
  },
  {
    part: "ComboboxContent",
    slot: "combobox-content",
    tree: () => (
      <Combobox aria-label="Fruit" defaultOpen>
        <ComboboxInput placeholder="Search" />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="apple">Apple</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ),
  },
  {
    part: "ContextMenuContent",
    slot: "context-menu-content",
    tree: () => (
      <ContextMenu>
        <ContextMenuTrigger>Right-click here</ContextMenuTrigger>
        <ContextMenuContent aria-label="Page">
          <ContextMenuItem>Reload</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),
    reveal: openContextMenu,
  },
  {
    part: "MenubarContent",
    slot: "menubar-content",
    tree: () => (
      <Menubar aria-label="Application">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New tab</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    ),
    reveal: () => press("File"),
  },
  {
    part: "CommandDialog",
    slot: "command",
    tree: () => (
      <CommandDialog isOpen>
        <Command label="Palette">
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandItem>Open</CommandItem>
          </CommandList>
        </Command>
      </CommandDialog>
    ),
  },
  {
    part: "Toaster (toast)",
    slot: "toast-viewport",
    tree: () => <Toaster />,
    reveal: async () => {
      toast.add({ title: "Saved" });
      flush();
      await tick();
    },
  },
  {
    part: "Toaster (sonner)",
    slot: "toaster-list",
    undeclared: "ltr",
    tree: () => <Sonner />,
    reveal: async () => {
      sonner("Saved");
      flush();
      await tick();
    },
  },
];

/** The nearest `dir` at or above the part, which is what its layout follows. */
const directionOf = (slot: string): string | null => {
  const element = document.querySelector(`[data-slot="${slot}"]`);
  if (element === null) throw new Error(`no [data-slot="${slot}"]`);
  return element.closest("[dir]")?.getAttribute("dir") ?? null;
};

describe("a portalled part carries the direction declared where it was written", () => {
  for (const row of ROWS) {
    test(`${row.part}, under a right-to-left provider`, async () => {
      // Built once, untracked: a hole that builds a tree re-builds it whenever
      // the tree's own state changes, and an overlay opening is such a change.
      render(() => <DirectionProvider dir="rtl">{untrack(row.tree)}</DirectionProvider>);
      flush();
      await tick();
      await row.reveal?.();
      expect(directionOf(row.slot)).toBe("rtl");
    });

    test(`${row.part}, with no direction declared, says nothing about it`, async () => {
      render(row.tree);
      flush();
      await tick();
      await row.reveal?.();
      expect(directionOf(row.slot)).toBe(row.undeclared ?? null);
    });
  }
});
