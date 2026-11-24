import type { JSX } from "@barqjs/web";
import { type Child, createContext, getContext } from "@barqjs/core";

import type { DiagramToCodeOptions } from "../editor/magic-frame.ts";
import type { TextToDiagramOptions } from "../ttd/types.ts";
import type { CommandPaletteItem } from "./command-palette.tsx";

export interface OpenSidebarRef {
  name: string;
  tab?: string;
}

/** The props a `<DefaultSidebar>` child passes, Excalidraw's. */
export interface DefaultSidebarProps {
  /** More `Sidebar.Tab`s, after the search and the library. */
  children?: Child;
  class?: string;
  /** Whether it is docked, in place of the user's preference. */
  docked?: boolean;
  /** Hears the dock button; `false` takes the button away. */
  onDock?: ((docked: boolean) => void) | false;
  /** Hears the sidebar open, close or change tab. */
  onStateChange?: (state: OpenSidebarRef | null) => void;
}

export interface MainMenuSlot {
  children?: Child;
  onSelect?: (event: Event) => void;
}

export interface ChildrenProps {
  children?: Child;
}

export interface SidebarTriggerSlot {
  icon?: Child;
  title?: string;
  children?: Child;
  onToggle?: (open: boolean) => void;
  class?: string;
}

export interface TtdTriggerSlot {
  children?: Child;
  icon?: Child;
}

export interface CommandPaletteSlot {
  customCommandPaletteItems?: CommandPaletteItem[];
}

/**
 * What the components given to `<DiagramEditor>` as children hand to the
 * editor's UI, by where they go: Excalidraw's tunnels.
 */
export interface HostSlots {
  mainMenu: MainMenuSlot;
  welcomeScreen: ChildrenProps;
  footer: ChildrenProps;
  defaultSidebar: DefaultSidebarProps;
  defaultSidebarTrigger: SidebarTriggerSlot;
  defaultSidebarTabTriggers: ChildrenProps;
  ttdDialog: TextToDiagramOptions;
  ttdDialogTrigger: TtdTriggerSlot;
  diagramToCode: DiagramToCodeOptions;
  commandPalette: CommandPaletteSlot;
}

export type HostSlotName = keyof HostSlots;

const SLOT = Symbol("diagram-host-slot");

interface SlotMarker<K extends HostSlotName = HostSlotName> {
  readonly [SLOT]: K;
  readonly props: HostSlots[K];
}

/**
 * True while `<DiagramEditor>` reads its children: a component that goes
 * somewhere in the editor's UI hands its props over instead of rendering.
 */
export const HostChildrenContext = createContext(false);

/** Whether the component is a direct child of `<DiagramEditor>`, to hand over rather than render. */
export function isHostChild(): boolean {
  return getContext(HostChildrenContext);
}

/** What a host child hands over to the UI. */
export function hostSlot<K extends HostSlotName>(name: K, props: HostSlots[K]): JSX.Element {
  return { [SLOT]: name, props } satisfies SlotMarker<K> as unknown as JSX.Element;
}

function isSlotMarker(value: unknown): value is SlotMarker {
  return typeof value === "object" && value !== null && SLOT in value;
}

/** The children, sorted into what goes into the UI's places and what renders as it is. */
export interface HostChildren {
  slots: Partial<HostSlots>;
  rest: unknown[];
}

export function collectHostChildren(children: readonly unknown[]): HostChildren {
  const slots: Partial<Record<HostSlotName, unknown>> = {};
  const rest: unknown[] = [];
  for (const child of children) {
    if (isSlotMarker(child)) {
      // the last of a kind wins, as the last tunnel entry shows
      slots[child[SLOT]] = child.props;
    } else if (child !== null && child !== undefined && child !== false && child !== true) {
      rest.push(child);
    }
  }
  return { slots: slots as Partial<HostSlots>, rest };
}
