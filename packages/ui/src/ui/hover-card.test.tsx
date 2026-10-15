import { describe, expect, test } from "bun:test";
import { createSignal, flush, onSettled, type Incoming } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Button } from "./button.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  type HoverCardContentProps,
} from "./hover-card.tsx";

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 15));
}

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

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

function Fixture(
  props: Incoming<{ openDelay?: number; closeDelay?: number; content?: HoverCardContentProps }>,
) {
  return (
    <>
      <HoverCard openDelay={props.openDelay?.() ?? 20} closeDelay={props.closeDelay?.() ?? 20}>
        <HoverCardTrigger>
          <Button variant="link">@salama</Button>
        </HoverCardTrigger>
        <HoverCardContent
          side={props.content?.()?.side}
          align={props.content?.()?.align}
          sideOffset={props.content?.()?.sideOffset}
          alignOffset={props.content?.()?.alignOffset}
          placement={props.content?.()?.placement}
        >
          <a href="https://example.com/salama">Profile</a>
        </HoverCardContent>
      </HoverCard>
      <button type="button">Elsewhere</button>
    </>
  );
}

const trigger = (): HTMLElement => screen.getByRole("button", { name: "@salama" });
const card = (): HTMLElement | null => document.querySelector('[data-slot="hover-card-content"]');

describe("HoverCard", () => {
  test("nothing until the pointer has rested for the open delay", async () => {
    render(() => <Fixture openDelay={40} />);
    expect(card()).toBeNull();
    expect(trigger().getAttribute("data-state")).toBe("closed");

    user.hover(trigger());
    await settle();
    expect(card()).toBeNull();

    await after(40);
    await settle();
    expect(card()?.textContent).toBe("Profile");
    expect(card()?.getAttribute("data-state")).toBe("open");
    expect(trigger().getAttribute("data-state")).toBe("open");
  });

  test("leaving closes it after the close delay, and not before", async () => {
    render(() => <Fixture closeDelay={40} />);
    user.hover(trigger());
    await after(20);
    await settle();
    expect(card()).not.toBeNull();

    user.unhover(trigger());
    await settle();
    expect(card()).not.toBeNull();

    await after(40);
    await settle();
    expect(card()).toBeNull();
  });

  test("the pointer can travel into the card without it closing", async () => {
    render(() => <Fixture />);
    user.hover(trigger());
    await after(20);
    await settle();

    user.unhover(trigger());
    user.hover(card() as HTMLElement);
    await after(20);
    await settle();
    expect(card()).not.toBeNull();

    user.unhover(card() as HTMLElement);
    await after(20);
    await settle();
    expect(card()).toBeNull();
  });

  test("keyboard focus opens it, leaves focus on the trigger, and blur closes it", async () => {
    render(() => <Fixture />);
    user.tab();
    expect(document.activeElement).toBe(trigger());

    await after(20);
    await settle();
    expect(card()).not.toBeNull();
    // The card is somewhere to read, not somewhere focus is sent.
    expect(document.activeElement).toBe(trigger());

    user.tab();
    await after(20);
    await settle();
    expect(card()).toBeNull();
  });

  test("Escape closes it", async () => {
    render(() => <Fixture />);
    user.tab();
    await after(20);
    await settle();
    expect(card()).not.toBeNull();

    user.keyDown("Escape");
    await settle();
    expect(card()).toBeNull();
  });

  test("it describes nothing and claims no popup: the trigger keeps its own semantics", async () => {
    render(() => <Fixture />);
    expect(trigger().hasAttribute("aria-haspopup")).toBe(false);
    expect(trigger().hasAttribute("aria-expanded")).toBe(false);
    expect(trigger().getAttribute("data-slot")).toBe("button");
  });

  test("side, align and the offsets are the position upstream names", async () => {
    render(() => (
      <Fixture content={{ side: "right", align: "start", sideOffset: 6, alignOffset: 3 }} />
    ));
    box(trigger(), { top: 100, left: 300, width: 80, height: 30 });
    user.hover(trigger());
    await after(20);
    await settle();

    expect(card()?.getAttribute("data-side")).toBe("right");
    expect(card()?.getAttribute("data-align")).toBe("start");
    expect(card()?.style.left).toBe("386px");
    expect(card()?.style.top).toBe("103px");
  });

  test("placement, where given, wins over side", async () => {
    render(() => <Fixture content={{ side: "right", placement: "top" }} />);
    box(trigger(), { top: 300, left: 300, width: 80, height: 30 });
    user.hover(trigger());
    await after(20);
    await settle();
    expect(card()?.getAttribute("data-side")).toBe("top");
  });

  test("a link can be the trigger, and stays a link", async () => {
    render(() => (
      <HoverCard openDelay={20} closeDelay={20}>
        <HoverCardTrigger
          render={(part) => (
            <a {...part.props} ref={part.ref} href="https://example.com/salama">
              @salama
            </a>
          )}
        />
        <HoverCardContent>Profile</HoverCardContent>
      </HoverCard>
    ));
    const link = screen.getByRole("link", { name: "@salama" });
    expect(link.hasAttribute("type")).toBe(false);
    expect(link.getAttribute("data-state")).toBe("closed");

    user.hover(link);
    await after(20);
    await settle();
    expect(card()?.textContent).toBe("Profile");
    expect(link.getAttribute("data-state")).toBe("open");
  });
});

describe("a controlled hover card", () => {
  test("opened as soon as the page settles is open, and Escape still closes it", async () => {
    function Pinned() {
      const [open, setOpen] = createSignal(false);
      onSettled(() => {
        setOpen(true);
      });
      return (
        <HoverCard isOpen={open()} onOpenChange={setOpen}>
          <HoverCardTrigger>
            <Button variant="link">@salama</Button>
          </HoverCardTrigger>
          <HoverCardContent>Profile</HoverCardContent>
        </HoverCard>
      );
    }

    render(() => <Pinned />);
    await settle();
    await settle();
    expect(card()?.textContent).toBe("Profile");

    user.keyDown("Escape");
    await settle();
    expect(card()).toBeNull();
  });
});
