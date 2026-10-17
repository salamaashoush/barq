import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * An attribute follows what it reads, whether or not the compiler can name the
 * thing read. A derived function, a helper from another module and a read mixed
 * with a plain object are all calls or reads the analysis cannot classify, and
 * each was evaluated once where the same expression at a text hole stayed live.
 */
const SOURCE = `
import { createSignal } from "@barqjs/core";
export const [count, setCount] = createSignal(1);
export const [on, setOn] = createSignal(true);
export const [label, setLabel] = createSignal("first");
const styles = { on: "is-on", off: "is-off" };
const double = () => count() * 2;
const row = () => ({ text: "n" + count() });
function plain() { return count() + 2; }
const labelOf = () => label;

export function Derived() {
  return <p title={double()} lang={row().text} id={\`id-\${double()}\`} data-plain={plain()} class={double() > 2 ? "big" : "small"} style={{ width: \`\${double()}px\` }} />;
}
export function Mixed() {
  return <p class={on() ? styles.on : styles.off} title={on() ? styles.on : null} data-both={styles.on + count()}>{on() ? styles.on : styles.off}</p>;
}
export function YieldsACell() {
  return <p title={labelOf()} />;
}
export function Cleared() {
  return <button title={on() ? "saved" : undefined} disabled={on() ? true : undefined} style={{ color: on() ? "red" : undefined }} />;
}
export function Property() {
  return <input value={double()} disabled={double() > 2} />;
}
`;

async function mounted(name: string) {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const module = (await loadModule(
    compileSource(SOURCE, "attribute-liveness.tsx"),
    `attribute-liveness-${name}`,
  )) as unknown as Record<string, (value?: never) => unknown>;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = web.render(() => module[name]() as never, host);
  return {
    element: host.firstElementChild as HTMLElement,
    set: (setter: string, value: unknown) => {
      module[setter](value as never);
      core.flush();
    },
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

describe("an attribute whose expression the compiler cannot classify", () => {
  test("a call to a derived function follows the signal it reads", async () => {
    const view = await mounted("Derived");
    try {
      const { element } = view;
      expect(element.title).toBe("2");
      view.set("setCount", 5);
      expect(element.title).toBe("10");
      expect(element.lang).toBe("n5");
      expect(element.id).toBe("id-10");
      expect(element.dataset.plain).toBe("7");
      expect(element.className).toBe("big");
      expect(element.style.width).toBe("10px");
    } finally {
      view.dispose();
    }
  });

  test("a signal read beside a plain object's member follows the signal", async () => {
    const view = await mounted("Mixed");
    try {
      const { element } = view;
      expect(element.className).toBe("is-on");
      view.set("setOn", false);
      expect(element.className).toBe("is-off");
      expect(element.hasAttribute("title")).toBe(false);
      expect(element.textContent).toBe("is-off");
      view.set("setCount", 4);
      expect(element.dataset.both).toBe("is-on4");
    } finally {
      view.set("setOn", true);
      view.dispose();
    }
  });

  test("a call that hands back an accessor is read through it", async () => {
    const view = await mounted("YieldsACell");
    try {
      expect(view.element.title).toBe("first");
      view.set("setLabel", "second");
      expect(view.element.title).toBe("second");
    } finally {
      view.dispose();
    }
  });

  test("an attribute, a property and a declaration that go to undefined are cleared", async () => {
    const view = await mounted("Cleared");
    try {
      const button = view.element as unknown as HTMLButtonElement;
      expect(button.title).toBe("saved");
      expect(button.disabled).toBe(true);
      expect(button.style.color).toBe("red");
      view.set("setOn", false);
      expect(button.hasAttribute("title")).toBe(false);
      expect(button.disabled).toBe(false);
      expect(button.style.color).toBe("");
    } finally {
      view.set("setOn", true);
      view.dispose();
    }
  });

  test("a property written from a derived call follows it too", async () => {
    const view = await mounted("Property");
    try {
      const input = view.element as unknown as HTMLInputElement;
      expect(input.value).toBe("2");
      expect(input.disabled).toBe(false);
      view.set("setCount", 3);
      expect(input.value).toBe("6");
      expect(input.disabled).toBe(true);
    } finally {
      view.dispose();
    }
  });
});
