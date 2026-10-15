import { describe, expect, test } from "bun:test";
import { createSignal, flush, onSettled, type Incoming } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Button } from "./button.tsx";
import { Input } from "./input.tsx";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  type PopoverContentProps,
} from "./popover.tsx";

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** happy-dom lays nothing out, so the box an overlay is placed against is stated. */
function box(element: Element, rect: { top: number; left: number; width: number; height: number }) {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
    }) as DOMRect;
}

function Fixture(props: Incoming<{ content?: PopoverContentProps }>) {
  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline">Open</Button>
      </PopoverTrigger>
      <PopoverContent
        side={props.content?.()?.side}
        align={props.content?.()?.align}
        sideOffset={props.content?.()?.sideOffset}
        alignOffset={props.content?.()?.alignOffset}
        placement={props.content?.()?.placement}
        offset={props.content?.()?.offset}
      >
        <PopoverHeader>
          <PopoverTitle>Dimensions</PopoverTitle>
          <PopoverDescription>Set the size of the layer.</PopoverDescription>
        </PopoverHeader>
        <Input aria-label="Width" />
      </PopoverContent>
    </Popover>
  );
}

const trigger = (): HTMLElement => screen.getByRole("button", { name: "Open" });
const content = (): HTMLElement | null => document.querySelector('[data-slot="popover-content"]');

describe("Popover", () => {
  test("every part carries upstream's slot name", async () => {
    render(() => <Fixture />);
    await user.click(trigger());
    await settle();

    for (const slot of [
      "popover-content",
      "popover-header",
      "popover-title",
      "popover-description",
    ]) {
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
  });

  test("the trigger and the content say whether it is open, and where", async () => {
    render(() => <Fixture />);
    expect(trigger().getAttribute("data-state")).toBe("closed");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");

    await user.click(trigger());
    await settle();

    expect(trigger().getAttribute("data-state")).toBe("open");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).not.toBeNull();
    expect(content()?.getAttribute("data-state")).toBe("open");
    expect(content()?.getAttribute("data-side")).toBe("bottom");
    expect(content()?.getAttribute("data-align")).toBe("center");
  });

  test("focus moves into it, and Escape closes it and gives focus back", async () => {
    render(() => <Fixture />);
    trigger().focus();
    await user.click(trigger());
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Width" }));

    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await frame();
    expect(content()).toBeNull();
    expect(document.activeElement === trigger()).toBe(true);
  });

  test("a press outside closes it", async () => {
    render(() => (
      <>
        <Fixture />
        <button type="button">Elsewhere</button>
      </>
    ));
    await user.click(trigger());
    await settle();

    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    await settle();
    expect(content()).toBeNull();
  });

  test("side, align and the two offsets are the position upstream names", async () => {
    render(() => (
      <Fixture content={{ side: "bottom", align: "start", sideOffset: 4, alignOffset: 10 }} />
    ));
    box(trigger(), { top: 100, left: 300, width: 80, height: 30 });
    await user.click(trigger());
    await settle();

    expect(content()?.getAttribute("data-side")).toBe("bottom");
    expect(content()?.getAttribute("data-align")).toBe("start");
    expect(content()?.style.top).toBe("134px");
    expect(content()?.style.left).toBe("310px");
  });

  test("a side on the inline axis aligns along the block axis", async () => {
    render(() => <Fixture content={{ side: "right", align: "start", sideOffset: 6 }} />);
    box(trigger(), { top: 100, left: 300, width: 80, height: 30 });
    await user.click(trigger());
    await settle();

    expect(content()?.getAttribute("data-side")).toBe("right");
    expect(content()?.style.left).toBe("386px");
    expect(content()?.style.top).toBe("100px");
  });

  test("placement and offset, where given, win over side and sideOffset", async () => {
    render(() => (
      <Fixture content={{ side: "top", sideOffset: 40, placement: "bottom start", offset: 2 }} />
    ));
    box(trigger(), { top: 100, left: 300, width: 80, height: 30 });
    await user.click(trigger());
    await settle();

    expect(content()?.getAttribute("data-side")).toBe("bottom");
    expect(content()?.style.top).toBe("132px");
  });

  test("PopoverAnchor is what it is placed against, and the trigger still gets focus back", async () => {
    render(() => (
      <Popover>
        <PopoverAnchor data-testid="anchor">
          <span>Row</span>
        </PopoverAnchor>
        <PopoverTrigger>
          <Button>Open</Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" sideOffset={0}>
          <Input aria-label="Width" />
        </PopoverContent>
      </Popover>
    ));
    const anchor = screen.getByTestId("anchor");
    expect(anchor.getAttribute("data-slot")).toBe("popover-anchor");
    box(anchor, { top: 40, left: 20, width: 400, height: 50 });
    box(trigger(), { top: 100, left: 300, width: 80, height: 30 });

    trigger().focus();
    await user.click(trigger());
    await settle();
    expect(content()?.style.top).toBe("90px");
    expect(content()?.style.left).toBe("20px");

    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await frame();
    expect(document.activeElement === trigger()).toBe(true);
  });

  test("a plain button can be the trigger", async () => {
    render(() => (
      <Popover>
        <PopoverTrigger
          render={(part) => (
            <button {...part.props} ref={part.ref}>
              Open
            </button>
          )}
        />
        <PopoverContent>
          <Input aria-label="Width" />
        </PopoverContent>
      </Popover>
    ));
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    trigger().focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(content()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await frame();
    expect(document.activeElement === trigger()).toBe(true);
  });

  test("a controlled popover opened as soon as the page settles is open", async () => {
    function Welcome() {
      const [open, setOpen] = createSignal(false);
      onSettled(() => {
        setOpen(true);
      });
      return (
        <Popover isOpen={open()} onOpenChange={setOpen}>
          <PopoverTrigger>
            <Button>Open</Button>
          </PopoverTrigger>
          <PopoverContent>Welcome</PopoverContent>
        </Popover>
      );
    }

    render(() => <Welcome />);
    await settle();
    await settle();

    expect(content()?.textContent).toBe("Welcome");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });
});
