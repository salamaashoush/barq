/**
 * A suspending read with a region between it and the loading boundary.
 *
 * `region` builds a body inside `untrack` — a body's own reads must not become
 * dependencies of the key, or every value the content displays would re-swap
 * the whole region instead of updating in place. That is right for a body that
 * builds and wrong for one that SUSPENDS: nothing was built, and the untracked
 * read registered no dependency, so the position could never wake and the
 * boundary sat on its fallback for good.
 *
 * Two things were needed and neither is sufficient alone: the suspended attempt
 * is retried TRACKED so the read lands somewhere, and the key effect's "the key
 * did not move" short-circuit learns that a suspended attempt left nothing
 * standing. `Loading > read` always worked and is the control.
 *
 * The third case also needed `loadingBoundary`'s `move` to stop relocating the
 * node list the last build returned: leaving the park takes everything in it,
 * because a nested region that swapped while parked is not in that list.
 */
import { describe, expect, test } from "bun:test";
import { Errored, Loading, Show } from "./components.ts";
import { render } from "./dom.ts";
import { resource } from "./async.ts";
import { block, scope, signal } from "./signals.ts";
import type { Scope } from "./scope.ts";
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
function mk() {
  const settled = signal<((v: string) => void) | null>(null);
  const value = resource<string>(
    () => null,
    () => new Promise<string>((r) => settled.set(r)),
  );
  return { settled, value };
}
describe("suspend behind a region", () => {
  for (const [name, wrap] of [
    ["Loading > read", null],
    ["Loading > Errored > read", "errored"],
    ["Loading > Show > read", "show"],
  ] as const) {
    test(name, async () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const { settled, value } = mk();
      const leaf = block(() => document.createTextNode(value()));
      scope(() => {
        render(
          block((s: Scope | null) =>
            Loading(s, {
              fallback: block(() => document.createTextNode("BUSY")),
              children:
                wrap === null
                  ? leaf
                  : wrap === "errored"
                    ? block((s2) =>
                        Errored(s2, {
                          fallback: block(() => document.createTextNode("ERR")),
                          children: leaf,
                        }),
                      )
                    : block((s2: Scope | null) => Show(s2, { when: () => true, children: leaf })),
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
      console.log(name.padEnd(26), "mount:", atMount.padEnd(6), "after:", host.textContent);
      expect(atMount).toBe("BUSY");
      expect(host.textContent).toBe("READY");
    });
  }
});
