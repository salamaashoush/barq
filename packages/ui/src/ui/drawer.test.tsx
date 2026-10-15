import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { Show, createSignal, flush, type Incoming } from "@barqjs/core";
import { cleanup, render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Button } from "./button.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHandle,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  type DrawerProps,
} from "./drawer.tsx";

function Basic(props: { direction?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Drawer direction={props.direction}>
      <DrawerTrigger>
        <Button>Open</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Move goal</DrawerTitle>
          <DrawerDescription>Set your daily activity goal.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <DrawerClose>Done</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

const content = (): HTMLElement | null => document.querySelector('[data-slot="drawer-content"]');
const trigger = (): HTMLElement => document.querySelector("button") as HTMLElement;

/** happy-dom measures nothing, and the threshold is a fraction of the size. */
function sized(element: HTMLElement, extent: number): void {
  element.getBoundingClientRect = () =>
    ({ height: extent, width: extent, top: 0, left: 0, right: extent, bottom: extent }) as DOMRect;
}

function drag(element: HTMLElement, from: number, to: number): void {
  element.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, clientY: from, button: 0 }),
  );
  window.dispatchEvent(new PointerEvent("pointermove", { clientY: to }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientY: to }));
}

/**
 * The drag reads the clock on every move, and a gesture written as three
 * events in a row takes no time at all unless a millisecond happens to turn
 * over between two of them. Then 40px "in one millisecond" is a flick, and a
 * drawer that was meant to stay closes. The clock is held still, so a gesture
 * here is decided by how far it went, and a test about speed moves the clock
 * itself.
 */
const START = Date.UTC(2026, 0, 1);

/** Moves the held clock on, as time passing between two events. */
function later(ms: number): void {
  setSystemTime(new Date(Date.now() + ms));
}

beforeEach(() => {
  setSystemTime(new Date(START));
});

afterEach(() => {
  setSystemTime();
  // Renders accumulate in `document.body`, and every query here is a document
  // one because the drawer is portalled out of its container.
  cleanup();
});

describe("Drawer", () => {
  test("nothing is in the DOM until it opens", () => {
    // A dialog that exists while closed is a dialog a screen reader can find.
    render(() => <Basic />);
    expect(content()).toBeNull();
  });

  test("the trigger opens it", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    expect(content()).not.toBeNull();
    expect(document.querySelector('[data-slot="drawer-title"]')?.textContent).toBe("Move goal");
  });

  test("it is a modal dialog with a name and a description", async () => {
    const { container } = render(() => (
      <>
        <p>behind</p>
        <Basic />
      </>
    ));
    await user.click(container.querySelector("button") as HTMLElement);
    flush();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-labelledby")).not.toBeNull();
    expect(dialog?.getAttribute("aria-describedby")).not.toBeNull();
    // The modality is the page behind being hidden rather than `aria-modal`,
    // which VoiceOver has been known to read as hiding the dialog too.
    expect(dialog?.closest("[aria-hidden=true]")).toBeNull();
    const behind = [...document.querySelectorAll("p")].find(
      (each) => each.textContent === "behind",
    );
    expect(behind?.closest("[aria-hidden=true]")).not.toBeNull();
  });

  test("the direction is an attribute, because the rules select on it", async () => {
    render(() => <Basic direction="right" />);
    await user.click(trigger());
    flush();
    expect(content()?.getAttribute("data-direction")).toBe("right");
  });

  test("bottom is the default, which is what a drawer means on a phone", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    expect(content()?.getAttribute("data-direction")).toBe("bottom");
  });

  test("the grip is there to be pulled, and only where pulling is down", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    const grip = document.querySelector('[data-slot="drawer-handle"]');
    expect(grip).not.toBeNull();
    // Decoration: it names nothing and the drag is on the whole drawer.
    expect(grip?.getAttribute("aria-hidden")).toBe("true");
  });

  test("a side drawer has no grip, because there is nothing to pull down", async () => {
    render(() => <Basic direction="right" />);
    await user.click(trigger());
    flush();
    expect(document.querySelector('[data-slot="drawer-handle"]')).toBeNull();
  });

  test("a header is centred on a bottom drawer and ranged left on a side one", async () => {
    // A drawer coming up from the bottom is read down the middle; one coming
    // in from the side is a column and reads from its edge.
    render(() => <Basic direction="left" />);
    await user.click(trigger());
    flush();
    const side = document.querySelector('[data-slot="drawer-header"]')?.className;
    cleanup();

    render(() => <Basic />);
    await user.click(trigger());
    flush();
    const bottom = document.querySelector('[data-slot="drawer-header"]')?.className;

    expect(side).not.toBe(bottom);
  });

  test("the close button closes it", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    await user.click(document.querySelector('[data-slot="drawer-close"]') as HTMLElement);
    flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("Escape closes it", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    (content() as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("a drag past the threshold closes it", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    drag(element, 0, 200);
    flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("a drag short of it snaps back rather than closing", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    drag(element, 0, 40);
    flush();
    expect(content()).not.toBeNull();
    // The inline transform goes, so the rule's own transition carries it home.
    expect(content()?.style.transform).toBe("");
  });

  test("the drawer follows the pointer while the drag is on", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 60 }));
    flush();
    expect(element.style.transform).toBe("translateY(60px)");
    expect(element.getAttribute("data-dragging")).toBe("");
    // A transition here would leave the drawer a third of a second behind.
    expect(element.style.transitionDuration).toBe("0s");
    window.dispatchEvent(new PointerEvent("pointerup", { clientY: 60 }));
  });

  test("a LEFT drawer follows the pointer across, and the other way", async () => {
    render(() => <Basic direction="left" />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 100, button: 0 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 40 }));
    flush();
    expect(element.style.transform).toBe("translateX(-60px)");
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 40 }));
  });

  test("a cancelled pointer puts it back rather than closing it", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 300 }));
    window.dispatchEvent(new PointerEvent("pointercancel", {}));
    flush();
    expect(content()).not.toBeNull();
    expect(element.style.transform).toBe("");
  });

  test("the right button only: a context menu is not a drag", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 2 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 300 }));
    expect(element.style.transform).toBe("");
  });

  test("a drag from a control belongs to the control", async () => {
    // Selecting text in a field, or moving a slider, is not a pull on the
    // drawer, and losing the gesture to the drawer makes the field unusable.
    render(() => (
      <Drawer>
        <DrawerTrigger>
          <Button>Open</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Name</DrawerTitle>
          <input data-testid="field" />
        </DrawerContent>
      </Drawer>
    ));
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    const field = document.querySelector('[data-testid="field"]') as HTMLElement;
    field.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 300 }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientY: 300 }));
    flush();
    expect(content()).not.toBeNull();
    expect(element.style.transform).toBe("");
  });

  test("the overlay names itself, so a stylesheet can tell it from a sheet's", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    expect(document.querySelector('[data-slot="drawer-overlay"]')).not.toBeNull();
  });
});

/** Every element measures `extent`, for what has to be placed before a test can reach it. */
function everySized(extent: number): () => void {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ height: extent, width: extent, top: 0, left: 0, right: extent, bottom: extent }) as DOMRect;
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

const overlay = (): HTMLElement | null => document.querySelector('[data-slot="drawer-overlay"]');
const dialogs = (): number => document.querySelectorAll('[role="dialog"]').length;

function Configured(props: DrawerProps & { handle?: boolean }) {
  return (
    <Drawer
      direction={props.direction}
      open={props.open}
      defaultOpen={props.defaultOpen}
      onOpenChange={props.onOpenChange}
      dismissible={props.dismissible}
      handleOnly={props.handleOnly}
      snapPoints={props.snapPoints}
      activeSnapPoint={props.activeSnapPoint}
      setActiveSnapPoint={props.setActiveSnapPoint}
      fadeFromIndex={props.fadeFromIndex}
      shouldScaleBackground={props.shouldScaleBackground}
      closeThreshold={props.closeThreshold}
      onDrag={props.onDrag}
      onRelease={props.onRelease}
      onClose={props.onClose}
    >
      <DrawerTrigger>
        <Button>Open</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerTitle>Move goal</DrawerTitle>
        <DrawerFooter>
          <DrawerClose>Done</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

describe("Drawer parts and state attributes", () => {
  test("the trigger carries upstream's slot name and says what it controls", async () => {
    render(() => <Basic />);
    const opener = document.querySelector('[data-slot="drawer-trigger"]') as HTMLElement;
    expect(opener.tagName).toBe("BUTTON");
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    await user.click(opener);
    flush();
    expect(content()).not.toBeNull();
  });

  test("content and overlay say they are open, in upstream's attribute as well as ours", async () => {
    render(() => <Basic direction="left" />);
    await user.click(trigger());
    flush();
    expect(content()?.getAttribute("data-state")).toBe("open");
    expect(content()?.getAttribute("data-vaul-drawer-direction")).toBe("left");
    expect(overlay()?.getAttribute("data-state")).toBe("open");
  });

  test("open is accepted beside isOpen, and a controlled drawer follows it", () => {
    const [open, setOpen] = createSignal(false);
    render(() => <Configured open={open()} />);
    expect(content()).toBeNull();
    setOpen(true);
    flush();
    expect(content()).not.toBeNull();
    setOpen(false);
    flush();
    expect(dialogs()).toBe(0);
  });

  test("a side drawer's header reads from the start edge, whichever side that is", async () => {
    render(() => <Basic direction="left" />);
    await user.click(trigger());
    flush();
    const header = document.querySelector('[data-slot="drawer-header"]');
    const rules = rulesFor([...(header?.classList ?? [])].join(" "));
    expect(rules).toContain("text-align: start");
    expect(rules).not.toContain("text-align: left");
  });
});

describe("Drawer handle", () => {
  test("it is a part of its own, for a drawer that wants one where none is drawn", async () => {
    render(() => (
      <Drawer direction="right">
        <DrawerTrigger>
          <Button>Open</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHandle />
          <DrawerTitle>Filters</DrawerTitle>
        </DrawerContent>
      </Drawer>
    ));
    await user.click(trigger());
    flush();
    const grip = document.querySelector('[data-slot="drawer-handle"]');
    expect(grip).not.toBeNull();
    expect(grip?.getAttribute("aria-hidden")).toBe("true");
  });

  test("pressing it closes a drawer that has nowhere else to rest", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    await user.click(document.querySelector('[data-slot="drawer-handle"]') as HTMLElement);
    flush();
    expect(dialogs()).toBe(0);
  });

  test("preventCycle leaves the press to the caller", async () => {
    render(() => (
      <Drawer>
        <DrawerTrigger>
          <Button>Open</Button>
        </DrawerTrigger>
        <DrawerContent showHandle={false}>
          <DrawerHandle preventCycle />
          <DrawerTitle>Move goal</DrawerTitle>
        </DrawerContent>
      </Drawer>
    ));
    await user.click(trigger());
    flush();
    await user.click(document.querySelector('[data-slot="drawer-handle"]') as HTMLElement);
    flush();
    expect(dialogs()).toBe(1);
  });

  test("the click that ends a drag on the handle is not a press", async () => {
    render(() => <Basic />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    const grip = document.querySelector('[data-slot="drawer-handle"]') as HTMLElement;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 40 }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientY: 40 }));
    grip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flush();
    expect(dialogs()).toBe(1);
  });

  test("a short drag closes when it was fast and stays when it was slow", async () => {
    const pull = async (took: number): Promise<number> => {
      render(() => <Basic />);
      await user.click(trigger());
      flush();
      const element = content() as HTMLElement;
      sized(element, 400);
      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }),
      );
      later(took);
      window.dispatchEvent(new PointerEvent("pointermove", { clientY: 40 }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientY: 40 }));
      flush();
      const open = dialogs();
      cleanup();
      return open;
    };

    // 40px of 400 is nowhere near the threshold, so only the speed can close it.
    expect(await pull(1000)).toBe(1);
    expect(await pull(10)).toBe(0);
    expect(await pull(0)).toBe(1);
  });

  test("handleOnly leaves the body of the drawer alone", async () => {
    render(() => <Configured handleOnly />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 300 }));
    expect(element.style.transform).toBe("");
    window.dispatchEvent(new PointerEvent("pointerup", { clientY: 300 }));
    flush();
    expect(dialogs()).toBe(1);

    const grip = document.querySelector('[data-slot="drawer-handle"]') as HTMLElement;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 300 }));
    expect(element.style.transform).toBe("translateY(300px)");
    window.dispatchEvent(new PointerEvent("pointerup", { clientY: 300 }));
    flush();
    expect(dialogs()).toBe(0);
  });
});

describe("Drawer that cannot be dismissed", () => {
  test("Escape, a drag and the close button all leave it open", async () => {
    render(() => <Configured dismissible={false} />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);

    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flush();
    expect(dialogs()).toBe(1);

    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 300 }));
    expect(element.style.transform).toBe("");
    window.dispatchEvent(new PointerEvent("pointerup", { clientY: 300 }));
    flush();
    expect(dialogs()).toBe(1);

    await user.click(document.querySelector('[data-slot="drawer-close"]') as HTMLElement);
    flush();
    expect(dialogs()).toBe(1);
  });

  test("the caller holding open is what closes it", async () => {
    const [open, setOpen] = createSignal(true);
    render(() => <Configured dismissible={false} open={open()} />);
    flush();
    expect(dialogs()).toBe(1);
    setOpen(false);
    flush();
    expect(dialogs()).toBe(0);
  });
});

describe("Drawer snap points", () => {
  test("it opens resting at the first snap point", async () => {
    const restore = everySized(window.innerHeight);
    render(() => <Configured snapPoints={[0.25, 1]} />);
    await user.click(trigger());
    flush();
    // A quarter of the viewport shows, so three quarters of the drawer is off it.
    expect(content()?.style.transform).toBe(`translateY(${String(window.innerHeight * 0.75)}px)`);
    restore();
  });

  test("the page is not dimmed below fadeFromIndex", async () => {
    const restore = everySized(window.innerHeight);
    render(() => <Configured snapPoints={[0.25, 1]} />);
    await user.click(trigger());
    flush();
    expect(overlay()?.style.getPropertyValue("--drawer-overlay-opacity")).toBe("0");
    restore();
  });

  test("the overlay's dimming is a custom property, because the overlay holds the drawer", () => {
    // Opacity on the element would fade the drawer with it.
    render(() => <Configured defaultOpen />);
    flush();
    const rules = rulesFor([...(overlay()?.classList ?? [])].join(" "));
    expect(rules).toContain("var(--drawer-overlay-opacity");
  });

  test("a drag to the next snap point reports it and rests there", async () => {
    const restore = everySized(window.innerHeight);
    const seen: (number | string | null)[] = [];
    render(() => (
      <Configured snapPoints={[0.25, 1]} setActiveSnapPoint={(point) => seen.push(point)} />
    ));
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    const from = window.innerHeight * 0.75;
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientY: from, button: 0 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 10 }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientY: 10 }));
    flush();
    expect(seen).toEqual([1]);
    expect(element.style.transform).toBe("");
    expect(overlay()?.style.getPropertyValue("--drawer-overlay-opacity")).toBe("1");
    restore();
  });

  test("a controlled snap point is where it rests, and moves when the caller moves it", () => {
    const restore = everySized(window.innerHeight);
    const [point, setPoint] = createSignal<number | string | null>(0.5);
    render(() => (
      <Configured
        defaultOpen
        snapPoints={[0.5, 1]}
        activeSnapPoint={point()}
        setActiveSnapPoint={setPoint}
      />
    ));
    flush();
    expect(content()?.style.transform).toBe(`translateY(${String(window.innerHeight * 0.5)}px)`);
    setPoint(1);
    flush();
    expect(content()?.style.transform).toBe("");
    restore();
  });

  test("pressing the handle goes to the next snap point", async () => {
    const restore = everySized(window.innerHeight);
    const seen: (number | string | null)[] = [];
    render(() => (
      <Configured
        defaultOpen
        snapPoints={["148px", 1]}
        setActiveSnapPoint={(point) => seen.push(point)}
      />
    ));
    flush();
    expect(content()?.style.transform).toBe(`translateY(${String(window.innerHeight - 148)}px)`);
    await user.click(document.querySelector('[data-slot="drawer-handle"]') as HTMLElement);
    flush();
    expect(seen).toEqual([1]);
    expect(content()?.style.transform).toBe("");
    restore();
  });
});

describe("Drawer callbacks", () => {
  test("onDrag, onRelease and onClose say what the pointer did", async () => {
    const dragged: number[] = [];
    const released: boolean[] = [];
    let closed = 0;
    render(() => (
      <Configured
        onDrag={(_event, progress) => dragged.push(progress)}
        onRelease={(_event, open) => released.push(open)}
        onClose={() => closed++}
      />
    ));
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    drag(element, 0, 200);
    flush();
    expect(dragged).toEqual([0.5]);
    expect(released).toEqual([false]);
    expect(closed).toBe(1);
  });

  test("onClose may write state of the caller's own", async () => {
    // It is called from an effect, which is the one place the strict build
    // could have refused a handler that writes.
    const [closedOnce, setClosedOnce] = createSignal(false);
    render(() => <Configured onClose={() => setClosedOnce(true)} />);
    await user.click(trigger());
    flush();
    await user.click(document.querySelector('[data-slot="drawer-close"]') as HTMLElement);
    flush();
    expect(closedOnce()).toBe(true);
  });

  test("closeThreshold moves how far a pull has to go", async () => {
    render(() => <Configured closeThreshold={0.75} />);
    await user.click(trigger());
    flush();
    const element = content() as HTMLElement;
    sized(element, 400);
    drag(element, 0, 200);
    flush();
    expect(dialogs()).toBe(1);
  });
});

describe("Drawer and the page behind it", () => {
  test("shouldScaleBackground scales the marked page while it is open", async () => {
    const page = document.createElement("div");
    page.setAttribute("data-vaul-drawer-wrapper", "");
    document.body.append(page);
    render(() => <Configured shouldScaleBackground />);
    expect(page.style.transform).toBe("");
    await user.click(trigger());
    flush();
    expect(page.style.transform).toContain("scale(");
    expect(page.style.borderRadius).toBe("8px");

    await user.click(document.querySelector('[data-slot="drawer-close"]') as HTMLElement);
    flush();
    expect(page.style.transform).toBe("");
    page.remove();
  });

  test("without the prop the page is left alone", async () => {
    const page = document.createElement("div");
    page.setAttribute("data-vaul-drawer-wrapper", "");
    document.body.append(page);
    render(() => <Configured />);
    await user.click(trigger());
    flush();
    expect(page.style.transform).toBe("");
    page.remove();
  });
});

describe("Nested drawers", () => {
  function Nested() {
    return (
      <Drawer>
        <DrawerTrigger>
          <Button>Open</Button>
        </DrawerTrigger>
        <DrawerContent data-testid="outer">
          <DrawerTitle>Outer</DrawerTitle>
          <Drawer>
            <DrawerTrigger>
              <Button>More</Button>
            </DrawerTrigger>
            <DrawerContent data-testid="inner">
              <DrawerTitle>Inner</DrawerTitle>
              <DrawerClose>Back</DrawerClose>
            </DrawerContent>
          </Drawer>
        </DrawerContent>
      </Drawer>
    );
  }

  const named = (id: string): HTMLElement | null => document.querySelector(`[data-testid="${id}"]`);

  test("the one underneath steps back while another is open over it", async () => {
    render(() => <Nested />);
    await user.click(trigger());
    flush();
    expect(named("outer")?.style.transform).toBe("");

    const more = [...document.querySelectorAll("button")].find(
      (each) => each.textContent === "More",
    ) as HTMLElement;
    await user.click(more);
    flush();
    expect(named("inner")).not.toBeNull();
    expect(named("outer")?.style.transform).toContain("scale(");
    expect(named("outer")?.style.transform).toContain("-16px");
    expect(named("outer")?.hasAttribute("data-nested-drawer-open")).toBe(true);

    const back = [...document.querySelectorAll("button")].find(
      (each) => each.textContent === "Back",
    ) as HTMLElement;
    await user.click(back);
    flush();
    expect(named("inner")).toBeNull();
    expect(named("outer")).not.toBeNull();
    expect(named("outer")?.style.transform).toBe("");
    expect(named("outer")?.hasAttribute("data-nested-drawer-open")).toBe(false);
  });

  test("dragging the upper one brings the lower one forward with it", async () => {
    render(() => <Nested />);
    await user.click(trigger());
    flush();
    const more = [...document.querySelectorAll("button")].find(
      (each) => each.textContent === "More",
    ) as HTMLElement;
    await user.click(more);
    flush();
    const inner = named("inner") as HTMLElement;
    sized(inner, 400);
    inner.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 0, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 80 }));
    // Half way back: 8 of the 16 pixels.
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 200 }));
    expect(named("outer")?.style.transform).toContain("-8px");
    window.dispatchEvent(new PointerEvent("pointercancel", {}));
    expect(named("outer")?.style.transform).toContain("-16px");
  });
});

describe("DrawerPortal and DrawerOverlay", () => {
  function Custom() {
    return (
      <Drawer>
        <DrawerTrigger>
          <Button>Open</Button>
        </DrawerTrigger>
        <DrawerPortal>
          <DrawerOverlay />
          <div data-testid="panel">Panel</div>
        </DrawerPortal>
      </Drawer>
    );
  }

  test("the portal renders outside the tree, and only while the drawer is open", async () => {
    const { container } = render(() => <Custom />);
    expect(document.querySelector('[data-testid="panel"]')).toBeNull();
    await user.click(trigger());
    flush();
    const panel = document.querySelector('[data-testid="panel"]');
    expect(panel).not.toBeNull();
    expect(container.contains(panel)).toBe(false);
  });

  test("the overlay is decoration that dismisses, and says its state", async () => {
    render(() => <Custom />);
    await user.click(trigger());
    flush();
    expect(overlay()?.getAttribute("data-state")).toBe("open");
    expect(overlay()?.getAttribute("aria-hidden")).toBe("true");
    await user.click(overlay() as HTMLElement);
    flush();
    expect(document.querySelector('[data-testid="panel"]')).toBeNull();
  });
});

describe("Drawer, vaul's remaining options", () => {
  function Options(props: Incoming<DrawerProps & { input?: boolean }>) {
    return (
      <>
        <button type="button">Outside</button>
        <Drawer
          modal={props.modal}
          container={props.container}
          noBodyStyles={props.noBodyStyles}
          shouldScaleBackground={props.shouldScaleBackground}
          autoFocus={props.autoFocus}
          onAnimationEnd={props.onAnimationEnd}
          fixed={props.fixed}
          repositionInputs={props.repositionInputs}
        >
          <DrawerTrigger>
            <Button>Open</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerTitle>Move goal</DrawerTitle>
            <Show when={props.input?.() === true}>
              <input aria-label="Goal" />
            </Show>
            <DrawerFooter>
              <DrawerClose>Done</DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  const open = async (): Promise<void> => {
    await user.click(screen.getByRole("button", { name: "Open" }));
    flush();
  };

  test("modal={false} leaves the page behind usable and draws no overlay", async () => {
    render(() => <Options modal={false} />);
    await open();
    const outside = screen.getByRole("button", { name: "Outside" });
    expect(outside.closest("[aria-hidden=true]")).toBeNull();
    expect(overlay()).toBeNull();

    await user.click(outside);
    flush();
    expect(screen.queryByRole("dialog")).not.toBeNull();

    user.key("Escape");

    flush();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("container is where the drawer is drawn", async () => {
    const host = document.createElement("section");
    document.body.append(host);
    render(() => <Options container={host} />);
    await open();
    const drawn = content() as HTMLElement;
    expect(host.contains(drawn)).toBe(true);
    expect(drawn.getAttribute("data-vaul-custom-container")).toBe("true");
    host.remove();
  });

  test("noBodyStyles scales the page without painting the body", async () => {
    const page = document.createElement("div");
    page.setAttribute("data-vaul-drawer-wrapper", "");
    document.body.append(page);
    // An earlier drawer's page is put back on a timer, and paints the body until then.
    document.body.style.background = "";
    render(() => <Options shouldScaleBackground noBodyStyles />);
    await open();
    expect(page.style.transform).toContain("scale(");
    expect(document.body.style.background).toBe("");
    page.remove();
  });

  test("autoFocus={false} leaves focus on the trigger", async () => {
    render(() => <Options autoFocus={false} />);
    await open();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open", hidden: true }));
  });

  test("onAnimationEnd hears the end of opening and of closing", async () => {
    const heard: boolean[] = [];
    render(() => <Options onAnimationEnd={(isOpen) => heard.push(isOpen)} />);
    await open();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(heard).toEqual([true]);
    await user.click(screen.getByRole("button", { name: "Done" }));
    flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(heard).toEqual([true, false]);
  });

  describe("an on-screen keyboard", () => {
    let viewport: EventTarget & { height: number };
    const original = Object.getOwnPropertyDescriptor(window, "visualViewport");

    beforeEach(() => {
      viewport = Object.assign(new EventTarget(), { height: window.innerHeight });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    });

    afterEach(() => {
      if (original === undefined) Reflect.deleteProperty(window, "visualViewport");
      else Object.defineProperty(window, "visualViewport", original);
    });

    const typeInto = async (): Promise<HTMLElement> => {
      await open();
      const drawn = content() as HTMLElement;
      sized(drawn, 300);
      const field = screen.getByRole("textbox", { name: "Goal" });
      field.focus();
      viewport.height = window.innerHeight - 200;
      viewport.dispatchEvent(new Event("resize"));
      flush();
      return drawn;
    };

    test("lifts the drawer above it", async () => {
      render(() => <Options input />);
      expect((await typeInto()).style.bottom).toBe("200px");
    });

    test("fixed keeps it in place and shortens it instead", async () => {
      render(() => <Options input fixed />);
      const drawn = await typeInto();
      expect(drawn.style.bottom).toBe("");
      expect(drawn.style.height).toBe("100px");
    });

    test("repositionInputs={false} leaves it alone", async () => {
      render(() => <Options input repositionInputs={false} />);
      const drawn = await typeInto();
      expect(drawn.style.bottom).toBe("");
      expect(drawn.style.height).toBe("");
    });
  });
});
