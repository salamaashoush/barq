import {
  For,
  createSignal,
  createEffect,
  onCleanup,
  onSettled,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { useDirection } from "@barqjs/aria/i18n";
import { exitDuration } from "@barqjs/aria/presence";
import {
  toastQueue,
  toastSwipe,
  type Toast,
  type ToastContent,
  type ToastId,
  type ToastKind,
  type ToastMessage,
  type ToastOptions,
  type ToastPromise,
  type ToastSwipeDirection,
} from "@barqjs/aria/toast";
import { keyframes, layer } from "@barqjs/css";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Info } from "@barqjs/lucide/icons/info";
import { OctagonX } from "@barqjs/lucide/icons/octagon-x";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { X } from "@barqjs/lucide/icons/x";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";
import { buttonVariants } from "./button.tsx";
import { Spinner } from "./spinner.tsx";

import type { UiProps } from "../lib/props.ts";
import { mergeRefs } from "@barqjs/primitives/refs";

const ui = layer("barq.ui");

const swipeOutLeft = keyframes`
  from {
    transform: var(--y) translateX(var(--swipe-amount-x));
    opacity: 1;
  }
  to {
    transform: var(--y) translateX(calc(var(--swipe-amount-x) - 100%));
    opacity: 0;
  }
`;

const swipeOutRight = keyframes`
  from {
    transform: var(--y) translateX(var(--swipe-amount-x));
    opacity: 1;
  }
  to {
    transform: var(--y) translateX(calc(var(--swipe-amount-x) + 100%));
    opacity: 0;
  }
`;

const swipeOutUp = keyframes`
  from {
    transform: var(--y) translateY(var(--swipe-amount-y));
    opacity: 1;
  }
  to {
    transform: var(--y) translateY(calc(var(--swipe-amount-y) - 100%));
    opacity: 0;
  }
`;

const swipeOutDown = keyframes`
  from {
    transform: var(--y) translateY(var(--swipe-amount-y));
    opacity: 1;
  }
  to {
    transform: var(--y) translateY(calc(var(--swipe-amount-y) + 100%));
    opacity: 0;
  }
`;

const list = ui({
  // shadcn's mapping of this package's tokens onto sonner's variables.
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
  "--success-bg": "hsl(143 85% 96%)",
  "--success-border": "hsl(145 92% 87%)",
  "--success-text": "hsl(140 100% 27%)",
  "--info-bg": "hsl(208 100% 97%)",
  "--info-border": "hsl(221 91% 93%)",
  "--info-text": "hsl(210 92% 45%)",
  "--warning-bg": "hsl(49 100% 97%)",
  "--warning-border": "hsl(49 91% 84%)",
  "--warning-text": "hsl(31 92% 45%)",
  "--error-bg": "hsl(359 100% 97%)",
  "--error-border": "hsl(359 100% 94%)",
  "--error-text": "hsl(360 100% 45%)",
  pointerEvents: "none",
  position: "fixed",
  zIndex: "100",
  boxSizing: "border-box",
  width: "var(--width)",
  maxWidth: "calc(100% - var(--offset-left) - var(--offset-right))",
  marginBlock: "0px",
  marginInline: "0px",
  padding: "0px",
  listStyleType: "none",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  '[data-x-position="right"]': {
    insetInlineEnd: "var(--offset-right)",
  },
  '[data-x-position="left"]': {
    insetInlineStart: "var(--offset-left)",
  },
  // Auto margins between two zero insets, so the centre does not depend on
  // which way the text runs.
  '[data-x-position="center"]': {
    insetInline: "0px",
    marginInline: "auto",
  },
  '[data-y-position="top"]': {
    top: "var(--offset-top)",
  },
  '[data-y-position="bottom"]': {
    bottom: "var(--offset-bottom)",
  },
  '[data-theme="dark"], &:not([data-theme]):is(.dark *)': {
    "--success-bg": "hsl(150 100% 6%)",
    "--success-border": "hsl(147 100% 12%)",
    "--success-text": "hsl(150 86% 65%)",
    "--info-bg": "hsl(215 100% 6%)",
    "--info-border": "hsl(223 43% 17%)",
    "--info-text": "hsl(216 87% 65%)",
    "--warning-bg": "hsl(64 100% 6%)",
    "--warning-border": "hsl(60 100% 9%)",
    "--warning-text": "hsl(46 87% 65%)",
    "--error-bg": "hsl(358 76% 10%)",
    "--error-border": "hsl(357 89% 16%)",
    "--error-text": "hsl(358 100% 81%)",
  },
  "@media (width < 600px)": {
    "&": {
      width: "auto",
      maxWidth: "none",
      insetInlineStart: "var(--mobile-offset-left)",
      insetInlineEnd: "var(--mobile-offset-right)",
    },
    '&[data-y-position="top"]': {
      top: "var(--mobile-offset-top)",
    },
    '&[data-y-position="bottom"]': {
      bottom: "var(--mobile-offset-bottom)",
    },
  },
});

/**
 * Where a toast sits in the stack, which is all transform.
 *
 * Every state names the ones before it in its selector rather than relying on
 * the order the rules were written in: one class is one declaration here, so
 * two rules for `--y` that tie on specificity are decided by which the
 * stylesheet happened to register first.
 */
const shell = ui({
  "--lift": "-1",
  "--lift-amount": "calc(var(--lift) * var(--gap))",
  "--y": "translateY(calc(var(--lift) * -100%))",
  pointerEvents: "auto",
  position: "absolute",
  insetInline: "0px",
  zIndex: "var(--z-index)",
  boxSizing: "border-box",
  opacity: "0%",
  transform: "var(--y)",
  // The pointer moves the toast, so the page under it must not scroll.
  touchAction: "none",
  overflowWrap: "anywhere",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  transitionProperty: "transform, opacity, height, box-shadow",
  transitionDuration: "400ms, 400ms, 400ms, 200ms",
  transitionTimingFunction: "ease",
  '[data-y-position="top"]': {
    "--lift": "1",
    top: "0px",
  },
  '[data-y-position="bottom"]': {
    bottom: "0px",
  },
  // Covers the gap to the next toast, so a pointer crossing an open stack
  // does not leave it between two toasts and close it.
  "::after": {
    content: '""',
    position: "absolute",
    insetInlineStart: "0px",
    bottom: "100%",
    width: "100%",
    height: "calc(var(--gap) + 1px)",
  },
  "& > *": {
    transitionProperty: "opacity",
    transitionDuration: "400ms",
  },
  '[data-mounted="true"]': {
    "--y": "translateY(0)",
    opacity: "100%",
  },
  '[data-mounted="true"][data-expanded="true"]': {
    "--y": "translateY(calc(var(--lift) * var(--offset)))",
    height: "var(--initial-height)",
  },
  '[data-mounted="true"][data-expanded="false"][data-front="false"]': {
    "--scale": "calc(1 - var(--toasts-before) * 0.05)",
    "--y": "translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(var(--scale))",
    height: "var(--front-toast-height)",
  },
  '&[data-styled="true"][data-expanded="false"][data-front="false"] > *': {
    opacity: "0%",
  },
  '[data-mounted="true"][data-removed="true"][data-front="true"][data-swipe-out="false"]': {
    "--y": "translateY(calc(var(--lift) * -100%))",
    opacity: "0%",
  },
  '[data-mounted="true"][data-removed="true"][data-front="false"][data-swipe-out="false"][data-expanded="true"]':
    {
      "--y": "translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%))",
      opacity: "0%",
    },
  '[data-mounted="true"][data-removed="true"][data-front="false"][data-swipe-out="false"][data-expanded="false"]':
    {
      "--y": "translateY(40%)",
      opacity: "0%",
    },
  '[data-swiping="true"]': {
    transform:
      "var(--y) translateY(var(--swipe-amount-y, 0px)) translateX(var(--swipe-amount-x, 0px))",
    transitionProperty: "none",
    userSelect: "none",
  },
  '[data-swipe-out="true"]': {
    animationDuration: "200ms",
    animationTimingFunction: "ease-out",
    animationFillMode: "forwards",
  },
  '[data-swipe-out="true"][data-swipe-direction="left"]': {
    animationName: swipeOutLeft,
  },
  '[data-swipe-out="true"][data-swipe-direction="right"]': {
    animationName: swipeOutRight,
  },
  '[data-swipe-out="true"][data-swipe-direction="up"]': {
    animationName: swipeOutUp,
  },
  '[data-swipe-out="true"][data-swipe-direction="down"]': {
    animationName: swipeOutDown,
  },
  "@media (prefers-reduced-motion: reduce)": {
    "&": {
      transitionDuration: "0s",
      animationDuration: "0s",
    },
  },
});

/** What a toast looks like, which one drawn by `toast.custom` does not get. */
const look = ui({
  display: "flex",
  alignItems: "flex-start",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "var(--border-radius)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--normal-border)",
  backgroundColor: "var(--normal-bg)",
  padding: "calc(var(--spacing) * 4)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--normal-text)",
  "--ui-shadow":
    "0 10px 15px -3px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  ":focus-visible": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
  },
  '[data-invert="true"]': {
    "--normal-bg": "var(--popover-foreground)",
    "--normal-text": "var(--popover)",
    "--normal-border": "var(--popover-foreground)",
  },
  '[data-rich-colors="true"][data-type="success"]': {
    borderColor: "var(--success-border)",
    backgroundColor: "var(--success-bg)",
    color: "var(--success-text)",
  },
  '[data-rich-colors="true"][data-type="info"]': {
    borderColor: "var(--info-border)",
    backgroundColor: "var(--info-bg)",
    color: "var(--info-text)",
  },
  '[data-rich-colors="true"][data-type="warning"]': {
    borderColor: "var(--warning-border)",
    backgroundColor: "var(--warning-bg)",
    color: "var(--warning-text)",
  },
  '[data-rich-colors="true"][data-type="error"]': {
    borderColor: "var(--error-border)",
    backgroundColor: "var(--error-bg)",
    color: "var(--error-text)",
  },
});

const icon = ui({
  display: "flex",
  marginTop: "calc(var(--spacing) * 0.5)",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  "& > svg": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
});

const body = ui({
  display: "flex",
  minWidth: "0px",
  flex: "1",
  flexDirection: "column",
  gap: "var(--spacing)",
});

const title = ui({
  "--ui-leading": "1",
  lineHeight: "1",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
});

const description = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--muted-foreground)",
  // A coloured toast keeps one voice; muted grey on a tinted ground does not
  // hold its contrast.
  ':is([data-rich-colors="true"]:not([data-type="default"], [data-type="loading"]) *)': {
    color: "inherit",
  },
});

const button = ui({
  flexShrink: "0",
});

/** The first control after the text, which takes the free space before it. */
const pushed = ui({
  marginInlineStart: "auto",
});

const close = ui({
  flexShrink: "0",
  borderRadius: "calc(var(--radius) * 0.8)",
  padding: "var(--spacing)",
  color: "var(--muted-foreground)",
  opacity: "0%",
  transitionProperty: "opacity",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "@media (hover: hover)": {
    ":is(:where(.group\\/toast):hover *)": {
      opacity: "100%",
    },
    ":hover": {
      color: "var(--foreground)",
    },
  },
  // A finger has no hover, so the button is simply there.
  "@media (hover: none)": {
    "&": {
      opacity: "100%",
    },
  },
  ":focus-visible": {
    opacity: "100%",
  },
});

export type ToasterPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type ToasterTheme = "light" | "dark" | "system";

/** Sonner's names for the ways a toast can be thrown. */
export type ToasterSwipeDirection = "top" | "right" | "bottom" | "left";

/** A length, as a number of pixels or as written. */
type Length = number | string;

export type ToasterOffset =
  | Length
  | {
      readonly top?: Length;
      readonly right?: Length;
      readonly bottom?: Length;
      readonly left?: Length;
    };

export interface ToastButtonOptions {
  readonly label: ToastContent;
  /** Upstream's name. Preventing the event's default keeps the toast up. */
  readonly onClick?: (event: MouseEvent) => void;
  readonly onAction?: () => void;
}

/** What a toast carries for this design system, beyond what the queue reads. */
interface Presentation {
  readonly position?: ToasterPosition;
  readonly richColors?: boolean;
  readonly closeButton?: boolean;
  readonly invert?: boolean;
  readonly unstyled?: boolean;
  readonly icon?: ToastContent;
  readonly class?: string;
  readonly className?: string;
  readonly style?: Record<string, string | number | undefined>;
  readonly testId?: string;
  /** Draws the whole toast, in place of the title, the icon and the buttons. */
  readonly render?: (id: ToastId) => Child;
}

export interface ExternalToast
  extends Omit<ToastOptions<never>, "action" | "cancel" | "data">, Omit<Presentation, "render"> {
  readonly action?: ToastButtonOptions;
  readonly cancel?: ToastButtonOptions;
}

/** A message for one outcome of a promise: the title alone, or the whole toast. */
export type ToastPromiseMessage = ToastContent | ExternalToast;

export interface ToastPromiseOptions<T> {
  readonly loading: ToastPromiseMessage;
  readonly success: ToastPromiseMessage | ((value: T) => ToastPromiseMessage);
  readonly error: ToastPromiseMessage | ((reason: unknown) => ToastPromiseMessage);
  /** Under whichever outcome arrives, written once or worked out from it. */
  readonly description?: ToastContent | ((outcome: unknown) => ToastContent);
  readonly finally?: () => void;
}

const DEFAULT_POSITION: ToasterPosition = "bottom-right";
const DEFAULT_VISIBLE = 3;
const DEFAULT_GAP = 14;
const DEFAULT_OFFSET = "24px";
const DEFAULT_MOBILE_OFFSET = "16px";
const DEFAULT_WIDTH = "356px";
const DEFAULT_HOTKEY: readonly string[] = ["altKey", "KeyT"];

/** The mounted toaster's own default lifetime, which the queue asks for. */
const fallback: { duration: (() => number | undefined) | null } = { duration: null };

/**
 * The one queue a page has.
 *
 * A module-level queue rather than a context, because the whole point of
 * `toast("Saved")` is that it can be called from anywhere: a fetch handler, a
 * store, a route action. A context would put it back inside the tree the
 * caller has usually already left.
 */
const queue = toastQueue<Presentation>({
  // Every toast is kept. How many are DRAWN is the toaster's `visibleToasts`,
  // and one behind them returns when there is room.
  limit: Number.POSITIVE_INFINITY,
  duration: () => fallback.duration?.(),
});

const history: Toast<Presentation>[] = [];
/** How many toasts the history holds before the oldest is let go. */
const HISTORY_SIZE = 100;

/** A copy without the keys that hold nothing, so a merge keeps what was there. */
function given<T extends object>(source: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined) out[name] = value;
  }
  return out as T;
}

function buttonOf(options: ToastButtonOptions | undefined): ToastOptions<Presentation>["action"] {
  if (options === undefined) return undefined;
  return {
    label: options.label,
    onAction: (event) => {
      if (event instanceof MouseEvent) options.onClick?.(event);
      options.onAction?.();
    },
  };
}

/** What the queue reads, and what only this design system does. */
function split(options: ExternalToast | undefined, id?: ToastId): ToastOptions<Presentation> {
  const {
    position,
    richColors,
    closeButton,
    invert,
    unstyled,
    icon: glyph,
    class: own,
    className,
    style,
    testId,
    action,
    cancel,
    ...rest
  } = options ?? {};
  const presentation = given<Presentation>({
    position,
    richColors,
    closeButton,
    invert,
    unstyled,
    icon: glyph,
    class: own,
    className,
    style,
    testId,
  });
  // An update names only what changed, so what the toast already carries
  // stays: a toast that lost its corner would jump to another list.
  const before = id === undefined ? undefined : queue.get(id)?.data;
  return given<ToastOptions<Presentation>>({
    ...rest,
    action: buttonOf(action),
    cancel: buttonOf(cancel),
    data: { ...before, ...presentation },
  });
}

function messageOf(message: ToastPromiseMessage): ToastMessage<Presentation> {
  return typeof message === "object" ? split(message) : message;
}

function raise<I extends ToastId = number>(
  kind: ToastKind | undefined,
  text: ToastContent | undefined,
  options: (ExternalToast & { readonly id?: I }) | undefined,
  render?: (id: ToastId) => Child,
): I {
  const base = split(options, options?.id);
  const id = queue.add<I>(
    given({
      ...base,
      id: options?.id,
      title: text,
      kind: kind ?? options?.kind,
      data: render === undefined ? base.data : { ...base.data, render },
    }),
  );
  const made = queue.get(id);
  if (made !== undefined) {
    history.push(made);
    if (history.length > HISTORY_SIZE) history.splice(0, history.length - HISTORY_SIZE);
  }
  return id;
}

type Raise = <I extends ToastId = number>(
  title: ToastContent,
  options?: ExternalToast & { readonly id?: I },
) => I;

export interface ToastApi extends Raise {
  message: Raise;
  success: Raise;
  info: Raise;
  warning: Raise;
  error: Raise;
  loading: Raise;
  /** Draws whatever `render` builds, with none of the toast's own look. */
  custom<I extends ToastId = number>(
    render: (id: ToastId) => Child,
    options?: ExternalToast & { readonly id?: I },
  ): I;
  /** Replaces one in place, keeping its position. */
  update(id: ToastId, options: ExternalToast): void;
  /** Takes one away, or every one when no id is given. */
  dismiss(id?: ToastId): void;
  clear(): void;
  /**
   * `loading` while it runs, then `success` or `error` on the same toast.
   *
   * The whole reason `update` keeps a toast's position: a "Saving" that becomes
   * "Saved" by jumping to the bottom of the column reads as a second thing
   * happening rather than the first one finishing.
   */
  promise<T>(
    work: Promise<T> | (() => Promise<T>),
    messages: ToastPromiseOptions<T>,
  ): ToastPromise<T>;
  /** The toasts that are up. */
  getToasts(): readonly Toast[];
  /** Every toast raised since the page loaded, gone or not. */
  getHistory(): readonly Toast[];
}

const of =
  (kind: ToastKind | undefined): Raise =>
  (text, options) =>
    raise(kind, text, options);

export const toast: ToastApi = Object.assign(of(undefined), {
  message: of("default"),
  success: of("success"),
  info: of("info"),
  warning: of("warning"),
  error: of("error"),
  loading: of("loading"),
  custom: <I extends ToastId = number>(
    render: (id: ToastId) => Child,
    options?: ExternalToast & { readonly id?: I },
  ): I => raise(options?.kind, undefined, options, render),
  update: (id: ToastId, options: ExternalToast) => queue.update(id, split(options, id)),
  dismiss: (id?: ToastId) => queue.dismiss(id),
  clear: () => queue.clear(),
  promise<T>(
    work: Promise<T> | (() => Promise<T>),
    messages: ToastPromiseOptions<T>,
  ): ToastPromise<T> {
    const { success, error, description: under } = messages;
    const described = (outcome: unknown): ToastOptions<Presentation> => {
      if (under === undefined) return {};
      return {
        description:
          typeof under === "function" && under.length > 0
            ? (under as (outcome: unknown) => ToastContent)(outcome)
            : (under as ToastContent),
      };
    };
    const outcome = (
      message: ToastPromiseMessage,
      arrived: unknown,
      kind?: ToastKind,
    ): ToastOptions<Presentation> => {
      const read = messageOf(message);
      return {
        ...described(arrived),
        ...(typeof read === "object" ? read : { title: read }),
        ...(kind === undefined ? {} : { kind }),
      };
    };
    const failed = (reason: unknown): ToastPromiseMessage =>
      typeof error === "function" && error.length > 0
        ? (error as (reason: unknown) => ToastPromiseMessage)(reason)
        : (error as ToastPromiseMessage);
    return queue.promise(work, {
      loading: messageOf(messages.loading),
      // Work that RESOLVES with a failure is one all the same: a `fetch` does
      // not reject on a 503, and a caller that returns its `Error` has said so.
      success: (value: T) => {
        if (value instanceof Response && !value.ok) {
          const reason = `HTTP error! status: ${String(value.status)}`;
          return outcome(failed(reason), reason, "error");
        }
        if (value instanceof Error) return outcome(failed(value), value, "error");
        return outcome(
          typeof success === "function" && success.length > 0
            ? (success as (value: T) => ToastPromiseMessage)(value)
            : (success as ToastPromiseMessage),
          value,
        );
      },
      error: (reason: unknown) => outcome(failed(reason), reason),
      finally: messages.finally,
    });
  },
  getToasts: () => queue.toasts(),
  getHistory: () => history,
});

/** Text as it is, and anything built, built here where there is a scope. */
function draw(content: ToastContent | undefined): Child {
  return typeof content === "function" ? content() : content;
}

export type ToasterIcons = Partial<Record<Exclude<ToastKind, "default"> | "close", ToastContent>>;

/** What each kind draws, which is shadcn's own mapping. */
function KindIcon(props: Incoming<{ kind: ToastKind }>) {
  const kind = (): ToastKind => props.kind();
  return (
    <>
      {kind() === "success" ? (
        <CircleCheck />
      ) : kind() === "info" ? (
        <Info />
      ) : kind() === "warning" ? (
        <TriangleAlert />
      ) : kind() === "error" ? (
        <OctagonX />
      ) : kind() === "loading" ? (
        <Spinner />
      ) : null}
    </>
  );
}

export interface ToasterToastOptions {
  class?: string;
  className?: string;
  style?: Record<string, string | number | undefined>;
  duration?: number;
  closeButton?: boolean;
  unstyled?: boolean;
  /** @default "Close toast" */
  closeButtonAriaLabel?: string;
}

export interface ToasterProps extends UiProps {
  /** Which corner, or which edge's middle. @default "bottom-right" */
  position?: ToasterPosition;
  /** Tints success, info, warning and error toasts with their own colours. */
  richColors?: boolean;
  /** Keeps the stack open rather than opening it under the pointer. */
  expand?: boolean;
  /** Whether a toast draws a button that takes it away. @default true */
  closeButton?: boolean;
  /** How long a toast stays, in ms, unless it says otherwise. @default 4000 */
  duration?: number;
  /** How many are drawn at once. The rest wait behind them. @default 3 */
  visibleToasts?: number;
  /** The space between toasts in an open stack, in px. @default 14 */
  gap?: number;
  /** How far from the viewport's edges. @default 24 */
  offset?: ToasterOffset;
  /** The same, below 600px. @default 16 */
  mobileOffset?: ToasterOffset;
  /**
   * Which palette `richColors` draws from. Left out, it follows a `.dark`
   * ancestor, which is where this package's themes put the dark tokens.
   */
  theme?: ToasterTheme;
  /** @default the reading direction in scope */
  dir?: "ltr" | "rtl" | "auto";
  /** Swaps the toast's ground and text. */
  invert?: boolean;
  /** The keys that move focus to the toasts. @default ["altKey", "KeyT"] */
  hotkey?: readonly string[];
  /** The ways a toast can be thrown. @default toward the edges it sits at */
  swipeDirections?: readonly ToasterSwipeDirection[];
  /** @default "Notifications" */
  containerAriaLabel?: string;
  /** The region's whole label, in place of `containerAriaLabel`. */
  customAriaLabel?: string;
  /** Replaces the icon a kind draws, or the close button's. */
  icons?: ToasterIcons;
  /** Defaults for every toast this toaster draws. */
  toastOptions?: ToasterToastOptions;
}

const MODIFIERS: Record<string, string> = {
  altKey: "Alt",
  ctrlKey: "Control",
  metaKey: "Meta",
  shiftKey: "Shift",
};

/** `["altKey", "KeyT"]` as `aria-keyshortcuts` wants it: `Alt+T`. */
function shortcut(hotkey: readonly string[]): string {
  return hotkey.map((key) => MODIFIERS[key] ?? key.replace(/^(Key|Digit)/, "")).join("+");
}

function px(value: Length): string {
  return typeof value === "number" ? `${String(value)}px` : value;
}

function offsets(
  prefix: string,
  value: ToasterOffset | undefined,
  otherwise: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const one = typeof value === "object" ? value[side] : value;
    out[`${prefix}-${side}`] = one === undefined ? otherwise : px(one);
  }
  return out;
}

const SWIPE_NAMES: Record<ToasterSwipeDirection, ToastSwipeDirection> = {
  top: "up",
  bottom: "down",
  left: "left",
  right: "right",
};

/** What the toaster knows that every toast in it reads. */
interface Stack {
  readonly positionOf: (toast: Toast<Presentation>) => ToasterPosition;
  readonly shown: (position: ToasterPosition) => readonly Toast<Presentation>[];
  readonly isExpanded: () => boolean;
  readonly gap: () => number;
  readonly heightOf: (id: ToastId) => number;
  readonly measured: (id: ToastId, height: number) => void;
  readonly attach: (id: ToastId, element: HTMLElement | null) => void;
  readonly swipeDirections: (position: ToasterPosition) => readonly ToastSwipeDirection[];
  readonly dismiss: (id: ToastId) => void;
  readonly richColors: () => boolean;
  readonly closeButton: () => boolean;
  readonly invert: () => boolean;
  readonly icons: () => ToasterIcons;
  readonly options: () => ToasterToastOptions;
  readonly hold: (held: boolean) => void;
}

function ToastRow(props: Incoming<{ toast: Toast<Presentation>; stack: Stack }>) {
  const stack = props.stack();
  const entry = (): Toast<Presentation> => props.toast();
  const { id } = props.toast();
  const data = (): Presentation => entry().data ?? {};
  const position = (): ToasterPosition => stack.positionOf(entry());
  const mine = (): readonly Toast<Presentation>[] => stack.shown(position());
  /** 0 is the front, which is the newest. */
  const index = (): number => {
    const all = mine();
    const at = all.findIndex((each) => each.id === id);
    return at < 0 ? 0 : all.length - 1 - at;
  };
  const offset = (): number => {
    const all = mine();
    const ahead = all.slice(all.length - index());
    let total = index() * stack.gap();
    for (const each of ahead) total += stack.heightOf(each.id);
    return total;
  };
  const isDismissible = (): boolean => entry().dismissible !== false;
  const isStyled = (): boolean =>
    data().render === undefined && (data().unstyled ?? stack.options().unstyled) !== true;
  const hasClose = (): boolean =>
    isDismissible() &&
    entry().kind !== "loading" &&
    (data().closeButton ?? stack.options().closeButton ?? stack.closeButton());

  const [mounted, setMounted] = createSignal(false);
  let row: HTMLElement | null = null;

  const swipe = toastSwipe({
    directions: () => stack.swipeDirections(position()),
    onDismiss: () => stack.dismiss(id),
    onHold: stack.hold,
  });

  /**
   * The toast's own height, whatever the stack is making it draw at.
   *
   * A collapsed toast behind the front one is drawn at the front one's height,
   * so reading it as it stands would report that instead.
   */
  const measure = (): void => {
    if (row === null) return;
    const forced = row.style.height;
    row.style.height = "auto";
    const { height } = row.getBoundingClientRect();
    row.style.height = forced;
    stack.measured(id, height);
  };

  // Reading the height resolves the styles of the state it arrives in, so the
  // change to `data-mounted` is a transition from there rather than the first
  // thing the browser ever knew about it.
  onSettled(() => {
    measure();
    setMounted(true);
  });

  let first = true;
  let frame: number | undefined;
  createEffect(
    () => [entry().title, entry().description, entry().kind, entry().action, entry().cancel],
    () => {
      if (first) {
        first = false;
        return;
      }
      // After the frame, when the new text is what is being drawn.
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        measure();
      });
    },
  );

  const onPointerDown = (event: PointerEvent): void => {
    if (row === null || !isDismissible() || entry().kind === "loading") return;
    swipe.track(event, row);
  };

  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    swipe.release();
    stack.attach(id, null);
  });

  const press = (which: "action" | "cancel", event: MouseEvent): void => {
    entry()[which]?.onAction(event);
    if (!event.defaultPrevented) stack.dismiss(id);
  };

  const buttonClass = (variant: "outline" | "ghost", lead: boolean): string =>
    ui(buttonVariants({ variant, size: "sm" }), button, lead ? pushed : "");

  return (
    <li
      data-slot="toast"
      class={() =>
        ui(
          shell,
          isStyled() ? look : "",
          "group/toast",
          stack.options().class,
          stack.options().className,
          data().class,
          data().className,
        )
      }
      ref={(element: HTMLElement | null) => {
        row = element;
        stack.attach(id, element);
      }}
      tabIndex={0}
      // A nested live region takes its own politeness, so the one toast that
      // cannot wait interrupts and the rest of the region still does not.
      aria-live={() => (entry().priority === "high" ? "assertive" : undefined)}
      data-testid={() => data().testId}
      data-kind={() => entry().kind}
      data-type={() => entry().kind}
      data-styled={() => String(isStyled())}
      data-mounted={() => String(mounted())}
      data-removed={() => String(entry().isLeaving === true)}
      data-dismissible={() => String(isDismissible())}
      data-rich-colors={() => String(data().richColors ?? stack.richColors())}
      data-invert={() => String(data().invert ?? stack.invert())}
      data-index={() => String(index())}
      data-front={() => String(index() === 0)}
      data-expanded={() => String(stack.isExpanded())}
      data-y-position={() => position().split("-")[0]}
      data-x-position={() => position().split("-")[1]}
      data-swiping={() => String(swipe.isSwiping())}
      data-swipe-out={() => String(swipe.direction() !== null)}
      data-swipe-direction={() => swipe.direction() ?? undefined}
      style={() => ({
        ...stack.options().style,
        ...data().style,
        "--index": String(index()),
        "--toasts-before": String(index()),
        "--z-index": String(mine().length - index()),
        "--offset": `${String(offset())}px`,
        "--initial-height": `${String(stack.heightOf(id))}px`,
        "--swipe-amount-x": `${String(swipe.offset().x)}px`,
        "--swipe-amount-y": `${String(swipe.offset().y)}px`,
      })}
      onPointerDown={onPointerDown}
    >
      {data().render === undefined ? (
        <>
          {data().icon !== undefined ? (
            <span class={icon} data-slot="toast-icon">
              {draw(data().icon)}
            </span>
          ) : entry().kind === "default" ? null : (
            <span class={icon} data-slot="toast-icon">
              {stack.icons()[entry().kind as keyof ToasterIcons] === undefined ? (
                <KindIcon kind={entry().kind} />
              ) : (
                draw(stack.icons()[entry().kind as keyof ToasterIcons])
              )}
            </span>
          )}
          <div class={body} data-slot="toast-body">
            <div class={title} data-slot="toast-title">
              {draw(entry().title)}
            </div>
            {entry().description === undefined ? null : (
              <div class={description} data-slot="toast-description">
                {draw(entry().description)}
              </div>
            )}
          </div>
          {entry().cancel === undefined ? null : (
            <button
              type="button"
              class={buttonClass("ghost", true)}
              data-slot="toast-cancel"
              data-variant="ghost"
              data-size="sm"
              onClick={(event: MouseEvent) => press("cancel", event)}
            >
              {draw(entry().cancel?.label)}
            </button>
          )}
          {entry().action === undefined ? null : (
            <button
              type="button"
              class={() => buttonClass("outline", entry().cancel === undefined)}
              data-slot="toast-action"
              data-variant="outline"
              data-size="sm"
              onClick={(event: MouseEvent) => press("action", event)}
            >
              {draw(entry().action?.label)}
            </button>
          )}
          {hasClose() ? (
            <button
              type="button"
              class={() =>
                ui(
                  close,
                  entry().action === undefined && entry().cancel === undefined ? pushed : "",
                )
              }
              data-slot="toast-close"
              aria-label={() => stack.options().closeButtonAriaLabel ?? "Close toast"}
              onClick={() => stack.dismiss(id)}
            >
              {stack.icons().close === undefined ? <X /> : draw(stack.icons().close)}
            </button>
          ) : null}
        </>
      ) : (
        data().render?.(id)
      )}
    </li>
  );
}

/**
 * ```tsx
 * <Toaster />
 * toast.success("Saved");
 * ```
 *
 * shadcn's is `sonner`'s `<Toaster>` with this package's tokens mapped onto its
 * CSS variables. `sonner` is React, so the queue is `@barqjs/aria`'s and the
 * look is transcribed rather than configured.
 *
 * The toasts are a STACK: the newest in front, the rest peeking out behind it,
 * and the whole thing opens into a column under a pointer or with focus inside.
 * A toast follows a pointer that drags it and leaves when thrown toward the
 * edge it sits at.
 *
 * A live REGION, not a focus trap. Moving focus to something that appeared on
 * its own takes the keyboard away from whatever the person was doing, so a
 * toast is announced and waits to be reached. Hovering the region pauses every
 * timer in it, because a toast that expires while the pointer is over it was
 * never read.
 */
export function Toaster(props: Incoming<ToasterProps>) {
  const direction = useDirection();
  const dir = (): "ltr" | "rtl" => {
    const asked = props.dir?.();
    return asked === "ltr" || asked === "rtl" ? asked : direction();
  };
  const position = (): ToasterPosition => props.position?.() ?? DEFAULT_POSITION;
  const visible = (): number => Math.max(1, props.visibleToasts?.() ?? DEFAULT_VISIBLE);
  const gap = (): number => props.gap?.() ?? DEFAULT_GAP;
  const hotkey = (): readonly string[] => props.hotkey?.() ?? DEFAULT_HOTKEY;

  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const [heights, setHeights] = createSignal<ReadonlyMap<ToastId, number>>(new Map());
  const [prefersDark, setPrefersDark] = createSignal(false);
  const rows = new Map<ToastId, HTMLElement>();
  let section: HTMLElement | null = null;
  let returnTo: HTMLElement | null = null;
  let byKeyboard = false;
  /** A pointer is down on a toast, so leaving the stack is part of a drag. */
  let held = false;

  const positionOf = (entry: Toast<Presentation>): ToasterPosition =>
    entry.data?.position ?? position();
  const placed = (at: ToasterPosition): readonly Toast<Presentation>[] =>
    queue.toasts().filter((each) => positionOf(each) === at);
  const shown = (at: ToasterPosition): readonly Toast<Presentation>[] =>
    placed(at).slice(-visible());
  const positions = (): readonly ToasterPosition[] => {
    const seen = new Set<ToasterPosition>();
    for (const each of queue.toasts()) seen.add(positionOf(each));
    return [...seen];
  };

  const theme = (): "light" | "dark" | undefined => {
    const asked = props.theme?.();
    if (asked === "system") return prefersDark() ? "dark" : "light";
    return asked;
  };

  /**
   * Focus has to go somewhere when the toast holding it leaves: the next toast
   * in its list, or back to whatever had it before the toasts did.
   */
  const dismiss = (id: ToastId): void => {
    const row = rows.get(id);
    if (row !== undefined && row.contains(document.activeElement)) {
      const one = queue.get(id);
      const others =
        one === undefined ? [] : shown(positionOf(one)).filter((each) => each.id !== id);
      const next = others.at(-1);
      const target = next === undefined ? returnTo : (rows.get(next.id) ?? returnTo);
      if (target !== null && target.isConnected) target.focus({ preventScroll: true });
    }
    queue.dismiss(id);
  };

  const stack: Stack = {
    positionOf,
    shown,
    isExpanded: () => props.expand?.() === true || hovered() || focused(),
    gap,
    heightOf: (id) => heights().get(id) ?? 0,
    measured: (id, height) => {
      setHeights((prev) => {
        if (prev.get(id) === height) return prev;
        const next = new Map<ToastId, number>();
        // Only what is still up is carried over, so the map does not keep the
        // height of every toast the page has ever shown.
        for (const each of queue.toasts()) {
          const known = prev.get(each.id);
          if (known !== undefined) next.set(each.id, known);
        }
        next.set(id, height);
        return next;
      });
    },
    attach: (id, element) => {
      if (element === null) rows.delete(id);
      else rows.set(id, element);
    },
    swipeDirections: (at) => {
      const asked = props.swipeDirections?.();
      if (asked !== undefined) return asked.map((each) => SWIPE_NAMES[each]);
      const [y, x] = at.split("-");
      const ways: ToastSwipeDirection[] = [y === "top" ? "up" : "down"];
      // The inline sides are mirrored with the text, so the edge a toast sits
      // at, and leaves by, is the other one when it runs right to left.
      const mirrored = dir() === "rtl";
      if (x === "left") ways.push(mirrored ? "right" : "left");
      if (x === "right") ways.push(mirrored ? "left" : "right");
      return ways;
    },
    dismiss,
    richColors: () => props.richColors?.() === true,
    closeButton: () => props.closeButton?.() ?? true,
    invert: () => props.invert?.() === true,
    icons: () => props.icons?.() ?? {},
    options: () => props.toastOptions?.() ?? {},
    hold: (next) => {
      held = next;
      if (next) queue.pause("swipe");
      else queue.resume("swipe");
    },
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const keys = hotkey();
    const asked =
      keys.length > 0 &&
      keys.every((key) => (key in MODIFIERS ? event[key as "altKey"] : event.code === key));
    if (asked) {
      const first = section?.querySelector<HTMLElement>('[data-slot="toaster-list"]');
      if (first === null || first === undefined) return;
      event.preventDefault();
      if (section?.contains(document.activeElement) !== true) {
        returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      first.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Escape" && section?.contains(document.activeElement) === true) {
      if (returnTo !== null && returnTo.isConnected) returnTo.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  };

  let teardown: (() => void) | null = null;

  onSettled(() => {
    fallback.duration = () => props.duration?.() ?? props.toastOptions?.()?.duration;
    const unwatch = queue.watchDocument();
    // Asked at the moment a toast is dismissed. The attribute is written here
    // rather than left to the binding, because the exit rules select on it and
    // the duration read back has to be theirs.
    const unmeasure = queue.onLeave((id) => {
      const row = rows.get(id);
      if (row === undefined) return 0;
      row.setAttribute("data-removed", "true");
      return exitDuration(row);
    });
    document.addEventListener("keydown", onKeyDown);
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const onScheme = (event: MediaQueryListEvent): void => {
      setPrefersDark(event.matches);
    };
    if (media !== null) {
      setPrefersDark(media.matches);
      media.addEventListener("change", onScheme);
    }
    teardown = () => {
      unwatch();
      unmeasure();
      document.removeEventListener("keydown", onKeyDown);
      media?.removeEventListener("change", onScheme);
    };
  });

  onCleanup(() => {
    teardown?.();
    fallback.duration = null;
    queue.resume("pointer");
    queue.resume("focus");
    queue.resume("swipe");
  });

  return (
    <section
      {...uiProps("toaster", "", props)}
      ref={mergeRefs((element: HTMLElement | null) => {
        section = element;
      }, props.ref?.())}
      aria-label={props.customAriaLabel?.() ?? props.containerAriaLabel?.() ?? "Notifications"}
      aria-keyshortcuts={shortcut(hotkey())}
      tabIndex={-1}
      // `polite`, so a toast waits for a screen reader to finish its sentence.
      // `assertive` interrupts, which is for an error the page cannot continue
      // past rather than for "Saved".
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
      onMouseEnter={() => {
        setHovered(true);
        queue.pause("pointer");
      }}
      onMouseLeave={() => {
        // A toast being dragged leaves the stack with the pointer still down.
        if (held) return;
        setHovered(false);
        queue.resume("pointer");
      }}
      onFocusIn={(event: FocusEvent) => {
        if (
          !focused() &&
          event.relatedTarget instanceof HTMLElement &&
          section?.contains(event.relatedTarget) !== true
        ) {
          returnTo = event.relatedTarget;
        }
        setFocused(true);
        queue.pause("focus");
      }}
      onKeyDown={() => {
        byKeyboard = true;
      }}
      onPointerDown={() => {
        byKeyboard = false;
      }}
      onFocusOut={(event: FocusEvent) => {
        if (
          event.relatedTarget instanceof Node &&
          section?.contains(event.relatedTarget) === true
        ) {
          return;
        }
        setFocused(false);
        queue.resume("focus");
        // Sonner's: Tab out of the toasts and the keyboard is back where it was
        // before it came here. A pointer that went elsewhere keeps its focus.
        const back = returnTo;
        returnTo = null;
        if (byKeyboard && back !== null && back.isConnected && back !== event.relatedTarget) {
          // After the move that is under way, which would otherwise land last.
          queueMicrotask(() => {
            if (back.isConnected) back.focus({ preventScroll: true });
          });
        }
        byKeyboard = false;
      }}
    >
      <For each={() => positions()} keyed={(at: ToasterPosition) => at}>
        {(at: () => ToasterPosition) => (
          <ol
            data-slot="toaster-list"
            class={ui(list, "toaster", "group")}
            dir={() => dir()}
            tabIndex={-1}
            data-theme={() => theme()}
            data-rich-colors={() => String(stack.richColors())}
            data-y-position={() => at().split("-")[0]}
            data-x-position={() => at().split("-")[1]}
            style={() => ({
              "--front-toast-height": `${String(stack.heightOf(shown(at()).at(-1)?.id ?? -1))}px`,
              "--width": DEFAULT_WIDTH,
              "--gap": `${String(gap())}px`,
              ...offsets("--offset", props.offset?.(), DEFAULT_OFFSET),
              ...offsets("--mobile-offset", props.mobileOffset?.(), DEFAULT_MOBILE_OFFSET),
            })}
          >
            <For each={() => shown(at())} keyed={(each: Toast<Presentation>) => each.id}>
              {(each: () => Toast<Presentation>) => <ToastRow toast={each()} stack={stack} />}
            </For>
          </ol>
        )}
      </For>
    </section>
  );
}
