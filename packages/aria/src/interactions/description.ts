/**
 * A description for assistive technology that has nowhere visible to live.
 *
 * "Long press to open the menu" is not shown to sighted users, who can see the
 * affordance, and cannot be `aria-label` because that would replace the
 * button's name. It goes in a hidden element referenced by `aria-describedby`.
 *
 * One element per distinct string, reference counted: a table with two hundred
 * rows offering the same long press adds one node, not two hundred.
 */

import { effect, isServer, signal } from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import { access, type DOMProps, type MaybeAccessor } from "../utils.ts";

let nextId = 0;
const nodes = new Map<string, { count: number; element: Element }>();

function acquire(text: string): string {
  let entry = nodes.get(text);
  if (entry === undefined) {
    const element = document.createElement("div");
    element.id = `barq-description-${nextId++}`;
    element.style.display = "none";
    element.textContent = text;
    document.body.appendChild(element);
    entry = { count: 0, element };
    nodes.set(text, entry);
  }
  entry.count++;
  return entry.element.id;
}

function release(text: string): void {
  const entry = nodes.get(text);
  if (entry === undefined) return;
  entry.count--;
  if (entry.count > 0) return;
  entry.element.remove();
  nodes.delete(text);
}

/**
 * ```tsx
 * const described = description(() => props.accessibilityDescription?.());
 * <button {...described} />
 * ```
 */
export function description(text: MaybeAccessor<string | undefined>): DOMProps {
  const describedBy = signal<string | undefined>(undefined);
  if (isServer) return { "aria-describedby": describedBy };

  effect(() => {
    const value = access(text);
    if (value === undefined || value === "") {
      describedBy.set(undefined);
      return undefined;
    }
    describedBy.set(acquire(value));
    return () => release(value);
  });

  tryCleanup(() => describedBy.set(undefined));

  return { "aria-describedby": () => describedBy() };
}
