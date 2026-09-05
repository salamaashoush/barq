/**
 * Everything that opens: a dialog, a menu, a tip.
 *
 * `size="auto"` on most of these in the registry, and it is not cosmetic — the
 * trigger is a button 36px tall and the card would be 288px of empty space
 * around it. What the reader needs is the thing that opens, which they get by
 * pressing it.
 */

import { css } from "@barqjs/css";
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
  Button,
  Command,
  CommandItem,
  CommandShortcut,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Toaster,
  Tooltip,
  TooltipContent,
  toast,
  PopoverTrigger,
} from "@barqjs/ui";

import { row } from "./shared.ts";

const ACTIONS = [
  { id: "rename", name: "Rename" },
  { id: "duplicate", name: "Duplicate" },
  { id: "delete", name: "Delete" },
];

const PALETTE = [
  { id: "new", name: "New file", keys: "⌘N" },
  { id: "open", name: "Open file", keys: "⌘O" },
  { id: "search", name: "Search the project", keys: "⌘F" },
  { id: "settings", name: "Open settings", keys: "⌘," },
];

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger>
        <Button variant="outline">Open the dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete the project?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AlertDialogDemo() {
  return (
    <AlertDialog>
      <AlertDialogTrigger>
        <Button variant="destructive">Delete everything</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>This deletes everything.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger>
        <Button variant="outline">Open the sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

const drawerBody = css`
  margin-inline: auto;
  width: 100%;
  max-width: 24rem;
`;

export function DrawerDemo() {
  return (
    <Drawer>
      <DrawerTrigger>
        <Button variant="outline">Open the drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <div class={drawerBody}>
          <DrawerHeader>
            <DrawerTitle>Move goal</DrawerTitle>
            <DrawerDescription>Set your daily activity goal.</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button>Submit</Button>
            <DrawerClose>Cancel</DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline">Open the popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Dimensions</PopoverTitle>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export function DropdownMenuDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline">Open the menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent items={ACTIONS} aria-label="Actions">
        {(action: (typeof ACTIONS)[number]) => (
          <DropdownMenuItem variant={action.id === "delete" ? "destructive" : "default"}>
            {action.name}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const dropzone = css`
  display: flex;
  height: 9rem;
  width: 100%;
  max-width: 26rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  border: 1px dashed var(--border);
  font-size: 0.875rem;
  color: var(--muted-foreground);
`;

export function ContextMenuDemo() {
  return (
    <ContextMenu>
      <ContextMenuTrigger class={dropzone}>Right-click anywhere in here</ContextMenuTrigger>
      <ContextMenuContent items={ACTIONS} aria-label="Actions">
        {(action: (typeof ACTIONS)[number]) => (
          <ContextMenuItem variant={action.id === "delete" ? "destructive" : "default"}>
            {action.name}
            <ContextMenuShortcut>{"⌘R"}</ContextMenuShortcut>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function TooltipDemo() {
  return (
    <Tooltip delay={200}>
      <Button variant="outline">Hover me</Button>
      <TooltipContent>Saves to the server</TooltipContent>
    </Tooltip>
  );
}

const hoverBody = css`
  display: grid;
  gap: calc(var(--spacing) * 2);
`;

const muted = css`
  color: var(--muted-foreground);
  font-size: 0.875rem;
`;

export function HoverCardDemo() {
  return (
    <HoverCard openDelay={200} closeDelay={200}>
      <HoverCardTrigger>
        <Button variant="link">@barq</Button>
      </HoverCardTrigger>
      <HoverCardContent>
        <div class={hoverBody}>
          <strong>@barq</strong>
          <span class={muted}>Reactive without a virtual DOM.</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function MenubarDemo() {
  return (
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent items={ACTIONS} aria-label="File">
          {(action: (typeof ACTIONS)[number]) => <MenubarItem>{action.name}</MenubarItem>}
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent items={ACTIONS} aria-label="Edit">
          {(action: (typeof ACTIONS)[number]) => <MenubarItem>{action.name}</MenubarItem>}
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent items={ACTIONS} aria-label="View">
          {(action: (typeof ACTIONS)[number]) => <MenubarItem>{action.name}</MenubarItem>}
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}

const palette = css`
  width: 100%;
  max-width: 26rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
`;

export function CommandDemo() {
  return (
    <div class={palette}>
      <Command items={PALETTE} placeholder="Type a command or search" aria-label="Commands">
        {(entry: (typeof PALETTE)[number]) => (
          <CommandItem>
            {entry.name}
            <CommandShortcut>{entry.keys}</CommandShortcut>
          </CommandItem>
        )}
      </Command>
    </div>
  );
}

/**
 * `<Toaster />` is in the demo, not in the page.
 *
 * The toaster is where the toasts land, and one per application is the rule —
 * a page that mounted one for every component's card would stack sixty
 * viewports on top of each other. So the component that raises a toast brings
 * its own.
 */
export function SonnerDemo() {
  return (
    <div class={row}>
      <Toaster />
      <Button variant="outline" onPress={() => toast("Saved")}>
        Default
      </Button>
      <Button variant="outline" onPress={() => toast.success("Everything worked")}>
        Success
      </Button>
      <Button
        variant="outline"
        onPress={() => toast.error("That did not work", { description: "Try again in a bit" })}
      >
        Error
      </Button>
    </div>
  );
}

export function SonnerAction() {
  return (
    <div class={row}>
      <Toaster />
      <Button
        variant="outline"
        onPress={() =>
          toast("Deleted three files", {
            action: { label: "Undo", onAction: () => toast.success("Restored") },
          })
        }
      >
        With an action
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          void toast.promise(new Promise((resolve) => setTimeout(resolve, 1200)), {
            loading: "Saving",
            success: "Saved",
            error: "Failed",
          })
        }
      >
        Promise
      </Button>
    </div>
  );
}
