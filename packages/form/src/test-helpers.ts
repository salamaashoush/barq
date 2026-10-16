import { type JSXElement, flush, render } from "@barqjs/core";
import { jest } from "bun:test";

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

/**
 * Installs the fake clock.
 *
 * happy-dom folds every zero-delay timeout into one native timer. One left
 * pending on the real clock would collect the zero-delay timeouts made under the
 * fake one, where advancing it never reaches them, so it is let fire first.
 */
export async function fakeClock(): Promise<void> {
  await tick();
  jest.useFakeTimers();
}

/**
 * Runs out the fake clock, then puts the real one back.
 *
 * A zero-delay timeout still pending on the fake clock is dropped with it, and
 * happy-dom's shared timer would then never fire again, taking every later
 * zero-delay timeout in the file with it.
 */
export async function realClock(): Promise<void> {
  if (!jest.isFakeTimers()) return;
  for (let round = 0; jest.getTimerCount() > 0; round++) {
    if (round === 100) {
      throw new Error(`${jest.getTimerCount()} timers still pending: something was left running`);
    }
    jest.runOnlyPendingTimers();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  jest.useRealTimers();
}
