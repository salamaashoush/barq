import { beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { setInteractionModality } from "./interactions/modality.ts";
import {
  isPointInSafeArea,
  PreviewPopover,
  PreviewTrigger,
  type PreviewTriggerComponentProps,
  usePreviewTrigger,
} from "./preview-trigger.tsx";
import { resetTooltipWarmup } from "./tooltip.tsx";

function after(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 20));
}

async function settle(): Promise<void> {
  await after();
  flush();
  await tick();
  flush();
}

function Profile(props: Omit<PreviewTriggerComponentProps, "children">) {
  return (
    <>
      <PreviewTrigger delay={0} closeDelay={0} {...props}>
        <Button>Salama</Button>
        <PreviewPopover data-testid="preview" aria-label="Profile">
          <p>Works at acme</p>
          <button type="button">Follow</button>
        </PreviewPopover>
      </PreviewTrigger>
      <button type="button">After</button>
    </>
  );
}

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: "Salama" });
}

function preview(): HTMLElement | null {
  return screen.queryByTestId("preview");
}

function placeAt(element: Element, left: number, top: number, right: number, bottom: number): void {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
    }) as DOMRect;
}

function pointerAt(x: number, y: number): void {
  document.body.dispatchEvent(
    new PointerEvent("pointermove", {
      clientX: x,
      clientY: y,
      pointerType: "mouse",
      bubbles: true,
    }),
  );
  flush();
}

describe("isPointInSafeArea", () => {
  const link = { left: 0, right: 100, top: 0, bottom: 20 } as DOMRect;
  const card = { left: 200, right: 300, top: 100, bottom: 200 } as DOMRect;

  test("the trigger and the overlay are in it, with a little padding", () => {
    expect(isPointInSafeArea({ x: 50, y: 10 }, link, card)).toBe(true);
    expect(isPointInSafeArea({ x: 105, y: 10 }, link, null)).toBe(true);
    expect(isPointInSafeArea({ x: 250, y: 150 }, link, card)).toBe(true);
  });

  test("so is the diagonal between them, and nothing off to the side", () => {
    expect(isPointInSafeArea({ x: 150, y: 60 }, link, card)).toBe(true);
    expect(isPointInSafeArea({ x: 20, y: 180 }, link, card)).toBe(false);
    expect(isPointInSafeArea({ x: 500, y: 500 }, link, card)).toBe(false);
  });
});

describe("PreviewTrigger", () => {
  beforeEach(() => {
    resetTooltipWarmup();
  });

  test("the trigger says it opens a dialog, and what it controls once open", async () => {
    render(() => <Profile />);
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().hasAttribute("aria-controls")).toBe(false);

    user.tab();
    await settle();

    const card = preview() as HTMLElement;
    expect(card.getAttribute("role")).toBe("dialog");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(card.id);
    expect(trigger().getAttribute("aria-describedby")).toContain(card.id);
  });

  test("hover opens it, the safe area keeps it, and leaving that closes it", async () => {
    render(() => <Profile />);

    user.hover(trigger());
    await settle();
    const card = preview() as HTMLElement;
    expect(card).not.toBeNull();

    placeAt(trigger(), 0, 0, 100, 20);
    placeAt(card, 0, 40, 100, 140);

    pointerAt(50, 30);
    await settle();
    expect(preview()).not.toBeNull();

    pointerAt(50, 100);
    await settle();
    expect(preview()).not.toBeNull();

    pointerAt(500, 500);
    await settle();
    expect(preview()).toBeNull();
  });

  test("leaving the trigger before it opens cancels it", async () => {
    render(() => <Profile delay={60} />);

    user.hover(trigger());
    flush();
    user.unhover(trigger());
    await after(60);
    flush();

    expect(preview()).toBeNull();
  });

  test("keyboard focus opens it after the delay, not at once", async () => {
    render(() => <Profile delay={60} />);

    user.tab();
    flush();
    expect(document.activeElement).toBe(trigger());
    expect(preview()).toBeNull();

    await after(60);
    flush();
    expect(preview()).not.toBeNull();
  });

  test("tabbing past before the delay never opens it", async () => {
    render(() => <Profile delay={60} />);

    user.tab();
    flush();
    user.tab();
    flush();
    expect(document.activeElement?.textContent).toBe("After");

    await after(60);
    flush();
    expect(preview()).toBeNull();
  });

  test("a click does not open it: that focus is not the keyboard's", async () => {
    render(() => <Profile />);
    user.click(trigger());
    await settle();
    user.unhover(trigger());
    await settle();
    expect(preview()).toBeNull();
  });

  test("Tab from the trigger goes into the preview, and out of it to what follows the trigger", async () => {
    render(() => <Profile />);

    user.tab();
    await settle();
    user.tab();
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Follow" }));
    expect(preview()).not.toBeNull();

    user.tab();
    await settle();
    expect(document.activeElement?.textContent).toBe("After");
  });

  test("Escape closes it and gives focus back to the trigger, which does not reopen it", async () => {
    render(() => <Profile />);

    user.tab();
    await settle();
    user.tab();
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Follow" }));

    user.keyDown("Escape");
    user.keyUp("Escape");
    await settle();

    expect(preview()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    await settle();
    expect(preview()).toBeNull();
  });

  test("Escape on the trigger closes it", async () => {
    render(() => <Profile />);
    user.tab();
    await settle();
    expect(preview()).not.toBeNull();

    user.keyDown("Escape");
    await settle();
    expect(preview()).toBeNull();
  });

  test("an Escape that closed it stops there; the next one reaches what is around it", async () => {
    const escapes: string[] = [];
    render(() => (
      <div
        role="dialog"
        aria-label="Outer"
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Escape" && !event.defaultPrevented) escapes.push(event.key);
        }}
      >
        <Profile />
      </div>
    ));
    user.tab();
    await settle();
    expect(preview()).not.toBeNull();

    user.keyDown("Escape");
    await settle();
    expect(preview()).toBeNull();
    expect(escapes).toEqual([]);

    user.keyDown("Escape");
    await settle();
    expect(escapes).toEqual(["Escape"]);
  });

  test("the hidden dismiss button closes it without it reopening", async () => {
    render(() => <Profile />);
    user.tab();
    await settle();
    user.tab();
    await settle();

    screen.getByRole<HTMLButtonElement>("button", { name: "Dismiss" }).click();
    await settle();

    expect(preview()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    await settle();
    expect(preview()).toBeNull();
  });

  test("disabled, nothing opens it", async () => {
    render(() => <Profile isDisabled />);

    user.hover(trigger());
    await settle();
    expect(preview()).toBeNull();

    user.tab();
    await settle();
    expect(preview()).toBeNull();
  });

  test("controlled, it is open when told and reports what the user does", async () => {
    const [open, setOpen] = createSignal(true);
    const seen: boolean[] = [];
    render(() => (
      <Profile
        isOpen={open()}
        onOpenChange={(next) => {
          seen.push(next);
          setOpen(next);
        }}
      />
    ));
    await settle();
    expect(preview()).not.toBeNull();

    user.focus(trigger());
    user.keyDown("Escape");
    await settle();
    expect(seen).toContain(false);
    expect(preview()).toBeNull();
  });

  test("a long press opens it and moves focus into it", async () => {
    render(() => <Profile />);

    user.pointerHold(trigger(), { pointerType: "touch" });
    await after(550);
    flush();
    await settle();

    const card = preview() as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(card);
    user.pointerUp(trigger(), { pointerType: "touch" });
    // A touch silences mouse hover page-wide for half a second; the next test
    // must not start inside that window.
    await after(500);
  });

  test("the long press is described only while the user is on touch", async () => {
    // A device that can be touched, which is what `"ontouchstart" in window` asks.
    Object.defineProperty(window, "ontouchstart", {
      value: null,
      configurable: true,
      writable: true,
    });
    try {
      render(() => <Profile />);
      setInteractionModality("keyboard");
      flush();
      expect(screen.queryByText("Long press to open preview")).toBeNull();

      setInteractionModality("pointer");
      flush();
      const hint = screen.queryByText("Long press to open preview");
      expect(hint).not.toBeNull();
      expect(trigger().getAttribute("aria-describedby")).toContain(hint?.id ?? "missing");
    } finally {
      Reflect.deleteProperty(window, "ontouchstart");
    }
  });

  test("a trigger of the caller's own takes the props from the context", async () => {
    function ProfileLink() {
      const held = usePreviewTrigger();
      return (
        <a href="https://example.com/salama" {...held.triggerProps} ref={held.triggerRef.set}>
          Salama
        </a>
      );
    }
    render(() => (
      <PreviewTrigger delay={0} closeDelay={0}>
        <ProfileLink />
        <PreviewPopover data-testid="preview" aria-label="Profile">
          card
        </PreviewPopover>
      </PreviewTrigger>
    ));

    user.tab();
    await settle();

    expect(document.activeElement).toBe(screen.getByRole("link"));
    expect(preview()).not.toBeNull();
  });
});
