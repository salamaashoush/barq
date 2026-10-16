import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";
import { compileText, host } from "./hydration.ts";

/**
 * An element's attributes read like an object: of two that name one thing the
 * later is what shows, and when the later one goes the earlier is what is left.
 * A spread in the middle of the list is no exception on either side of it.
 */
const SOURCE = `
import { createSignal } from "@barqjs/core";
export const [rest, setRest] = createSignal<Record<string, unknown>>({});
export const [local, setLocal] = createSignal("local-a");
export const clicks: string[] = [];
const own = () => clicks.push("own");

export function Static() { return <button type="button" class="base" {...rest()} />; }
export function Dynamic() { return <p title={local()} {...rest()} />; }
export function Handler() { return <button onClick={own} {...rest()} />; }
export function Around() { return <p title="before" {...rest()} lang="after" />; }
export default function Page() { return <main><p title="before" {...rest()} lang="after" id={local()}>x</p></main>; }
`;

async function mounted(name: string) {
  const core = await import("@barqjs/core");
  const module = (await loadModule(
    compileSource(SOURCE, "spread-precedence.tsx"),
    `spread-precedence-${name}`,
  )) as unknown as Record<string, (value?: never) => unknown> & { clicks: string[] };
  const root = document.createElement("div");
  document.body.appendChild(root);
  const dispose = core.render(() => module[name]() as never, root);
  return {
    element: root.firstElementChild as HTMLElement,
    module,
    set: (setter: string, value: unknown) => {
      module[setter](value as never);
      core.flush();
    },
    dispose: () => {
      dispose();
      root.remove();
    },
  };
}

describe("an attribute written before a spread", () => {
  test("is what is left when the spread stops naming it", async () => {
    const view = await mounted("Static");
    try {
      expect(view.element.getAttribute("type")).toBe("button");
      view.set("setRest", { type: "submit", class: "wide" });
      expect(view.element.getAttribute("type")).toBe("submit");
      expect(view.element.className).toBe("wide");
      view.set("setRest", {});
      expect(view.element.getAttribute("type")).toBe("button");
      expect(view.element.className).toBe("base");
    } finally {
      view.dispose();
    }
  });

  test("does not write over the spread's value when it changes", async () => {
    const view = await mounted("Dynamic");
    try {
      expect(view.element.title).toBe("local-a");
      view.set("setRest", { title: "from-rest" });
      expect(view.element.title).toBe("from-rest");
      view.set("setLocal", "local-b");
      expect(view.element.title).toBe("from-rest");
      view.set("setRest", {});
      expect(view.element.title).toBe("local-b");
    } finally {
      view.dispose();
    }
  });

  test("a handler is replaced by the spread's and comes back after it", async () => {
    const view = await mounted("Handler");
    try {
      const click = (): void => {
        view.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      };
      click();
      view.set("setRest", { onClick: () => view.module.clicks.push("spread") });
      click();
      view.set("setRest", {});
      click();
      expect(view.module.clicks).toEqual(["own", "spread", "own"]);
    } finally {
      view.dispose();
    }
  });

  test("and one written after the spread still wins over it", async () => {
    const view = await mounted("Around");
    try {
      view.set("setRest", { title: "from-rest", lang: "from-rest" });
      expect(view.element.title).toBe("from-rest");
      expect(view.element.lang).toBe("after");
    } finally {
      view.dispose();
    }
  });
});

describe("the same list on the server", () => {
  test("gives the attributes the client gives, on both sides of the spread", async () => {
    const core = await import("@barqjs/core");
    const server = await import("@barqjs/server");
    const compiled = await compileText(SOURCE, "spread-precedence-ssr");
    const arrange = (module: unknown): void => {
      (module as { setRest: (value: Record<string, unknown>) => void }).setRest({
        title: "from-rest",
        lang: "from-rest",
        id: "from-rest",
      });
    };
    arrange(compiled.ssr);
    arrange(compiled.dom);
    core.flush();
    const rendered = await server.renderPage((() =>
      (compiled.ssr.default as unknown as () => unknown)()) as never);
    const page = host(rendered.html);
    const written = page.querySelector("p")?.outerHTML;
    core.resetChildIds();
    const dispose = core.hydrate(compiled.dom.default as never, page);
    core.flush();
    try {
      const paragraph = page.querySelector("p");
      expect(paragraph?.title).toBe("from-rest");
      expect(paragraph?.lang).toBe("after");
      expect(paragraph?.id).toBe("local-a");
      expect(paragraph?.outerHTML).toBe(written);
      expect(core.hydrate.report.recovered).toBe(false);
    } finally {
      dispose();
      page.remove();
    }
  });
});
