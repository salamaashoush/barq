import { describe, expect, test } from "bun:test";
import { type Incoming, signal } from "@barqjs/core";
import { accessibleName, render, screen, tick, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { Dialog, Heading, Modal } from "./dialog.tsx";

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
