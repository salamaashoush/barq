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
import { fromProps, provideTriggerSlot } from "@barqjs/aria/utils";
import {
  context,
  getContext,
  getOwner,
  provide,
  type Child,
  type Incoming,
  type JSXElement,
} from "@barqjs/core";
import { ref as makeRef } from "@barqjs/primitives/refs";

export interface OverlayValue {
  state: OverlayTriggerState;
  /** The control the overlay is anchored to and returns focus to. */
  triggerRef: ReturnType<typeof makeRef<HTMLElement>>;
}

export interface OverlayRootProps {
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export interface OverlayFamily {
  Root: (props: Incoming<OverlayRootProps>) => JSXElement;
  Trigger: (props: Incoming<{ children?: Child }>) => JSXElement;
  use: () => OverlayValue;
}

export type OverlayKind = "dialog" | "menu" | "listbox" | "tree" | "grid";

export function overlayFamily(name: string, kind: OverlayKind = "dialog"): OverlayFamily {
  const Context = context<OverlayValue | null>(null);
  // A second context, holding the same value, for the trigger's own `provide`.
  // Providing `Context` again would be providing what is already there, and the
  // scope the trigger slot has to be installed in is the one that `provide`
  // creates.
  const TriggerContext = context<OverlayValue | null>(null);

  const use = (): OverlayValue => {
    const value = getContext(Context);
    if (value === null || value === undefined) {
      throw new Error(`This must be rendered inside a <${name}>.`);
    }
    return value;
  };

  function Root(props: Incoming<OverlayRootProps>) {
    const state = overlayTriggerState(fromProps(props));
    const value: OverlayValue = { state, triggerRef: makeRef<HTMLElement>() };

    const owner = getOwner();
    // `provide`, not `install`: a component gets no scope of its own, so
    // installing on the ambient owner writes where its SIBLINGS read, and two
    // dialogs beside each other would share one open state.
    if (owner === null) return <>{props.children}</>;
    return provide(
      owner,
      Context,
      () => value,
      () => props.children as unknown,
    ) as never;
  }

  function Trigger(props: Incoming<{ children?: Child }>) {
    const value = use();
    const { triggerProps } = overlayTrigger({ type: kind }, value.state);

    const owner = getOwner();
    if (owner === null) return <>{props.children}</>;
    // The slot is installed INSIDE the `provide` callback, which is the only
    // place a scope of its own exists. Installed on the ambient owner it would
    // land beside the trigger rather than above it, and the control would
    // never see it.
    return provide(
      owner,
      TriggerContext,
      () => value,
      () => {
        provideTriggerSlot({
          props: triggerProps,
          ref: value.triggerRef.set,
        });
        return props.children;
      },
    ) as never;
  }

  return { Root, Trigger, use };
}
