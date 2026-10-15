import { describe, expect, test } from "bun:test";
import { type Incoming, Show, createSignal, onSettled } from "@barqjs/core";
import { accessibleName, render, screen, tick, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { ref } from "@barqjs/primitives/refs";
import {
  Dialog,
  Heading,
  Modal,
  Popover,
  popoverStateProps,
  PortalProvider,
  useDialogDescription,
} from "./dialog.tsx";

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
    const [open, setOpen] = createSignal(true);
    const changes: boolean[] = [];
    render(() => (
      <Confirm
        isOpen={open()}
        onOpenChange={(next) => {
          changes.push(next);
          setOpen(next);
        }}
      />
    ));
    await tick();

    user.keyDown("Escape");

    expect(changes).toEqual([false]);
  });

  test("a press outside closes it", async () => {
    const [open, setOpen] = createSignal(true);
    const changes: boolean[] = [];
    render(() => (
      <Confirm
        isOpen={open()}
        onOpenChange={(next) => {
          changes.push(next);
          setOpen(next);
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
    const [open, setOpen] = createSignal(true);
    render(() => <Confirm isOpen={open()} />);
    await tick();

    expect(screen.getByText("before").closest("[aria-hidden=true]")).not.toBeNull();

    setOpen(false);
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

  test("a dialog with no description points at nothing", () => {
    // An `aria-describedby` naming an id no element carries is announced as a
    // gap where the description should be.
    render(() => (
      <Dialog aria-label="Named">
        <p>Body</p>
      </Dialog>
    ));
    expect(screen.getByRole("dialog").hasAttribute("aria-describedby")).toBe(false);
  });

  test("a description registers itself, and the dialog points at it", () => {
    render(() => (
      <Dialog aria-label="Named">
        <Description>Three files will be deleted.</Description>
      </Dialog>
    ));
    const dialog = screen.getByRole("dialog");
    const described = dialog.getAttribute("aria-describedby");
    expect(described).not.toBeNull();
    expect(document.getElementById(described ?? "")?.textContent).toBe(
      "Three files will be deleted.",
    );
  });

  test("an explicit aria-describedby wins, because the caller knows better", () => {
    render(() => (
      <Dialog aria-label="Named" aria-describedby="elsewhere">
        <Description>Ignored</Description>
      </Dialog>
    ));
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe("elsewhere");
  });

  test("a description that leaves takes the attribute with it", async () => {
    const [showing, setShowing] = createSignal(true);
    render(() => (
      <Dialog aria-label="Named">
        <Show when={showing()}>
          <Description>Gone in a moment.</Description>
        </Show>
      </Dialog>
    ));
    const dialog = screen.getByRole("dialog");
    expect(dialog.hasAttribute("aria-describedby")).toBe(true);
    setShowing(false);
    await tick();
    expect(dialog.hasAttribute("aria-describedby")).toBe(false);
  });
});

/** What a design system's `<DialogDescription>` is, minus the styling. */
function Description(props: Incoming<{ children?: unknown }>) {
  const described = useDialogDescription();
  return <p id={described?.id()}>{props.children as never}</p>;
}

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
    const [open, setOpen] = createSignal(true);
    return (
      <>
        <button type="button" ref={triggerRef.set}>
          Open
        </button>
        <Popover triggerRef={triggerRef} isOpen={open()} onOpenChange={setOpen}>
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

  function Panel() {
    return (
      <div data-testid="panel" {...popoverStateProps()}>
        Dimensions
      </div>
    );
  }

  test("says where it is, in both vocabularies, on itself and to what it holds", async () => {
    const triggerRef = ref<HTMLElement>();
    render(() => (
      <>
        <button type="button" ref={triggerRef.set}>
          Open
        </button>
        <Popover triggerRef={triggerRef} isOpen placement="bottom start" data-testid="popover">
          <Panel />
        </Popover>
      </>
    ));
    await settle();

    const popover = screen.getByTestId("popover");
    expect(popover.getAttribute("data-placement")).toBe("bottom");
    expect(popover.getAttribute("data-side")).toBe("bottom");
    expect(popover.getAttribute("data-align")).toBe("start");
    expect(popover.getAttribute("data-state")).toBe("open");

    const panel = screen.getByTestId("panel");
    expect(panel.getAttribute("data-side")).toBe("bottom");
    expect(panel.getAttribute("data-align")).toBe("start");
    expect(panel.getAttribute("data-state")).toBe("open");
  });

  test("an element outside any popover gets no state at all", () => {
    render(() => <Panel />);
    const panel = screen.getByTestId("panel");
    expect(panel.hasAttribute("data-state")).toBe(false);
    expect(panel.hasAttribute("data-side")).toBe(false);
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
    const [open, setOpen] = createSignal(false);
    return (
      <>
        <Button onPress={() => setOpen(true)}>Open</Button>
        <Modal isOpen={open()} onOpenChange={setOpen}>
          <Dialog>
            <Heading slot="title">Delete this?</Heading>
            <Button onPress={() => setOpen(false)}>Cancel</Button>
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

describe("what a design system puts on the underlay", () => {
  test("reaches the underlay, and both elements say they are open", async () => {
    render(() => (
      <Modal
        isOpen
        underlayClass="dim"
        underlayProps={{ "data-testid": "underlay", "data-tone": "dark", class: "blurred" }}
      >
        <Dialog aria-label="Settings">
          <Button>Done</Button>
        </Dialog>
      </Modal>
    ));
    await settle();

    const underlay = screen.getByTestId("underlay");
    expect(underlay.hasAttribute("data-barq-underlay")).toBe(true);
    expect(underlay.getAttribute("data-tone")).toBe("dark");
    expect(underlay.className).toBe("dim blurred");
    expect(underlay.getAttribute("data-state")).toBe("open");
    expect(screen.getByRole("dialog").parentElement?.getAttribute("data-state")).toBe("open");
  });
});

describe("PortalProvider", () => {
  function Anchored(props: Incoming<{ label: string }>) {
    const triggerRef = ref<HTMLElement>();
    return (
      <>
        <button type="button" ref={triggerRef.set}>
          {props.label()}
        </button>
        <Popover triggerRef={triggerRef} isOpen>
          <Dialog aria-label={props.label()}>
            <Button>Done</Button>
          </Dialog>
        </Popover>
      </>
    );
  }

  test("sends what is inside it to the container, and nothing beside it", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(() => (
      <>
        <PortalProvider getContainer={() => container}>
          <Anchored label="Inside" />
        </PortalProvider>
        <Anchored label="Beside" />
      </>
    ));
    await settle();

    expect(container.contains(screen.getByRole("dialog", { name: "Inside" }))).toBe(true);
    expect(container.contains(screen.getByRole("dialog", { name: "Beside" }))).toBe(false);
    container.remove();
  });
});

describe("a popover that leaves focus alone", () => {
  function Card(props: Incoming<{ shouldContainFocus?: boolean }>) {
    const triggerRef = ref<HTMLElement>();
    const [open, setOpen] = createSignal(false);
    return (
      <>
        <button type="button" ref={triggerRef.set} onClick={() => setOpen(true)}>
          Open
        </button>
        <Popover
          triggerRef={triggerRef}
          isOpen={open()}
          onOpenChange={setOpen}
          shouldContainFocus={props.shouldContainFocus?.()}
        >
          <a href="https://example.com">Profile</a>
        </Popover>
      </>
    );
  }

  test("an ordinary popover takes focus when it opens", async () => {
    render(() => <Card />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    user.click(trigger);
    await settle();

    expect(document.activeElement?.textContent).toBe("Profile");
  });

  test("one told not to leaves it on whatever opened it", async () => {
    render(() => <Card shouldContainFocus={false} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    user.click(trigger);
    await settle();

    expect(screen.getByText("Profile")).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
  });
});

/**
 * A controlled overlay whose owner opens it the moment the page settles: a
 * welcome popover, a dialog restored from the URL.
 */
describe("an overlay opened as soon as the page settles", () => {
  test("a popover is open", async () => {
    function Welcome() {
      const triggerRef = ref<HTMLElement>();
      const [open, setOpen] = createSignal(false);
      onSettled(() => {
        setOpen(true);
      });
      return (
        <>
          <button type="button" ref={triggerRef.set}>
            Open
          </button>
          <Popover triggerRef={triggerRef} isOpen={open()} onOpenChange={setOpen}>
            <Dialog aria-label="Welcome">
              <Button>Done</Button>
            </Dialog>
          </Popover>
        </>
      );
    }

    render(() => <Welcome />);
    await settle();
    await settle();
    expect(screen.getByRole("dialog", { name: "Welcome" })).toBeTruthy();
  });

  test("a modal is open", async () => {
    function Restored() {
      const [open, setOpen] = createSignal(false);
      onSettled(() => {
        setOpen(true);
      });
      return (
        <Modal isOpen={open()} onOpenChange={setOpen}>
          <Dialog aria-label="Restored">
            <Button>Done</Button>
          </Dialog>
        </Modal>
      );
    }

    render(() => <Restored />);
    await settle();
    await settle();
    expect(screen.getByRole("dialog", { name: "Restored" })).toBeTruthy();
  });
});

describe("a Modal that is not modal", () => {
  function Panel(props: Incoming<{ autoFocus?: boolean }>) {
    const [open, setOpen] = createSignal(true);
    return (
      <>
        <button type="button">before</button>
        <Modal isOpen={open()} onOpenChange={setOpen} isNonModal autoFocus={props.autoFocus?.()}>
          <Dialog>
            <Heading slot="title">Filters</Heading>
            <Button>Apply</Button>
          </Dialog>
        </Modal>
        <button type="button">after</button>
      </>
    );
  }

  test("the page behind stays reachable, by a screen reader, by Tab and by a press", async () => {
    render(() => <Panel />);
    await tick();
    expect(document.activeElement?.textContent).toBe("Apply");
    expect(screen.getByText("before").closest("[aria-hidden=true]")).toBeNull();
    expect(document.documentElement.style.overflow).not.toBe("hidden");

    user.tab();
    expect(document.activeElement?.textContent).not.toBe("Apply");

    await user.click(screen.getByText("before"));
    await tick();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  test("Escape still closes it", async () => {
    render(() => <Panel />);
    await tick();
    user.key("Escape");
    await tick();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("autoFocus={false} leaves focus where it was", async () => {
    render(() => <Panel autoFocus={false} />);
    await tick();
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(document.activeElement?.textContent).not.toBe("Apply");
  });
});
