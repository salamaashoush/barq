import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * A template is parsed from its own bytes, so a MathML element that is a unit
 * root, a row of a list inside `<math>` or what a component returns, has to be
 * parsed inside `<math>` to be a MathML element at all. On its own the parser
 * hands back an unknown HTML element, which lays out as inline text.
 */
const SOURCE = `
import { For, createSignal } from "@barqjs/core";
export const [names, setNames] = createSignal(["x", "y"]);
function Variable(props) { return <mi mathvariant="bold">{props.name()}</mi>; }
export function Rows() {
  return <math display="block"><mrow><For each={names()}>{(name) => <mi>{name}</mi>}</For><Variable name="z" /><mspace width="1em" /></mrow></math>;
}
export function Html() { return <p><For each={names()}>{(name) => <b>{name}</b>}</For></p>; }
`;

describe("a MathML element that is the root of its own template", () => {
  const code = compileSource(SOURCE, "mathml.tsx");

  test("is emitted as a template parsed inside <math>", () => {
    expect(code).toContain('_$template(`<mi mathvariant="bold"></mi>`, 2)');
    expect(code).toContain("_$template(`<mi></mi>`, 2)");
    expect(code).toContain(
      '<math display="block"><mrow><!----><mspace width="1em"/></mrow></math>`)',
    );
    expect(code).toContain("_$template(`<b></b>`)");
  });

  test("builds every row, in order", async () => {
    // The namespace itself is Chrome's to answer: happy-dom parses `<math>` as
    // HTML. See `browser-mathml-check.ts`.
    const core = await import("@barqjs/core");
    const module = (await loadModule(code, "mathml-rows")) as unknown as {
      Rows: () => unknown;
      setNames: (next: string[]) => void;
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = core.render(() => module.Rows() as never, host);
    try {
      module.setNames(["x", "y", "w"]);
      core.flush();
      const identifiers = [...host.querySelectorAll("mi")];
      expect(identifiers.map((node) => node.textContent)).toEqual(["x", "y", "w", "z"]);
    } finally {
      dispose();
      host.remove();
    }
  });
});
