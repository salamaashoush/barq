import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * SEMANTICS M3: a ref runs when its element is created, in document order and
 * before the element is inserted into the parent its render is building, which
 * is Solid 2.0's timing. A function it returns is a cleanup on the scope that
 * owns the element.
 */
const SOURCE = `
import { createSignal, Show } from "@barqjs/core";
export const log: string[] = [];
export const [on, setOn] = createSignal(true);
function Leaf() {
  return <i ref={(el: HTMLElement) => { log.push("leaf parent=" + (el.parentElement?.tagName ?? "none")); }} />;
}
export function Order() {
  return (
    <section ref={(el: HTMLElement) => { log.push("section children=" + el.childElementCount); }}>
      <div ref={(el: HTMLElement) => { log.push("div children=" + el.childElementCount + " parent=" + el.parentElement?.tagName); }}>
        <span ref={(el: HTMLElement) => { log.push("span parent=" + el.parentElement?.tagName); }} />
        <span />
      </div>
      <Leaf />
    </section>
  );
}
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
  const web = await import("@barqjs/web");
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
  const dispose = web.render(() => (module[name] as () => never)(), host);
  return {
    core,
    module,
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

describe("M3, when a ref runs", () => {
  test("in document order at creation: a parent before its children, a component's root before insertion", async () => {
    const view = await mount("Order");
    try {
      expect(view.module.log).toEqual([
        "section children=1",
        "div children=2 parent=SECTION",
        "span parent=DIV",
        "leaf parent=none",
      ]);
    } finally {
      view.dispose();
    }
  });
});

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
