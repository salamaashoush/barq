/**
 * One click, one `onClick`, whichever part the control is a trigger for.
 *
 * `button()` delivers `onClick` itself, because a press is how it hears a
 * keyboard or a touch activation as well as a mouse. A handler that is also
 * bound on the element then runs twice for every mouse click, and a trigger
 * that toggles on it opens and closes in the same press.
 *
 * The handler reaches a control three ways, and each row takes the one its
 * part has: a component of the caller's own reading the slot, an element built
 * by `render`, and a part that IS the button and takes the prop.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { flush, type Child, type Incoming, type JSXElement } from "@barqjs/core";
import { accessibleName, render, user } from "@barqjs/testing";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible.tsx";
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "../ui/combobox.tsx";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.tsx";
import { TriggerPart, useTrigger, type TriggerRender } from "./trigger.tsx";

let clicks = 0;
const count = (): void => {
  clicks += 1;
};

afterEach(() => {
  clicks = 0;
});

/** A control of the caller's own, taking whatever the triggers around it offer. */
function Chip(props: Incoming<{ children?: Child }>) {
  const trigger = useTrigger();
  return (
    <button {...trigger.props} ref={trigger.ref}>
      {props.children}
    </button>
  );
}

/** What a wrapper with a click handler of its own offers the control inside it. */
function Counted(props: Incoming<{ children?: Child }>) {
  return <TriggerPart slot={{ props: { onClick: count } }}>{props.children}</TriggerPart>;
}

const rendered = (trigger: TriggerRender): JSXElement => (
  <button {...trigger.props} ref={trigger.ref}>
    Open
  </button>
);

interface Row {
  readonly part: string;
  /** The part around a control that reads the slot, inside a counting wrapper. */
  readonly slotted?: () => JSXElement;
  /** The part building its control through `render`. */
  readonly rendered?: () => JSXElement;
  /** The part that is the button, given the handler as its own prop. */
  readonly own?: () => JSXElement;
  /** Whether the part is open, where one click toggling twice would close it. */
  readonly opens?: () => boolean;
}

const control = (): HTMLElement => {
  const found = [...document.querySelectorAll<HTMLElement>("button")].find(
    (each) => accessibleName(each) === "Open",
  );
  if (found === undefined) throw new Error("no control named Open");
  return found;
};

const expanded = (): boolean => control().getAttribute("aria-expanded") === "true";

const ROWS: readonly Row[] = [
  {
    part: "DialogTrigger",
    slotted: () => (
      <Dialog>
        <Counted>
          <DialogTrigger>
            <Chip>Open</Chip>
          </DialogTrigger>
        </Counted>
        <DialogContent>
          <DialogTitle>Details</DialogTitle>
        </DialogContent>
      </Dialog>
    ),
    rendered: () => (
      <Dialog>
        <DialogTrigger render={rendered} />
        <DialogContent>
          <DialogTitle>Details</DialogTitle>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    part: "SheetTrigger",
    slotted: () => (
      <Sheet>
        <Counted>
          <SheetTrigger>
            <Chip>Open</Chip>
          </SheetTrigger>
        </Counted>
        <SheetContent>
          <SheetTitle>Details</SheetTitle>
        </SheetContent>
      </Sheet>
    ),
    rendered: () => (
      <Sheet>
        <SheetTrigger render={rendered} />
        <SheetContent>
          <SheetTitle>Details</SheetTitle>
        </SheetContent>
      </Sheet>
    ),
  },
  {
    part: "PopoverTrigger",
    slotted: () => (
      <Popover>
        <Counted>
          <PopoverTrigger>
            <Chip>Open</Chip>
          </PopoverTrigger>
        </Counted>
        <PopoverContent aria-label="Details">Body</PopoverContent>
      </Popover>
    ),
    rendered: () => (
      <Popover>
        <PopoverTrigger render={rendered} />
        <PopoverContent aria-label="Details">Body</PopoverContent>
      </Popover>
    ),
  },
  {
    part: "DropdownMenuTrigger",
    slotted: () => (
      <DropdownMenu>
        <Counted>
          <DropdownMenuTrigger>
            <Chip>Open</Chip>
          </DropdownMenuTrigger>
        </Counted>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    rendered: () => (
      <DropdownMenu>
        <DropdownMenuTrigger render={rendered} />
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  {
    part: "TooltipTrigger",
    slotted: () => (
      <Counted>
        <Tooltip>
          <TooltipTrigger>
            <Chip>Open</Chip>
          </TooltipTrigger>
          <TooltipContent>Details</TooltipContent>
        </Tooltip>
      </Counted>
    ),
  },
  {
    part: "CollapsibleTrigger",
    slotted: () => (
      <Collapsible>
        <Counted>
          <CollapsibleTrigger asChild>
            <Chip>Open</Chip>
          </CollapsibleTrigger>
        </Counted>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ),
    rendered: () => (
      <Collapsible>
        <CollapsibleTrigger render={rendered} />
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ),
    own: () => (
      <Collapsible>
        <CollapsibleTrigger onClick={count}>Open</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>
    ),
    opens: expanded,
  },
  {
    part: "SelectTrigger",
    own: () => (
      <Select aria-label="Fruit">
        <SelectTrigger onClick={count} aria-label="Open">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
        </SelectContent>
      </Select>
    ),
  },
  {
    part: "ComboboxTrigger",
    own: () => (
      <Combobox aria-label="Fruit">
        <ComboboxTrigger onClick={count} aria-label="Open" />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="apple">Apple</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ),
  },
];

describe("a trigger's onClick fires once per click", () => {
  for (const row of ROWS) {
    if (row.slotted !== undefined) {
      test(`${row.part}, around a control that reads the slot`, async () => {
        render(row.slotted as () => JSXElement);
        await user.click(control());
        flush();
        expect(clicks).toBe(1);
        if (row.opens !== undefined) expect(row.opens()).toBe(true);
      });

      test(`${row.part}, around a control that reads the slot, by a screen reader's click`, () => {
        render(row.slotted as () => JSXElement);
        user.virtualClick(control());
        flush();
        expect(clicks).toBe(1);
      });
    }

    if (row.rendered !== undefined) {
      test(`${row.part}, rendering its control`, async () => {
        render(row.rendered as () => JSXElement);
        await user.click(control());
        flush();
        // A press handled twice toggles twice, and the part is shut again.
        expect(expanded()).toBe(true);
      });
    }

    if (row.own !== undefined) {
      test(`${row.part}, as the button itself`, async () => {
        render(row.own as () => JSXElement);
        await user.click(control());
        flush();
        expect(clicks).toBe(1);
        if (row.opens !== undefined) expect(row.opens()).toBe(true);
      });
    }
  }
});
