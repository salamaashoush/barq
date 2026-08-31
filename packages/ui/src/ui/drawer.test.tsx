import { afterEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { cleanup, render, user } from "@barqjs/testing";

import { Button } from "./button.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
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

afterEach(() => {
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
