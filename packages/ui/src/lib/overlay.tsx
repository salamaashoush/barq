/**
 * The state a trigger and its overlay share, and the context that carries it.
 *
 * shadcn's overlays are three components — a root that holds `open`, a trigger,
 * and the content — and the two ends have to find each other. Radix does it
 * with a context per family, and so does this: one context per family rather
 * than one shared one, because a `<DropdownMenuContent>` inside a `<Dialog>`
 * would otherwise find the dialog's state and open the wrong thing.
 *
 * The trigger's own props reach the control through `provideTriggerSlot`, which
 * is how `<Button>` picks up `aria-expanded` and the press handler without
 * being wrapped in anything. A wrapper would be an element that focus never
 * reaches and that `aria-haspopup` would then be on.
 */

import {
  overlayTrigger,
  overlayTriggerState,
  type OverlayTriggerState,
} from "@barqjs/aria/overlays";
import { PortalProvider } from "@barqjs/aria/dialog";
import { fromProps, type DOMProps } from "@barqjs/aria/utils";
import {
  createContext,
  createSignal,
  getContext,
  getOwner,
  onCleanup,
  provide,
  type Accessor,
  type Child,
  type Incoming,
  type JSXElement,
} from "@barqjs/core";
import { ref as makeRef } from "@barqjs/primitives/refs";

import { TriggerPart, type TriggerPartProps } from "./trigger.tsx";

export interface OverlayValue {
  state: OverlayTriggerState;
  /** The control the overlay is anchored to and returns focus to. */
  triggerRef: ReturnType<typeof makeRef<HTMLElement>>;
  /**
   * An element to place the overlay against instead of the trigger: a
   * popover's `<PopoverAnchor>`. Focus still returns to the trigger.
   */
  anchorRef: ReturnType<typeof makeRef<HTMLElement>>;
  /**
   * What the family's `*Overlay` part was given, for the content to put on the
   * element behind it. `null` until one is rendered.
   */
  underlay: Accessor<DOMProps | null>;
  setUnderlay: (props: DOMProps | null) => void;
}

/**
 * Hand the family's content what its `*Overlay` part was given.
 *
 * shadcn's `<DialogOverlay>` is an element the caller places. Here the modal
 * draws the element behind its content itself, because the two have to enter
 * and leave together, so the part is a REQUEST: it renders nothing, and what it
 * was given lands on the element the modal draws.
 */
export function registerUnderlay(value: OverlayValue, props: DOMProps): void {
  value.setUnderlay(props);
  onCleanup(() => value.setUnderlay(null));
}

export interface OverlayPortalProps {
  children?: Child;
  /** Where the overlay inside is rendered. @default the portal target in scope, then the body */
  container?: Element | null;
}

/**
 * A family's `*Portal` part.
 *
 * Every overlay here portals itself, so the part has one job left: naming a
 * container other than the body. Without one it changes nothing, and in
 * particular does not undo a container set further up.
 */
export function OverlayPortal(props: Incoming<OverlayPortalProps>) {
  if (props.container === undefined) return <>{props.children}</>;
  return (
    <PortalProvider getContainer={() => props.container?.() ?? null}>
      {props.children}
    </PortalProvider>
  );
}

export interface OverlayRootProps {
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export interface OverlayFamily {
  Root: (props: Incoming<OverlayRootProps>) => JSXElement;
  Trigger: (props: Incoming<TriggerPartProps>) => JSXElement;
  use: () => OverlayValue;
}

export type OverlayKind = "dialog" | "menu" | "listbox" | "tree" | "grid";

export function overlayFamily(name: string, kind: OverlayKind = "dialog"): OverlayFamily {
  const Context = createContext<OverlayValue | null>(null);
  // `AlertDialog` is `alert-dialog`, which is what its parts' slots start with.
  const slotName = name.replace(/(?<=[a-z])(?=[A-Z])/g, "-").toLowerCase();

  const use = (): OverlayValue => {
    const value = getContext(Context);
    if (value === null || value === undefined) {
      throw new Error(`This must be rendered inside a <${name}>.`);
    }
    return value;
  };

  function Root(props: Incoming<OverlayRootProps>) {
    const state = overlayTriggerState(fromProps(props));
    const [underlay, setUnderlay] = createSignal<DOMProps | null>(null, { ownedWrite: true });
    const value: OverlayValue = {
      state,
      triggerRef: makeRef<HTMLElement>(),
      anchorRef: makeRef<HTMLElement>(),
      underlay,
      setUnderlay: (next) => setUnderlay(() => next),
    };

    const owner = getOwner();
    // `provide`, not `install`: a component gets no scope of its own, so
    // installing on the ambient owner writes where its SIBLINGS read, and two
    // dialogs beside each other would share one open state.
    if (owner === null) return <>{props.children}</>;
    return provide(
      Context,
      () => value,
      () => props.children as unknown,
    );
  }

  function Trigger(props: Incoming<TriggerPartProps>) {
    const value = use();
    const { triggerProps } = overlayTrigger({ type: kind }, value.state);

    return (
      <TriggerPart
        slot={{
          props: {
            ...triggerProps,
            "data-state": () => (value.state.isOpen() ? "open" : "closed"),
          },
          ref: value.triggerRef.set,
        }}
        render={props.render?.()}
        name={`${slotName}-trigger`}
      >
        {props.children}
      </TriggerPart>
    );
  }

  return { Root, Trigger, use };
}
