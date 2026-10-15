import { describe, expect, test } from "bun:test";

import { compileBoth, compileText, host, wire } from "./hydration.ts";

/**
 * A function child is a live hole, as it is in Solid: whatever it reads, the
 * hole follows. Handed to a component or a construct, it is still the author's
 * function, so the choice it makes is made again when what it reads changes.
 */
const PRELUDE = `
import { Show, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(false);
function Check() { return <i>check</i>; }
function Copy() { return <i>copy</i>; }
function Button(props) { return <button>{props.children}</button>; }
function Panel(props) { return <section>{props.fallback}</section>; }
`;

const SHAPES: Record<string, string> = {
  "a ternary thunk as a component's only child": `
export default function Page() {
  return <div><Button>{() => (on() ? <Check /> : <Copy />)}</Button></div>;
}`,
  "a ternary thunk beside text": `
export default function Page() {
  return <div><Button>Copy {() => (on() ? <Check /> : <Copy />)}</Button></div>;
}`,
  "an && thunk": `
export default function Page() {
  return <div><Button>{() => on() && <Check />}<Copy /></Button></div>;
}`,
  "a statement body that branches": `
export default function Page() {
  return <div><Button>{() => { if (on()) return <Check />; return <Copy />; }}</Button></div>;
}`,
  "a ternary thunk in a fallback slot": `
export default function Page() {
  return <div><Panel fallback={() => (on() ? <Check /> : <Copy />)} /></div>;
}`,
  "a ternary thunk as a Show body": `
export default function Page() {
  return <div><Show when={true}>{() => (on() ? <Check /> : <Copy />)}</Show></div>;
}`,
};

const text = (page: Element) => [...page.querySelectorAll("i")].map((i) => i.textContent);

describe("a function child that chooses its DOM", () => {
  let index = 0;
  for (const [name, body] of Object.entries(SHAPES)) {
    const tag = `arrow-child-${index++}`;

    test(`${name}: follows what it reads`, async () => {
      const core = await import("@barqjs/core");
      const compiled = await compileText(PRELUDE + body, `${tag}-cold`, false);
      const dom = compiled.dom as unknown as { setOn: (value: boolean) => void };
      dom.setOn(false);
      const page = document.createElement("div");
      document.body.append(page);
      const stop = core.render(compiled.dom.default as never, page);
      core.flush();
      try {
        const before = text(page);
        expect(before).toContain("copy");
        dom.setOn(true);
        core.flush();
        expect(text(page)).toContain("check");
        dom.setOn(false);
        core.flush();
        expect(text(page)).toEqual(before);
      } finally {
        stop();
        page.remove();
      }
    });

    test(`${name}: hydrates, then follows what it reads`, async () => {
      const core = await import("@barqjs/core");
      const compiled = await compileText(PRELUDE + body, `${tag}-hydrate`);
      const dom = compiled.dom as unknown as { setOn: (value: boolean) => void };
      dom.setOn(false);
      const page = host(wire(compiled.ssr));
      const served = [...page.querySelectorAll("i")];
      const stop = core.hydrate(compiled.dom.default as never, page);
      core.flush();
      try {
        expect(core.hydrate.report.mismatches).toEqual([]);
        expect(core.hydrate.report.recovered).toBe(false);
        expect([...page.querySelectorAll("i")]).toEqual(served);
        dom.setOn(true);
        core.flush();
        expect(text(page)).toContain("check");
      } finally {
        stop();
        page.remove();
      }
    });
  }
});

describe("a function child that builds one fixed thing", () => {
  test("stays the Block itself, with no hole around it", () => {
    const [dom] = compileBoth(
      `${PRELUDE}
export default function Page() { return <Button>{() => <Check />}</Button>; }`,
      "arrow-child-fixed",
      false,
      false,
    );
    expect(dom).toContain("children: _$block(() => Check({}))");
  });
});
