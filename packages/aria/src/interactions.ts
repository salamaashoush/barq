/**
 * The interaction layer: what the user did, normalised across every device and
 * assistive technology that can do it.
 */

export { description } from "./interactions/description.ts";

export { focused, focusWithin } from "./interactions/focus-events.ts";
export type {
  FocusOptions,
  FocusResult,
  FocusWithinOptions,
  FocusWithinResult,
} from "./interactions/focus-events.ts";

export { focusable, focusSafely } from "./interactions/focusable.ts";
export type { FocusableOptions, FocusableResult } from "./interactions/focusable.ts";

export { hover } from "./interactions/hover.ts";
export type { HoverEvent, HoverOptions, HoverResult } from "./interactions/hover.ts";

export { interactOutside } from "./interactions/interact-outside.ts";
export type { InteractOutsideOptions } from "./interactions/interact-outside.ts";

export { createEventHandler, keyboard } from "./interactions/keyboard.ts";
export type { BaseEvent, KeyboardOptions, KeyboardResult } from "./interactions/keyboard.ts";

export { globalListeners } from "./interactions/listeners.ts";
export type { GlobalListeners } from "./interactions/listeners.ts";

export { longPress } from "./interactions/long-press.ts";
export type {
  LongPressEvent,
  LongPressOptions,
  LongPressResult,
} from "./interactions/long-press.ts";

export {
  focusVisible,
  getInteractionModality,
  getPointerType,
  isFocusVisible,
  isVirtualClick,
  isVirtualPointerEvent,
  modality,
  onModalityChange,
  setInteractionModality,
  trackModality,
  untrackModality,
} from "./interactions/modality.ts";
export type { Modality, ModalityHandler, PointerType } from "./interactions/modality.ts";

export { move } from "./interactions/move.ts";
export type {
  MoveEndEvent,
  MoveMoveEvent,
  MoveOptions,
  MoveResult,
  MoveStartEvent,
} from "./interactions/move.ts";

export {
  handleLinkClick,
  openLink,
  router,
  RouterContext,
  shouldClientNavigate,
  syntheticLinkProps,
} from "./interactions/open-link.ts";
export type { LinkModifiers, Router } from "./interactions/open-link.ts";

export { press } from "./interactions/press.ts";
export type { ElementRef, PressEvent, PressOptions, PressResult } from "./interactions/press.ts";

export { preventFocus } from "./interactions/prevent-focus.ts";

export { scrollWheel } from "./interactions/scroll-wheel.ts";
export type { ScrollWheelOptions } from "./interactions/scroll-wheel.ts";

export { disableTextSelection, restoreTextSelection } from "./interactions/text-selection.ts";
