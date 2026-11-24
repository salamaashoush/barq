import { type Child, For, Show, createSignal, onCleanup, untrack } from "@barqjs/core";
import { shortcut } from "@barqjs/primitives/keyboard";
import { useRouter } from "@barqjs/router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@barqjs/ui/command";
import { isServer } from "@barqjs/web";
import { variants } from "@barqjs/css";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { useArcMessages } from "./messages.ts";

import type { NavIcon } from "./app-shell.tsx";
import type { LinkTarget } from "./link.ts";

/** One entry of the palette: a place to go (`to`), a thing to do (`onSelect`), or both. */
export interface CommandMenuAction extends Partial<LinkTarget> {
  label: string;
  icon?: NavIcon;
  /** More words it is found by, which are not shown. */
  keywords?: readonly string[];
  /** The keys shown beside it, such as `"G P"`. Shown only; binding them is the caller's. */
  keys?: string;
  /** Runs after the palette has closed, and after the navigation to `to` has started. */
  onSelect?: () => void;
  disabled?: boolean;
}

export interface CommandMenuGroup {
  /** Shown above the group. Groups with one heading are drawn as one. */
  heading: string;
  actions: readonly CommandMenuAction[];
}

type Source = () => readonly CommandMenuGroup[];

// The registry lives beside the signal that announces it, which is what lets a
// component register from its own body: the write is `ownedWrite`, and the
// list itself is read as it stands rather than as of the last flush.
let sources: readonly Source[] = [];
const [version, bump] = createSignal(0, { equals: false, ownedWrite: true });
const [opened, setOpened] = createSignal(false);

function registered(): readonly CommandMenuGroup[] {
  version();
  return sources.flatMap((source) => source());
}

/**
 * Add groups to every `<CommandMenu>` until the returned function is called.
 *
 * A function is read whenever the palette draws, so labels and the actions
 * themselves can follow state.
 */
export function registerCommands(
  groups: readonly CommandMenuGroup[] | (() => readonly CommandMenuGroup[]),
): () => void {
  const source: Source = typeof groups === "function" ? groups : () => groups;
  sources = [...sources, source];
  bump(0);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    sources = sources.filter((each) => each !== source);
    bump(0);
  };
}

/**
 * {@link registerCommands} for as long as the calling component lives: a page
 * offers its own actions while it is open.
 *
 * ```tsx
 * useCommands(() => [{ heading: "Invoice", actions: [{ label: "Send", onSelect: send }] }]);
 * ```
 */
export function useCommands(
  groups: readonly CommandMenuGroup[] | (() => readonly CommandMenuGroup[]),
): void {
  if (isServer) return;
  onCleanup(registerCommands(groups));
}

/** Open the palette from a button, a menu, anywhere. */
export function openCommandMenu(): void {
  setOpened(true);
}

function merged(...lists: (readonly CommandMenuGroup[])[]): CommandMenuGroup[] {
  const byHeading = new Map<string, CommandMenuAction[]>();
  for (const list of lists) {
    for (const group of list) {
      const actions = byHeading.get(group.heading);
      if (actions === undefined) byHeading.set(group.heading, [...group.actions]);
      else actions.push(...group.actions);
    }
  }
  return [...byHeading].map(([heading, actions]) => ({ heading, actions }));
}

export const commandMenuStyles = variants({
  slots: {
    root: arc({}),
    input: arc({}),
    list: arc({}),
    empty: arc({}),
    group: arc({}),
    item: arc({}),
    shortcut: arc({}),
  },
});

type Slots = ReturnType<typeof commandMenuStyles>;

export interface CommandMenuProps extends Customisable<Slots> {
  /** The palette's own groups. Registered ones join them, under their headings. */
  groups?: readonly CommandMenuGroup[];
  /** The combo that opens and closes it, `false` for none. @default "mod+k" */
  shortcut?: string | false;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the dialog to a screen reader. @default "Command menu" */
  title?: string;
  /** @default "Search for a page or an action." */
  description?: string;
  /** @default "Type a command or search..." */
  placeholder?: string;
  /** @default "No results found." */
  empty?: Child;
}

/**
 * The app's palette: places to go and things to do, found by typing.
 *
 * ```tsx
 * <CommandMenu
 *   groups={[
 *     { heading: "Pages", actions: [{ label: "Projects", to: "/projects", icon: Folder }] },
 *     { heading: "Theme", actions: [{ label: "Dark", onSelect: () => scheme.set("dark") }] },
 *   ]}
 * />
 * ```
 *
 * `Mod+K` (Command on Apple platforms, Control elsewhere) opens it from
 * anywhere, and `openCommandMenu()` from a button. Anything rendered may add
 * to it with `useCommands`, for as long as it is on the page.
 */
export function CommandMenu(props: CommandMenuProps) {
  const router = useRouter();
  const messages = useArcMessages();
  const cls = (): Slots => parts(commandMenuStyles(), props.classes);
  const isOpen = (): boolean => props.open ?? opened();
  const setOpen = (next: boolean): void => {
    if (props.open === undefined) setOpened(next);
    props.onOpenChange?.(next);
  };

  const combo = untrack(() => props.shortcut);
  if (combo !== false) shortcut(combo ?? "mod+k", () => setOpen(!isOpen()));

  const groups = (): CommandMenuGroup[] => merged(props.groups ?? [], registered());

  const run = (action: CommandMenuAction): void => {
    setOpen(false);
    if (action.to !== undefined) {
      void router.navigate({
        to: action.to,
        params: action.params,
        search: action.search,
        hash: action.hash,
      } as never);
    }
    action.onSelect?.();
  };

  return (
    <CommandDialog
      isOpen={isOpen()}
      onOpenChange={setOpen}
      class={arc(cls().root, props.class, props.className)}
      title={props.title ?? messages().commandMenu}
      description={props.description ?? messages().commandMenuDescription}
    >
      <CommandInput
        class={cls().input}
        placeholder={props.placeholder ?? messages().commandPlaceholder}
      />
      <CommandList class={cls().list}>
        <CommandEmpty class={cls().empty}>{props.empty ?? messages().noResults}</CommandEmpty>
        <For each={groups()}>
          {(group: CommandMenuGroup) => (
            <CommandGroup class={cls().group} heading={group.heading}>
              <For each={group.actions}>
                {(action: CommandMenuAction) => (
                  <ActionItem action={action} run={run} classes={cls()} />
                )}
              </For>
            </CommandGroup>
          )}
        </For>
      </CommandList>
    </CommandDialog>
  );
}

function ActionItem(props: {
  action: CommandMenuAction;
  run: (action: CommandMenuAction) => void;
  classes: Slots;
}) {
  const action = props.action;
  const run = props.run;
  const Icon = action.icon;
  return (
    <CommandItem
      value={action.label}
      keywords={action.keywords === undefined ? undefined : [...action.keywords]}
      disabled={action.disabled === true}
      class={props.classes.item}
      data-slot="command-menu-item"
      onSelect={() => run(action)}
    >
      {Icon === undefined ? null : <Icon />}
      <span>{action.label}</span>
      <Show when={action.keys}>
        <CommandShortcut class={props.classes.shortcut}>{action.keys}</CommandShortcut>
      </Show>
    </CommandItem>
  );
}
