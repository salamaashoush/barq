import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { Link } from "@barqjs/router";
import { ariaViolations, screen, tick, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { ConfirmHost } from "./confirm.tsx";
import { UnsavedChangesGuard } from "./unsaved-changes-guard.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const [dirty, setDirty] = createSignal(false);

function Editor() {
  return (
    <>
      <Link to="/elsewhere">Leave</Link>
      <UnsavedChangesGuard when={dirty()} discardLabel="Throw away" />
      <ConfirmHost />
    </>
  );
}

async function open() {
  return renderRoute({
    routeTree: [
      { path: "/edit", component: Editor },
      { path: "/elsewhere", component: () => <p>Elsewhere</p> },
    ] as never,
    path: "/edit",
  });
}

describe("UnsavedChangesGuard", () => {
  test("lets a clean page go without asking", async () => {
    setDirty(false);
    const view = await open();
    await user.click(screen.getByRole("link", { name: "Leave" }));
    await waitFor(() => expect(view.state.location().pathname).toBe("/elsewhere"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    view.unmount();
  });

  test("asks before a dirty page is left, and keeping it stays", async () => {
    setDirty(true);
    const view = await open();
    await user.click(screen.getByRole("link", { name: "Leave" }));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("alertdialog"));
    expect(dialog.textContent).toContain("Discard unsaved changes?");
    expect(await ariaViolations(dialog)).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await settle();
    expect(view.state.location().pathname).toBe("/edit");
    view.unmount();
  });

  test("discarding lets the navigation through", async () => {
    setDirty(true);
    const view = await open();
    await user.click(screen.getByRole("link", { name: "Leave" }));
    await settle();
    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: "Throw away" }));
    await waitFor(() => expect(view.state.location().pathname).toBe("/elsewhere"));
    view.unmount();
  });

  test("guards closing the tab only while there is something to lose", async () => {
    setDirty(true);
    const view = await open();
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    setDirty(false);
    await settle();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    view.unmount();
  });
});
