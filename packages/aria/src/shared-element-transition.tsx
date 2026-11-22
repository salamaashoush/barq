/**
 * Shared elements: one element that appears to move from one parent to another.
 *
 * A selection indicator under the chosen tab is the case. Every tab renders
 * its own indicator and only the selected one is shown; when the selection
 * moves, the old indicator goes and a new one appears somewhere else. Drawn as
 * that, it blinks. Drawn as one bar sliding across, it reads as the selection
 * moving, which is what happened.
 *
 * The technique is FLIP. When a shared element leaves, its box and the current
 * value of every property it transitions are recorded under its name. When one
 * of the same name arrives, it is put where the old one was, with the old
 * values, for one frame, and then let go: the stylesheet's own transitions
 * carry it to where it now belongs. Nothing here animates anything, so the
 * motion, its duration and `prefers-reduced-motion` all stay the stylesheet's.
 *
 * An element with nothing to continue from ENTERS: `data-entering` for one
 * frame. One that leaves with nothing to take over from it EXITS:
 * `data-exiting`, held until its exit transition has finished.
 */

import {
  cells,
  type Accessor,
  type Child,
  createContext,
  createEffect,
  createRenderEffect,
  createSignal,
  getContext,
  type Incoming,
  onCleanup,
  provide,
  Show,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { exitDuration } from "./presence.ts";
import {
  access,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

interface Snapshot {
  rect: DOMRect;
  style: [property: string, value: string][];
  /** The element it was taken from. */
  source: HTMLElement;
}

interface LiveElement {
  name: Accessor<string>;
  element: Accessor<HTMLElement | null>;
  isVisible: Accessor<boolean>;
}

/** What a {@link SharedElementTransition} holds for the shared elements inside it. */
export interface SharedElementScope {
  /** The boxes of elements that have left, by name, until one of the same name arrives. */
  snapshots: Map<string, Snapshot>;
  /** Every shared element currently mounted in the scope. */
  live: Set<LiveElement>;
}

const SharedElementContext = createContext<SharedElementScope | null>(null);

export interface SharedElementTransitionComponentProps {
  children?: Child;
}

/**
 * The scope a shared element's name is unique in.
 *
 * ```tsx
 * <SharedElementTransition>
 *   <For each={tabs()}>{(tab) => <Tab>{tab.name}<Show when={selected() === tab.id}><SharedElement name="underline" /></Show></Tab>}</For>
 * </SharedElementTransition>
 * ```
 */
export function SharedElementTransition(props: Incoming<SharedElementTransitionComponentProps>) {
  const scope: SharedElementScope = { snapshots: new Map(), live: new Set() };
  return provide(
    SharedElementContext,
    () => scope,
    () => props.children as unknown,
  );
}

export type SharedElementPhase = "visible" | "hidden" | "entering" | "exiting";

export interface SharedElementOptions {
  name: MaybeAccessor<string>;
  /** @default true */
  isVisible?: MaybeAccessor<boolean | undefined>;
  ref: Accessor<HTMLElement | null>;
}

export interface SharedElementResult {
  /** Whether the element belongs in the document: shown, or still leaving. */
  isRendered: Accessor<boolean>;
  phase: Accessor<SharedElementPhase>;
  elementProps: DOMProps;
}

type StyleRecord = Record<string, string>;

function animationsOf(element: HTMLElement): Animation[] {
  const source = element as HTMLElement & { getAnimations?: () => Animation[] };
  return typeof source.getAnimations === "function" ? source.getAnimations() : [];
}

function snapshotOf(element: HTMLElement): Snapshot | null {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style === undefined) return null;
  const transitioned = style.transitionProperty.trim();
  if (transitioned === "" || transitioned === "none") return null;
  const values = style as unknown as StyleRecord;
  return {
    rect: element.getBoundingClientRect(),
    style: transitioned.split(/\s*,\s*/).map((property) => [property, values[property] ?? ""]),
    source: element,
  };
}

export function sharedElement(
  options: SharedElementOptions,
  scope: SharedElementScope,
): SharedElementResult {
  const name = (): string => access(options.name);
  const isVisible = (): boolean => access(options.isVisible) !== false;
  const [phase, setPhase] = createSignal<SharedElementPhase>(
    untrack(isVisible) ? "visible" : "hidden",
    { ownedWrite: true },
  );
  const self: LiveElement = { name, element: options.ref, isVisible };

  const record = (element: HTMLElement | null): void => {
    if (element === null || !element.isConnected || element.hasAttribute("data-exiting")) return;
    const snapshot = snapshotOf(element);
    if (snapshot !== null) scope.snapshots.set(untrack(name), snapshot);
  };

  /** Whether the element a snapshot came from is still mounted and still shown. */
  const stays = (source: HTMLElement): boolean => {
    for (const other of scope.live) {
      if (other !== self && untrack(other.element) === source) return untrack(other.isVisible);
    }
    return false;
  };

  if (!isServer) {
    // An element whose PARENT unmounts it is gone from the document by the
    // time its own cleanup runs, too late to measure. One arriving in the same
    // flush is built while the other is still in place, so it measures it.
    if (untrack(isVisible) && !scope.snapshots.has(untrack(name))) {
      for (const other of scope.live) {
        if (untrack(other.name) !== untrack(name)) continue;
        const element = untrack(other.element);
        if (element !== null && element.isConnected) {
          record(element);
          break;
        }
      }
    }
    scope.live.add(self);
    onCleanup(() => scope.live.delete(self));

    // In the render phase, so the leaving element's box is on record before
    // any arriving one, built in the same flush, looks for it.
    createRenderEffect(isVisible, (visible, previous) => {
      if (previous === true && !visible) record(untrack(options.ref));
    });

    createEffect(
      () => ({ visible: isVisible(), element: options.ref(), key: name() }),
      ({ visible, element, key }) => {
        if (element === null) return undefined;
        let frame: number | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;

        let previous = scope.snapshots.get(key);
        if (visible && previous !== undefined) {
          scope.snapshots.delete(key);
          // Taken from one that has not left after all: two of one name shown
          // at once, which is nothing to move between.
          if (stays(previous.source)) previous = undefined;
        }

        if (visible && previous !== undefined) {
          const from = previous;
          setPhase("visible");
          const running = animationsOf(element);
          const inline = element.style as unknown as StyleRecord;
          const restore = from.style.map(([property, value]): [string, string] => {
            const current = inline[property] ?? "";
            if (property === "translate") {
              const now = element.getBoundingClientRect();
              element.style.setProperty(
                "translate",
                `${from.rect.left - now.left}px ${from.rect.top - now.top}px`,
              );
            } else {
              inline[property] = value;
            }
            return [property, current];
          });
          // Moving it back to the old values must not itself animate: only the
          // release next frame should.
          for (const animation of animationsOf(element)) {
            if (!running.includes(animation)) animation.cancel();
          }
          frame = requestAnimationFrame(() => {
            frame = null;
            for (const [property, value] of restore) inline[property] = value;
          });
        } else if (visible) {
          queueMicrotask(() => {
            if (!cancelled) setPhase("entering");
          });
          frame = requestAnimationFrame(() => {
            frame = null;
            setPhase("visible");
          });
        } else {
          // A microtask later, once any element arriving in the same flush has
          // had its chance to take the snapshot over.
          queueMicrotask(() => {
            if (cancelled) return;
            if (!scope.snapshots.has(key)) {
              setPhase("hidden");
              return;
            }
            scope.snapshots.delete(key);
            element.setAttribute("data-exiting", "");
            setPhase("exiting");
            const duration = exitDuration(element);
            if (duration <= 0) {
              setPhase("hidden");
              return;
            }
            timer = setTimeout(() => {
              timer = null;
              setPhase("hidden");
            }, duration);
          });
        }

        return () => {
          cancelled = true;
          if (frame !== null) cancelAnimationFrame(frame);
          if (timer !== null) clearTimeout(timer);
        };
      },
    );
  }

  return {
    phase,
    isRendered: () => isVisible() || phase() !== "hidden",
    elementProps: {
      "data-entering": () => phase() === "entering",
      "data-exiting": () => phase() === "exiting",
    },
  };
}

/** The enclosing {@link SharedElementTransition}'s scope. */
export function useSharedElementScope(): SharedElementScope {
  const scope = getContext(SharedElementContext);
  if (scope === null || scope === undefined) {
    throw new Error("A SharedElement must be rendered inside a SharedElementTransition.");
  }
  return scope;
}

export interface SharedElementComponentProps extends StyleProps {
  /** Elements of one name, in one scope, are one element moving. */
  name: string;
  /** @default true */
  isVisible?: boolean;
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

/** An element that moves, rather than reappears, when it changes parent. */
export function SharedElement(props: SharedElementComponentProps) {
  const scope = useSharedElementScope();
  const domRef = makeRef<HTMLDivElement>();
  const { isRendered, elementProps } = sharedElement(
    { name: () => props.name, isVisible: () => props.isVisible, ref: domRef },
    scope,
  );

  const forwarded = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true, labelable: true }),
    styleProps(cells(props)),
    elementProps,
    { "data-testid": () => props["data-testid"] },
  );

  return (
    <Show when={isRendered()}>
      <div {...forwarded} ref={mergeRefs(domRef.set, props.ref)}>
        {props.children}
      </div>
    </Show>
  );
}
