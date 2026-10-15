import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog.tsx";
import { Button } from "./button.tsx";

/** The portal builds on a microtask after the marker connects. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function Fixture() {
  return (
    <AlertDialog>
      <AlertDialogTrigger>
        <Button variant="destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>!</AlertDialogMedia>
          <AlertDialogTitle>Delete the project?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Delete it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

async function open(): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await settle();
}

describe("AlertDialog", () => {
  test("every part carries upstream's slot name", async () => {
    render(() => <Fixture />);
    await open();

    for (const slot of [
      "alert-dialog-overlay",
      "alert-dialog-content",
      "alert-dialog-header",
      "alert-dialog-media",
      "alert-dialog-title",
      "alert-dialog-description",
      "alert-dialog-footer",
      "alert-dialog-cancel",
      "alert-dialog-action",
    ]) {
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
  });

  test("the content says its size and its state, and so does the trigger", async () => {
    render(() => <Fixture />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    expect(trigger.getAttribute("data-state")).toBe("closed");
    await open();

    const content = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement;
    expect(content.getAttribute("data-size")).toBe("sm");
    expect(content.getAttribute("data-state")).toBe("open");
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(
      document.querySelector('[data-slot="alert-dialog-overlay"]')?.getAttribute("data-state"),
    ).toBe("open");
  });

  test("it is named and described, and focus starts on the way out that changes nothing", async () => {
    render(() => <Fixture />);
    await open();

    const dialog = screen.getByRole("alertdialog");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Delete the project?",
    );
    expect(
      document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("This cannot be undone.");
    expect(document.activeElement?.textContent).toBe("Cancel");
  });

  test("Tab stays inside it", async () => {
    render(() => <Fixture />);
    await open();

    expect(document.activeElement?.textContent).toBe("Cancel");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Delete it");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Cancel");
  });

  test("AlertDialogOverlay styles the element behind it", async () => {
    render(() => (
      <AlertDialog>
        <AlertDialogTrigger>
          <Button>Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogPortal>
          <AlertDialogOverlay class="frosted" />
          <AlertDialogContent>
            <AlertDialogTitle>Sure?</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    ));
    await open();

    const underlay = document.querySelector('[data-slot="alert-dialog-overlay"]') as HTMLElement;
    expect(underlay.hasAttribute("data-barq-underlay")).toBe(true);
    expect(underlay.classList.contains("frosted")).toBe(true);
    expect(rulesFor(underlay.className)).toContain("position: fixed");
  });

  test("AlertDialogPortal sends it to a container of the caller's", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    render(() => (
      <AlertDialog>
        <AlertDialogTrigger>
          <Button>Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogPortal container={container}>
          <AlertDialogContent>
            <AlertDialogTitle>Sure?</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    ));
    await open();

    expect(container.contains(screen.getByRole("alertdialog"))).toBe(true);
    await user.keyboard("{Escape}");
    await settle();
    container.remove();
  });

  test("the action and the cancel are buttons with upstream's defaults", async () => {
    render(() => <Fixture />);
    await open();

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const action = screen.getByRole("button", { name: "Delete it" });
    expect(cancel.getAttribute("data-variant")).toBe("outline");
    expect(action.getAttribute("data-variant")).toBe("destructive");
    expect(cancel.getAttribute("data-size")).toBe("default");
  });

  test("the footer's corners and the header's alignment follow the text direction", async () => {
    render(() => <Fixture />);
    await open();

    const footer = rulesFor(
      (document.querySelector('[data-slot="alert-dialog-footer"]') as HTMLElement).className,
    );
    expect(footer).toContain("border-end-end-radius:");
    expect(footer).not.toContain("border-bottom-left-radius:");

    const header = rulesFor(
      (document.querySelector('[data-slot="alert-dialog-header"]') as HTMLElement).className,
    );
    expect(header).toContain("text-align: start");
    expect(header).not.toContain("text-align: left");
  });
});
