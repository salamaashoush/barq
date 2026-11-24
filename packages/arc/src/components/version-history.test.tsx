import { describe, expect, test } from "bun:test";
import { type Child, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import { type VersionEntry, VersionHistory } from "./version-history.tsx";

const HERE = import.meta.dir;
const NOW = new Date("2026-05-01T12:00:00Z");
const ME = { id: "me", name: "Salama Ashoush" };
const ALEX = { id: "alex", name: "Alex Doe" };

const VERSIONS: VersionEntry[] = [
  {
    id: "v3",
    author: ME,
    createdAt: "2026-05-01T11:00:00Z",
    label: "v3",
    summary: "Tightened the intro",
    current: true,
  },
  {
    id: "v2",
    author: ALEX,
    createdAt: "2026-04-30T09:00:00Z",
    label: "v2",
    summary: "Added pricing",
  },
  { id: "v1", author: ME, createdAt: "2026-04-29T09:00:00Z", label: "v1" },
];

const TEXT: Record<string, string> = { v3: "Third draft", v2: "Second draft", v1: "First draft" };

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

function history(extra: Partial<Parameters<typeof VersionHistory>[0]> = {}) {
  return (
    <VersionHistory
      versions={VERSIONS}
      now={NOW}
      renderPreview={(version) => <p>{TEXT[version.id]}</p>}
      {...extra}
    />
  );
}

describe("VersionHistory", () => {
  test("lists the versions newest first, each with its author and time, the current marked", async () => {
    render(() => history());
    const region = screen.getByRole("region", { name: "Version history" });
    const rows = within(within(region).getByRole("grid", { name: "Versions" })).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("Current");
    expect(rows[1]?.textContent).toContain("Alex Doe · Added pricing");
    expect(rows[1]?.querySelector("time")).not.toBeNull();
    expect(slot("version-history-preview")?.textContent).toBe("Third draft");
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows and a press choose a version to preview", async () => {
    const chosen: string[] = [];
    render(() => history({ onSelectionChange: (id) => chosen.push(id) }));
    user.tab();
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");
    await settle();
    expect(chosen).toEqual(["v2"]);
    expect(slot("version-history-preview")?.textContent).toBe("Second draft");
    user.tap(screen.getAllByRole("row")[2] as HTMLElement);
    await settle();
    expect(slot("version-history-preview")?.textContent).toBe("First draft");
  });

  test("compare sets the version against the current one or the one before", async () => {
    render(() => history({ defaultSelectedId: "v2" }));
    await user.click(screen.getByRole("button", { name: "Compare" }));
    await settle();
    const panes = [...document.querySelectorAll('[data-slot="version-history-pane"]')];
    expect(panes.map((pane) => pane.textContent)).toEqual([
      "Original: v2Second draft",
      "Modified: v3Third draft",
    ]);
    const base = screen.getByRole<HTMLSelectElement>("combobox", { name: "Compare with" });
    base.value = "previous";
    base.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(
      [...document.querySelectorAll('[data-slot="version-history-pane"]')].map(
        (pane) => pane.textContent,
      ),
    ).toEqual(["Original: v1First draft", "Modified: v2Second draft"]);
  });

  test("a compare of its own takes the older and the newer", async () => {
    const [view, setView] = createSignal<"preview" | "compare">("compare");
    render(() =>
      history({
        view: view(),
        onViewChange: setView,
        defaultSelectedId: "v1",
        renderCompare: (older, newer) => <pre>{`${older.id} -> ${newer.id}`}</pre>,
      }),
    );
    expect(document.querySelector("pre")?.textContent).toBe("v1 -> v3");
    user.click(screen.getByRole("button", { name: "Preview" }));
    await settle();
    expect(view()).toBe("preview");
  });

  test("Restore asks first, stays pending, and says so when it fails", async () => {
    let fail: () => void = () => {};
    const restored: string[] = [];
    render(() => (
      <>
        <ConfirmHost />
        {history({
          defaultSelectedId: "v2",
          onRestore: (version) => {
            restored.push(version.id);
            return new Promise<void>((_resolve, reject) => {
              fail = () => reject(new Error("no"));
            });
          },
        })}
      </>
    ));
    const button = screen.getByRole("button", { name: "Restore" });
    expect(wears(button, touch.target)).toBe(true);
    await user.click(button);
    await settle();
    const dialog = screen.getByRole("alertdialog", { name: "Restore v2?" });
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restored).toEqual(["v2"]));
    await settle();
    expect(slot("version-history-restore")?.getAttribute("aria-disabled")).toBe("true");
    fail();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "The version could not be restored. Try again.",
      ),
    );
  });

  test("shows loading rows, then an empty state", async () => {
    const [loading, setLoading] = createSignal(true);
    render(() => <VersionHistory versions={[]} isLoading={loading()} />);
    expect(slot("version-history-loading")?.getAttribute("aria-busy")).toBe("true");
    setLoading(false);
    await settle();
    expect(screen.getByText("No versions yet")).toBeDefined();
  });

  test("runs right to left with the locale's digits", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => <Arabic>{history()}</Arabic>);
    expect(document.querySelector("time")?.textContent).toMatch(/[٠-٩]/u);
  });

  test("takes a class per part", () => {
    render(() =>
      history({
        class: "mine",
        classes: { root: "r", list: "l", detail: "d", header: "h", preview: "p" },
      }),
    );
    const pairs = [
      ["version-history", "r"],
      ["version-history-list", "l"],
      ["version-history-detail", "d"],
      ["version-history-header", "h"],
      ["version-history-preview", "p"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name)?.classList.contains(cls)).toBe(true);
    expect(slot("version-history")?.classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { VersionHistory } from "${HERE}/version-history.tsx";
      export function Page() {
        return (
          <VersionHistory
            now={new Date("2026-05-01T12:00:00Z")}
            versions={[
              { id: "b", author: { name: "Alex Doe" }, createdAt: "2026-05-01T11:00:00Z", label: "v2", current: true },
              { id: "a", author: { name: "Sam Roe" }, createdAt: "2026-04-30T11:00:00Z", label: "v1" },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="row"]')).toHaveLength(2);
    result.unmount();
  });
});
