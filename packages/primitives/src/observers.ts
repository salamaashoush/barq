import { isServer, onCleanup, renderEffect, scope } from "@barqjs/core";
import { type Clear, type MaybeAccessor, access } from "./utils.ts";

/**
 * Every observer in this module is shared.
 *
 * A `ResizeObserver` per observed element is the shape most component
 * libraries end up with, and it is the expensive one: the browser keeps a
 * per-observer record and delivers a separate callback batch for each. One
 * observer per distinct option set, routing entries by `entry.target`, turns a
 * thousand observed rows into one observation callback per frame.
 *
 * The registry is torn down when its last target unsubscribes, so a page that
 * stops observing stops paying.
 */
interface Registry<E extends { target: Element }, O> {
  observer: {
    observe: (target: Element, options?: O) => void;
    unobserve: (target: Element) => void;
    disconnect: () => void;
  };
  targets: Map<Element, Set<(entry: E) => void>>;
}

function route<E extends { target: Element }>(
  targets: Map<Element, Set<(entry: E) => void>>,
  entries: readonly E[],
): void {
  for (const entry of entries) {
    const handlers = targets.get(entry.target);
    if (handlers === undefined) continue;
    for (const handler of handlers) handler(entry);
  }
}

function subscribe<E extends { target: Element }, O>(
  registries: Map<string, Registry<E, O>>,
  key: string,
  create: (targets: Map<Element, Set<(entry: E) => void>>) => Registry<E, O>["observer"],
  target: Element,
  handler: (entry: E) => void,
  options: O | undefined,
): Clear {
  let registry = registries.get(key);
  if (registry === undefined) {
    const targets = new Map<Element, Set<(entry: E) => void>>();
    registry = { observer: create(targets), targets };
    registries.set(key, registry);
  }
  const held = registry;

  let handlers = held.targets.get(target);
  if (handlers === undefined) {
    handlers = new Set();
    held.targets.set(target, handlers);
    held.observer.observe(target, options);
  }
  handlers.add(handler);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = held.targets.get(target);
    if (current === undefined) return;
    current.delete(handler);
    if (current.size > 0) return;
    held.targets.delete(target);
    held.observer.unobserve(target);
    if (held.targets.size === 0) {
      held.observer.disconnect();
      if (registries.get(key) === held) registries.delete(key);
    }
  };
}

/**
 * Bind an observer to a target that may arrive late or change, and unbind it
 * with the owning scope.
 */
function observed<T extends Element>(
  target: MaybeAccessor<T | null | undefined>,
  bind: (element: T) => Clear,
): Clear {
  if (isServer) return () => {};
  return scope((dispose) => {
    if (typeof target === "function") {
      renderEffect(() => {
        const element = access(target);
        if (element === null || element === undefined) return undefined;
        return bind(element);
      });
    } else if (target !== null && target !== undefined) {
      onCleanup(bind(target));
    }
    return dispose;
  });
}

const resizeRegistries = new Map<string, Registry<ResizeObserverEntry, ResizeObserverOptions>>();

/**
 * Observe an element's size. The target may be an accessor, so a `ref` that
 * fills in after mount needs no extra effect.
 */
export function resizeObserver<T extends Element>(
  target: MaybeAccessor<T | null | undefined>,
  handler: (entry: ResizeObserverEntry) => void,
  options?: ResizeObserverOptions,
): Clear {
  const box = options?.box ?? "content-box";
  return observed(target, (element) =>
    subscribe(
      resizeRegistries,
      box,
      (targets) => new ResizeObserver((entries) => route(targets, entries)),
      element,
      handler,
      options,
    ),
  );
}

const intersectionRegistries = new Map<
  string,
  Map<string, Registry<IntersectionObserverEntry, undefined>>
>();
let nextRootId = 0;
const rootIds = new WeakMap<Element | Document, string>();

function rootKey(root: IntersectionObserverInit["root"]): string {
  if (root === null || root === undefined) return "";
  let id = rootIds.get(root);
  if (id === undefined) {
    id = `r${nextRootId++}`;
    rootIds.set(root, id);
  }
  return id;
}

/**
 * Observe whether an element intersects the viewport, or a `root` you name.
 *
 * Observers are shared per option set. Two components watching the same
 * element with the same margin and thresholds cost one browser observation.
 */
export function intersectionObserver<T extends Element>(
  target: MaybeAccessor<T | null | undefined>,
  handler: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit,
): Clear {
  const root = options?.root ?? null;
  const outerKey = rootKey(root);
  const threshold = options?.threshold ?? 0;
  const innerKey = `${options?.rootMargin ?? ""}|${
    Array.isArray(threshold) ? threshold.join(",") : threshold
  }`;

  return observed(target, (element) => {
    let registries = intersectionRegistries.get(outerKey);
    if (registries === undefined) {
      registries = new Map();
      intersectionRegistries.set(outerKey, registries);
    }
    const held = registries;
    const release = subscribe(
      held,
      innerKey,
      (targets) => new IntersectionObserver((entries) => route(targets, entries), options),
      element,
      handler,
      undefined,
    );
    return () => {
      release();
      if (held.size === 0 && intersectionRegistries.get(outerKey) === held) {
        intersectionRegistries.delete(outerKey);
      }
    };
  });
}

/**
 * Observe DOM mutations.
 *
 * Not shared, unlike the other two: with `subtree` on, a record's `target` is
 * whichever descendant changed, so records cannot be routed back to the
 * subscription that asked for them. One observer per call is the only correct
 * answer.
 */
export function mutationObserver(
  target: MaybeAccessor<Node | null | undefined>,
  handler: (records: MutationRecord[], observer: MutationObserver) => void,
  options: MutationObserverInit = { childList: true, subtree: true },
): Clear {
  if (isServer) return () => {};
  return scope((dispose) => {
    const bind = (node: Node): Clear => {
      const observer = new MutationObserver(handler);
      observer.observe(node, options);
      return () => observer.disconnect();
    };
    if (typeof target === "function") {
      renderEffect(() => {
        const node = access(target);
        if (node === null || node === undefined) return undefined;
        return bind(node);
      });
    } else if (target !== null && target !== undefined) {
      onCleanup(bind(target));
    }
    return dispose;
  });
}
