/**
 * A drop zone: an area things can be dropped on, or pasted into.
 *
 * The area itself is not focusable; a visually hidden button inside it is.
 * That button is the drop target a keyboard or screen reader drag lands on,
 * the element a paste is read from, and what a click on the area focuses.
 */

import {
  type Accessor,
  type Child,
  cells,
  createContext,
  createSignal,
  getContext,
  getOwner,
  install,
  onCleanup,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import { clipboard, drop, type DropOptions } from "./dnd/index.ts";
import { contains, focusWithoutScrolling, isFocusable } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { StringDictionary, stringFormatter } from "./i18n.ts";
import { hover, type HoverEvent } from "./interactions/hover.ts";
import { visuallyHidden } from "./live.ts";
import {
  callback,
  filterDOMProps,
  fromProps,
  id,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

const strings = new StringDictionary<"dropzoneLabel">({
  "en-US": { dropzoneLabel: "DropZone" },
});

interface DropZoneLabelSlot {
  id: Accessor<string>;
  name(has: boolean): void;
}

const DropZoneLabelContext = createContext<DropZoneLabelSlot | null>(null);

/**
 * The id the enclosing drop zone's visible label must carry.
 *
 * Calling it is what makes the zone's button point at the label, and leaving
 * undoes that, so the button never names an element that is not there.
 */
export function useDropZoneLabel(): Accessor<string> | null {
  const slot = getContext(DropZoneLabelContext);
  if (slot === null || slot === undefined) return null;
  slot.name(true);
  onCleanup(() => slot.name(false));
  return slot.id;
}

export interface DropZoneLabelProps extends StyleProps {
  children?: Child;
}

/** The visible text that names a drop zone. */
export function DropZoneLabel(props: DropZoneLabelProps) {
  const labelId = useDropZoneLabel();
  return (
    <span
      {...filterDOMProps(fromProps(cells(props)), { global: true })}
      {...styleProps(cells(props))}
      id={labelId?.()}
      data-slot={props["data-slot"] ?? "label"}
    >
      {props.children}
    </span>
  );
}

export interface DropZoneProps
  extends
    Omit<DropOptions, "getDropOperationForPoint" | "ref" | "hasDropButton" | "isDisabled">,
    StyleProps {
  children?: Child;
  isDisabled?: boolean;
  /** @default "DropZone" */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * ```tsx
 * <DropZone onDrop={async (event) => upload(event.items)}>
 *   <DropZoneLabel>Drop files here</DropZoneLabel>
 * </DropZone>
 * ```
 *
 * `data-drop-target` while a drag is over it, and `data-hovered`,
 * `data-focused`, `data-focus-visible` and `data-disabled` as usual. A paste
 * while its button is focused is delivered to `onDrop` as a copy.
 */
export function DropZone(props: DropZoneProps) {
  const zoneRef = makeRef<HTMLDivElement>();
  const buttonRef = makeRef<HTMLButtonElement>();
  const options = fromProps(cells(props));
  function isDisabled(): boolean {
    return props.isDisabled === true;
  }
  const message = stringFormatter(strings);

  const { dropProps, dropButtonProps, isDropTarget } = drop({
    ref: buttonRef,
    hasDropButton: true,
    isDisabled,
    getDropOperation: (types, allowed) =>
      callback(cells(props).getDropOperation)?.(types, allowed) ?? allowed[0] ?? "cancel",
    onDropEnter: (event) => options.onDropEnter?.(event),
    onDropMove: (event) => options.onDropMove?.(event),
    onDropActivate: (event) => options.onDropActivate?.(event),
    onDropExit: (event) => options.onDropExit?.(event),
    onDrop: (event) => options.onDrop?.(event),
  });

  const textId = id();
  const [isNamed, setNamed] = createSignal(false, { ownedWrite: true });
  const owner = getOwner();
  if (owner !== null) {
    const slot: DropZoneLabelSlot = { id: textId, name: setNamed };
    install(owner, DropZoneLabelContext, () => slot);
  }

  const buttonId = id();
  function ariaLabel(): string {
    return props["aria-label"] ?? message().format("dropzoneLabel");
  }
  // The button names itself AND points at the visible label, so a screen
  // reader reads both: "DropZone, Drop files here".
  function ariaLabelledBy(): string | undefined {
    const ids = [isNamed() ? textId() : undefined, props["aria-labelledby"]].filter(
      (each): each is string => each !== undefined && each !== "",
    );
    return ids.length === 0 ? undefined : [buttonId(), ...ids].join(" ");
  }

  const { buttonProps } = button({ ...dropButtonProps, isDisabled }, buttonRef);
  const { hoverProps, isHovered } = hover({
    isDisabled,
    onHoverStart: (event) => options.onHoverStart?.(event),
    onHoverEnd: (event) => options.onHoverEnd?.(event),
    onHoverChange: (value) => options.onHoverChange?.(value),
  });
  const { focusProps, isFocused, isFocusVisible } = focusRing();
  const { clipboardProps } = clipboard({
    isDisabled,
    onPaste: (items) =>
      options.onDrop?.({ type: "drop", items, x: 0, y: 0, dropOperation: "copy" }),
  });
  const { visuallyHiddenProps } = visuallyHidden();

  // A click on the zone's own surface focuses its button; a click on
  // something focusable inside it leaves focus there.
  function onClick(event: MouseEvent): void {
    const zone = zoneRef();
    let target = event.target instanceof Element ? event.target : null;
    while (target !== null && contains(zone, target)) {
      if (isFocusable(target)) break;
      const hidden = buttonRef();
      if (target === zone && hidden !== null) {
        focusWithoutScrolling(hidden);
        break;
      }
      target = target.parentElement;
    }
  }

  const elementProps = mergeProps(
    filterDOMProps(options, { global: true, id: false }),
    styleProps(cells(props)),
    dropProps,
    hoverProps,
    {
      onClick,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-drop-target": isDropTarget,
      "data-disabled": isDisabled,
      "data-testid": () => props["data-testid"],
    },
  );

  const hiddenButtonProps = mergeProps(buttonProps, focusProps, clipboardProps, {
    id: buttonId,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
  });

  return (
    <div {...elementProps} ref={mergeRefs(zoneRef.set, props.ref)}>
      <div {...visuallyHiddenProps}>
        <button {...hiddenButtonProps} ref={buttonRef.set} />
      </div>
      {props.children}
    </div>
  );
}
