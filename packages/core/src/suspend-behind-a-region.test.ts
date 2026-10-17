/**
 * A suspending read with a region between it and the loading boundary.
 *
 * `region` builds a body untracked — a body's own reads must not become
 * dependencies of the region, or every value the content displays would rebuild
 * it instead of updating in place. A body that SUSPENDS built nothing, so the
 * position has to wake when the value it read arrives, and the boundary above
 * has to leave its fallback then. `Loading > read` is the control.
 */
import { rooted } from "./test-root.ts";
import { describe, expect, test } from "bun:test";
import { Errored, Loading, Show } from "./components.ts";
import { render } from "./dom.ts";
import { block, createMemo, createRoot } from "./signals.ts";
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
function mk() {
  let settle: (v: string) => void = () => {};
  const value = createMemo(
    () =>
      new Promise<string>((r) => {
        settle = r;
      }),
  );
  return { settled: () => settle, value };
}
describe("suspend behind a region", () => {
  for (const [name, wrap] of [
    ["Loading > read", null],
    ["Loading > Errored > read", "errored"],
    ["Loading > Show > read", "show"],
  ] as const) {
    test(
      name,
      rooted(async () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const { settled, value } = mk();
        const leaf = block(() => document.createTextNode(value()));
        createRoot(() => {
          render(
            block(() =>
              Loading({
                fallback: block(() => document.createTextNode("BUSY")),
                children:
                  wrap === null
                    ? leaf
                    : wrap === "errored"
                      ? block(() =>
                          Errored({
                            fallback: block(() => document.createTextNode("ERR")),
                            children: leaf,
                          }),
                        )
                      : block(() => Show({ when: () => true, children: leaf })),
              }),
            ),
            host,
          );
        });
        await tick();
        const atMount = host.textContent;
        settled()?.("READY");
        await tick();
        await tick();
        await tick();
        expect(atMount).toBe("BUSY");
        expect(host.textContent).toBe("READY");
      }),
    );
  }
});
