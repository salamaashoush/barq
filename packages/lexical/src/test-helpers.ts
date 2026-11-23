import { flush } from "@barqjs/core";

/** Lexical's commit (a microtask) and barq's flush of what it wrote, then a macrotask for good measure. */
export async function settle(ms = 0): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await new Promise((resolve) => setTimeout(resolve, ms));
  flush();
}

export function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

export function key(target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}
