import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * A spread on a component whose object is read from something that moves.
 * `<Row {...rest()} />` handed the component the first object and nothing after
 * it; the same spread on an element has always followed its source.
 */
const SOURCE = `
import { Dynamic, createSignal } from "@barqjs/core";
export const [rest, setRest] = createSignal<Record<string, unknown>>({ title: "first" });
export const [wide, setWide] = createSignal(false);
const narrow = { lang: "en" };
const broad = { lang: "fr", id: "broad" };

function Row(props: { title?: () => string; lang?: () => string; id?: () => string }) {
  return <p title={props.title?.()} lang={props.lang?.()} id={props.id?.()} />;
}
function Passes(props: Record<string, unknown>) {
  return <p {...props} />;
}

export function Called() { return <Row {...rest()} />; }
export function Chosen() { return <Row {...(wide() ? broad : narrow)} />; }
export function Shadowed() { return <Row {...rest()} title="fixed" />; }
export function Forwarded() { return <Passes {...rest()} />; }
export function Tag() { return <Dynamic component="p" {...rest()} />; }
`;

async function mounted(name: string) {
  const core = await import("@barqjs/core");
  const module = (await loadModule(
    compileSource(SOURCE, "component-spread.tsx"),
    `component-spread-${name}`,
  )) as unknown as Record<string, (value?: never) => unknown>;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = core.render(() => module[name]() as never, host);
  return {
    element: () => host.firstElementChild as HTMLElement,
    set: (setter: string, value: unknown) => {
      module[setter](value as never);
      core.flush();
    },
    dispose: () => {
      module.setRest({ title: "first" } as never);
      module.setWide(false as never);
      dispose();
      host.remove();
    },
  };
}

describe("a component spread whose source moves", () => {
  test("the component reads the object the signal holds now", async () => {
    const view = await mounted("Called");
    try {
      expect(view.element().title).toBe("first");
      view.set("setRest", { title: "second", lang: "ar" });
      expect(view.element().title).toBe("second");
      expect(view.element().lang).toBe("ar");
      view.set("setRest", { lang: "ar" });
      expect(view.element().hasAttribute("title")).toBe(false);
    } finally {
      view.dispose();
    }
  });

  test("a spread that chooses between two objects follows the choice", async () => {
    const view = await mounted("Chosen");
    try {
      expect(view.element().lang).toBe("en");
      view.set("setWide", true);
      expect(view.element().lang).toBe("fr");
      expect(view.element().id).toBe("broad");
    } finally {
      view.dispose();
    }
  });

  test("an attribute written after the spread still wins", async () => {
    const view = await mounted("Shadowed");
    try {
      view.set("setRest", { title: "second", lang: "ar" });
      expect(view.element().title).toBe("fixed");
      expect(view.element().lang).toBe("ar");
    } finally {
      view.dispose();
    }
  });

  test("a component that spreads its props onto an element passes the change on", async () => {
    const view = await mounted("Forwarded");
    try {
      expect(view.element().title).toBe("first");
      view.set("setRest", { id: "only" });
      expect(view.element().hasAttribute("title")).toBe(false);
      expect(view.element().id).toBe("only");
    } finally {
      view.dispose();
    }
  });

  test("<Dynamic> forwards the change to the element it made", async () => {
    const view = await mounted("Tag");
    try {
      expect(view.element().title).toBe("first");
      view.set("setRest", { id: "only" });
      expect(view.element().hasAttribute("title")).toBe(false);
      expect(view.element().id).toBe("only");
    } finally {
      view.dispose();
    }
  });
});
