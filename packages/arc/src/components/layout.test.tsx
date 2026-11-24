import { type Child, Errored } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { describe, expect, test } from "bun:test";
import { render, renderAndHydrate } from "@barqjs/testing";
import { breakpoints, on } from "@barqjs/ui/conditions";

import { halves } from "../ssr-harness.ts";
import { space } from "../style/tokens.ts";
import {
  type Align,
  Center,
  Container,
  Grid,
  Inline,
  type Length,
  type SpaceStep,
  Stack,
} from "./layout.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

/** The custom properties an element sets, by the condition each was written under. */
function variables(element: HTMLElement): string[] {
  return (element.getAttribute("style") ?? "")
    .split(";")
    .map((one) => one.trim())
    .filter((one) => one.startsWith("--"))
    .map((one) => one.replace(/:\s*/, "="));
}

describe("layout components", () => {
  test("a stack is a column, its gap on the spacing scale", () => {
    render(() => (
      <Stack gap={6} class="mine">
        <p>One</p>
        <p>Two</p>
      </Stack>
    ));
    const stack = slot("stack");
    expect(stack.className).toContain("mine");
    expect(stack.className).toContain("a-flex-direction");
    expect(variables(stack).some((one) => one.endsWith("=calc(var(--spacing) * 6)"))).toBe(true);
    expect(stack.children).toHaveLength(2);
  });

  test("a responsive value sets one property per step it changes at, read by fixed rules", () => {
    render(() => <Inline gap={{ base: 2, md: 4 }} />);
    // The base, and md, lg, xl and 2xl each holding 4; sm holds the base and is left out.
    expect(variables(slot("inline"))).toEqual([
      "--arc-gap-base=calc(var(--spacing) * 2)",
      "--arc-gap-md=calc(var(--spacing) * 4)",
      "--arc-gap-lg=calc(var(--spacing) * 4)",
      "--arc-gap-xl=calc(var(--spacing) * 4)",
      "--arc-gap-2xl=calc(var(--spacing) * 4)",
    ]);
    const sheet = collectCss();
    expect(sheet).toMatch(/\{row-gap:var\(--arc-gap-base\)\}/);
    expect(sheet).toContain(`${on.mdOnly}{`);
    expect(sheet).toMatch(/\{row-gap:var\(--arc-gap-md\)\}/);
    expect(sheet).toContain(`${on["2xl"]}{`);
  });

  test("the stylesheet is the same whatever values a page asks for", () => {
    render(() => <Stack gap={{ base: 1, md: 8 }} align="center" />);
    const before = collectCss();
    render(() => <Stack gap={{ base: 3, lg: 12 }} align="end" justify="between" />);
    const after = collectCss();
    expect(after).toBe(before);
  });

  test("a container step reads the nearest query container", () => {
    render(() => <Grid columns={{ base: 1, cqMd: 3 }} />);
    expect(variables(slot("grid"))).toContain("--arc-columns-cq-md=3");
    const sheet = collectCss();
    expect(sheet).toContain(`${on.cqMdOnly}{`);
    expect(sheet).toContain("repeat(var(--arc-columns-cq-md), minmax(0, 1fr))");
  });

  test("a nested stack reads none of the steps of the stack around it", () => {
    render(() => (
      <Stack gap={{ base: 2, md: 6 }}>
        <Stack gap={3} data-testid="inner" />
      </Stack>
    ));
    const inner = document.querySelector('[data-testid="inner"]') as HTMLElement;
    const outer = slot("stack");
    expect(variables(inner)).toEqual(["--arc-gap-base=calc(var(--spacing) * 3)"]);
    const ranged = outer.className.split(" ").filter((one) => !inner.className.includes(one));
    expect(ranged.length).toBeGreaterThan(0);
    for (const one of ranged) expect(inner.className.split(" ")).not.toContain(one);
  });

  test("every value it sets is one of the system's tokens, and anything else is refused", () => {
    render(() => (
      <>
        <Stack gap={{ base: 0.5, xl: 16 }} align={{ base: "start", md: "center" }} />
        <Grid columns={{ base: 2, lg: 4 }} gap={2.5} />
        <Container size="md" padding={{ base: 3, cqLg: 10 }} />
      </>
    ));
    const tokens = new Set<string>([
      ...Object.values(space),
      ...Object.values(breakpoints),
      "flex-start",
      "center",
      "flex-end",
      "stretch",
      "baseline",
      "space-between",
    ]);
    const set = ["stack", "grid", "container"].flatMap((name) => variables(slot(name)));
    expect(set.length).toBeGreaterThan(10);
    for (const one of set) {
      const value = one.slice(one.indexOf("=") + 1);
      if (one.startsWith("--arc-columns-")) expect(value).toMatch(/^[1-9]\d*$/);
      else expect(tokens.has(value), one).toBe(true);
    }

    function refused(child: () => Child): string {
      const { container } = render(() => (
        <Errored fallback={(error: () => Error) => <p>{() => error().message}</p>}>
          {child()}
        </Errored>
      ));
      return container.textContent ?? "";
    }
    expect(refused(() => <Stack gap={7 as SpaceStep} />)).toBe(
      "7 is not a step of arc's spacing scale",
    );
    expect(refused(() => <Inline align={"middle" as Align} />)).toBe("middle is not an alignment");
    expect(refused(() => <Grid columns={2.5} />)).toBe("2.5 is not a column count");
    expect(refused(() => <Grid minItemWidth={"calc(1px)" as Length} />)).toBe(
      "calc(1px) is not a length",
    );
  });

  test("a server writes the properties each step reads, and the page hydrates as written", async () => {
    const { server, client } = await halves(`
      import { Grid, Stack } from "<arc>";
      export function Page() {
        return (
          <Stack gap={{ base: 2, md: 6 }}>
            <Grid columns={{ base: 1, cqMd: 3 }}><p>one</p></Grid>
          </Stack>
        );
      }
    `);
    const result = renderAndHydrate({ server, client });
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.html).toMatch(/--arc-gap-md:\s*calc\(var\(--spacing\) \* 6\)/);
    expect(result.html).toMatch(/--arc-columns-cq-md:\s*3/);
    const written = document.createElement("div");
    written.innerHTML = result.html;
    for (const name of ["stack", "grid"]) {
      const served = written.querySelector(`[data-slot="${name}"]`);
      const hydrated = result.container.querySelector(`[data-slot="${name}"]`);
      expect(hydrated?.getAttribute("style")).toBe(served?.getAttribute("style") ?? "");
      expect(hydrated?.getAttribute("class")).toBe(served?.getAttribute("class") ?? "");
    }
    result.unmount();
  });

  test("a container is centred, as wide as a step's token, and a query container", () => {
    render(() => <Container size="lg" />);
    const box = slot("container");
    expect(variables(box).some((one) => one.endsWith(`=${breakpoints.lg}`))).toBe(true);
    expect(box.className).toContain("a-container-type");
  });

  test("any of them can draw another element in its place", () => {
    render(() => (
      <Stack
        gap={2}
        render={(part, children) => (
          <ul {...part.props} ref={part.ref}>
            {children}
          </ul>
        )}
      >
        <li>One</li>
      </Stack>
    ));
    const list = slot("stack");
    expect(list.tagName).toBe("UL");
    expect(list.querySelector("li")?.textContent).toBe("One");
  });

  test("a centre centres both ways, inline or as a block", () => {
    render(() => <Center inline />);
    expect(slot("center").className).toContain("a-justify-content");
  });
});
