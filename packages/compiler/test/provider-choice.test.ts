import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * A child of a context provider that is a CHOICE, or a fragment holding one.
 *
 * The provider builds its children under the scope that carries the binding,
 * and a choice is not built there: it is a Cell, handed on to the hole that
 * places the provider and called by it. Under that hole's owner the binding is
 * not in reach, so the component the choice built could not find the context
 * it was written inside.
 */
const SOURCE = `
import { createContext, createSignal, useContext } from "@barqjs/core";
const Theme = createContext();
export const [on, setOn] = createSignal(true);
function Reads() { const theme = useContext(Theme); return <i>{theme()}</i>; }
function Wrapped() { return <>{on() ? <Reads /> : null}</>; }
export function Choice() {
  return <main><Theme value="dark">{on() ? <Reads /> : null}</Theme></main>;
}
export function InAFragment() {
  return <main><Theme value="dark"><Wrapped /></Theme></main>;
}
export function BesideAnElement() {
  return <main><Theme value="dark"><b>x</b>{on() ? <Reads /> : null}</Theme></main>;
}
`;

describe("a choice under a provider reads the provider's context", () => {
  for (const name of ["Choice", "InAFragment", "BesideAnElement"]) {
    test(name, async () => {
      const core = await import("@barqjs/core");
      const web = await import("@barqjs/web");
      const module = (await loadModule(
        compileSource(SOURCE, "provider-choice.tsx"),
        `provider-choice-${name}`,
      )) as unknown as Record<string, () => unknown> & { setOn(next: boolean): void };
      const host = document.createElement("div");
      document.body.appendChild(host);
      const dispose = web.render(() => module[name]() as never, host);
      try {
        expect(host.querySelector("i")?.textContent).toBe("dark");
        module.setOn(false);
        core.flush();
        expect(host.querySelector("i")).toBeNull();
        module.setOn(true);
        core.flush();
        expect(host.querySelector("i")?.textContent).toBe("dark");
      } finally {
        dispose();
        host.remove();
      }
    });
  }
});
