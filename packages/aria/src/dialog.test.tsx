import { describe, expect, test } from "bun:test";
import { type Incoming, signal } from "@barqjs/core";
import { accessibleName, render, screen, tick, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { ref } from "@barqjs/primitives/refs";
import { Dialog, Heading, Modal, Popover } from "./dialog.tsx";

/** The portal builds on a microtask after its marker connects. */
async function settle(): Promise<void> {
  await tick();
  await tick();
}

function Confirm(props: Incoming<{ isOpen: boolean; onOpenChange?: (open: boolean) => void }>) {
  return (
    <>
      <button type="button">before</button>
      <Modal isOpen={props.isOpen()} onOpenChange={props.onOpenChange?.()}>
        <Dialog>
          <Heading slot="title">Delete this?</Heading>
          <Button>Cancel</Button>
          <Button>Delete</Button>
        </Dialog>
      </Modal>
      <button type="button">after</button>
    </>
  );
}

describe("Modal", () => {
  test("renders nothing while closed", () => {
    render(() => <Confirm isOpen={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the dialog is named by its title heading", async () => {
    render(() => <Confirm isOpen={true} />);
    await tick();

    const dialog = screen.getByRole("dialog");
    expect(accessibleName(dialog)).toBe("Delete this?");
  });

  test("focus moves into the dialog when it opens", async () => {
    render(() => <Confirm isOpen={true} />);
    await tick();

    expect(document.activeElement?.textContent).toBe("Cancel");
  });

  test("Tab is contained inside", async () => {
    render(() => <Confirm isOpen={true} />);
    await tick();

    expect(document.activeElement?.textContent).toBe("Cancel");
    user.tab();
    expect(document.activeElement?.textContent).toBe("Delete");
    // Past the last control, focus wraps rather than reaching "after".
    user.tab();
    expect(document.activeElement?.textContent).toBe("Cancel");
  });

  test("the rest of the page is hidden from assistive technology", async () => {
    render(() => <Confirm isOpen={true} />);
    await tick();

    const before = screen.getByText("before");
    expect(before.closest("[aria-hidden=true]")).not.toBeNull();
    expect(screen.getByRole("dialog").closest("[aria-hidden=true]")).toBeNull();
  });

  test("Escape closes it", async () => {
    const open = signal(true);
    const changes: boolean[] = [];
    render(() => (
      <Confirm
        isOpen={open()}
        onOpenChange={(next) => {
          changes.push(next);
          open.set(next);
        }}
      />
    ));
    await tick();

    user.keyDown("Escape");

    expect(changes).toEqual([false]);
  });

  test("a press outside closes it", async () => {
    const open = signal(true);
    const changes: boolean[] = [];
    render(() => (
      <Confirm
        isOpen={open()}
        onOpenChange={(next) => {
          changes.push(next);
          open.set(next);
        }}
      />
    ));
    await tick();

    user.click(document.body);

    expect(changes).toEqual([false]);
  });

  test("a press inside does not", async () => {
    const changes: boolean[] = [];
    render(() => <Confirm isOpen={true} onOpenChange={(next) => changes.push(next)} />);
    await tick();

    user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(changes).toEqual([]);
  });

  test("the page is visible again once it closes", async () => {
    const open = signal(true);
    render(() => <Confirm isOpen={open()} />);
    await tick();

    expect(screen.getByText("before").closest("[aria-hidden=true]")).not.toBeNull();

    open.set(false);
    await tick();

    expect(screen.getByText("before").closest("[aria-hidden=true]")).toBeNull();
  });
});

describe("Dialog", () => {
  test("an alertdialog says so", () => {
    render(() => (
      <Dialog role="alertdialog" aria-label="Careful">
        <p>Body</p>
      </Dialog>
    ));
    expect(screen.getByRole("alertdialog")).toBeDefined();
  });

  test("aria-label wins over the title heading", () => {
    render(() => (
      <Dialog aria-label="Explicit">
        <Heading slot="title">Ignored</Heading>
      </Dialog>
    ));
    expect(accessibleName(screen.getByRole("dialog"))).toBe("Explicit");
  });

  test("a heading without the title slot does not name the dialog", () => {
    render(() => (
      <Dialog aria-label="Named">
        <Heading>Just a heading</Heading>
      </Dialog>
    ));
    const dialog = screen.getByRole("dialog");
    expect(dialog.hasAttribute("aria-labelledby")).toBe(false);
  });
});

/**
 * A popover with no `style` prop of its own.
 *
 * `styleProps` used to return `style: () => …` whether or not the caller had
 * given one, which made it the last word in a merge that ends with it — so the
 * `position: absolute` and the coordinates `overlayPosition` had just computed
 * were replaced by `undefined`, and the popover rendered in the document flow.
 */
describe("a positioned overlay", () => {
  function Anchored() {
    const triggerRef = ref<HTMLElement>();
    const open = signal(true);
    return (
      <>
        <button type="button" ref={triggerRef.set}>
          Open
        </button>
        <Popover triggerRef={triggerRef} isOpen={open()} onOpenChange={open.set}>
          <Dialog>
            <Heading slot="title">Dimensions</Heading>
          </Dialog>
        </Popover>
      </>
    );
  }

  test("keeps the position it was given when the caller styles nothing", async () => {
    render(() => <Anchored />);
    await tick();

    const popover = screen.getByRole("dialog").parentElement;
    expect(popover?.getAttribute("style") ?? "").toContain("position");
  });
});

/**
 * Where focus goes when an overlay closes.
 *
 * Three things had to be true and none of them was, so a browser gave the user
 * back nothing: the scope has to be created WITH the content it contains — an
 * overlay whose scope outlives its `<Show>` is never disposed, and disposal is
 * what restores; the scope-tree teardown has to be registered FIRST so it runs
 * LAST, because cleanups run in reverse and it was erasing the record the
 * restore reads; and the element to restore to has to be captured from the
 * page's document rather than from the inert `<template>` one a fresh clone
 * belongs to.
 */
describe("closing an overlay", () => {
  function Fixture() {
    const open = signal(false);
    return (
      <>
        <Button onPress={() => open.set(true)}>Open</Button>
        <Modal isOpen={open()} onOpenChange={open.set}>
          <Dialog>
            <Heading slot="title">Delete this?</Heading>
            <Button onPress={() => open.set(false)}>Cancel</Button>
          </Dialog>
        </Modal>
      </>
    );
  }

  test("gives focus back to what opened it", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();

    await user.click(trigger);
    await settle();
    expect(document.activeElement?.textContent).toBe("Cancel");

    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await frame();

    expect(document.activeElement?.textContent).toBe("Open");
  });

  test("the scope is disposed, so opening again captures a fresh target", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();

    for (let round = 0; round < 2; round++) {
      await user.click(trigger);
      await settle();
      expect(document.activeElement?.textContent).toBe("Cancel");

      await user.keyboard("{Escape}");
      await settle();
      await frame();
      await frame();
      expect(document.activeElement?.textContent).toBe("Open");
    }
  });
});

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
