import { collectCss } from "@barqjs/css";
import { describe, expect, test } from "bun:test";
import { render } from "@barqjs/testing";
import { breakpoints, on } from "@barqjs/ui/conditions";

import { Center, Container, Grid, Inline, Stack } from "./layout.tsx";

const slot = (name: string): HTMLElement =>
  document.querySelector(`[data-slot="${name}"]`) as HTMLElement;

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

  test("a responsive value writes one range per step it changes at, never overlapping", () => {
    render(() => <Inline gap={{ base: 2, md: 4 }} />);
    const set = variables(slot("inline"));
    // The base, and md, lg, xl and 2xl each holding 4; sm holds the base and is left out.
    expect(set.filter((one) => one.endsWith("=calc(var(--spacing) * 2)"))).toHaveLength(2);
    expect(set.filter((one) => one.endsWith("=calc(var(--spacing) * 4)"))).toHaveLength(8);
    const sheet = collectCss();
    expect(sheet).toContain(`${on.mdOnly}{`);
    expect(sheet).toContain(`${on["2xl"]}{`);
  });

  test("a container step reads the nearest query container", () => {
    render(() => <Grid columns={{ base: 1, cqMd: 3 }} />);
    expect(variables(slot("grid")).some((one) => one.endsWith("=repeat(3, minmax(0, 1fr))"))).toBe(
      true,
    );
    expect(collectCss()).toContain(`${on.cqMdOnly}{`);
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
