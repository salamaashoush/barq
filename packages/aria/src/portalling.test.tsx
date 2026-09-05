/**
 * Every overlay leaves the box its trigger sits in.
 *
 * `overlayPosition` computes coordinates in the VIEWPORT and writes them onto
 * an element that is `position: absolute`, so the element needs the body as its
 * containing block. Rendered in place, the nearest positioned ancestor is
 * whatever the trigger happens to sit in — and the overlay lands as far from
 * the trigger as that box is from the corner of the page. An ancestor with
 * `overflow: hidden` then clips what is left.
 *
 * The tooltip shipped that way. Measured on the site's own documentation page:
 * a trigger at x=671 and a tooltip at x=1069, clipped by the card between them,
 * and nothing visible at all. Both halves are the same missing `<Portal>` that
 * Radix has had since the beginning.
 *
 * Asserted as ANCESTRY rather than position, because happy-dom lays nothing
 * out: what it can answer is whether the content is a descendant of the box,
 * and that is the thing that was wrong.
 */

import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { Tooltip, TooltipTrigger, resetTooltipWarmup } from "./tooltip.tsx";

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 15));
}

/** A clipping box, which is what a card, a toolbar or a table cell is. */
function Boxed(props: { children?: unknown }) {
  return (
    <div data-testid="box" style={{ overflow: "hidden", position: "relative" }}>
      {props.children as never}
    </div>
  );
}

describe("an overlay is not a descendant of the box its trigger sits in", () => {
  test("Tooltip", async () => {
    resetTooltipWarmup();
    render(() => (
      <Boxed>
        <TooltipTrigger delay={20} closeDelay={20}>
          <Button>Trigger</Button>
          <Tooltip>Saves to the server</Tooltip>
        </TooltipTrigger>
      </Boxed>
    ));
    user.hover(screen.getByRole("button"));
    await after(20);
    flush();
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toBe("Saves to the server");
    expect(screen.getByTestId("box").contains(tip)).toBe(false);
  });
});
