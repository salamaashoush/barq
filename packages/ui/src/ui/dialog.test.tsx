import { describe, expect, test } from "bun:test";
import { createSignal, flush, onSettled } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import { Button } from "./button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog.tsx";

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function Fixture() {
  return (
    <Dialog>
      <DialogTrigger>
        <Button>Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete the project?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  test("the description describes it, rather than sitting there unread", async () => {
    // Radix wires `aria-describedby` from `<DialogDescription>`; without it
    // the paragraph under the title is read by whoever goes looking and by
    // nobody else.
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    const dialog = screen.getByRole("dialog");
    const described = dialog.getAttribute("aria-describedby");
    expect(described).not.toBeNull();
    expect(document.getElementById(described ?? "")?.textContent).toBe("This cannot be undone.");
  });

  test("nothing is in the document until it opens", () => {
    render(() => <Fixture />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  test("the trigger is the button itself", () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // `aria-haspopup` is deliberately absent for a dialog: screen readers
    // announce every value but "menu" and "listbox" as "menu".
    expect(trigger.hasAttribute("aria-haspopup")).toBe(false);
  });

  test("pressing it opens a named dialog", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Delete the project?").getAttribute("data-slot")).toBe("dialog-title");
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      screen.getByText("Delete the project?").getAttribute("id"),
    );
  });

  test("the close button closes it", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a DialogClose in the footer closes it too", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Escape closes it", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the close button can be turned off", async () => {
    render(() => (
      <Dialog>
        <DialogTrigger>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Plain</DialogTitle>
        </DialogContent>
      </Dialog>
    ));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  test("the underlay is styled and is not the dialog", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    const underlay = document.querySelector("[data-barq-underlay]") as HTMLElement;
    expect(underlay).not.toBeNull();
    expect(underlay.className).not.toBe("");
    const rules = rulesFor(underlay.className);
    expect(rules).toContain("position: fixed");
    // Atoms expand a shorthand, so `inset: 0` is its four sides.
    expect(rules).toContain("top: 0px");
  });

  test("role can be alertdialog", async () => {
    render(() => (
      <Dialog>
        <DialogTrigger>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent role="alertdialog">
          <DialogTitle>Careful</DialogTitle>
        </DialogContent>
      </Dialog>
    ));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});

describe("the parts shadcn exports beside the content", () => {
  test("every element says whether it is open, in upstream's words too", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    expect(trigger.getAttribute("data-state")).toBe("closed");

    await user.click(trigger);
    await settle();

    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(document.querySelector('[data-slot="dialog-content"]')?.getAttribute("data-state")).toBe(
      "open",
    );
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.getAttribute("data-state")).toBe(
      "open",
    );
  });

  test("the trigger keeps the slot of the control it is", () => {
    // Radix's `asChild` merges the child's props last, so a `<Button>` inside a
    // trigger is still `data-slot="button"`, which is what a style selects on.
    render(() => <Fixture />);
    expect(screen.getByRole("button", { name: "Delete" }).getAttribute("data-slot")).toBe("button");
  });

  test("DialogOverlay styles the element behind the dialog, which the modal draws", async () => {
    render(() => (
      <Dialog>
        <DialogTrigger>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogPortal>
          <DialogOverlay class="frosted" data-tone="dark" />
          <DialogContent>
            <DialogTitle>Plain</DialogTitle>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    ));
    // The part is a request, not an element: nothing is drawn while closed.
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();

    const overlays = document.querySelectorAll('[data-slot="dialog-overlay"]');
    expect(overlays).toHaveLength(1);
    const underlay = overlays[0] as HTMLElement;
    expect(underlay.hasAttribute("data-barq-underlay")).toBe(true);
    expect(underlay.classList.contains("frosted")).toBe(true);
    expect(underlay.getAttribute("data-tone")).toBe("dark");
    // The component's own look is still there under the caller's.
    expect(rulesFor(underlay.className)).toContain("position: fixed");
  });

  test("DialogPortal sends the dialog to a container of the caller's", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(() => (
      <Dialog>
        <DialogTrigger>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogPortal container={container}>
          <DialogContent>
            <DialogTitle>Inside</DialogTitle>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    ));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();

    expect(container.contains(screen.getByRole("dialog"))).toBe(true);
    await user.keyboard("{Escape}");
    await settle();
    container.remove();
  });

  test("the footer can carry its own close button", async () => {
    render(() => (
      <Dialog>
        <DialogTrigger>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Share</DialogTitle>
          <DialogFooter showCloseButton>
            <Button>Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await settle();

    const footer = document.querySelector('[data-slot="dialog-footer"]') as HTMLElement;
    const close = screen.getByRole("button", { name: "Close" });
    expect(footer.contains(close)).toBe(true);
    // After the caller's own buttons, as upstream writes it.
    expect(footer.lastElementChild).toBe(close);
    expect(close.getAttribute("data-slot")).toBe("dialog-close");
    expect(close.getAttribute("data-variant")).toBe("outline");

    await user.click(close);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a footer says nothing about closing unless asked", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    const footer = document.querySelector('[data-slot="dialog-footer"]') as HTMLElement;
    expect(footer.querySelectorAll("button")).toHaveLength(1);
  });

  test("the corner button and the footer sit on logical edges", async () => {
    render(() => <Fixture />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();

    const corner = screen.getByRole("button", { name: "Close" });
    const cornerRules = rulesFor(corner.className);
    expect(cornerRules).toContain("inset-inline-end:");
    expect(cornerRules).not.toContain("right:");

    const footer = document.querySelector('[data-slot="dialog-footer"]') as HTMLElement;
    const footerRules = rulesFor(footer.className);
    expect(footerRules).toContain("border-end-end-radius:");
    expect(footerRules).toContain("border-end-start-radius:");
    expect(footerRules).not.toContain("border-bottom-right-radius:");
  });
});

describe("a trigger that is not a control from this package", () => {
  function Plain() {
    return (
      <Dialog>
        <DialogTrigger
          render={(trigger) => (
            <button {...trigger.props} ref={trigger.ref} class="link">
              Delete
            </button>
          )}
        />
        <DialogContent>
          <DialogTitle>Delete the project?</DialogTitle>
        </DialogContent>
      </Dialog>
    );
  }

  test("a plain button given the trigger's props says what a Button would", () => {
    render(() => <Plain />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(trigger.className).toBe("link");
  });

  test("pressing it opens the dialog, and it says so", async () => {
    render(() => <Plain />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    await user.click(trigger);
    await settle();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(trigger.getAttribute("aria-controls")).not.toBeNull();
  });

  test("the keyboard opens it too, and closing gives it focus back", async () => {
    render(() => <Plain />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");
    await settle();
    await frame();
    await frame();
    expect(document.activeElement === trigger).toBe(true);
  });
});

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("a controlled dialog", () => {
  test("opened as soon as the page settles is open", async () => {
    function Restored() {
      const [open, setOpen] = createSignal(false);
      onSettled(() => {
        setOpen(true);
      });
      return (
        <Dialog isOpen={open()} onOpenChange={setOpen}>
          <DialogTrigger>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Restored</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }

    render(() => <Restored />);
    await settle();
    await settle();
    expect(screen.getByRole("dialog")).toBeTruthy();

    // And it is a real one: Escape reaches it and the owner hears about it.
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
