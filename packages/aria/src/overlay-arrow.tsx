/**
 * The arrow on a popover or a tooltip, pointing at the trigger.
 *
 * Its shape is the caller's (an SVG, a rotated square); what is here is where
 * it goes. It sits outside the overlay's edge on the side facing the trigger,
 * which is the side the overlay ended up on after any flip and not the one it
 * asked for, and along that edge it lines up with the trigger's centre.
 *
 * Both come from the overlay. The side is its placement; the position along
 * the edge is `overlayPosition`'s `arrowProps`, measured once the overlay has
 * been shifted to fit the viewport, since after a shift the overlay's middle
 * is no longer the trigger's. An overlay that offers only its side gets an
 * arrow centred on its own edge.
 *
 * `data-placement` names the side, so a stylesheet can turn the shape to face
 * the trigger.
 */

import {
  cells,
  type Accessor,
  type Child,
  createContext,
  getContext,
  type Incoming,
  provide,
} from "@barqjs/core";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import type { Axis } from "./overlays.ts";
import {
  access,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
} from "./utils.ts";

export interface OverlayArrowValue {
  /** The side of the trigger the overlay is on, after any flip. */
  placement: Accessor<Axis | null>;
  /** `overlayPosition`'s `arrowProps`: the measured offset along the edge. */
  arrowProps?: DOMProps;
  /** Where the arrow's element goes, for the overlay to measure it. */
  ref?: (element: Element | null) => void;
}

const OverlayArrowContext = createContext<OverlayArrowValue | null>(null);

export interface OverlayArrowProviderProps {
  value: OverlayArrowValue;
  children?: Child;
}

/** Offer an overlay's placement and arrow position to an {@link OverlayArrow} inside it. */
export function OverlayArrowProvider(props: Incoming<OverlayArrowProviderProps>) {
  return provide(
    OverlayArrowContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

/**
 * Where the enclosing overlay is, as its {@link OverlayArrowProvider} says. A
 * `<Popover>` and a `<Tooltip>` each provide one.
 */
export function useOverlayArrow(): OverlayArrowValue | null {
  return getContext(OverlayArrowContext) ?? null;
}

type CrossOffset = Partial<Record<"left" | "top", string>>;

export interface OverlayArrowOptions {
  placement: MaybeAccessor<Axis | null>;
  arrowProps?: DOMProps;
}

export interface OverlayArrowResult {
  arrowProps: DOMProps;
  placement: Accessor<Axis | null>;
}

export function overlayArrow(options: OverlayArrowOptions): OverlayArrowResult {
  function placement(): Axis | null {
    return access(options.placement);
  }
  function measured(): CrossOffset {
    const style = access(options.arrowProps?.style as MaybeAccessor<CrossOffset | undefined>);
    return style ?? {};
  }

  return {
    placement,
    arrowProps: {
      "data-placement": placement,
      style: () => {
        const side = placement();
        const vertical = side === "top" || side === "bottom";
        const offset = measured();
        const style: Record<string, string> = { position: "absolute" };
        if (side !== null) style[side] = "100%";
        const along = vertical ? offset.left : offset.top;
        if (along !== undefined) {
          style[vertical ? "left" : "top"] = along;
        } else if (side !== null) {
          style[vertical ? "left" : "top"] = "50%";
          style.transform = vertical ? "translateX(-50%)" : "translateY(-50%)";
        }
        return style;
      },
    },
  };
}

export interface OverlayArrowComponentProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * ```tsx
 * <Popover triggerRef={trigger} isOpen={open()}>
 *   <OverlayArrow>
 *     <svg width={12} height={12} viewBox="0 0 12 12"><path d="M0 0 L6 6 L12 0" /></svg>
 *   </OverlayArrow>
 *   …
 * </Popover>
 * ```
 */
export function OverlayArrow(props: OverlayArrowComponentProps) {
  const overlay = useOverlayArrow();
  const { arrowProps } = overlayArrow({
    placement: () => overlay?.placement() ?? null,
    arrowProps: overlay?.arrowProps,
  });

  const elementProps = mergeProps(
    arrowProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    {
      class: () => props.class ?? props.className,
      // The caller's style on top of the position, so a size or a colour does
      // not have to restate where the arrow goes.
      style: () => ({
        ...access(arrowProps.style as MaybeAccessor<Record<string, string>>),
        ...props.style,
      }),
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(overlay?.ref, props.ref)}>
      {props.children}
    </div>
  );
}
