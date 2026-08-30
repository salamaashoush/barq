/**
 * A compiled block, under `bun test`.
 *
 * This suite exists so tests drive the same emission a build produces. That was
 * only true of the JavaScript: the loader kept `result.code` and dropped
 * `result.css`, so a component rendered with a class name that named nothing
 * and no test could have noticed. The loader now appends the same registration
 * the dev server does, into the same registry.
 */

import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
import { css } from "@barqjs/css";
import { render, screen } from "./index.ts";

const card = css`
  color: rgb(1, 2, 3);
  &:hover {
    color: rgb(4, 5, 6);
  }
`;

describe("a compiled block in a test", () => {
  test("compiles: the class is a literal, not a runtime call", () => {
    // A `b` prefix is the compiler's; `r` would mean it fell back.
    expect(card).toMatch(/^b[0-9a-z]{7}$/);
  });

  test("renders onto the element", () => {
    render(() => <div data-testid="card" class={card} />);
    expect(screen.getByTestId("card").className).toBe(card);
  });

  test("and its rules are in the document, flattened", () => {
    const sheet = document.getElementById("barq-css")?.textContent ?? "";
    expect(sheet).toContain(`.${card}{color: rgb(1, 2, 3)}`);
    expect(sheet).toContain(`.${card}:hover{color: rgb(4, 5, 6)}`);
  });

  test("collectCss sees the same rules a server render would inline", () => {
    expect(collectCss()).toContain(`.${card}{color: rgb(1, 2, 3)}`);
  });
});
