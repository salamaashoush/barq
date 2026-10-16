import { type JSXElement, flush, render } from "@barqjs/core";

export const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface Mounted {
  host: HTMLElement;
  dispose: () => void;
  text: (selector: string) => string;
  input: (selector: string) => HTMLInputElement;
}

export function mount(view: () => JSXElement): Mounted {
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(view, host);
  flush();
  const find = (selector: string): Element => {
    const found = host.querySelector(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
  };
  return {
    host,
    dispose,
    text: (selector) => find(selector).textContent ?? "",
    input: (selector) => find(selector) as HTMLInputElement,
  };
}

export function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}

export function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new FocusEvent("blur"));
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  flush();
}

export function click(element: Element): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  flush();
}

/** Lets timers and the promises behind them run, then applies what they wrote. */
export async function settle(ms = 0): Promise<void> {
  await tick(ms);
  flush();
}

/**
 * Runs every queued microtask, then applies what they wrote. `setImmediate` is
 * the one timer fake timers leave real, and it fires only once the microtask
 * queue is empty.
 */
export async function drain(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  flush();
}
