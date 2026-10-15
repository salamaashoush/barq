/**
 * A `ref` callback that throws reaches the enclosing boundary.
 *
 * A ref runs while the component holding the element is being built, so the
 * throw is routed with that component's scope still current. A boundary takes
 * a routed error by writing it down, and a write made under an owner is one the
 * engine's development build refuses: the refusal replaced the error the
 * application threw, and the boundary showed nothing.
 */
import { expect, test } from "bun:test";
import { Errored } from "./components.ts";
import { ref, render } from "./dom.ts";
import { createRoot, flush } from "./signals.ts";

test("a throwing ref shows the boundary's fallback with the error it threw", () => {
  const container = document.createElement("div");
  const dispose = createRoot((disposeRoot) => {
    render(
      Errored({
        fallback: (error: () => Error) => document.createTextNode(`caught: ${error().message}`),
        children: () => {
          const element = document.createElement("p");
          ref(element, () => {
            throw new Error("ref exploded");
          });
          return element;
        },
      }),
      container,
    );
    return disposeRoot;
  });
  flush();
  expect(container.textContent).toBe("caught: ref exploded");
  dispose();
});
