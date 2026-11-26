import { describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { Outlet } from "@barqjs/router";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";
import { Button } from "@barqjs/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@barqjs/ui/dialog";

import { hydrates, settle } from "../test-arc.ts";
import {
  ModalHost,
  type ModalOwnProps,
  closeModals,
  defineModal,
  openModal,
  preloadModal,
} from "./modals.tsx";

interface PickProps extends ModalOwnProps<string> {
  question: string;
}

function PickModal(props: PickProps) {
  return (
    <Dialog isOpen={props.modal.isOpen()} onOpenChange={props.modal.onOpenChange}>
      <DialogContent>
        <DialogTitle>{props.question}</DialogTitle>
        <Button onPress={() => props.modal.resolve("teal")}>Teal</Button>
      </DialogContent>
    </Dialog>
  );
}

function counted() {
  let loads = 0;
  const modal = defineModal("pick", async () => {
    loads++;
    return PickModal;
  });
  return { modal, loads: () => loads };
}

describe("openModal", () => {
  test("fetches the modal on first open, draws it, and resolves with its result", async () => {
    const { modal, loads } = counted();
    render(() => <ModalHost />);
    const answer = openModal(modal, { question: "Which colour?" });
    await settle();
    await settle();
    expect(loads()).toBe(1);
    expect(screen.getByRole("dialog", { name: "Which colour?" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Teal" }));
    expect(await answer).toBe("teal");
    await settle();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("Escape dismisses it with no result", async () => {
    const { modal } = counted();
    render(() => <ModalHost />);
    const answer = openModal(modal, { question: "Which?" });
    await settle();
    await settle();
    await user.keyboard("{Escape}");
    expect(await answer).toBeUndefined();
  });

  test("opening the modal on top again joins it; preloading fetches once", async () => {
    const { modal, loads } = counted();
    preloadModal(modal);
    render(() => <ModalHost />);
    const first = openModal(modal, { question: "One" });
    const second = openModal(modal, { question: "Two" });
    expect(second).toBe(first);
    await settle();
    await settle();
    expect(loads()).toBe(1);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    closeModals();
    expect(await first).toBeUndefined();
  });

  test("a slow fetch shows a busy dialog; a failed one says so and tries again", async () => {
    let attempts = 0;
    const release = Promise.withResolvers<void>();
    const modal = defineModal("flaky", async () => {
      attempts++;
      if (attempts === 1) {
        await release.promise;
        throw new Error("chunk failed to load");
      }
      return PickModal;
    });
    render(() => <ModalHost />);
    const answer = openModal(modal, { question: "Late" });
    await settle();
    await waitFor(() =>
      expect(document.querySelector('[data-slot="modal-loading"]')?.getAttribute("aria-busy")).toBe(
        "true",
      ),
    );
    release.resolve();
    await settle();
    await settle();
    expect(screen.getByRole("dialog", { name: "This could not be opened" }).textContent).toContain(
      "Chunk failed to load.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    await settle();
    expect(screen.getByRole("dialog", { name: "Late" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Teal" }));
    expect(await answer).toBe("teal");
  });

  test("a change of path dismisses a modal unless it keeps on navigation", async () => {
    const [kept] = createSignal(
      defineModal("kept", async () => PickModal, { keepOnNavigation: true }),
    );
    const { modal } = counted();
    function Root() {
      return (
        <>
          <Outlet />
          <ModalHost />
        </>
      );
    }
    const view = await renderRoute({
      routeTree: [
        {
          path: "/",
          component: Root,
          children: [
            { path: "", component: () => <p>home</p> },
            { path: "other", component: () => <p>other</p> },
          ],
        },
      ] as never,
      path: "/",
    });
    const dropped = openModal(modal, { question: "Dropped" });
    const stays = openModal(kept(), { question: "Stays" });
    await settle();
    await settle();
    await view.navigate("/other");
    expect(await dropped).toBeUndefined();
    await settle();
    expect(screen.getByRole("dialog", { name: "Stays" })).toBeDefined();
    closeModals();
    expect(await stays).toBeUndefined();
    view.unmount();
  });

  test("a server's host writes nothing and hydrates in place", async () => {
    const result = await hydrates(`
      import { ModalHost } from "<arc>";
      export function Page() {
        return <main><p>Page</p><ModalHost /></main>;
      }
    `);
    expect(result.container.textContent).toBe("Page");
    result.unmount();
  });
});
