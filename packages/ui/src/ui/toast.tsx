import { declaredDirection, useDirection } from "@barqjs/aria/i18n";
import { portalContainer, usePortalTarget } from "@barqjs/aria/overlays";
import { exitDuration } from "@barqjs/aria/presence";
import {
  toastQueue,
  toastSwipe,
  type Toast as QueuedToast,
  type ToastContent as ToastText,
  type ToastKind,
  type ToastOptions,
  type ToastPromise,
  type ToastQueue,
  type ToastSwipeDirection,
} from "@barqjs/aria/toast";
import {
  For,
  createContext,
  createSignal,
  createEffect,
  createUniqueId,
  getContext,
  onCleanup,
  onSettled,
  provide,
  type Accessor,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { Portal } from "@barqjs/web";
import { layer } from "@barqjs/css";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Info } from "@barqjs/lucide/icons/info";
import { LoaderCircle } from "@barqjs/lucide/icons/loader-circle";
import { OctagonX } from "@barqjs/lucide/icons/octagon-x";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { X } from "@barqjs/lucide/icons/x";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { buttonVariants } from "./button.tsx";
import { mergeRefs } from "@barqjs/primitives/refs";

const ui = layer("barq.ui");

const viewport = ui({
  pointerEvents: "none",
  position: "fixed",
  insetInline: "calc(var(--spacing) * 4)",
  bottom: "calc(var(--spacing) * 4)",
  zIndex: "50",
  marginInline: "auto",
  width: "auto",
  maxWidth: "var(--container-sm)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "@media (width >= 40rem)": {
    "&": {
      insetInlineStart: "auto",
      insetInlineEnd: "calc(var(--spacing) * 4)",
      marginInline: "0px",
      width: "100%",
    },
  },
});

/**
 * Where a toast sits in the stack.
 *
 * Each state excludes the ones that outrank it in its own selector. One class
 * is one declaration here, so two rules for `transform` that tie on
 * specificity are decided by which the stylesheet registered first, and
 * upstream's class list relies on the order it was written in.
 */
const root = ui({
  "--gap": "0.75rem",
  "--peek": "0.75rem",
  "--height": "var(--toast-frontmost-height, var(--toast-height))",
  "--scale": "calc(max(0, 1 - (var(--toast-index) * 0.1)))",
  "--shrink": "calc(1 - var(--scale))",
  "--offset-y":
    "calc(var(--toast-offset-y) * -1 + calc(var(--toast-index) * var(--gap) * -1) + var(--toast-swipe-movement-y))",
  pointerEvents: "auto",
  position: "absolute",
  insetInlineEnd: "0px",
  bottom: "0px",
  zIndex: "calc(1000 - var(--toast-index))",
  width: "100%",
  height: "var(--height)",
  transformOrigin: "bottom",
  borderRadius: "var(--radius)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 10px 15px -3px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  willChange: "transform",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "-webkit-user-select": "none",
  userSelect: "none",
  // The pointer moves the toast, so the page under it must not scroll.
  touchAction: "none",
  transform:
    "translateX(var(--toast-swipe-movement-x)) translateY(calc(var(--toast-swipe-movement-y) - (var(--toast-index) * var(--peek)) - (var(--shrink) * var(--height)))) scale(var(--scale))",
  transitionProperty: "transform, opacity, height",
  transitionDuration: "500ms, 500ms, 150ms",
  transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1), ease, ease",
  ":focus-visible": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  // Covers the gap to the next toast, so a pointer crossing an open stack
  // does not leave it between two toasts and close it.
  "::after": {
    "--ui-content": "''",
    content: "var(--ui-content)",
    position: "absolute",
    top: "100%",
    insetInlineStart: "0px",
    width: "100%",
    height: "calc(var(--gap) + 1px)",
  },
  "[data-expanded]": {
    height: "var(--toast-height)",
  },
  "[data-expanded]:not([data-starting-style])": {
    transform: "translateX(var(--toast-swipe-movement-x)) translateY(var(--offset-y))",
  },
  "[data-swiping]": {
    transitionProperty: "opacity, height",
  },
  "[data-limited]": {
    opacity: "0%",
  },
  "[data-starting-style]": {
    transform: "translateY(150%)",
  },
  "[data-ending-style]:not([data-limited]):not([data-swipe-direction]):not([data-starting-style])":
    {
      transform: "translateY(150%)",
    },
  '[data-ending-style][data-swipe-direction="down"]:not([data-starting-style])': {
    transform: "translateY(calc(var(--toast-swipe-movement-y) + 150%))",
  },
  '[data-ending-style][data-swipe-direction="up"]:not([data-starting-style])': {
    transform: "translateY(calc(var(--toast-swipe-movement-y) - 150%))",
  },
  '[data-ending-style][data-swipe-direction="left"]:not([data-starting-style])': {
    transform: "translateX(calc(var(--toast-swipe-movement-x) - 150%)) translateY(var(--offset-y))",
  },
  '[data-ending-style][data-swipe-direction="right"]:not([data-starting-style])': {
    transform: "translateX(calc(var(--toast-swipe-movement-x) + 150%)) translateY(var(--offset-y))",
  },
  "@media (prefers-reduced-motion: reduce)": {
    "&": {
      transitionDuration: "0s",
    },
  },
});

const content = ui({
  display: "flex",
  height: "100%",
  alignItems: "center",
  gap: "calc(var(--spacing) * 3)",
  overflow: "hidden",
  padding: "calc(var(--spacing) * 4)",
  transitionProperty: "opacity",
  "--ui-duration": "250ms",
  transitionDuration: "250ms",
  "--ui-ease": "cubic-bezier(0.22, 1, 0.36, 1)",
  transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
  "[data-behind]": {
    opacity: "0%",
  },
  "[data-behind][data-expanded]": {
    opacity: "100%",
  },
});

const text = ui({
  display: "flex",
  minWidth: "0px",
  flex: "1",
  flexDirection: "column",
  gap: "var(--spacing)",
});

const title = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
});

const description = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--muted-foreground)",
});

const action = ui({
  flexShrink: "0",
});

const close = ui({
  position: "relative",
  flexShrink: "0",
  color: "var(--muted-foreground)",
  // A hit area wider than the glyph, so a thumb does not have to find 16px.
  "::after": {
    "--ui-content": "''",
    content: "var(--ui-content)",
    position: "absolute",
    inset: "calc(var(--spacing) * -2)",
  },
  "@media (hover: hover)": {
    ":hover": {
      color: "var(--foreground)",
    },
  },
});

const icon = ui({
  flexShrink: "0",
  "& svg": {
    pointerEvents: "none",
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  '[data-type="error"]': {
    color: "var(--destructive)",
  },
  '[data-type="loading"] svg': {
    animation: "spin 1s linear infinite",
  },
});

export interface ToastActionProps {
  children?: ToastText;
  onClick?: (event: MouseEvent) => void;
  class?: string;
  "aria-label"?: string;
}

export interface ToastManagerOptions<Data = unknown> {
  /** One already up under the same id is updated rather than added again. */
  id?: string;
  title?: ToastText;
  description?: ToastText;
  /** Draws a status icon for `success`, `info`, `warning`, `error` and `loading`. */
  type?: string;
  /** How long before it goes, in ms. `0` keeps it. @default the provider's */
  timeout?: number;
  /** `high` interrupts a screen reader; `low` waits its turn. @default "low" */
  priority?: "low" | "high";
  /** Told when it is closed, before it has finished leaving. */
  onClose?: () => void;
  /** Told once it has left the page. */
  onRemove?: () => void;
  /** Draws an action button with these props. */
  actionProps?: ToastActionProps;
  data?: Data;
}

export interface ToastObject<Data = unknown> extends ToastManagerOptions<Data> {
  id: string;
  /** Kept, and hidden, because more are up than the provider's `limit`. */
  limited?: boolean;
  /** Closed, and still being drawn on its way out. */
  transitionStatus?: "ending";
}

/** One outcome of a promise: its description alone, or the whole toast. */
export type ToastPromiseMessage<Data = unknown> = string | ToastManagerOptions<Data>;

export interface ToastPromiseOptions<T, Data = unknown> {
  loading: ToastPromiseMessage<Data>;
  success: ToastPromiseMessage<Data> | ((value: T) => ToastPromiseMessage<Data>);
  error: ToastPromiseMessage<Data> | ((reason: unknown) => ToastPromiseMessage<Data>);
}

export interface ToastManager {
  /** The toasts that are up, newest first. */
  readonly toasts: Accessor<readonly ToastObject[]>;
  add<Data = unknown>(options: ToastManagerOptions<Data>): string;
  /** Closes one, or every one when no id is given. */
  close(id?: string): void;
  update<Data = unknown>(id: string, options: ToastManagerOptions<Data>): void;
  promise<T, Data = unknown>(
    work: Promise<T>,
    options: ToastPromiseOptions<T, Data>,
  ): ToastPromise<T>;
}

/** What a queued toast carries for this component, beyond what the queue reads. */
interface Carried {
  readonly type?: string;
  readonly timeout?: number;
  readonly actionProps?: ToastActionProps;
  readonly onRemove?: () => void;
  readonly payload?: unknown;
}

/** What a provider needs from a manager and a caller does not. */
interface Internals {
  readonly queue: ToastQueue<Carried>;
  /** The mounted provider's default lifetime, which the queue asks for. */
  timeout: (() => number | undefined) | null;
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_LIMIT = 3;
const KINDS = new Set<string>(["success", "info", "warning", "error", "loading"]);
const internalsOf = new WeakMap<ToastManager, Internals>();
let made = 0;

/** `0` is "never", which the queue spells `Infinity`. */
function lifetime(timeout: number): number {
  return timeout === 0 ? Number.POSITIVE_INFINITY : timeout;
}

/** A copy without the keys that hold nothing, so a merge keeps what was there. */
function given<T extends object>(source: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined) out[name] = value;
  }
  return out as T;
}

function queued(options: ToastManagerOptions, before?: Carried): ToastOptions<Carried> {
  return given<ToastOptions<Carried>>({
    title: options.title,
    description: options.description,
    kind:
      options.type === undefined
        ? undefined
        : KINDS.has(options.type)
          ? (options.type as ToastKind)
          : "default",
    duration: options.timeout === undefined ? undefined : lifetime(options.timeout),
    priority: options.priority,
    onDismiss: options.onClose,
    data: {
      ...before,
      ...given<Carried>({
        type: options.type,
        timeout: options.timeout,
        actionProps: options.actionProps,
        onRemove: options.onRemove,
        payload: options.data,
      }),
    },
  });
}

function view(entry: QueuedToast<Carried>): ToastObject {
  return given<ToastObject>({
    id: String(entry.id),
    title: entry.title,
    description: entry.description,
    type: entry.data?.type,
    timeout: entry.data?.timeout,
    priority: entry.priority,
    onClose: entry.onDismiss,
    onRemove: entry.data?.onRemove,
    actionProps: entry.data?.actionProps,
    data: entry.data?.payload,
    transitionStatus: entry.isLeaving === true ? "ending" : undefined,
  });
}

/**
 * A queue of toasts that can be raised from anywhere.
 *
 * ```tsx
 * const toast = createToastManager();
 * <Toaster toastManager={toast} />
 * toast.add({ title: "Event created" });
 * ```
 *
 * A manager is an object rather than a context so a fetch handler or a store,
 * which have usually left the tree, can still reach it.
 */
export function createToastManager(): ToastManager {
  const internals: Internals = {
    queue: toastQueue<Carried>({
      // Every toast is kept. How many are DRAWN is the provider's `limit`.
      limit: Number.POSITIVE_INFINITY,
      duration: () => lifetime(internals.timeout?.() ?? DEFAULT_TIMEOUT),
    }),
    timeout: null,
  };
  const { queue } = internals;

  /** A string describes; anything richer is the toast as written. */
  const outcome = (message: ToastPromiseMessage): ToastOptions<Carried> =>
    queued(typeof message === "string" ? { description: message } : message);

  const manager: ToastManager = {
    toasts: () => queue.toasts().map(view).toReversed(),
    add(options) {
      const id = options.id ?? `toast-${String(++made)}`;
      queue.add({ ...queued(options, queue.get(id)?.data), id });
      return id;
    },
    close: (id) => queue.dismiss(id),
    update(id, options) {
      queue.update(id, queued(options, queue.get(id)?.data));
    },
    promise<T, Data = unknown>(
      work: Promise<T>,
      options: ToastPromiseOptions<T, Data>,
    ): ToastPromise<T> {
      const { success, error } = options;
      // The outcome's own type wins, so a success that is really a warning
      // can say so; left out, it is the outcome's.
      const typed = (type: string, message: ToastPromiseMessage): ToastOptions<Carried> =>
        outcome(
          typeof message === "string" ? { description: message, type } : { type, ...message },
        );
      return queue.promise(work, {
        loading: typed("loading", options.loading),
        success: (value: T) =>
          typed("success", typeof success === "function" ? success(value) : success),
        error: (reason: unknown) =>
          typed("error", typeof error === "function" ? error(reason) : error),
      });
    },
  };
  internalsOf.set(manager, internals);
  return manager;
}

/** The manager a `<Toaster />` reads unless it is given another. */
export const toast: ToastManager = createToastManager();

interface ProviderValue {
  readonly manager: ToastManager;
  readonly queue: ToastQueue<Carried>;
  readonly toasts: Accessor<readonly ToastObject[]>;
  readonly isExpanded: Accessor<boolean>;
  readonly setHovered: (hovered: boolean) => void;
  readonly setFocused: (focused: boolean) => void;
  readonly indexOf: (id: string) => number;
  readonly offsetOf: (id: string) => number;
  readonly heightOf: (id: string) => number;
  readonly frontHeight: Accessor<number>;
  readonly measured: (id: string, height: number) => void;
  readonly attach: (id: string, element: HTMLElement | null) => void;
  /** Closes it, and hands on the focus it was holding. */
  readonly close: (id: string) => void;
  /** Where focus goes back to when the toasts let go of it. */
  readonly remember: (element: HTMLElement | null) => void;
  readonly giveBack: () => void;
  readonly hold: (held: boolean) => void;
  readonly isHeld: () => boolean;
}

const ProviderContext = createContext<ProviderValue | null>(null);

function useProvider(): ProviderValue {
  const value = getContext(ProviderContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <ToastProvider>.");
  }
  return value;
}

/**
 * The provider's manager, and its toasts as the provider draws them.
 *
 * `toasts` is newest first and marks the ones past the provider's `limit`,
 * which the manager on its own cannot know.
 */
export function useToastManager(): ToastManager {
  const provider = useProvider();
  return { ...provider.manager, toasts: provider.toasts };
}

export interface ToastProviderProps {
  /** @default the module's `toast` */
  toastManager?: ToastManager;
  /** How long a toast stays, in ms, unless it says otherwise. `0` keeps it. @default 5000 */
  timeout?: number;
  /** How many are drawn at once. The rest are kept and hidden. @default 3 */
  limit?: number;
  children?: Child;
}

/**
 * Holds the stack's state for the parts under it.
 *
 * ```tsx
 * <ToastProvider>
 *   <App />
 *   <ToastPortal>
 *     <ToastViewport>…</ToastViewport>
 *   </ToastPortal>
 * </ToastProvider>
 * ```
 */
export function ToastProvider(props: Incoming<ToastProviderProps>) {
  const manager = props.toastManager?.() ?? toast;
  const internals = internalsOf.get(manager);
  if (internals === undefined) {
    throw new Error("`toastManager` must come from createToastManager().");
  }
  const { queue } = internals;
  const limit = (): number => Math.max(1, props.limit?.() ?? DEFAULT_LIMIT);

  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const [heights, setHeights] = createSignal<ReadonlyMap<string, number>>(new Map());
  const rows = new Map<string, HTMLElement>();
  let returnTo: HTMLElement | null = null;
  let held = false;

  const toasts = (): readonly ToastObject[] => {
    // One that is leaving has given up its place, so the one waiting behind
    // the limit shows as it goes rather than after.
    let staying = 0;
    return manager.toasts().map((each) => {
      if (each.transitionStatus === "ending") return each;
      staying++;
      return staying > limit() ? { ...each, limited: true } : each;
    });
  };

  const drawn = (): readonly ToastObject[] => toasts().filter((each) => each.limited !== true);
  const heightOf = (id: string): number => heights().get(id) ?? 0;

  const giveBack = (): void => {
    const target = returnTo;
    returnTo = null;
    if (target !== null && target.isConnected) target.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const value: ProviderValue = {
    manager,
    queue,
    toasts,
    isExpanded: () => hovered() || focused(),
    setHovered,
    setFocused,
    indexOf: (id) => {
      const at = drawn().findIndex((each) => each.id === id);
      // A hidden one sits where the last drawn one does, so it comes back
      // from the back of the stack rather than from the front.
      return at < 0 ? Math.max(0, drawn().length - 1) : at;
    },
    offsetOf: (id) => {
      let total = 0;
      for (const each of drawn()) {
        if (each.id === id) break;
        total += heightOf(each.id);
      }
      return total;
    },
    heightOf,
    frontHeight: () => heightOf(drawn()[0]?.id ?? ""),
    measured: (id, height) => {
      setHeights((prev) => {
        if (prev.get(id) === height) return prev;
        const next = new Map<string, number>();
        // Only what is still up is carried over, so the map does not keep the
        // height of every toast the page has ever shown.
        for (const each of queue.toasts()) {
          const known = prev.get(String(each.id));
          if (known !== undefined) next.set(String(each.id), known);
        }
        next.set(id, height);
        return next;
      });
    },
    attach: (id, element) => {
      if (element === null) rows.delete(id);
      else rows.set(id, element);
    },
    close: (id) => {
      const row = rows.get(id);
      if (row !== undefined && row.contains(document.activeElement)) {
        const next = drawn().find((each) => each.id !== id && each.transitionStatus !== "ending");
        const target = next === undefined ? undefined : rows.get(next.id);
        if (target === undefined) giveBack();
        else target.focus({ preventScroll: true });
      }
      queue.dismiss(id);
    },
    remember: (element) => {
      if (returnTo === null) returnTo = element;
    },
    giveBack,
    hold: (next) => {
      held = next;
      if (next) queue.pause("swipe");
      else queue.resume("swipe");
    },
    isHeld: () => held,
  };

  let teardown: (() => void) | null = null;

  onSettled(() => {
    internals.timeout = () => props.timeout?.();
    const unwatch = queue.watchDocument();
    // Asked at the moment a toast is closed. The attribute is written here
    // rather than left to the binding, because the exit rules select on it
    // and the duration read back has to be theirs.
    const unmeasure = queue.onLeave((id) => {
      const row = rows.get(String(id));
      if (row === undefined) return 0;
      row.setAttribute("data-ending-style", "");
      return exitDuration(row);
    });
    teardown = () => {
      unwatch();
      unmeasure();
    };
  });

  onCleanup(() => {
    teardown?.();
    internals.timeout = null;
    queue.resume("pointer");
    queue.resume("focus");
    queue.resume("swipe");
  });

  return <ToastProviderInner value={value}>{props.children}</ToastProviderInner>;
}

/**
 * Its own component, because a `provide` callback that BUILDS the children is
 * the only place the scope exists.
 */
function ToastProviderInner(props: Incoming<{ value: ProviderValue; children?: Child }>) {
  return provide(
    ProviderContext,
    () => props.value(),
    () => props.children,
  );
}

/** Draws the viewport outside the tree, so no ancestor clips or transforms it. */
export function ToastPortal(props: Incoming<UiProps>) {
  const target = usePortalTarget();
  // Read here, where the toaster is written: the portal is outside the element
  // that carries `dir`.
  const declared = declaredDirection();

  return (
    <Portal mount={portalContainer(target)}>
      <div {...uiProps("toast-portal", "", props)} dir={() => props.dir?.() ?? declared()}>
        {props.children}
      </div>
    </Portal>
  );
}

/**
 * The region the toasts are drawn in.
 *
 * A live REGION, not a focus trap. Moving focus to something that appeared on
 * its own takes the keyboard away from whatever the person was doing, so a
 * toast is announced and waits to be reached: `F6` moves focus here, and gives
 * it back with the last toast. A pointer over the stack, or focus inside it,
 * opens it and stops every clock, because a toast that expires while it is
 * being read was never read.
 */
export function ToastViewport(props: Incoming<UiProps>) {
  const provider = useProvider();
  let node: HTMLElement | null = null;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "F6" || node === null || provider.toasts().length === 0) return;
    event.preventDefault();
    if (!node.contains(document.activeElement)) {
      provider.remember(
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
      );
    }
    node.focus({ preventScroll: true });
  };

  onSettled(() => {
    document.addEventListener("keydown", onKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      {...uiProps("toast-viewport", viewport, props)}
      ref={mergeRefs((element: HTMLElement | null) => {
        node = element;
      }, props.ref?.())}
      role="region"
      aria-label={props["aria-label"]?.() ?? "Notifications"}
      aria-keyshortcuts="F6"
      // `polite`, so a toast waits for a screen reader to finish its sentence.
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
      tabIndex={-1}
      data-expanded={() => (provider.isExpanded() ? "" : undefined)}
      style={() => ({
        ...props.style?.(),
        "--toast-frontmost-height": `${String(provider.frontHeight())}px`,
      })}
      onMouseEnter={() => {
        provider.setHovered(true);
        provider.queue.pause("pointer");
      }}
      onMouseLeave={() => {
        // A toast being dragged leaves the stack with the pointer still down.
        if (provider.isHeld()) return;
        provider.setHovered(false);
        provider.queue.resume("pointer");
      }}
      onFocusIn={(event: FocusEvent) => {
        if (
          event.relatedTarget instanceof HTMLElement &&
          node?.contains(event.relatedTarget) !== true
        ) {
          provider.remember(event.relatedTarget);
        }
        provider.setFocused(true);
        provider.queue.pause("focus");
      }}
      onFocusOut={(event: FocusEvent) => {
        if (event.relatedTarget instanceof Node && node?.contains(event.relatedTarget) === true) {
          return;
        }
        provider.setFocused(false);
        provider.queue.resume("focus");
      }}
    >
      {props.children}
    </div>
  );
}

interface RootValue {
  readonly toast: Accessor<ToastObject>;
  readonly titleId: string;
  readonly descriptionId: string;
  /** Called by the part that draws the title, with whether it has one to draw. */
  readonly labelledBy: (has: Accessor<boolean>) => void;
  readonly describedBy: (has: Accessor<boolean>) => void;
  readonly isExpanded: Accessor<boolean>;
  readonly isBehind: Accessor<boolean>;
  readonly close: () => void;
}

const RootContext = createContext<RootValue | null>(null);

function useRoot(): RootValue {
  const value = getContext(RootContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <Toast>.");
  }
  return value;
}

function ToastRootInner(props: Incoming<{ value: RootValue; children?: Child }>) {
  return provide(
    RootContext,
    () => props.value(),
    () => props.children,
  );
}

export interface ToastProps extends UiProps {
  /** The toast to draw, from `useToastManager().toasts()`. */
  toast: ToastObject;
  /** The ways it can be thrown. @default down, and toward the end of the line */
  swipeDirection?: ToastSwipeDirection | readonly ToastSwipeDirection[];
}

/**
 * One toast in the stack.
 *
 * A dialog that is not modal: it has a name and a description and can hold
 * focus, and nothing behind it is taken away. `Escape` closes it while it has
 * focus. A pointer drags it, and thrown toward its edge it leaves that way.
 */
export function Toast(props: Incoming<ToastProps>) {
  const provider = useProvider();
  const direction = useDirection();
  const entry = (): ToastObject => props.toast();
  const { id } = props.toast();
  const titleId = createUniqueId();
  const descriptionId = createUniqueId();

  // `ownedWrite`: the title and the description register from their own
  // component bodies, which are built while this one still is.
  const registered = { ownedWrite: true } as const;
  const [hasTitle, setHasTitle] = createSignal<Accessor<boolean> | null>(null, registered);
  const [hasDescription, setHasDescription] = createSignal<Accessor<boolean> | null>(
    null,
    registered,
  );
  const [mounted, setMounted] = createSignal(false);
  let row: HTMLElement | null = null;

  const ways = (): readonly ToastSwipeDirection[] => {
    const asked = props.swipeDirection?.();
    if (asked === undefined) return ["down", direction() === "rtl" ? "left" : "right"];
    return typeof asked === "string" ? [asked] : asked;
  };

  const swipe = toastSwipe({
    directions: ways,
    threshold: 40,
    // Base UI throws a toast away on distance alone. The swipe's own default
    // also counts a fast flick, which is sonner's rule and not this one's.
    velocity: Number.POSITIVE_INFINITY,
    reverseCancels: true,
    onDismiss: () => provider.close(id),
    onHold: provider.hold,
  });

  const isLimited = (): boolean => entry().limited === true;
  const isEnding = (): boolean => entry().transitionStatus === "ending";

  /**
   * The toast's own height, whatever the stack is making it draw at.
   *
   * A collapsed toast is drawn at the front one's height, so reading it as it
   * stands would report that instead.
   */
  const measure = (): void => {
    if (row === null) return;
    const forced = row.style.height;
    row.style.height = "auto";
    const { height } = row.getBoundingClientRect();
    row.style.height = forced;
    provider.measured(id, height);
  };

  // Reading the height resolves the styles of the state it arrives in, so
  // dropping `data-starting-style` is a transition from there rather than the
  // first thing the browser ever knew about it.
  onSettled(() => {
    measure();
    setMounted(true);
  });

  let first = true;
  let frame: number | undefined;
  createEffect(
    () => [entry().title, entry().description, entry().type, entry().actionProps],
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

  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    swipe.release();
    provider.attach(id, null);
    // Leaving the page with the provider is not being removed from the queue.
    if (provider.queue.get(id) === undefined) props.toast().onRemove?.();
  });

  const value: RootValue = {
    toast: entry,
    titleId,
    descriptionId,
    // Wrapped, because a setter handed a function calls it as an updater.
    labelledBy: (has) => setHasTitle(() => has),
    describedBy: (has) => setHasDescription(() => has),
    isExpanded: provider.isExpanded,
    isBehind: () => provider.indexOf(id) > 0,
    close: () => provider.close(id),
  };

  return (
    <div
      {...uiProps("toast", ui(root, "group/toast"), props)}
      ref={mergeRefs((element: HTMLElement | null) => {
        row = element;
        provider.attach(id, element);
      }, props.ref?.())}
      role={() => (entry().priority === "high" ? "alertdialog" : "dialog")}
      aria-modal="false"
      aria-labelledby={() => (hasTitle()?.() === true ? titleId : undefined)}
      aria-describedby={() => (hasDescription()?.() === true ? descriptionId : undefined)}
      // A nested live region takes its own politeness, so the one toast that
      // cannot wait interrupts and the rest of the region still does not.
      aria-live={() => (entry().priority === "high" ? "assertive" : undefined)}
      // Drawn at no opacity is still read and still a tab stop, so one that is
      // hidden behind the limit is taken out of both.
      aria-hidden={() => (isLimited() ? "true" : undefined)}
      inert={() => isLimited()}
      tabIndex={0}
      data-type={() => entry().type}
      data-expanded={() => (provider.isExpanded() ? "" : undefined)}
      data-limited={() => (isLimited() ? "" : undefined)}
      data-swiping={() => (swipe.isSwiping() ? "" : undefined)}
      data-swipe-direction={() => swipe.direction() ?? undefined}
      data-starting-style={() => (mounted() ? undefined : "")}
      data-ending-style={() => (isEnding() ? "" : undefined)}
      style={() => ({
        ...props.style?.(),
        "--toast-index": String(provider.indexOf(id)),
        "--toast-offset-y": `${String(provider.offsetOf(id))}px`,
        "--toast-height": `${String(provider.heightOf(id))}px`,
        "--toast-swipe-movement-x": `${String(swipe.offset().x)}px`,
        "--toast-swipe-movement-y": `${String(swipe.offset().y)}px`,
      })}
      onPointerDown={(event: PointerEvent) => {
        if (row !== null) swipe.track(event, row);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        provider.close(id);
      }}
    >
      <ToastRootInner value={value}>{props.children}</ToastRootInner>
    </div>
  );
}

/** The padded row inside a toast, which fades while the toast is behind another. */
export function ToastContent(props: Incoming<UiProps>) {
  const toastRoot = useRoot();

  return (
    <div
      {...uiProps("toast-content", content, props)}
      data-behind={() => (toastRoot.isBehind() ? "" : undefined)}
      data-expanded={() => (toastRoot.isExpanded() ? "" : undefined)}
    >
      {props.children}
    </div>
  );
}

/** Text as it is, and anything built, built here where there is a scope. */
function draw(source: ToastText | undefined): Child {
  return typeof source === "function" ? source() : source;
}

/** The toast's name. Draws the toast's own `title` unless given children, and nothing without either. */
export function ToastTitle(props: Incoming<UiProps>) {
  const toastRoot = useRoot();
  const has = (): boolean => props.children !== undefined || toastRoot.toast().title !== undefined;
  toastRoot.labelledBy(has);

  return (
    <>
      {has() ? (
        <h2 {...uiProps("toast-title", title, props)} id={props.id?.() ?? toastRoot.titleId}>
          {props.children === undefined ? draw(toastRoot.toast().title) : props.children}
        </h2>
      ) : null}
    </>
  );
}

/** What the toast says. Draws the toast's own `description` unless given children. */
export function ToastDescription(props: Incoming<UiProps>) {
  const toastRoot = useRoot();
  const has = (): boolean =>
    props.children !== undefined || toastRoot.toast().description !== undefined;
  toastRoot.describedBy(has);

  return (
    <>
      {has() ? (
        <p
          {...uiProps("toast-description", description, props)}
          id={props.id?.() ?? toastRoot.descriptionId}
        >
          {props.children === undefined ? draw(toastRoot.toast().description) : props.children}
        </p>
      ) : null}
    </>
  );
}

/**
 * The button a toast's `actionProps` describes.
 *
 * Draws nothing when the toast has none and no children were given. It does
 * what `onClick` says and no more: closing the toast is the caller's call.
 */
export function ToastAction(props: Incoming<UiProps>) {
  const toastRoot = useRoot();
  const asked = (): ToastActionProps | undefined => toastRoot.toast().actionProps;
  const has = (): boolean => props.children !== undefined || asked()?.children !== undefined;

  return (
    <>
      {has() ? (
        <button
          {...uiProps(
            "toast-action",
            () => ui(buttonVariants({ variant: "outline", size: "sm" }), action, asked()?.class),
            props,
          )}
          type="button"
          data-variant="outline"
          data-size="sm"
          aria-label={() => props["aria-label"]?.() ?? asked()?.["aria-label"]}
          onClick={(event: MouseEvent) => {
            asked()?.onClick?.(event);
            props.onClick?.()?.(event);
          }}
        >
          {props.children === undefined ? draw(asked()?.children) : props.children}
        </button>
      ) : null}
    </>
  );
}

/** Closes the toast it is in. Draws a cross unless given children. */
export function ToastClose(props: Incoming<UiProps>) {
  const toastRoot = useRoot();

  return (
    <button
      {...uiProps(
        "toast-close",
        ui(buttonVariants({ variant: "ghost", size: "icon-sm" }), close),
        props,
      )}
      type="button"
      data-variant="ghost"
      data-size="icon-sm"
      aria-label={props["aria-label"]?.() ?? "Close toast"}
      onClick={(event: MouseEvent) => {
        props.onClick?.()?.(event);
        toastRoot.close();
      }}
    >
      {props.children === undefined ? <X aria-hidden="true" /> : props.children}
    </button>
  );
}

/** What each type draws. `aria-hidden`, because it repeats what the text says. */
function ToastIcon(props: Incoming<{ type: string | undefined }>) {
  const type = (): string | undefined => props.type();

  return (
    <>
      {type() !== undefined && KINDS.has(type() as string) ? (
        <span class={icon} data-slot="toast-icon" data-type={() => type()}>
          {type() === "success" ? (
            <CircleCheck aria-hidden="true" />
          ) : type() === "info" ? (
            <Info aria-hidden="true" />
          ) : type() === "warning" ? (
            <TriangleAlert aria-hidden="true" />
          ) : type() === "error" ? (
            <OctagonX aria-hidden="true" />
          ) : (
            <LoaderCircle aria-hidden="true" />
          )}
        </span>
      ) : null}
    </>
  );
}

function ToastList() {
  const manager = useToastManager();

  return (
    <For each={() => manager.toasts()} keyed={(each: ToastObject) => each.id}>
      {(each: () => ToastObject) => (
        <Toast toast={each()}>
          <ToastContent>
            <ToastIcon type={each().type} />
            <div class={text} data-slot="toast-text">
              <ToastTitle />
              <ToastDescription />
            </div>
            <ToastAction />
            <ToastClose />
          </ToastContent>
        </Toast>
      )}
    </For>
  );
}

export interface ToasterProps extends ToastProviderProps {}

/**
 * ```tsx
 * <Toaster />
 * toast.add({ title: "Event created", description: "Sunday, December 3 at 9:00 AM" });
 * ```
 *
 * The provider, the portal, the viewport and a list of every toast, which is
 * all most pages want. Compose the parts yourself for a toast of another
 * shape. shadcn's is Base UI's toast; that is React, so the queue, the clocks
 * and the swipe are `@barqjs/aria`'s and the parts are named and styled as
 * upstream's are.
 */
export function Toaster(props: Incoming<ToasterProps>) {
  return (
    <ToastProvider
      toastManager={props.toastManager?.()}
      timeout={props.timeout?.()}
      limit={props.limit?.()}
    >
      {props.children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}
