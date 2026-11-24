import type { JSX } from "@barqjs/web";
import { type Child, createContext, getContext } from "@barqjs/core";

import type { DiagramToCodeOptions } from "../editor/magic-frame.ts";
import type { TextToDiagramOptions } from "../ttd/types.ts";
import type { CommandPaletteItem } from "./command-palette.tsx";

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
  onStateChange?: (state: { name: string; tab?: string } | null) => void;
}

/**
 * What the components given to `<DiagramEditor>` as children hand to the
 * editor's UI, by where they go: Excalidraw's tunnels.
 */
export interface HostSlots {
  mainMenu: { children?: Child; onSelect?: (event: Event) => void };
  welcomeScreen: { children?: Child };
  footer: { children?: Child };
  defaultSidebar: DefaultSidebarProps;
  defaultSidebarTrigger: {
    icon?: Child;
    title?: string;
    children?: Child;
    onToggle?: (open: boolean) => void;
    class?: string;
  };
  defaultSidebarTabTriggers: { children?: Child };
  ttdDialog: TextToDiagramOptions;
  ttdDialogTrigger: { children?: Child; icon?: Child };
  diagramToCode: DiagramToCodeOptions;
  commandPalette: { customCommandPaletteItems?: CommandPaletteItem[] };
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
export const isHostChild = (): boolean => getContext(HostChildrenContext);

/** What a host child hands over to the UI. */
export const hostSlot = <K extends HostSlotName>(name: K, props: HostSlots[K]): JSX.Element =>
  ({ [SLOT]: name, props }) satisfies SlotMarker<K> as unknown as JSX.Element;

const isSlotMarker = (value: unknown): value is SlotMarker =>
  typeof value === "object" && value !== null && SLOT in value;

/** The children, sorted into what goes into the UI's places and what renders as it is. */
export interface HostChildren {
  slots: Partial<HostSlots>;
  rest: unknown[];
}

export const collectHostChildren = (children: readonly unknown[]): HostChildren => {
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
};
