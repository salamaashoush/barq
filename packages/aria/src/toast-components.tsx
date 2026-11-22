/**
 * The toast region and its parts, headless, over the queue in `toast.ts`.
 *
 * The queue decides what is shown and for how long; what is here is what a
 * screen reader and a keyboard make of it:
 *
 * - **The region is a landmark**, named by how many notifications it holds,
 *   and it is only in the document while it holds one. It is marked top layer,
 *   so a modal opened later neither hides it nor counts a press on it as a
 *   press outside.
 * - **Each toast is a non-modal `alertdialog`** that can be tabbed to, named by
 *   its title and described by its description. Its content is a
 *   `role="alert"`, hidden for the first render and shown after it: NVDA
 *   announces an alert only when it APPEARS in the tree, not when it is
 *   rendered there already visible.
 * - **The clocks stop while the user is in the region**, pointer or focus. A
 *   toast that expires while being read or while its button is focused was
 *   never available to the user.
 * - **Focus is never stranded.** A focused toast that goes hands focus to its
 *   neighbour, newer first; the last one going gives focus back to where it
 *   was before the region took it.
 */

import {
  cells,
  type Accessor,
  type Child,
  createContext,
  createEffect,
  createSignal,
  For,
  getContext,
  isBlock,
  omit,
  onCleanup,
  onSettled,
  provide,
  Show,
  untrack,
} from "@barqjs/core";
import { isServer, Portal } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { Button, type ButtonComponentProps } from "./button.tsx";
import { focusWithoutScrolling, targetElement } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { useLocale } from "./i18n.ts";
import { focusWithin } from "./interactions/focus-events.ts";
import { hover } from "./interactions/hover.ts";
import { getInteractionModality } from "./interactions/modality.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import { portalContainer, topLayerProps, usePortalTarget } from "./overlays.ts";
import type { Toast as QueuedToast, ToastId, ToastQueue } from "./toast.ts";
import {
  access,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

const PAUSE_POINTER = "pointer";
const PAUSE_FOCUS = "focus";

function notifications(count: number): string {
  return count === 1 ? "1 notification." : `${count} notifications.`;
}

// ---------------------------------------------------------------------------
// The region
// ---------------------------------------------------------------------------

export interface ToastRegionOptions {
  ref: ElementRef;
  /** @default "N notifications." */
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface ToastRegionResult {
  regionProps: DOMProps;
  /** Whether the pointer is over the region. */
  isHovered: Accessor<boolean>;
}

export function toastRegion<D>(
  options: ToastRegionOptions,
  queue: ToastQueue<D>,
): ToastRegionResult {
  const count = (): number => queue.toasts().length;

  const { hoverProps, isHovered } = hover({
    onHoverStart: () => queue.pause(PAUSE_POINTER),
    onHoverEnd: () => queue.resume(PAUSE_POINTER),
  });

  // Where focus was before it came into the region, to give it back to.
  let lastFocused: HTMLElement | null = null;
  // Which toast, by its place in the list, holds focus; -1 for none.
  let focusedIndex = -1;

  const giveBack = (): void => {
    const element = lastFocused;
    lastFocused = null;
    if (element === null || !element.isConnected) return;
    if (getInteractionModality() === "pointer") focusWithoutScrolling(element);
    else element.focus();
  };

  const { focusWithinProps } = focusWithin({
    onFocusWithin: (event) => {
      queue.pause(PAUSE_FOCUS);
      lastFocused = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    },
    onBlurWithin: () => {
      queue.resume(PAUSE_FOCUS);
      lastFocused = null;
      focusedIndex = -1;
    },
  });

  const toastElements = (): HTMLElement[] => {
    const region = untrack(() => access(options.ref)) as HTMLElement | null;
    return region === null ? [] : [...region.querySelectorAll<HTMLElement>('[role="alertdialog"]')];
  };

  if (!isServer) {
    let previous: readonly ToastId[] = untrack(() => queue.toasts().map((each) => each.id));
    createEffect(
      () => queue.toasts().map((each) => each.id),
      (ids) => {
        const before = previous;
        previous = ids;
        if (ids.length === 0) {
          // The last one went while the user was in the region.
          if (focusedIndex !== -1) giveBack();
          focusedIndex = -1;
          return;
        }
        if (focusedIndex === -1) return;
        const focusedId = before[focusedIndex];
        if (focusedId === undefined || ids.includes(focusedId)) return;

        // A pointer user is somewhere else entirely; focus held in the region
        // would hold every clock in it stopped.
        if (getInteractionModality() === "pointer" && lastFocused?.isConnected === true) {
          giveBack();
          return;
        }
        // The queue keeps the newest last, and the newer neighbour is the one
        // to land on: it is the one most likely still being read.
        const elements = toastElements();
        let newer: number | null = null;
        for (let at = focusedIndex + 1; at < before.length; at++) {
          const kept = before[at];
          if (kept !== undefined && ids.includes(kept)) {
            newer = ids.indexOf(kept);
            break;
          }
        }
        let older: number | null = null;
        for (let at = focusedIndex - 1; at >= 0; at--) {
          const kept = before[at];
          if (kept !== undefined && ids.includes(kept)) {
            older = ids.indexOf(kept);
            break;
          }
        }
        const next = elements[newer ?? older ?? 0];
        if (next !== undefined) focusWithoutScrolling(next);
      },
    );

    // The region leaving with focus in it, when its owner unmounts it.
    onCleanup(() => {
      if (focusedIndex !== -1) giveBack();
    });
  }

  return {
    isHovered,
    regionProps: mergeProps(hoverProps, focusWithinProps, topLayerProps(), {
      role: "region",
      tabIndex: -1,
      "aria-label": () => access(options["aria-label"]) ?? notifications(count()),
      "aria-labelledby": () => access(options["aria-labelledby"]),
      "aria-describedby": () => access(options["aria-describedby"]),
      // Every focus change, not only the first: focus-within fires once on
      // the way in.
      onFocusIn: (event: FocusEvent) => {
        const target = targetElement(event)?.closest('[role="alertdialog"]') ?? null;
        focusedIndex = target === null ? -1 : toastElements().indexOf(target as HTMLElement);
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// A toast
//
// `ToastRoot` and `ToastBody` rather than React Aria's `Toast` and
// `ToastContent`: `toast.ts` already exports those two names as the types of a
// queued toast and of its text.
// ---------------------------------------------------------------------------

export interface ToastRootOptions<D> {
  toast: MaybeAccessor<QueuedToast<D>>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface ToastRootResult {
  /** The toast: a non-modal alert dialog. */
  toastProps: DOMProps;
  /** Its message: the live alert. */
  contentProps: DOMProps;
  titleProps: DOMProps;
  descriptionProps: DOMProps;
  /** Options for a `<Button>`, not props for an element. */
  closeButtonProps: DOMProps;
  /** Call from a description element while it is mounted, so the toast points at it. */
  describe(has: boolean): void;
}

export function toastRoot<D>(options: ToastRootOptions<D>, queue: ToastQueue<D>): ToastRootResult {
  const titleId = id();
  const descriptionId = id();
  const [described, setDescribed] = createSignal(false, { ownedWrite: true });
  const [isVisible, setVisible] = createSignal(false, { ownedWrite: true });
  onSettled(() => {
    setVisible(true);
  });

  return {
    describe: setDescribed,
    toastProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      role: "alertdialog",
      "aria-modal": "false",
      "aria-labelledby": () => access(options["aria-labelledby"]) ?? titleId(),
      "aria-describedby": () =>
        access(options["aria-describedby"]) ?? (described() ? descriptionId() : undefined),
      tabIndex: 0,
    }),
    contentProps: {
      role: "alert",
      "aria-atomic": "true",
      "aria-hidden": () => (isVisible() ? undefined : "true"),
    },
    titleProps: { id: titleId },
    descriptionProps: { id: descriptionId },
    closeButtonProps: {
      "aria-label": "Close",
      onPress: () => queue.dismiss(access(options.toast).id),
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface RegionValue {
  queue: ToastQueue;
}

interface ToastValue {
  toast: Accessor<QueuedToast>;
  contentProps: DOMProps;
  titleProps: DOMProps;
  descriptionProps: DOMProps;
  closeButtonProps: DOMProps;
  describe(has: boolean): void;
}

const RegionContext = createContext<RegionValue | null>(null);
const ToastRootContext = createContext<ToastValue | null>(null);

function useRegion(): RegionValue {
  const value = getContext(RegionContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a ToastRegion.");
  }
  return value;
}

/** The enclosing {@link ToastRoot}'s toast and the props its parts carry. */
export function useToastRoot(): ToastValue {
  const value = getContext(ToastRootContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a ToastRoot.");
  }
  return value;
}

type ToastRender<D> = (toast: QueuedToast<D>) => Child;

export interface ToastRegionComponentProps<D> extends StyleProps {
  queue: ToastQueue<D>;
  /** How one toast renders, or a {@link ToastList} with that callback inside other markup. */
  children: ToastRender<D> | Child;
  /** @default "N notifications." */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/** The callback among the children, when they are one rather than markup. */
function renderCallback<D>(children: unknown): ToastRender<D> | null {
  if (typeof children !== "function") return null;
  if (children.length > 0) return children as ToastRender<D>;
  if (isBlock(children)) return null;
  const inner: unknown = (children as () => unknown)();
  return typeof inner === "function" && inner.length > 0 ? (inner as ToastRender<D>) : null;
}

/**
 * The toast as its callback sees it: each field read from the queue's current
 * copy, so an update in place reaches the markup without building it again.
 */
function liveToast(current: Accessor<QueuedToast>): QueuedToast {
  return new Proxy({} as QueuedToast, {
    get: (_target, key) => (current() as unknown as Record<PropertyKey, unknown>)[key],
    has: (_target, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), key);
      return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
    },
  });
}

/**
 * ```tsx
 * const queue = toastQueue<{ title: string }>();
 * <ToastRegion queue={queue}>
 *   {(toast) => (
 *     <ToastRoot toast={toast}>
 *       <ToastBody>
 *         <ToastTitle>{toast.title}</ToastTitle>
 *       </ToastBody>
 *       <ToastCloseButton>×</ToastCloseButton>
 *     </ToastRoot>
 *   )}
 * </ToastRegion>
 * ```
 */
export function ToastRegion<D>(props: ToastRegionComponentProps<D>) {
  const target = usePortalTarget();
  const queue = props.queue as ToastQueue;
  const value: RegionValue = { queue };

  return (
    <Show when={queue.toasts().length > 0}>
      <Portal mount={portalContainer(target)}>
        <RegionProvider value={value}>
          <RegionBody {...props} />
        </RegionProvider>
      </Portal>
    </Show>
  );
}

function RegionProvider(props: { value: RegionValue; children?: Child }) {
  return provide(
    RegionContext,
    () => props.value,
    () => props.children as unknown,
  );
}

/** Inside the `<Show>`, so leaving the document is what disposes it. */
function RegionBody<D>(props: ToastRegionComponentProps<D>) {
  const domRef = makeRef<HTMLDivElement>();
  const { queue } = useRegion();
  const locale = useLocale();
  const { regionProps, isHovered } = toastRegion(
    {
      ref: domRef,
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () => props["aria-labelledby"],
      "aria-describedby": () => props["aria-describedby"],
    },
    queue,
  );
  const { focusProps, isFocused, isFocusVisible } = focusRing();
  const render = renderCallback<unknown>(cells(props).children);

  const elementProps = mergeProps(
    regionProps,
    focusProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      dir: () => locale().direction,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      {render === null ? (
        props.children
      ) : (
        <ToastList style={{ display: "contents" }}>{render}</ToastList>
      )}
    </div>
  );
}

export interface ToastListComponentProps<D> extends StyleProps {
  children: ToastRender<D>;
  ref?: RefTarget<HTMLOListElement>;
}

/** The toasts, newest last, as a list. */
export function ToastList<D>(props: ToastListComponentProps<D>) {
  const { queue } = useRegion();
  const { hoverProps, isHovered } = hover({});
  const render = renderCallback<unknown>(cells(props).children);

  const elementProps = mergeProps(
    hoverProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    { "data-hovered": isHovered, "data-testid": () => props["data-testid"] },
  );

  return (
    <ol {...elementProps} ref={mergeRefs(props.ref)}>
      <For each={queue.toasts()} keyed={(each: QueuedToast) => each.id}>
        {(each: Accessor<QueuedToast>) => (
          <li style={{ display: "contents" }}>{render?.(liveToast(each))}</li>
        )}
      </For>
    </ol>
  );
}

export interface ToastRootComponentProps<D> extends StyleProps {
  toast: QueuedToast<D>;
  children?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/** One toast: a non-modal alert dialog that can be tabbed to. */
export function ToastRoot<D>(props: ToastRootComponentProps<D>) {
  const { queue } = useRegion();
  const result = toastRoot<unknown>(
    {
      toast: () => props.toast,
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () => props["aria-labelledby"],
      "aria-describedby": () => props["aria-describedby"],
    },
    queue,
  );
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const value: ToastValue = {
    toast: () => props.toast,
    contentProps: result.contentProps,
    titleProps: result.titleProps,
    descriptionProps: result.descriptionProps,
    closeButtonProps: result.closeButtonProps,
    describe: (has) => result.describe(has),
  };

  const elementProps = mergeProps(
    result.toastProps,
    focusProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-kind": () => props.toast.kind,
      "data-leaving": () => props.toast.isLeaving === true,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(props.ref)}>
      <ToastRootProvider value={value}>{props.children}</ToastRootProvider>
    </div>
  );
}

function ToastRootProvider(props: { value: ToastValue; children?: Child }) {
  return provide(
    ToastRootContext,
    () => props.value,
    () => props.children as unknown,
  );
}

export interface ToastPartComponentProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

/** The message: what is announced when the toast appears. */
export function ToastBody(props: ToastPartComponentProps) {
  const held = useToastRoot();
  return (
    <div
      {...mergeProps(
        held.contentProps,
        filterDOMProps(fromProps(cells(props)), { global: true }),
        styleProps(cells(props)),
        { "data-testid": () => props["data-testid"] },
      )}
      ref={mergeRefs(props.ref)}
    >
      {props.children}
    </div>
  );
}

/** What names the toast. */
export function ToastTitle(props: ToastPartComponentProps) {
  const held = useToastRoot();
  return (
    <div
      {...mergeProps(
        held.titleProps,
        filterDOMProps(fromProps(cells(props)), { global: true, id: false }),
        styleProps(cells(props)),
        { "data-testid": () => props["data-testid"] },
      )}
      ref={mergeRefs(props.ref)}
    >
      {props.children}
    </div>
  );
}

/** What describes it. Rendering one is what makes the toast point at it. */
export function ToastDescription(props: ToastPartComponentProps) {
  const held = useToastRoot();
  held.describe(true);
  onCleanup(() => held.describe(false));
  return (
    <div
      {...mergeProps(
        held.descriptionProps,
        filterDOMProps(fromProps(cells(props)), { global: true, id: false }),
        styleProps(cells(props)),
        { "data-testid": () => props["data-testid"] },
      )}
      ref={mergeRefs(props.ref)}
    >
      {props.children}
    </div>
  );
}

export interface ToastCloseButtonComponentProps extends Omit<ButtonComponentProps, "onPress"> {
  /** Told after the toast is dismissed. */
  onPress?: ButtonComponentProps["onPress"];
}

/** A button that dismisses the enclosing toast. Named "Close" unless told otherwise. */
export function ToastCloseButton(props: ToastCloseButtonComponentProps) {
  const held = useToastRoot();
  const { queue } = useRegion();
  return (
    <Button
      {...omit(props, "onPress", "aria-label")}
      aria-label={props["aria-label"] ?? "Close"}
      onPress={(event: PressEvent) => {
        queue.dismiss(held.toast().id);
        props.onPress?.(event);
      }}
    />
  );
}
