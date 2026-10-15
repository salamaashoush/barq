import { describe, expect, test } from "bun:test";
import { createSignal, flush, onSettled, type Incoming } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Button } from "./button.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
  type SheetSide,
} from "./sheet.tsx";

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function Fixture(props: Incoming<{ side?: SheetSide; showCloseButton?: boolean }>) {
  return (
    <Sheet>
      <SheetTrigger>
        <Button>Filters</Button>
      </SheetTrigger>
      <SheetContent side={props.side?.()} showCloseButton={props.showCloseButton?.()}>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose>Done</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function open(): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await settle();
}

describe("Sheet", () => {
  test("every part carries upstream's slot name", async () => {
    render(() => <Fixture />);
    await open();

    for (const slot of [
      "sheet-overlay",
      "sheet-content",
      "sheet-header",
      "sheet-title",
      "sheet-description",
      "sheet-footer",
      "sheet-close",
    ]) {
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
  });

  test("it is a named, described dialog that says its side and its state", async () => {
    render(() => <Fixture side="left" />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(trigger.getAttribute("data-state")).toBe("closed");
    await open();

    const dialog = screen.getByRole("dialog");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Filters",
    );
    expect(
      document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Narrow the list.");

    const content = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
    expect(content.getAttribute("data-side")).toBe("left");
    expect(content.getAttribute("data-state")).toBe("open");
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(document.querySelector('[data-slot="sheet-overlay"]')?.getAttribute("data-state")).toBe(
      "open",
    );
  });

  test("each side has rules of its own", async () => {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const view = render(() => <Fixture side={side} />);
      await open();
      const content = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
      expect(content.getAttribute("data-side")).toBe(side);
      expect(rulesFor(content.className)).toContain(`[data-side="${side}"]`);
      await user.keyboard("{Escape}");
      await settle();
      view.unmount();
    }
  });

  test("the corner button closes it, sits on the inline end, and can be turned off", async () => {
    render(() => <Fixture />);
    await open();

    const corner = screen.getByRole("button", { name: "Close" });
    const rules = rulesFor(corner.className);
    expect(rules).toContain("inset-inline-end:");
    expect(rules).not.toContain("right:");

    await user.click(corner);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("showCloseButton={false} leaves only the caller's own way out", async () => {
    render(() => <Fixture showCloseButton={false} />);
    await open();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  test("Escape closes it and focus goes back to the trigger", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    trigger.focus();
    await open();

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Focus is given back a frame after the content has gone.
    await frame();
    await frame();
    expect(document.activeElement === trigger).toBe(true);
  });

  test("SheetOverlay styles the element behind it", async () => {
    render(() => (
      <Sheet>
        <SheetTrigger>
          <Button>Filters</Button>
        </SheetTrigger>
        <SheetPortal>
          <SheetOverlay class="frosted" />
          <SheetContent>
            <SheetTitle>Filters</SheetTitle>
          </SheetContent>
        </SheetPortal>
      </Sheet>
    ));
    await open();

    const underlay = document.querySelector('[data-slot="sheet-overlay"]') as HTMLElement;
    expect(underlay.hasAttribute("data-barq-underlay")).toBe(true);
    expect(underlay.classList.contains("frosted")).toBe(true);
    expect(rulesFor(underlay.className)).toContain("position: fixed");
  });

  test("SheetPortal sends it to a container of the caller's", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(() => (
      <Sheet>
        <SheetTrigger>
          <Button>Filters</Button>
        </SheetTrigger>
        <SheetPortal container={container}>
          <SheetContent>
            <SheetTitle>Filters</SheetTitle>
          </SheetContent>
        </SheetPortal>
      </Sheet>
    ));
    await open();

    expect(container.contains(screen.getByRole("dialog"))).toBe(true);
    await user.keyboard("{Escape}");
    await settle();
    container.remove();
  });
});

describe("a controlled sheet", () => {
  test("opened as soon as the page settles is open", async () => {
    function Restored() {
      const [isOpen, setOpen] = createSignal(false);
      onSettled(() => {
        setOpen(true);
      });
      return (
        <Sheet isOpen={isOpen()} onOpenChange={setOpen}>
          <SheetTrigger>
            <Button>Filters</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle>Filters</SheetTitle>
          </SheetContent>
        </Sheet>
      );
    }

    render(() => <Restored />);
    await settle();
    await settle();
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
