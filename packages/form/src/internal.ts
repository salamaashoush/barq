import { type JSXElement, createRenderEffect, readSlot } from "@barqjs/core";

export type Slots = Record<string, unknown>;

export function optionsOf(props: Slots, origin: string): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (key === "children") continue;
    options[key] = readSlot(props[key], `${origin}.${key}`);
  }
  return options;
}

export function renderSlot(slot: unknown, ...args: unknown[]): JSXElement {
  return (
    typeof slot === "function" ? (slot as (...given: unknown[]) => unknown)(...args) : slot
  ) as JSXElement;
}

/**
 * Mounts in an effect rather than in the component body: the core runs user
 * validators and listeners from `mount`, and those may write signals, which a
 * body under construction is not allowed to do.
 */
export function mountWith(api: { mount: () => () => void }): void {
  createRenderEffect(
    () => api,
    (target) => target.mount(),
  );
}

export function updateWith<TOptions>(
  options: () => TOptions,
  update: (next: TOptions) => void,
): void {
  createRenderEffect(options, (next) => {
    update(next);
  });
}
