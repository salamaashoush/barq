import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * SEMANTICS M3's cleanup clause: a function a ref callback returns is a
 * cleanup on the scope that owns the element, so it runs at dispose and when
 * a branch holding the element leaves.
 */
const SOURCE = `
import { createSignal, Show } from "@barqjs/core";
export const log: string[] = [];
export const [on, setOn] = createSignal(true);
export function Cleanup() {
  return (
    <p>
      <Show when={on()}>
        <b
          ref={(el: HTMLElement) => {
            log.push("ref " + el.tagName);
            return () => log.push("cleanup");
          }}
        />
      </Show>
    </p>
  );
}
`;

async function mount(name: string) {
  const core = await import("@barqjs/core");
  const module = (await loadModule(
    compileSource(SOURCE, "ref-cleanup.tsx"),
    `ref-cleanup-${name}`,
  )) as unknown as Record<string, unknown> & {
    log: string[];
    setOn: (value: boolean) => void;
  };
  module.log.length = 0;
  module.setOn(true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = core.render(() => (module[name] as () => never)(), host);
  return {
    core,
    module,
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

describe("M3, a ref callback's returned cleanup", () => {
  test("a returned function runs when the scope that owns the element is disposed", async () => {
    const view = await mount("Cleanup");
    view.dispose();
    expect(view.module.log).toEqual(["ref B", "cleanup"]);
  });

  test("a branch that leaves runs its ref's cleanup, and coming back runs the ref again", async () => {
    const view = await mount("Cleanup");
    try {
      view.module.setOn(false);
      view.core.flush();
      view.module.setOn(true);
      view.core.flush();
      expect(view.module.log).toEqual(["ref B", "cleanup", "ref B"]);
    } finally {
      view.dispose();
    }
    expect(view.module.log).toEqual(["ref B", "cleanup", "ref B", "cleanup"]);
  });
});
