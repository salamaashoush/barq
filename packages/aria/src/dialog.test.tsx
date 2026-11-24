import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { renderToString } from "@barqjs/server";
import { type Child, Show, createSignal, isDev, onSettled, flush } from "@barqjs/core";
import { accessibleName, ariaViolations, render, screen, tick, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { ref } from "@barqjs/primitives/refs";
import {
  Dialog,
  Heading,
  Modal,
  Popover,
  popoverStateProps,
  PortalProvider,
  providePopoverTrigger,
  useDialogDescription,
  useDialogTitle,
} from "./dialog.tsx";
import { provideLocale } from "./i18n.ts";
import { overlayTriggerState } from "./overlays.ts";
import { OverlayArrow } from "./overlay-arrow.tsx";

/** The portal builds on a microtask after its marker connects. */
async function settle(): Promise<void> {
  await tick();
  await tick();
}

function Confirm(props: { isOpen: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <>
      <button type="button">before</button>
      <Modal isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
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

  test("the rest of the page is inert: hidden from assistive technology and out of the Tab order", async () => {
    render(() => <Confirm isOpen={true} />);
    await tick();

    const before = screen.getByText("before");
    expect(before.closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();
    expect(document.querySelector("[aria-hidden=true]")).toBeNull();
    expect(ariaViolations(document.body)).toEqual([]);
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

    expect(screen.getByText("before").closest("[inert]")).not.toBeNull();

    setOpen(false);
    await tick();

    expect(screen.getByText("before").closest("[inert]")).toBeNull();
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
function Description(props: { children?: unknown }) {
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
  function Anchored(props: { label: string }) {
    const triggerRef = ref<HTMLElement>();
    return (
      <>
        <button type="button" ref={triggerRef.set}>
          {props.label}
        </button>
        <Popover triggerRef={triggerRef} isOpen>
          <Dialog aria-label={props.label}>
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
  function Card(props: { shouldContainFocus?: boolean }) {
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
          shouldContainFocus={props.shouldContainFocus}
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
  function Panel(props: { autoFocus?: boolean }) {
    const [open, setOpen] = createSignal(true);
    return (
      <>
        <button type="button">before</button>
        <Modal isOpen={open()} onOpenChange={setOpen} isNonModal autoFocus={props.autoFocus}>
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

/** The nearest element that hides `node` from assistive technology, if any. */
function hiddenBy(node: Element | null): Element | null {
  for (let at = node; at !== null; at = at.parentElement) {
    if (at.getAttribute("aria-hidden") === "true" || (at as HTMLElement).inert) return at;
  }
  return null;
}

describe("a popover inside a modal", () => {
  function Nested(props: { isModal?: boolean }) {
    const triggerRef = ref<HTMLElement>();
    const [open, setOpen] = createSignal(false);
    return (
      <>
        <p>behind</p>
        <Modal isOpen>
          <Dialog aria-label="Settings">
            <button type="button" ref={triggerRef.set} onClick={() => setOpen(true)}>
              Size
            </button>
            <Popover
              triggerRef={triggerRef}
              isOpen={open()}
              onOpenChange={setOpen}
              isModal={props.isModal}
              aria-label="Sizes"
            >
              <p>Small</p>
            </Popover>
          </Dialog>
        </Modal>
      </>
    );
  }

  test("stays readable by a screen reader once it opens", async () => {
    render(() => <Nested />);
    await settle();
    user.click(screen.getByRole("button", { name: "Size" }));
    await settle();

    expect(hiddenBy(screen.getByText("Small"))).toBeNull();
    expect(hiddenBy(screen.getByText("behind"))).not.toBeNull();
  });

  test("a modal one makes the rest of the page inert, and gives it back on closing", async () => {
    const triggerRef = ref<HTMLElement>();
    const [open, setOpen] = createSignal(false);
    render(() => (
      <>
        <p>behind</p>
        <button type="button" ref={triggerRef.set}>
          Size
        </button>
        <Popover triggerRef={triggerRef} isOpen={open()} onOpenChange={setOpen} isModal>
          <p>Small</p>
        </Popover>
      </>
    ));
    setOpen(true);
    await settle();

    const behind = screen.getByText("behind");
    expect(behind.inert || (behind.parentElement as HTMLElement).inert).toBe(true);
    expect(hiddenBy(screen.getByText("Small"))).toBeNull();

    setOpen(false);
    await settle();
    expect(hiddenBy(behind)).toBeNull();
  });
});

describe("the dismiss button", () => {
  function Sizes(props: { isModal?: boolean; onOpenChange?: (open: boolean) => void }) {
    const triggerRef = ref<HTMLElement>();
    return (
      <>
        <button type="button" ref={triggerRef.set}>
          Size
        </button>
        <Popover
          triggerRef={triggerRef}
          defaultOpen
          isModal={props.isModal}
          onOpenChange={props.onOpenChange}
        >
          <button type="button">Small</button>
        </Popover>
      </>
    );
  }

  test("a modal popover has one at each end that closes it", async () => {
    const changes: boolean[] = [];
    render(() => <Sizes isModal onOpenChange={(open) => changes.push(open)} />);
    await settle();

    const dismiss = screen.getAllByRole("button", { name: "Dismiss" });
    expect(dismiss).toHaveLength(2);
    const popover = screen.getByText("Small").parentElement as HTMLElement;
    expect(popover.firstElementChild).toBe(dismiss[0] as Element);
    expect(popover.lastElementChild).toBe(dismiss[1] as Element);
    expect(dismiss[1]?.getAttribute("tabindex")).toBe("-1");
    // Focus still goes to the content, not to a button nobody can see.
    expect(document.activeElement?.textContent).toBe("Small");

    user.click(dismiss[1] as HTMLElement);
    expect(changes).toEqual([false]);
  });

  test("a dismissable modal starts with one, and focus still goes to the content", async () => {
    const changes: boolean[] = [];
    render(() => <Confirm isOpen onOpenChange={(open) => changes.push(open)} />);
    await tick();

    expect(document.activeElement?.textContent).toBe("Cancel");
    user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(changes).toEqual([false]);
  });

  test("a modal that cannot be dismissed has none", async () => {
    render(() => (
      <Modal isOpen isDismissable={false}>
        <Dialog aria-label="Terms">
          <Button>Accept</Button>
        </Dialog>
      </Modal>
    ));
    await tick();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  test("is named in the page's language", async () => {
    function German() {
      provideLocale("de-DE");
      return <Sizes isModal />;
    }
    render(() => <German />);
    await settle();
    expect(screen.getAllByRole("button", { name: "Schließen" })).toHaveLength(2);
  });
});

describe("a dialog with no title", () => {
  test("points aria-labelledby at nothing, and says so in development", async () => {
    const warned: unknown[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warned.push(args[0]);
    try {
      render(() => (
        <Dialog>
          <p>Body</p>
        </Dialog>
      ));
      await tick();
    } finally {
      console.warn = warn;
    }

    expect(screen.getByRole("dialog").hasAttribute("aria-labelledby")).toBe(false);
    expect(warned.some((message) => String(message).includes("title"))).toBe(isDev);
  });

  test("a title that arrives later names it", async () => {
    const [titled, setTitled] = createSignal(false);
    const warn = console.warn;
    console.warn = () => {};
    try {
      render(() => (
        <Dialog>
          <Show when={titled()}>
            <Heading slot="title">Later</Heading>
          </Show>
        </Dialog>
      ));
      await tick();
    } finally {
      console.warn = warn;
    }
    expect(screen.getByRole("dialog").hasAttribute("aria-labelledby")).toBe(false);

    setTitled(true);
    await tick();
    expect(accessibleName(screen.getByRole("dialog"))).toBe("Later");
  });
});

/** happy-dom lays nothing out; an overlay with no size has no edge to put an arrow along. */
function laidOut(element: HTMLElement | null): void {
  if (element === null) return;
  Object.defineProperty(element, "offsetWidth", { value: 200, configurable: true });
  Object.defineProperty(element, "offsetHeight", { value: 40, configurable: true });
}

describe("a popover's arrow", () => {
  test("is told where along the popover's edge the trigger is", async () => {
    const triggerRef = ref<HTMLElement>();
    render(() => (
      <>
        <button type="button" ref={triggerRef.set}>
          Size
        </button>
        <Popover triggerRef={triggerRef} defaultOpen aria-label="Sizes" ref={laidOut}>
          <OverlayArrow data-testid="arrow" />
          <p>Small</p>
        </Popover>
      </>
    ));
    await settle();

    const arrow = screen.getByTestId("arrow");
    expect(arrow.getAttribute("data-placement")).toBe("bottom");
    expect(arrow.style.left).toMatch(/px$/);
  });
});

describe("a popover under a trigger it did not build", () => {
  function Preview(props: { children?: Child }) {
    const triggerRef = ref<HTMLElement>();
    const state = overlayTriggerState({});
    return (
      <>
        <button type="button" ref={triggerRef.set} onClick={() => state.toggle()}>
          Salama
        </button>
        {providePopoverTrigger(
          { triggerRef, state, overlayProps: { "data-from-trigger": "" } },
          () => props.children,
        )}
      </>
    );
  }

  test("opens and closes with the trigger's state, and carries its props", async () => {
    render(() => (
      <Preview>
        <Popover aria-label="Profile">
          <a href="https://example.com">Profile</a>
        </Popover>
      </Preview>
    ));
    expect(screen.queryByText("Profile")).toBeNull();

    user.click(screen.getByRole("button", { name: "Salama" }));
    await settle();
    const link = screen.getByText("Profile");
    expect(link.closest("[data-from-trigger]")).not.toBeNull();

    user.keyDown("Escape");
    await settle();
    expect(screen.queryByText("Profile")).toBeNull();
  });

  test("a popover told its own state keeps it", async () => {
    render(() => (
      <Preview>
        <Popover aria-label="Pinned" isOpen>
          <p>Pinned</p>
        </Popover>
      </Preview>
    ));
    await settle();
    expect(screen.getByText("Pinned")).toBeTruthy();
  });
});

describe("a dialog's title", () => {
  test("a titled dialog does not warn", async () => {
    const warned: unknown[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warned.push(args[0]);
    try {
      render(() => (
        <Modal isOpen>
          <Dialog>
            <Heading slot="title">Hello</Heading>
          </Dialog>
        </Modal>
      ));
      await tick();
      await tick();
    } finally {
      console.warn = warn;
    }
    expect(warned.filter((message) => String(message).includes("title"))).toEqual([]);
  });

  test("a design system's own heading names it through useDialogTitle", async () => {
    function Title(props: { children?: Child }) {
      const title = useDialogTitle();
      return <h2 id={title?.id as () => string}>{props.children}</h2>;
    }
    render(() => (
      <Dialog>
        <Title>Rename</Title>
      </Dialog>
    ));
    await tick();
    expect(accessibleName(screen.getByRole("dialog"))).toBe("Rename");
  });

  test("a server-rendered dialog with a title heading is named by it", async () => {
    const mod = await ssrModule<{ App: () => unknown }>(`
      import { Dialog, Heading } from "${SRC}/dialog.tsx";
      export function App() {
        return <Dialog><Heading slot="title">Delete?</Heading><p>Body</p></Dialog>;
      }
    `);
    const html = renderToString(() => mod.App() as never);
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeDefined();
    expect(html).toContain(`id="${labelledBy}"`);
  });
});

const ssrRequire = createRequire(import.meta.url);
const compiler = ssrRequire("@barqjs/compiler") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};
const SRC = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const SSR_OUT = join(SRC, "..", "node_modules", ".barq-ssr-fixtures");
let ssrSequence = 0;

/** A fixture compiled for the server, as `ssr.test.ts` compiles its own. */
async function ssrModule<T>(source: string): Promise<T> {
  mkdirSync(SSR_OUT, { recursive: true });
  const name = `dialog-fixture-${ssrSequence++}`;
  const { code } = compiler.transform(source, {
    filename: join(SSR_OUT, `${name}.tsx`),
    ssr: true,
    moduleSource: new URL("../node_modules/@barqjs/web/src/index.ts", import.meta.url).pathname,
    coreSource: new URL("../node_modules/@barqjs/core/src/index.ts", import.meta.url).pathname,
    serverSource: new URL("../node_modules/@barqjs/server/src/index.ts", import.meta.url).pathname,
  });
  const file = join(SSR_OUT, `${name}.ts`);
  writeFileSync(file, code);
  return (await import(file)) as T;
}

describe("a popover that focus leaves", () => {
  function Page(props: { children?: Child }) {
    const triggerRef = ref<HTMLElement>();
    const state = overlayTriggerState({ defaultOpen: true });
    return (
      <>
        <button type="button" ref={triggerRef.set}>
          Open
        </button>
        {providePopoverTrigger({ triggerRef, state, shouldContainFocus: false }, () => (
          <Popover aria-label="Options">{props.children}</Popover>
        ))}
        <button type="button">Elsewhere</button>
      </>
    );
  }

  test("closes when focus moves to something outside it", async () => {
    render(() => (
      <Page>
        <button type="button">Inside</button>
      </Page>
    ));
    await settle();
    const inside = screen.getByRole("button", { name: "Inside" });
    inside.focus();
    flush();

    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    inside.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: elsewhere }));
    elsewhere.focus();
    await settle();
    expect(screen.queryByRole("button", { name: "Inside" })).toBeNull();
  });

  test("stays open when focus moves into a popover it opened", async () => {
    render(() => (
      <Page>
        <button type="button">Inside</button>
        <Page>
          <button type="button">Deeper</button>
        </Page>
      </Page>
    ));
    await settle();
    const inside = screen.getByRole("button", { name: "Inside" });
    inside.focus();
    flush();

    const deeper = screen.getByRole("button", { name: "Deeper" });
    inside.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: deeper }));
    deeper.focus();
    await settle();
    expect(screen.queryByRole("button", { name: "Inside" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Deeper" })).not.toBeNull();
  });
});

describe("Popover's veto of an outside press", () => {
  test("a vetoed press reaches its target and leaves the popover open; any other closes it", async () => {
    const triggerRef = ref<HTMLButtonElement>();
    const pressed: string[] = [];
    render(() => {
      const state = overlayTriggerState({ defaultOpen: true });
      return (
        <>
          <button type="button" ref={triggerRef.set}>
            Open
          </button>
          {providePopoverTrigger({ triggerRef, state }, () => (
            <Popover
              aria-label="Options"
              shouldCloseOnInteractOutside={(element) => element.closest("[data-keep]") === null}
            >
              <button type="button">Inside</button>
            </Popover>
          ))}
          <button type="button" data-keep="" onClick={() => pressed.push("kept")}>
            Kept
          </button>
        </>
      );
    });
    await settle();

    user.click(screen.getByRole("button", { name: "Kept" }));
    await settle();
    expect(pressed).toEqual(["kept"]);
    expect(screen.queryByRole("button", { name: "Inside" })).not.toBeNull();

    user.click(document.body);
    await settle();
    expect(screen.queryByRole("button", { name: "Inside" })).toBeNull();
  });
});
