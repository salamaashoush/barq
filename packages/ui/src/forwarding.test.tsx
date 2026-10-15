/**
 * What a caller writes on a part reaches the element the part renders.
 *
 * `class`, `style`, `id`, a `data-*` attribute, an `aria-*` attribute and a
 * `ref`, on every `*Content`, `*Trigger` and `*Item` that renders an element.
 * A part that builds its element through another component has to hand each of
 * them on by name, and the one it forgets is dropped without a word:
 * `<SheetContent style={…}>` rendered a sheet with no style and no error.
 *
 * A trigger that renders NO element (`DialogTrigger`, `PopoverTrigger`: the
 * control inside takes the slot) has nothing to receive them and is not here.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { For, flush, type JSXElement } from "@barqjs/core";
import { render, tick, user } from "@barqjs/testing";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion.tsx";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";
import { Attachment, AttachmentContent, AttachmentTrigger } from "./ui/attachment.tsx";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList } from "./ui/breadcrumb.tsx";
import { Bubble, BubbleContent } from "./ui/bubble.tsx";
import { Card, CardContent } from "./ui/card.tsx";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltipContent,
} from "./ui/chart.tsx";
import { Carousel, CarouselContent, CarouselItem } from "./ui/carousel.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible.tsx";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "./ui/combobox.tsx";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command.tsx";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ui/context-menu.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Button } from "./ui/button.tsx";
import { Empty, EmptyContent } from "./ui/empty.tsx";
import { Field, FieldContent } from "./ui/field.tsx";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card.tsx";
import { Item, ItemContent } from "./ui/item.tsx";
import { Marker, MarkerContent } from "./ui/marker.tsx";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "./ui/menubar.tsx";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from "./ui/message-scroller.tsx";
import { Message, MessageContent } from "./ui/message.tsx";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./ui/navigation-menu.tsx";
import { Pagination, PaginationContent, PaginationItem } from "./ui/pagination.tsx";
import { Popover, PopoverContent } from "./ui/popover.tsx";
import { Questionnaire, QuestionnaireItem, QuestionnaireTitle } from "./ui/questionnaire.tsx";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/sidebar.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";
import {
  Toast,
  ToastContent,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  type ToastObject,
} from "./ui/toast.tsx";
import { Tooltip, TooltipContent } from "./ui/tooltip.tsx";

/**
 * What the caller writes on the part under test.
 *
 * Spread onto a component, a value arrives as the Cell a written prop would
 * be, and a function is taken for one already. The `ref` is therefore a Cell
 * that yields the callback, which is what `ref={callback}` compiles to.
 */
interface Given {
  class: string;
  style: Record<string, string>;
  id: string;
  "data-caller": string;
  "aria-describedby": string;
  ref: () => (element: Element | null) => void;
}

let handed: (Element | null)[] = [];

const record = (element: Element | null): void => {
  handed.push(element);
};

const given = (): Given => ({
  class: "caller-class",
  style: { "--caller": "1" },
  id: "caller-id",
  "data-caller": "yes",
  "aria-describedby": "caller-note",
  ref: () => record,
});

afterEach(() => {
  handed = [];
});

interface Row {
  /** The component, as exported. */
  readonly part: string;
  /** The `data-slot` of the element the part renders. */
  readonly slot: string;
  readonly tree: (given: Given) => JSXElement;
  /** Brings a part that is not drawn at rest into the document. */
  readonly reveal?: () => void | Promise<void>;
  /**
   * The control inside the part's element, where it wraps one.
   *
   * A radio's `id`, its description and its `ref` belong on the `<input>`: it
   * is the labelable element, and what a `<label for>` and a form address.
   */
  readonly control?: (element: HTMLElement) => HTMLElement;
  /**
   * The element with the part's ROLE, where that is not its box.
   *
   * A dialog's panel is what is styled and measured; the `role="dialog"`
   * inside it is what a description describes.
   */
  readonly role?: (element: HTMLElement) => HTMLElement;
  /**
   * The element the caller's class is for, where that is not the part's own.
   *
   * A collapsing panel is a grid track that animates and holds one child, and
   * a class on the track would be a class on the animation. It goes on the
   * child, which is where upstream's accordion puts it too.
   */
  readonly styled?: (element: HTMLElement) => HTMLElement;
  /**
   * Why `id` is the part's own and not the caller's to place.
   *
   * An item in a collection takes `id` as its KEY, the way `value` is one, and
   * the element's id is what `aria-activedescendant` and `aria-controls`
   * address: a tab and its panel, a trigger and the menu it opens.
   */
  readonly ownsId?: "the item's key" | "what its trigger or panel addresses";
}

/** Which of a menu family's parts take `id` for themselves. */
const ownership = (part: string): Row["ownsId"] => {
  if (/^(ContextMenu|DropdownMenu|Menubar)\w*(Item|SubTrigger)$/.test(part))
    return "the item's key";
  if (/^(DropdownMenu|Menubar)Content$|^NavigationMenuTrigger$/.test(part)) {
    return "what its trigger or panel addresses";
  }
  return undefined;
};

const dialogRole = (element: HTMLElement): HTMLElement =>
  element.querySelector('[role="dialog"], [role="alertdialog"]') as HTMLElement;

const press = async (name: string): Promise<void> => {
  const found = [...document.querySelectorAll<HTMLElement>("button, [role='menuitem']")].find(
    (each) => each.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`nothing to press named ${name}`);
  await user.click(found);
  flush();
  await tick();
};

const SERIES = [{ key: "sales", label: "Sales", color: "var(--chart-1)" }];

const RAISED = createToastManager();

const ROWS: readonly Row[] = [
  {
    part: "AccordionItem",
    slot: "accordion-item",
    tree: (caller) => (
      <Accordion type="single" defaultValue="one">
        <AccordionItem value="one" {...caller}>
          <AccordionTrigger>Shipping</AccordionTrigger>
          <AccordionContent>Two days.</AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
  },
  {
    part: "AccordionTrigger",
    slot: "accordion-trigger",
    tree: (caller) => (
      <Accordion type="single" defaultValue="one">
        <AccordionItem value="one">
          <AccordionTrigger {...caller}>Shipping</AccordionTrigger>
          <AccordionContent>Two days.</AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
  },
  {
    part: "AccordionContent",
    slot: "accordion-content",
    styled: (element) => element.firstElementChild as HTMLElement,
    tree: (caller) => (
      <Accordion type="single" defaultValue="one">
        <AccordionItem value="one">
          <AccordionTrigger>Shipping</AccordionTrigger>
          <AccordionContent {...caller}>Two days.</AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
  },
  {
    part: "AlertDialogContent",
    slot: "alert-dialog-content",
    role: dialogRole,
    tree: (caller) => (
      <AlertDialog defaultOpen>
        <AlertDialogContent {...caller}>
          <AlertDialogTitle>Delete the project?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
  {
    part: "AttachmentContent",
    slot: "attachment-content",
    tree: (caller) => (
      <Attachment>
        <AttachmentContent {...caller}>report.pdf</AttachmentContent>
      </Attachment>
    ),
  },
  {
    part: "AttachmentTrigger",
    slot: "attachment-trigger",
    tree: (caller) => (
      <Attachment>
        <AttachmentTrigger {...caller} aria-label="Open report.pdf" />
      </Attachment>
    ),
  },
  {
    part: "BreadcrumbItem",
    slot: "breadcrumb-item",
    tree: (caller) => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem {...caller}>Home</BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ),
  },
  {
    part: "BubbleContent",
    slot: "bubble-content",
    tree: (caller) => (
      <Bubble>
        <BubbleContent {...caller}>Just now.</BubbleContent>
      </Bubble>
    ),
  },
  {
    part: "CardContent",
    slot: "card-content",
    tree: (caller) => (
      <Card>
        <CardContent {...caller}>Twelve invoices.</CardContent>
      </Card>
    ),
  },
  {
    part: "CarouselContent",
    slot: "carousel-content",
    tree: (caller) => (
      <Carousel aria-label="Featured">
        <CarouselContent {...caller}>
          <CarouselItem>One</CarouselItem>
        </CarouselContent>
      </Carousel>
    ),
  },
  {
    part: "CarouselItem",
    slot: "carousel-item",
    tree: (caller) => (
      <Carousel aria-label="Featured">
        <CarouselContent>
          <CarouselItem {...caller}>One</CarouselItem>
        </CarouselContent>
      </Carousel>
    ),
  },
  {
    part: "CollapsibleTrigger",
    slot: "collapsible-trigger",
    tree: (caller) => (
      <Collapsible defaultOpen>
        <CollapsibleTrigger {...caller}>Details</CollapsibleTrigger>
        <CollapsibleContent>Hidden until asked for.</CollapsibleContent>
      </Collapsible>
    ),
  },
  {
    part: "CollapsibleContent",
    slot: "collapsible-content",
    styled: (element) => element.firstElementChild as HTMLElement,
    tree: (caller) => (
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent {...caller}>Hidden until asked for.</CollapsibleContent>
      </Collapsible>
    ),
  },
  {
    part: "ComboboxTrigger",
    slot: "combobox-trigger",
    tree: (caller) => (
      <Combobox aria-label="Fruit">
        <ComboboxTrigger {...caller} aria-label="Open" />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="apple">Apple</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ),
  },
  {
    part: "ComboboxContent",
    slot: "combobox-content",
    tree: (caller) => (
      <Combobox aria-label="Fruit" defaultOpen>
        <ComboboxInput placeholder="Search" />
        <ComboboxContent {...caller}>
          <ComboboxList>
            <ComboboxItem value="apple">Apple</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ),
  },
  {
    part: "ComboboxItem",
    slot: "combobox-item",
    ownsId: "the item's key",
    tree: (caller) => (
      <Combobox aria-label="Fruit" defaultOpen>
        <ComboboxInput placeholder="Search" />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="apple" {...caller}>
              Apple
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ),
  },
  {
    part: "CommandItem",
    slot: "command-item",
    tree: (caller) => (
      <Command label="Commands">
        <CommandInput placeholder="Search" />
        <CommandList>
          <CommandGroup heading="Suggestions">
            <CommandItem {...caller}>Calendar</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    ),
  },
  {
    part: "ContextMenuTrigger",
    slot: "context-menu-trigger",
    tree: (caller) => (
      <ContextMenu>
        <ContextMenuTrigger {...caller}>Right-click here</ContextMenuTrigger>
        <ContextMenuContent aria-label="Page">
          <ContextMenuItem>Reload</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),
  },
  ...(
    [
      ["ContextMenuContent", "context-menu-content"],
      ["ContextMenuItem", "context-menu-item"],
      ["ContextMenuCheckboxItem", "context-menu-checkbox-item"],
      ["ContextMenuRadioItem", "context-menu-radio-item"],
      ["ContextMenuSubTrigger", "context-menu-sub-trigger"],
      ["ContextMenuSubContent", "context-menu-sub-content"],
    ] as const
  ).map(([part, slot]): Row => ({
    part,
    slot,
    ownsId: ownership(part),
    tree: (caller) => (
      <ContextMenu>
        <ContextMenuTrigger>Right-click here</ContextMenuTrigger>
        <ContextMenuContent aria-label="Page" {...(part === "ContextMenuContent" ? caller : {})}>
          <ContextMenuItem {...(part === "ContextMenuItem" ? caller : {})}>Reload</ContextMenuItem>
          <ContextMenuCheckboxItem checked {...(part === "ContextMenuCheckboxItem" ? caller : {})}>
            Bookmarks
          </ContextMenuCheckboxItem>
          <ContextMenuRadioGroup value="salama">
            <ContextMenuRadioItem
              value="salama"
              {...(part === "ContextMenuRadioItem" ? caller : {})}
            >
              Salama
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger {...(part === "ContextMenuSubTrigger" ? caller : {})}>
              More
            </ContextMenuSubTrigger>
            <ContextMenuSubContent
              aria-label="More"
              {...(part === "ContextMenuSubContent" ? caller : {})}
            >
              <ContextMenuItem>Save as</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>
    ),
    reveal: async () => {
      user.rightClick(document.querySelector('[data-slot="context-menu-trigger"]') as Element);
      flush();
      await tick();
      if (part === "ContextMenuSubContent") await press("More");
    },
  })),
  {
    part: "DialogContent",
    slot: "dialog-content",
    role: dialogRole,
    tree: (caller) => (
      <Dialog defaultOpen>
        <DialogContent {...caller}>
          <DialogTitle>Details</DialogTitle>
          <DialogDescription>About this project.</DialogDescription>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    part: "DrawerContent",
    slot: "drawer-content",
    role: dialogRole,
    tree: (caller) => (
      <Drawer>
        <DrawerTrigger>
          <Button>Open</Button>
        </DrawerTrigger>
        <DrawerContent {...caller}>
          <DrawerTitle>Details</DrawerTitle>
          <DrawerDescription>About this project.</DrawerDescription>
        </DrawerContent>
      </Drawer>
    ),
    reveal: () => press("Open"),
  },
  ...(
    [
      ["DropdownMenuContent", "dropdown-menu-content"],
      ["DropdownMenuItem", "dropdown-menu-item"],
      ["DropdownMenuCheckboxItem", "dropdown-menu-checkbox-item"],
      ["DropdownMenuRadioItem", "dropdown-menu-radio-item"],
      ["DropdownMenuSubTrigger", "dropdown-menu-sub-trigger"],
      ["DropdownMenuSubContent", "dropdown-menu-sub-content"],
    ] as const
  ).map(([part, slot]): Row => ({
    part,
    slot,
    ownsId: ownership(part),
    tree: (caller) => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button>Open</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          aria-label="Account"
          {...(part === "DropdownMenuContent" ? caller : {})}
        >
          <DropdownMenuItem {...(part === "DropdownMenuItem" ? caller : {})}>
            Profile
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem
            checked
            {...(part === "DropdownMenuCheckboxItem" ? caller : {})}
          >
            Status bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="salama">
            <DropdownMenuRadioItem
              value="salama"
              {...(part === "DropdownMenuRadioItem" ? caller : {})}
            >
              Salama
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger {...(part === "DropdownMenuSubTrigger" ? caller : {})}>
              More
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              aria-label="More"
              {...(part === "DropdownMenuSubContent" ? caller : {})}
            >
              <DropdownMenuItem>Invite</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    reveal: async () => {
      await press("Open");
      if (part === "DropdownMenuSubContent") await press("More");
    },
  })),
  {
    part: "EmptyContent",
    slot: "empty-content",
    tree: (caller) => (
      <Empty>
        <EmptyContent {...caller}>Nothing yet.</EmptyContent>
      </Empty>
    ),
  },
  {
    part: "FieldContent",
    slot: "field-content",
    tree: (caller) => (
      <Field>
        <FieldContent {...caller}>Street</FieldContent>
      </Field>
    ),
  },
  {
    part: "HoverCardContent",
    slot: "hover-card-content",
    tree: (caller) => (
      <HoverCard defaultOpen>
        <HoverCardTrigger>
          <Button>salama</Button>
        </HoverCardTrigger>
        <HoverCardContent {...caller}>Joined in 2021.</HoverCardContent>
      </HoverCard>
    ),
  },
  {
    part: "Item",
    slot: "item",
    tree: (caller) => <Item {...caller}>Q3 report</Item>,
  },
  {
    part: "ItemContent",
    slot: "item-content",
    tree: (caller) => (
      <Item>
        <ItemContent {...caller}>Q3 report</ItemContent>
      </Item>
    ),
  },
  {
    part: "MarkerContent",
    slot: "marker-content",
    tree: (caller) => (
      <Marker>
        <MarkerContent {...caller}>Yesterday</MarkerContent>
      </Marker>
    ),
  },
  {
    part: "MenubarTrigger",
    slot: "menubar-trigger",
    tree: (caller) => (
      <Menubar aria-label="Application">
        <MenubarMenu>
          <MenubarTrigger {...caller}>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New tab</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    ),
  },
  ...(
    [
      ["MenubarContent", "menubar-content"],
      ["MenubarItem", "menubar-item"],
      ["MenubarCheckboxItem", "menubar-checkbox-item"],
      ["MenubarRadioItem", "menubar-radio-item"],
      ["MenubarSubTrigger", "menubar-sub-trigger"],
      ["MenubarSubContent", "menubar-sub-content"],
    ] as const
  ).map(([part, slot]): Row => ({
    part,
    slot,
    ownsId: ownership(part),
    tree: (caller) => (
      <Menubar aria-label="Application">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent {...(part === "MenubarContent" ? caller : {})}>
            <MenubarItem {...(part === "MenubarItem" ? caller : {})}>New tab</MenubarItem>
            <MenubarCheckboxItem checked {...(part === "MenubarCheckboxItem" ? caller : {})}>
              Bookmarks bar
            </MenubarCheckboxItem>
            <MenubarRadioGroup value="salama">
              <MenubarRadioItem value="salama" {...(part === "MenubarRadioItem" ? caller : {})}>
                Salama
              </MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSub>
              <MenubarSubTrigger {...(part === "MenubarSubTrigger" ? caller : {})}>
                Share
              </MenubarSubTrigger>
              <MenubarSubContent {...(part === "MenubarSubContent" ? caller : {})}>
                <MenubarItem>Email</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    ),
    reveal: async () => {
      await press("File");
      if (part === "MenubarSubContent") await press("Share");
    },
  })),
  {
    part: "MessageContent",
    slot: "message-content",
    tree: (caller) => (
      <Message>
        <MessageContent {...caller}>Did the build go out?</MessageContent>
      </Message>
    ),
  },
  {
    part: "MessageScrollerContent",
    slot: "message-scroller-content",
    tree: (caller) => (
      <MessageScroller>
        <MessageScrollerViewport aria-label="Support chat" role="group" tabIndex={-1}>
          <MessageScrollerContent {...caller} />
        </MessageScrollerViewport>
      </MessageScroller>
    ),
  },
  {
    part: "MessageScrollerItem",
    slot: "message-scroller-item",
    tree: (caller) => (
      <MessageScroller>
        <MessageScrollerViewport aria-label="Support chat" role="group" tabIndex={-1}>
          <MessageScrollerContent>
            <MessageScrollerItem messageId="one" {...caller}>
              Hello
            </MessageScrollerItem>
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    ),
  },
  ...(
    [
      ["NavigationMenuItem", "navigation-menu-item"],
      ["NavigationMenuTrigger", "navigation-menu-trigger"],
      ["NavigationMenuContent", "navigation-menu-content"],
    ] as const
  ).map(([part, slot]): Row => ({
    part,
    slot,
    ownsId: ownership(part),
    tree: (caller) => (
      <NavigationMenu defaultValue="docs">
        <NavigationMenuList>
          <NavigationMenuItem value="docs" {...(part === "NavigationMenuItem" ? caller : {})}>
            <NavigationMenuTrigger {...(part === "NavigationMenuTrigger" ? caller : {})}>
              Docs
            </NavigationMenuTrigger>
            <NavigationMenuContent {...(part === "NavigationMenuContent" ? caller : {})}>
              Guides
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ),
  })),
  {
    part: "PaginationContent",
    slot: "pagination-content",
    tree: (caller) => (
      <Pagination>
        <PaginationContent {...caller}>
          <PaginationItem>1</PaginationItem>
        </PaginationContent>
      </Pagination>
    ),
  },
  {
    part: "PaginationItem",
    slot: "pagination-item",
    tree: (caller) => (
      <Pagination>
        <PaginationContent>
          <PaginationItem {...caller}>1</PaginationItem>
        </PaginationContent>
      </Pagination>
    ),
  },
  {
    part: "PopoverContent",
    slot: "popover-content",
    tree: (caller) => (
      <Popover defaultOpen>
        <PopoverContent aria-label="Details" {...caller}>
          Body
        </PopoverContent>
      </Popover>
    ),
  },
  {
    part: "QuestionnaireItem",
    slot: "questionnaire-item",
    tree: (caller) => (
      <Questionnaire aria-label="Plan">
        <QuestionnaireItem name="plan" {...caller}>
          <QuestionnaireTitle>Choose a plan</QuestionnaireTitle>
        </QuestionnaireItem>
      </Questionnaire>
    ),
  },
  {
    part: "RadioGroupItem",
    slot: "radio-group-item",
    tree: (caller) => (
      <RadioGroup aria-label="Size">
        <RadioGroupItem value="s" aria-label="Small" {...caller} />
      </RadioGroup>
    ),
    control: (element) => element.querySelector("input") as HTMLElement,
  },
  {
    part: "SelectTrigger",
    slot: "select-trigger",
    tree: (caller) => (
      <Select aria-label="Fruit">
        <SelectTrigger {...caller}>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
        </SelectContent>
      </Select>
    ),
  },
  {
    part: "SelectContent",
    slot: "select-content",
    tree: (caller) => (
      <Select aria-label="Fruit" defaultOpen>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent {...caller}>
          <SelectItem value="apple">Apple</SelectItem>
        </SelectContent>
      </Select>
    ),
  },
  {
    part: "SelectItem",
    slot: "select-item",
    tree: (caller) => (
      <Select aria-label="Fruit" defaultOpen>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple" {...caller}>
            Apple
          </SelectItem>
        </SelectContent>
      </Select>
    ),
  },
  {
    part: "SheetContent",
    slot: "sheet-content",
    role: dialogRole,
    tree: (caller) => (
      <Sheet defaultOpen>
        <SheetContent {...caller}>
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>About this project.</SheetDescription>
        </SheetContent>
      </Sheet>
    ),
  },
  ...(
    [
      ["SidebarTrigger", "sidebar-trigger"],
      ["SidebarContent", "sidebar-content"],
      ["SidebarGroupContent", "sidebar-group-content"],
      ["SidebarMenuItem", "sidebar-menu-item"],
      ["SidebarMenuSubItem", "sidebar-menu-sub-item"],
    ] as const
  ).map(([part, slot]): Row => ({
    part,
    slot,
    ownsId: ownership(part),
    tree: (caller) => (
      <SidebarProvider>
        <Sidebar collapsible="none">
          <SidebarContent {...(part === "SidebarContent" ? caller : {})}>
            <SidebarGroup>
              <SidebarGroupContent {...(part === "SidebarGroupContent" ? caller : {})}>
                <SidebarMenu>
                  <SidebarMenuItem {...(part === "SidebarMenuItem" ? caller : {})}>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem {...(part === "SidebarMenuSubItem" ? caller : {})}>
                        Inbox
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarTrigger {...(part === "SidebarTrigger" ? caller : {})} />
      </SidebarProvider>
    ),
  })),
  {
    part: "TabsTrigger",
    slot: "tabs-trigger",
    ownsId: "what its trigger or panel addresses",
    tree: (caller) => (
      <Tabs defaultValue="account">
        <TabsList aria-label="Settings">
          <TabsTrigger value="account" {...caller}>
            Account
          </TabsTrigger>
        </TabsList>
        <TabsContent value="account">Name</TabsContent>
      </Tabs>
    ),
  },
  {
    part: "TabsContent",
    slot: "tabs-content",
    ownsId: "what its trigger or panel addresses",
    tree: (caller) => (
      <Tabs defaultValue="account">
        <TabsList aria-label="Settings">
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        <TabsContent value="account" {...caller}>
          Name
        </TabsContent>
      </Tabs>
    ),
  },
  {
    part: "ToggleGroupItem",
    slot: "toggle-group-item",
    tree: (caller) => (
      <ToggleGroup type="multiple" aria-label="Format">
        <ToggleGroupItem value="bold" aria-label="Bold" {...caller}>
          B
        </ToggleGroupItem>
      </ToggleGroup>
    ),
  },
  {
    part: "ChartLegendContent",
    slot: "chart-legend",
    tree: (caller) => (
      <ChartContainer config={SERIES}>
        <ChartLegend content={<ChartLegendContent {...caller} />} />
      </ChartContainer>
    ),
  },
  {
    part: "ChartTooltipContent",
    slot: "chart-tooltip",
    tree: (caller) => (
      <ChartContainer config={SERIES}>
        <ChartTooltipContent
          label="January"
          payload={[{ dataKey: "sales", name: "sales", value: 186, color: "var(--chart-1)" }]}
          {...caller}
        />
      </ChartContainer>
    ),
  },
  {
    part: "ToastContent",
    slot: "toast-content",
    tree: (caller) => (
      <ToastProvider toastManager={RAISED}>
        <ToastViewport>
          <For each={() => RAISED.toasts()} keyed={(each: ToastObject) => each.id}>
            {(each: () => ToastObject) => (
              <Toast toast={each()}>
                <ToastContent {...caller}>
                  <ToastTitle />
                </ToastContent>
              </Toast>
            )}
          </For>
        </ToastViewport>
      </ToastProvider>
    ),
    reveal: async () => {
      RAISED.add({ title: "Saved" });
      flush();
      await tick();
    },
  },
  {
    part: "TooltipContent",
    slot: "tooltip-content",
    tree: (caller) => (
      <Tooltip defaultOpen>
        <Button>Save</Button>
        <TooltipContent {...caller}>Saves the draft</TooltipContent>
      </Tooltip>
    ),
  },
];

describe("what a caller writes on a part reaches its element", () => {
  for (const row of ROWS) {
    test(row.part, async () => {
      const caller = given();
      render(() => row.tree(caller));
      flush();
      await tick();
      await row.reveal?.();

      const element = document.querySelector<HTMLElement>(`[data-slot="${row.slot}"]`);
      expect(element === null ? `no [data-slot="${row.slot}"]` : "found").toBe("found");
      if (element === null) return;
      const control = row.control?.(element) ?? element;

      const missing: string[] = [];
      if (!(row.styled?.(element) ?? element).classList.contains("caller-class")) {
        missing.push("class");
      }
      if (element.style.getPropertyValue("--caller") !== "1") missing.push("style");
      if (element.getAttribute("data-caller") !== "yes") missing.push("data-*");
      if (row.ownsId === undefined && control.id !== "caller-id") missing.push("id");
      const described = row.role?.(element) ?? control;
      if (described.getAttribute("aria-describedby")?.includes("caller-note") !== true) {
        missing.push("aria-*");
      }
      if (!handed.includes(control)) missing.push("ref");
      expect(missing).toEqual([]);
      expect(document.querySelectorAll("#caller-id")).toHaveLength(
        row.ownsId === undefined ? 1 : 0,
      );
    });
  }
});
