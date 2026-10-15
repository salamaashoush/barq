import { describe, expect, test } from "bun:test";

import { compileText, host } from "./hydration.ts";

/**
 * `createUniqueId` on a page the server rendered. The label and the field it
 * names are joined by the id, and the client must arrive at the string the
 * server wrote, or the attribute is rewritten under a reader's feet.
 */
const SOURCE = `
import { For, Show, createSignal, createUniqueId } from "@barqjs/core";
export const [names] = createSignal(["ada", "grace"]);
export const [extra, setExtra] = createSignal(false);
function Field(props) {
  const id = createUniqueId();
  return <p><label for={id}>{props.label()}</label><input id={id} /></p>;
}
export default function Page() {
  const [open] = createSignal(true);
  return (
    <form>
      <Field label="first" />
      <Show when={open()}><Field label="inside a condition" /></Show>
      <For each={names()}>{(name) => <Field label={name} />}</For>
      <Show when={extra()}><Field label="later" /></Show>
      <Field label="last" />
    </form>
  );
}`;

const ids = (root: Element): string[] =>
  [...root.querySelectorAll("input")].map((input) => input.id);

async function served(tag: string) {
  const core = await import("@barqjs/core");
  const server = await import("@barqjs/server");
  const compiled = await compileText(SOURCE, tag);
  const rendered = await server.renderPage((() =>
    (compiled.ssr.default as unknown as () => unknown)()) as never);
  const page = host(rendered.html);
  core.resetChildIds();
  return { core, compiled, page };
}

describe("an id made on the server and again on the client", () => {
  test("is the same string, for every field on the page", async () => {
    const { core, compiled, page } = await served("unique-id-same");
    const written = ids(page);
    const dispose = core.hydrate(compiled.dom.default as never, page);
    core.flush();
    try {
      expect(written).toHaveLength(5);
      expect(new Set(written).size).toBe(5);
      expect(ids(page)).toEqual(written);
      expect(core.hydrate.report.recovered).toBe(false);
      for (const label of page.querySelectorAll("label")) {
        expect(page.querySelector(`#${CSS.escape(label.htmlFor)}`)).not.toBeNull();
      }
    } finally {
      dispose();
      page.remove();
    }
  });

  test("a field built after hydration takes an id no other field has", async () => {
    const { core, compiled, page } = await served("unique-id-later");
    const dispose = core.hydrate(compiled.dom.default as never, page);
    core.flush();
    try {
      (compiled.dom as unknown as { setExtra: (value: boolean) => void }).setExtra(true);
      core.flush();
      const all = ids(page);
      expect(all).toHaveLength(6);
      expect(new Set(all).size).toBe(6);
    } finally {
      (compiled.dom as unknown as { setExtra: (value: boolean) => void }).setExtra(false);
      dispose();
      page.remove();
    }
  });

  test("a page that was never on a server still gets distinct ids", async () => {
    const core = await import("@barqjs/core");
    const compiled = await compileText(SOURCE, "unique-id-cold");
    const page = host("");
    const dispose = core.render(compiled.dom.default as never, page);
    core.flush();
    try {
      const all = ids(page);
      expect(all).toHaveLength(5);
      expect(new Set(all).size).toBe(5);
    } finally {
      dispose();
      page.remove();
    }
  });
});
