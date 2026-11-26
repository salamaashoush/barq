import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { hydrates, settle } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import { type SavedView, SavedViews, sameViewState } from "./saved-views.tsx";

const VIEWS: SavedView[] = [
  {
    id: "v1",
    name: "Failing in production",
    state: { status: "failing", env: "prod" },
    mine: true,
  },
  {
    id: "v2",
    name: "Slow checks",
    state: { sort: "latency" },
    mine: true,
    isDefault: true,
  },
  { id: "v3", name: "On-call board", state: { status: "open" }, mine: false, shared: true },
];

function trigger(): HTMLElement {
  return document.querySelector('[data-slot="saved-views"]') as HTMLElement;
}

async function openMenu(): Promise<HTMLElement> {
  await user.click(trigger());
  await settle();
  return waitFor(() => screen.getByRole("menu", { name: "Views" }));
}

interface ChecksProps {
  views: readonly SavedView[];
}

function Checks(props: ChecksProps) {
  return (
    <>
      <SavedViews
        param="view"
        views={props.views}
        onCreate={(draft, state) => ({ id: "new", name: draft.name, state, mine: true })}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
      <ConfirmHost />
    </>
  );
}

describe("SavedViews", () => {
  test("views grouped as the reader's own and shared, the default starred", async () => {
    render(() => (
      <SavedViews
        views={VIEWS}
        state={{}}
        onApply={() => {}}
        onCreate={() => VIEWS[0] as SavedView}
      />
    ));
    expect(trigger().textContent).toContain("Views");
    const menu = await openMenu();
    expect(within(menu).getByText("Your views")).toBeDefined();
    expect(within(menu).getByText("Shared")).toBeDefined();
    expect(within(menu).getByRole("img", { name: "Opens by default" })).toBeDefined();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Failing in production", "Slow checks", "On-call board", "Save as a new view…"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a link names the view; editing the list marks it and offers Update", async () => {
    const updates: string[] = [];
    function List() {
      return (
        <SavedViews
          param="view"
          views={VIEWS}
          onCreate={() => VIEWS[0] as SavedView}
          onUpdate={(view, state) => void updates.push(`${view.id} ${JSON.stringify(state)}`)}
        />
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/checks", component: List }] as never,
      path: "/checks?env=prod&status=failing&view=v1",
    });
    await settle();
    expect(trigger().textContent).toContain("Failing in production");
    expect(trigger().textContent).not.toContain("(edited)");
    void view.navigate("/checks?env=prod&status=passing&view=v1");
    await waitFor(() => expect(trigger().textContent).toContain("Failing in production (edited)"));
    const menu = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Update Failing in production" }));
    await settle();
    expect(updates).toEqual([`v1 {"env":"prod","status":"passing"}`]);
    view.unmount();
  });

  test("opening a view rewrites the address to its state", async () => {
    const view = await renderRoute({
      routeTree: [{ path: "/checks", component: () => <Checks views={VIEWS} /> }] as never,
      path: "/checks?status=passing&view=v1",
    });
    await settle();
    const menu = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "On-call board" }));
    await waitFor(() => expect(view.state.search().get("view")).toBe("v3"));
    expect(view.state.search().get("status")).toBe("open");
    view.unmount();
  });

  test("the default view opens once, only when the address names nothing", async () => {
    const view = await renderRoute({
      routeTree: [{ path: "/checks", component: () => <Checks views={VIEWS} /> }] as never,
      path: "/checks",
    });
    await waitFor(() => expect(view.state.search().get("view")).toBe("v2"));
    expect(view.state.search().get("sort")).toBe("latency");
    view.unmount();

    const set = await renderRoute({
      routeTree: [{ path: "/checks", component: () => <Checks views={VIEWS} /> }] as never,
      path: "/checks?status=failing",
    });
    await settle();
    expect(set.state.search().has("view")).toBe(false);
    set.unmount();
  });

  test("Save as a new view asks for a name and opens what it saved", async () => {
    const view = await renderRoute({
      routeTree: [{ path: "/checks", component: () => <Checks views={[]} /> }] as never,
      path: "/checks?status=failing",
    });
    await settle();
    const menu = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Save as a new view…" }));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Save view" }));
    const save = within(dialog).getByRole("button", { name: "Save view" });
    expect(save.hasAttribute("disabled") || save.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Mine failing");
    await user.click(within(dialog).getByRole("switch", { name: "Open the list on it" }));
    await user.click(save);
    await waitFor(() => expect(view.state.search().get("view")).toBe("new"));
    expect(view.state.search().get("status")).toBe("failing");
    view.unmount();
  });

  test("a failed save keeps the dialog open with the reason", async () => {
    render(() => (
      <SavedViews
        views={[]}
        state={{ q: "x" }}
        onApply={() => {}}
        onCreate={() => Promise.reject(new Error("A view of that name exists."))}
      />
    ));
    const menu = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Save as a new view…" }));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Save view" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Dup");
    await user.click(within(dialog).getByRole("button", { name: "Save view" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe("A view of that name exists."),
    );
  });

  test("delete asks first and closes the open view", async () => {
    const gone: string[] = [];
    const [current, setCurrent] = createSignal<string | null>("v1");
    render(() => (
      <>
        <SavedViews
          views={VIEWS}
          state={{ status: "failing", env: "prod" }}
          currentId={current()}
          onApply={(view) => setCurrent(view?.id ?? null)}
          onCreate={() => VIEWS[0] as SavedView}
          onDelete={(view) => void gone.push(view.id)}
        />
        <ConfirmHost />
      </>
    ));
    const menu = await openMenu();
    expect(within(menu).queryByRole("menuitem", { name: /Copy link/ })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: "Delete view" }));
    await settle();
    const ask = await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(gone).toEqual(["v1"]));
    await waitFor(() => expect(current()).toBeNull());
  });

  test("a shared view the reader cannot edit offers no Update, Rename or Delete", async () => {
    render(() => (
      <SavedViews
        views={VIEWS}
        state={{ status: "closed" }}
        currentId="v3"
        onApply={() => {}}
        onCreate={() => VIEWS[0] as SavedView}
        onUpdate={() => {}}
        onRename={(view) => view}
        onDelete={() => {}}
        onDefaultChange={() => {}}
      />
    ));
    const menu = await openMenu();
    const names = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(names).toContain("Open the list on it");
    expect(names.some((name) => name?.startsWith("Update"))).toBe(false);
    expect(names).not.toContain("Rename or share…");
    expect(names).not.toContain("Delete view");
  });

  test("compares state whatever the key order", () => {
    expect(sameViewState({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
    expect(sameViewState({ a: "1" }, { a: "1", b: "2" })).toBe(false);
  });

  test("runs right to left", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <SavedViews
          views={VIEWS}
          state={{}}
          onApply={() => {}}
          onCreate={() => VIEWS[0] as SavedView}
        />
      </Arabic>
    ));
    const menu = await openMenu();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { SavedViews } from "<arc>";
      const views = [{ id: "a", name: "Mine", state: { q: "x" }, mine: true }];
      export function Page() {
        return <SavedViews views={views} state={{ q: "y" }} currentId="a" onCreate={() => views[0]} />;
      }
    `);
    expect(result.container.textContent).toContain("Mine (edited)");
    result.unmount();
  });
});
