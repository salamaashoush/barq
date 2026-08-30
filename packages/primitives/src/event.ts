import { type Accessor, getOwner, listen, renderEffect, scope, signal } from "@barqjs/core";
import { type Clear, type MaybeAccessor, access } from "./utils.ts";

/**
 * The event map a target publishes, so `type` autocompletes and the handler's
 * argument is the concrete event rather than `Event`.
 */
export type EventMapOf<T> = T extends Window
  ? WindowEventMap
  : T extends Document
    ? DocumentEventMap
    : T extends HTMLVideoElement | HTMLAudioElement
      ? HTMLMediaElementEventMap
      : T extends MediaQueryList
        ? MediaQueryListEventMap
        : T extends AbortSignal
          ? AbortSignalEventMap
          : T extends XMLHttpRequest
            ? XMLHttpRequestEventMap
            : T extends WebSocket
              ? WebSocketEventMap
              : T extends SVGElement
                ? SVGElementEventMap
                : T extends Element
                  ? // Not `ElementEventMap`, which holds two fullscreen events and
                    // nothing else. Every element in a browser is HTML or SVG, and
                    // both of those maps are supersets of it.
                    HTMLElementEventMap
                  : Record<string, Event>;

export type EventTypeOf<T> = keyof EventMapOf<T> & string;

export type EventOf<T, K extends EventTypeOf<T>> = EventMapOf<T>[K] extends Event
  ? EventMapOf<T>[K]
  : Event;

/** A handler whose `currentTarget` is the element the listener was bound to. */
export type EventHandler<T, K extends EventTypeOf<T>> = (
  event: EventOf<T, K> & { currentTarget: T },
) => void;

type Options = boolean | AddEventListenerOptions;

function bindOne(
  target: EventTarget,
  type: string,
  handler: EventListener,
  options: Options | undefined,
): void {
  // Through the core's `listen`, not `addEventListener` directly: a throw out
  // of a handler has to reach the enclosing `Errored` boundary the same way a
  // compiled `onClick` does, and the handler has to run under this owner so
  // primitives it creates are disposed with it.
  listen(getOwner(), target, type, handler, options);
}

function bindAll(
  target: EventTarget,
  types: string | readonly string[],
  handler: EventListener,
  options: Options | undefined,
): void {
  if (typeof types === "string") {
    bindOne(target, types, handler, options);
    return;
  }
  for (const type of types) bindOne(target, type, handler, options);
}

const isAccessor = (value: unknown): boolean => typeof value === "function";

/**
 * Listen to an event, with the listener removed when the owning scope disposes
 * or when the returned function is called.
 *
 * Any of the target, the type and the options may be an accessor: the listener
 * is then rebound whenever one of them changes, which is what makes a `ref`
 * that fills in after mount work without a manual effect.
 *
 * ```ts
 * on(window, "resize", () => …);
 * on(el, ["mousedown", "touchstart"], () => …, { passive: true });
 * on(target, "click", () => …); // target is an accessor; rebinds on change
 * ```
 */
export function on<T extends EventTarget, K extends EventTypeOf<T>>(
  target: MaybeAccessor<T | null | undefined>,
  type: MaybeAccessor<K | readonly K[]>,
  handler: EventHandler<T, K>,
  options?: MaybeAccessor<Options>,
): Clear {
  return scope((dispose) => {
    if (isAccessor(target) || isAccessor(type) || isAccessor(options)) {
      renderEffect(() => {
        const element = access(target);
        if (element === null || element === undefined) return;
        bindAll(element, access(type), handler as EventListener, access(options));
      });
    } else if (target !== null && target !== undefined) {
      bindAll(
        target as T,
        type as string | readonly string[],
        handler as EventListener,
        options as Options | undefined,
      );
    }
    return dispose;
  });
}

/**
 * The most recent event of `type`, as a signal.
 *
 * ```ts
 * const click = eventSignal(window, "click");
 * effect(() => console.log(click()?.clientX));
 * ```
 */
export function eventSignal<T extends EventTarget, K extends EventTypeOf<T>>(
  target: MaybeAccessor<T | null | undefined>,
  type: MaybeAccessor<K>,
  options?: MaybeAccessor<Options>,
): Accessor<EventOf<T, K> | undefined> {
  const last = signal<EventOf<T, K> | undefined>(undefined, { equals: false });
  on<T, K>(target, type, (event) => last.set(event), options);
  return last;
}

/** Every handler a target needs, bound in one call and removed together. */
export function onMap<T extends EventTarget>(
  target: MaybeAccessor<T | null | undefined>,
  handlers: { [K in EventTypeOf<T>]?: EventHandler<T, K> },
  options?: MaybeAccessor<Options>,
): Clear {
  return scope((dispose) => {
    for (const type of Object.keys(handlers) as EventTypeOf<T>[]) {
      const handler = handlers[type];
      if (handler !== undefined) on<T, EventTypeOf<T>>(target, type, handler, options);
    }
    return dispose;
  });
}

/**
 * Listen until the first event, then unbind.
 *
 * `{ once: true }` does the same for a static target; this also covers the
 * reactive form, where the option would rearm on every rebind.
 */
export function once<T extends EventTarget, K extends EventTypeOf<T>>(
  target: MaybeAccessor<T | null | undefined>,
  type: MaybeAccessor<K>,
  handler: EventHandler<T, K>,
  options?: MaybeAccessor<Options>,
): Clear {
  let done = false;
  const clear = on<T, K>(
    target,
    type,
    (event) => {
      if (done) return;
      done = true;
      clear();
      handler(event);
    },
    options,
  );
  return clear;
}
