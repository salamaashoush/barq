/**
 * How a trigger part reaches the control it is a trigger FOR.
 *
 * shadcn writes `<DialogTrigger asChild><Button /></DialogTrigger>` and Radix
 * clones the child. Nothing is cloned here, so there are two routes and every
 * trigger in this package takes both:
 *
 * - **The slot.** A control from this package written inside the trigger takes
 *   the props itself, through `triggerSlot()`. That is the ordinary case and it
 *   needs nothing from the caller.
 * - **`render`.** Any other element is handed the props and the ref and spreads
 *   them:
 *
 *   ```tsx
 *   <DialogTrigger
 *     render={(trigger) => <button {...trigger.props} ref={trigger.ref}>Open</button>}
 *   />
 *   ```
 *
 * A component of your own takes the first route with {@link useTrigger}, which
 * is the slot already turned into what an element wants:
 *
 * ```tsx
 * function Chip(props: Incoming<{ children?: Child }>) {
 *   const trigger = useTrigger();
 *   return <button {...trigger.props} ref={trigger.ref}>{props.children}</button>;
 * }
 * ```
 *
 * It is a hook rather than a spread at the call site because a props object
 * spread onto a COMPONENT arrives as Cells, and a handler read as a Cell is
 * called once with no event.
 *
 * A trigger's own props are not DOM props: `onPress` is not an event, and a
 * plain element given one would never hear it. Both routes therefore hand over
 * what `button()` makes of them, which is what `<Button>` puts on its own
 * element.
 */

import { button, type ButtonOptions } from "@barqjs/aria/button";
import {
  filterDOMProps,
  mergeProps,
  provideTriggerSlot,
  triggerSlot,
  type DOMProps,
  type TriggerSlot,
} from "@barqjs/aria/utils";
import { createContext, provide, type Child, type Incoming, type JSXElement } from "@barqjs/core";
import { ref as makeRef, mergeRefs } from "@barqjs/primitives/refs";

export interface TriggerRender {
  /** For the control's element: the ARIA, the handlers, `type="button"`. */
  props: DOMProps;
  /** For the same element. What opens is anchored to it and returns focus to it. */
  ref: (element: Element | null) => void;
}

export interface TriggerPartProps {
  /** A control that takes the trigger's props itself, such as `<Button>`. */
  children?: Child;
  /** Any other control, built from the props and the ref it is handed. */
  render?: (trigger: TriggerRender) => Child;
}

/** Nothing reads it. `provide` is what creates the scope the slot is installed in. */
const Slotted = createContext<boolean>(false);

export function TriggerPart(
  props: Incoming<TriggerPartProps & { slot: TriggerSlot; name?: string }>,
) {
  const slot = props.slot();
  const render = props.render?.();

  if (render === undefined) {
    return provide(
      Slotted,
      () => true,
      () => {
        provideTriggerSlot(slot);
        return props.children;
      },
    );
  }

  // Upstream's trigger is an element of its own and carries the part's slot
  // name. A rendered control is that element here; one that took the slot keeps
  // the name it already has, as a `<Button>` under `asChild` does not.
  const forControl = forElement(slot);
  const name = props.name?.();
  return render(
    name === undefined
      ? forControl
      : { ...forControl, props: mergeProps({ "data-slot": name }, forControl.props) },
  ) as JSXElement;
}

function forElement(slot: TriggerSlot): TriggerRender {
  const domRef = makeRef<Element>();
  const options: ButtonOptions = slot.props;
  const { buttonProps } = button(options, domRef);
  // `button()` delivers `onClick` itself, as part of the press. Bound on the
  // element as well, a handler a wrapper offered through the slot runs twice
  // for every mouse click.
  const { onClick: _, ...forwarded } = filterDOMProps(slot.props, { global: true });

  return {
    props: mergeProps(buttonProps, forwarded),
    ref: mergeRefs(domRef.set, slot.ref),
  };
}

/**
 * What the trigger this component is written inside wants on its element.
 *
 * Outside any trigger it is an ordinary button's props and a ref that goes
 * nowhere, so a component that calls it works on its own as well.
 */
export function useTrigger(): TriggerRender {
  return forElement(triggerSlot());
}
