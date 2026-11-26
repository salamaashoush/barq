import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type ApiKey, type ApiKeyDraft, ApiKeyManager } from "./api-key-manager.tsx";
import { ConfirmHost } from "./confirm.tsx";

afterEach(() => destroyAnnouncer());

const NOW = "2026-11-26T12:00:00Z";

const KEYS: readonly ApiKey[] = [
  {
    id: "k1",
    name: "default",
    prefix: "ak_live_3f",
    scopes: ["checks:read", "checks:write"],
    lastUsedAt: "2026-11-25T12:00:00Z",
    expiresAt: "2027-02-01T00:00:00Z",
  },
  {
    id: "k2",
    name: "github-actions",
    suffix: "x7Qa",
    scopes: ["runs:trigger"],
    lastUsedAt: null,
    expiresAt: "2026-11-01T00:00:00Z",
  },
];

const GROUPS = [
  {
    label: "Checks",
    scopes: [
      { value: "checks:read" },
      { value: "checks:write", implies: ["checks:read"] },
      { value: "runs:trigger", implies: ["checks:read"] },
    ],
  },
];

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole("rowheader", { name }).closest("[role=row]") as HTMLElement;
}

describe("ApiKeyManager", () => {
  test("each key with what tells it apart, its use and its expiry, an expired one marked", async () => {
    render(() => <ApiKeyManager keys={KEYS} now={NOW} scopeGroups={GROUPS} />);
    await settle();
    const first = rowOf("default");
    expect(within(first).getByText("ak_live_3f…")).toBeDefined();
    expect(within(first).getByText("checks:write")).toBeDefined();
    expect(within(first).queryByText("checks:read")).toBeNull();
    const second = rowOf("github-actions");
    expect(within(second).getByText("…x7Qa")).toBeDefined();
    expect(within(second).getByText("Never")).toBeDefined();
    expect(within(second).getByText(/Expired/)).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a key is made with a free name, its scopes and expiry, and its secret shown once", async () => {
    const drafts: ApiKeyDraft[] = [];
    const [keys, setKeys] = createSignal<readonly ApiKey[]>(KEYS);
    render(() => (
      <ApiKeyManager
        keys={keys()}
        now={NOW}
        scopeGroups={GROUPS}
        onCreate={(draft: ApiKeyDraft) => {
          drafts.push(draft);
          const key = { id: "k3", name: draft.name, prefix: "ak_live_9e" };
          setKeys((all) => [...all, key]);
          return Promise.resolve({ secret: "ak_live_9e8d7c6b5a", key });
        }}
      />
    ));
    await settle();
    expect(screen.getByText("2 keys")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("dialog"));
    const name = within(dialog).getByLabelText<HTMLInputElement>("Name");
    expect(name.value).toBe("default-2");
    await user.click(within(dialog).getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(within(dialog).getByText("Pick at least one.")).toBeDefined());
    expect(drafts).toHaveLength(0);
    await user.click(within(dialog).getByRole("checkbox", { name: "checks:read" }));
    await user.click(within(dialog).getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(drafts[0]?.name).toBe("default-2");
    expect(drafts[0]?.scopes).toEqual(["checks:read"]);
    expect(drafts[0]?.expiresAt).toBeInstanceOf(Date);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="one-time-secret"]')?.textContent).toContain(
        "ak_live_9e8d7c6b5a",
      ),
    );
    expect(screen.getByRole("button", { name: "Copy the key" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await settle();
    expect(document.querySelector('[data-slot="one-time-secret"]')).toBeNull();
  });

  test("revoking asks first, with the box the key needs", async () => {
    const revoked: [string, boolean][] = [];
    render(() => (
      <>
        <ApiKeyManager
          keys={KEYS}
          now={NOW}
          revokeOption={(key: ApiKey) =>
            key.id === "k1" ? { label: "Also remove the 3 runners that joined with it" } : undefined
          }
          onRevoke={(key: ApiKey, also: boolean) => {
            revoked.push([key.id, also]);
          }}
        />
        <ConfirmHost />
      </>
    ));
    await settle();
    await user.click(within(rowOf("default")).getByRole("button", { name: "Actions for default" }));
    await settle();
    await user.click(await waitFor(() => screen.getByRole("menuitem", { name: "Revoke key" })));
    const dialog = await waitFor(() => screen.getByRole("alertdialog"));
    expect(dialog.textContent).toContain("Revoke default?");
    const also = within(dialog).getByRole("checkbox", {
      name: "Also remove the 3 runners that joined with it",
    });
    await user.click(also);
    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }));
    await waitFor(() => expect(revoked).toEqual([["k1", false]]));
  });

  test("no keys yet: an empty state that makes the first; loading; right to left", async () => {
    render(() => (
      <Rtl>
        <ApiKeyManager keys={[]} onCreate={() => Promise.resolve({ secret: "x" })} />
        <ApiKeyManager keys={undefined} label="Loading keys" />
      </Rtl>
    ));
    await settle();
    expect(screen.getByText("No API keys yet")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Create key" })).toHaveLength(1);
    expect(
      screen
        .getByRole("grid", { name: "Loading keys" })
        .closest("[aria-busy]")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
  });
});

interface HappyWindow {
  happyDOM: HappyPage;
}

interface HappyPage {
  setViewport(size: ViewportSize): void;
}

interface ViewportSize {
  width: number;
}

/**
 * The server answers every media query `false`, which the harness's server
 * half, run in this window, reads only at a phone's width.
 */
function viewport(width: number): void {
  (window as unknown as HappyWindow).happyDOM.setViewport({ width });
}

describe("keys on the server", () => {
  afterEach(() => viewport(1024));

  test("are hydrated in place", async () => {
    viewport(375);
    const result = await hydrates(`
      import { ApiKeyManager } from "<arc>";
      export function Page() {
        return (
          <div>
            <ApiKeyManager now="2026-11-26T12:00:00Z" keys={[{ id: "a", name: "default", prefix: "ak_3f", expiresAt: null }]}
              onCreate={() => Promise.resolve({ secret: "x" })} onRevoke={() => {}} />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("default");
    result.unmount();
  });
});
