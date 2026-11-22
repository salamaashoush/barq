import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { ref } from "@barqjs/primitives/refs";
import { render, screen, tick } from "@barqjs/testing";
import { Popover } from "./dialog.tsx";
import { OverlayArrow, OverlayArrowProvider, type OverlayArrowValue } from "./overlay-arrow.tsx";
import type { Axis } from "./overlays.ts";

async function settle(): Promise<void> {
  await tick();
  await tick();
}

function arrow(): HTMLElement {
  return screen.getByTestId("arrow");
}

describe("OverlayArrow", () => {
  test("inside a popover it sits on the side facing the trigger, where the popover measured", async () => {
    const triggerRef = ref<HTMLElement>();
    render(() => (
      <>
        <button type="button" ref={triggerRef.set}>
          Open
        </button>
        <Popover triggerRef={triggerRef} isOpen placement="bottom" aria-label="Details">
          <OverlayArrow data-testid="arrow">
            <svg width={12} height={12} />
          </OverlayArrow>
        </Popover>
      </>
    ));
    await settle();

    expect(arrow().getAttribute("data-placement")).toBe("bottom");
    expect(arrow().style.position).toBe("absolute");
    expect(arrow().style.bottom).toBe("100%");
    // The popover measures the offset along its edge, so nothing centres it.
    expect(arrow().style.left).toMatch(/px$/);
    expect(arrow().style.transform).toBe("");
    expect(arrow().querySelector("svg")).not.toBeNull();
  });

  test("a measured offset along the edge replaces the centring", () => {
    const value: OverlayArrowValue = {
      placement: () => "top",
      arrowProps: { style: () => ({ position: "absolute", left: "14px" }) },
    };
    render(() => (
      <OverlayArrowProvider value={value}>
        <OverlayArrow data-testid="arrow" />
      </OverlayArrowProvider>
    ));

    expect(arrow().style.top).toBe("100%");
    expect(arrow().style.left).toBe("14px");
    expect(arrow().style.transform).toBe("");
  });

  test("a side placement offsets along the vertical edge", () => {
    const value: OverlayArrowValue = { placement: () => "left" };
    render(() => (
      <OverlayArrowProvider value={value}>
        <OverlayArrow data-testid="arrow" />
      </OverlayArrowProvider>
    ));

    expect(arrow().getAttribute("data-placement")).toBe("left");
    expect(arrow().style.left).toBe("100%");
    expect(arrow().style.top).toBe("50%");
    expect(arrow().style.transform).toBe("translateY(-50%)");
  });

  test("follows the placement when the overlay flips", () => {
    const [side, setSide] = createSignal<Axis | null>("bottom");
    const value: OverlayArrowValue = { placement: side };
    render(() => (
      <OverlayArrowProvider value={value}>
        <OverlayArrow data-testid="arrow" />
      </OverlayArrowProvider>
    ));
    expect(arrow().style.bottom).toBe("100%");

    setSide("top");
    flush();
    expect(arrow().getAttribute("data-placement")).toBe("top");
    expect(arrow().style.top).toBe("100%");
    expect(arrow().style.bottom).toBe("");
  });

  test("hands its element to the overlay that measures it", () => {
    let held: Element | null = null;
    const value: OverlayArrowValue = {
      placement: () => "bottom",
      ref: (element) => {
        held = element;
      },
    };
    render(() => (
      <OverlayArrowProvider value={value}>
        <OverlayArrow data-testid="arrow" />
      </OverlayArrowProvider>
    ));

    expect(held === arrow()).toBe(true);
  });

  test("the caller's class and style land on top of the position", () => {
    render(() => (
      <OverlayArrowProvider value={{ placement: () => "bottom" }}>
        <OverlayArrow data-testid="arrow" class="acme-arrow" style={{ width: "12px" }} />
      </OverlayArrowProvider>
    ));

    expect(arrow().getAttribute("class")).toBe("acme-arrow");
    expect(arrow().style.width).toBe("12px");
    expect(arrow().style.bottom).toBe("100%");
  });

  test("outside any overlay it has no placement", () => {
    render(() => <OverlayArrow data-testid="arrow" />);

    expect(arrow().hasAttribute("data-placement")).toBe(false);
    expect(arrow().style.position).toBe("absolute");
  });
});
