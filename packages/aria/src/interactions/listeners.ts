/**
 * Listeners on targets a component does not own.
 *
 * A press that begins on a button ends wherever the pointer happens to be, so
 * the `pointerup` has to be on the document; a hover ends when the element
 * under the pointer is removed, which only a document-level `pointerover`
 * reports. Both are bound mid-interaction and must come off when the
 * interaction ends AND when the component is disposed, whichever is first.
 */

import { tryCleanup } from "@barqjs/primitives/utils";

interface Registration {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

export interface GlobalListeners {
  add(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  remove(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
  removeAll(): void;
}

/**
 * A set of global listeners tied to the calling scope.
 *
 * `{ once: true }` is handled here rather than being handed to the platform,
 * because a listener the platform removed is still in this registry and
 * `removeAll` would then try to remove it a second time and, worse, keep a
 * reference to it alive.
 */
export function globalListeners(): GlobalListeners {
  const registered = new Map<EventListenerOrEventListenerObject, Registration>();

  const remove: GlobalListeners["remove"] = (target, type, listener, options) => {
    const entry = registered.get(listener);
    target.removeEventListener(type, entry?.listener ?? listener, options);
    registered.delete(listener);
  };

  const removeAll = (): void => {
    // A copy, because `remove` deletes from the map being walked.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const [key, entry] of [...registered]) {
      remove(entry.target, entry.type, key, entry.options);
    }
  };

  tryCleanup(removeAll);

  return {
    add(target, type, listener, options) {
      const wrapped =
        typeof options === "object" && options?.once === true
          ? (event: Event): void => {
              registered.delete(listener);
              if (typeof listener === "function") listener(event);
              else listener.handleEvent(event);
            }
          : listener;
      registered.set(listener, { target, type, listener: wrapped, options });
      target.addEventListener(type, wrapped, options);
    },
    remove,
    removeAll,
  };
}
