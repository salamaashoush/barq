/**
 * The command palette, ported from
 * `apps/v4/app/(app)/(create)/components/action-menu.tsx`.
 *
 * Upstream's navigates the registry: type a component's name and the preview
 * loads it. This one searches the page's own choices, which is the same job
 * over the collection this page actually has — and it doubles as the way to
 * reach a control without a shortcut, which is what a palette is for.
 *
 * The groups are items with `children`, which is this package's collection
 * model: a section is an item whose own children are its items, so the palette
 * takes one array rather than a list of lists.
 */

import type { Incoming } from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { CommandDialog, CommandGroup, CommandItem } from "@barqjs/ui";

import { BASE_COLORS, CHART_COLORS, FONTS, RADII, STYLES, THEMES } from "./options.ts";
import type { Design, Params } from "./params.ts";

interface Entry {
  readonly id: string;
  readonly name: string;
  readonly apply?: Partial<Params>;
  readonly children?: readonly Entry[];
}

function entriesFor(
  section: string,
  key: keyof Params,
  options: readonly { value: string; label: string }[],
): Entry {
  return {
    id: section,
    name: section,
    children: options.map((option) => ({
      id: `${key}:${option.value}`,
      name: option.label,
      apply: { [key]: option.value } as Partial<Params>,
    })),
  };
}

const GROUPS: readonly Entry[] = [
  entriesFor("Style", "style", STYLES),
  entriesFor("Base Color", "baseColor", BASE_COLORS),
  entriesFor("Theme", "theme", THEMES),
  entriesFor("Chart Color", "chartColor", CHART_COLORS),
  entriesFor("Font", "font", FONTS),
  entriesFor("Radius", "radius", RADII),
];

/** Flattened once, so running a key does not walk the tree every time. */
const BY_KEY = new Map<string, Partial<Params>>(
  GROUPS.flatMap((group) =>
    (group.children ?? []).map((entry) => [entry.id, entry.apply ?? {}] as const),
  ),
);

export interface ActionMenuProps {
  design: Design;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The dialog and nothing else.
 *
 * Upstream renders no trigger either: the palette is reached from the menu or
 * from its shortcut, and a button for it would be a fifth control in a footer
 * that already has four.
 */
export function ActionMenu(props: Incoming<ActionMenuProps>) {
  const run = (key: Key): void => {
    const apply = BY_KEY.get(String(key));
    if (apply === undefined) return;
    props.design().set(apply);
    props.onOpenChange()(false);
  };

  return (
    <CommandDialog
      isOpen={props.isOpen()}
      onOpenChange={props.onOpenChange()}
      title="Search"
      description="Jump to any of this page's choices."
      items={GROUPS}
      getKey={(entry: Entry) => entry.id}
      getTextValue={(entry: Entry) => entry.name}
      getChildren={(entry: Entry) => entry.children}
      placeholder="Search"
      aria-label="Search"
      empty="No items found."
      onAction={run}
      data-slot="action-menu"
    >
      {(entry: Entry) =>
        entry.children === undefined ? (
          <CommandItem>{entry.name}</CommandItem>
        ) : (
          <CommandGroup heading={entry.name} />
        )
      }
    </CommandDialog>
  );
}
