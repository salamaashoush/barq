import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  type ActiveSession,
  ActiveSessionsList,
  type ConnectedApp,
  ConnectedAppsList,
} from "./access-lists.tsx";
import { ConfirmHost } from "./confirm.tsx";

afterEach(() => destroyAnnouncer());

const NOW = "2026-11-26T12:00:00Z";

const SESSIONS: readonly ActiveSession[] = [
  {
    id: "s1",
    client: "Firefox on macOS",
    location: "Cairo, Egypt",
    address: "203.0.113.4",
    lastActiveAt: "2026-11-26T11:59:00Z",
    current: true,
  },
  {
    id: "s2",
    client: "Safari on iPhone",
    device: "phone",
    location: "Alexandria, Egypt",
    lastActiveAt: "2026-11-25T08:00:00Z",
  },
  {
    id: "s3",
    client: "acme CLI 2.4",
    device: "terminal",
    address: "198.51.100.7",
    lastActiveAt: "2026-11-20T08:00:00Z",
  },
];

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

function rowOf(name: string): HTMLElement {
  return screen
    .getByRole("rowheader", { name: new RegExp(name) })
    .closest("[role=row]") as HTMLElement;
}

describe("ActiveSessionsList", () => {
  test("each session, this one marked and the rest signed out one by one", async () => {
    const ended: string[] = [];
    const [sessions, setSessions] = createSignal<readonly ActiveSession[]>(SESSIONS);
    render(() => (
      <ActiveSessionsList
        sessions={sessions()}
        now={NOW}
        onRevoke={(session: ActiveSession) => {
          ended.push(session.id);
          setSessions((all) => all.filter((one) => one.id !== session.id));
        }}
      />
    ));
    await settle();
    expect(screen.getByRole("grid", { name: "Sessions" })).toBeDefined();
    const mine = rowOf("Firefox on macOS");
    expect(within(mine).getByText("This device")).toBeDefined();
    expect(within(mine).queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(within(rowOf("acme CLI")).getByText("198.51.100.7")).toBeDefined();
    expect(
      within(rowOf("Safari on iPhone")).queryByRole("button", { name: /^Actions for/ }) === null,
    ).toBe(true);
    await user.click(within(rowOf("Safari on iPhone")).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(ended).toEqual(["s2"]));
    await settle();
    expect(screen.queryByText("Safari on iPhone")).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("signing out everywhere else is asked first", async () => {
    let ended = 0;
    render(() => (
      <>
        <ActiveSessionsList sessions={SESSIONS} now={NOW} onRevokeOthers={() => (ended += 1)} />
        <ConfirmHost />
      </>
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "Sign out everywhere else" }));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("alertdialog"));
    expect(dialog.textContent).toContain("The 2 other sessions end at once");
    await user.click(within(dialog).getByRole("button", { name: "Sign out everywhere else" }));
    await waitFor(() => expect(ended).toBe(1));
  });

  test("loading, failed and empty", async () => {
    let retried = 0;
    render(() => (
      <>
        <ActiveSessionsList sessions={undefined} label="Loading sessions" />
        <ActiveSessionsList
          sessions={[]}
          label="Failed sessions"
          error={{ message: "The server did not answer." }}
          onRetry={() => {
            retried += 1;
          }}
        />
        <ActiveSessionsList sessions={[]} label="No sessions" />
      </>
    ));
    await settle();
    expect(
      screen
        .getByRole("grid", { name: "Loading sessions" })
        .closest("[aria-busy]")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.getByText("The server did not answer.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retried).toBe(1);
    expect(screen.getByText("Not signed in anywhere")).toBeDefined();
  });

  test("on a right-to-left page", async () => {
    render(() => (
      <Rtl>
        <ActiveSessionsList sessions={SESSIONS.slice(0, 1)} now={NOW} />
      </Rtl>
    ));
    await settle();
    expect(screen.getByText("203.0.113.4").getAttribute("dir")).toBe("ltr");
  });
});

const APPS: readonly ConnectedApp[] = [
  {
    id: "a1",
    name: "Claude Code",
    source: "on salama-laptop",
    scopes: ["checks:read", "checks:write", "runs:trigger"],
    connectedAt: "2026-10-01T08:00:00Z",
    lastUsedAt: "2026-11-26T10:00:00Z",
    connectedBy: "Salama Ashoush",
  },
  {
    id: "a2",
    name: "Acme CI",
    source: "ci.example.com",
    scopes: ["checks:read"],
    connectedAt: "2026-09-01T08:00:00Z",
    lastUsedAt: null,
    connectedBy: "Salama Ashoush",
    blocked: "Agents are off in Acme.",
  },
];

describe("ConnectedAppsList", () => {
  test("each app with its access, its state and Disconnect, asked first", async () => {
    const gone: string[] = [];
    render(() => (
      <>
        <ConnectedAppsList
          apps={APPS}
          now={NOW}
          scopeGroups={[
            {
              label: "Checks",
              scopes: [
                { value: "checks:read" },
                { value: "checks:write", implies: ["checks:read"] },
                { value: "runs:trigger", implies: ["checks:read"] },
              ],
            },
          ]}
          onDisconnect={(app: ConnectedApp) => {
            gone.push(app.id);
          }}
        />
        <ConfirmHost />
      </>
    ));
    await settle();
    const claude = rowOf("Claude Code");
    expect(within(claude).getByText("Connected")).toBeDefined();
    expect(within(claude).getByText("checks:write")).toBeDefined();
    expect(within(claude).queryByText("checks:read")).toBeNull();
    const ci = rowOf("Acme CI");
    expect(within(ci).getByText("Blocked")).toBeDefined();
    expect(within(ci).getByText("Agents are off in Acme.")).toBeDefined();
    expect(within(ci).getByText("Never")).toBeDefined();
    await user.click(within(ci).getByRole("button", { name: /Acme CI/ }));
    await settle();
    await user.click(await waitFor(() => screen.getByRole("menuitem", { name: "Disconnect" })));
    const dialog = await waitFor(() => screen.getByRole("alertdialog"));
    expect(dialog.textContent).toContain("Disconnect Acme CI?");
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(gone).toEqual(["a2"]));
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the policy switch and the address to connect at", async () => {
    const changes: boolean[] = [];
    render(() => (
      <ConnectedAppsList
        apps={[]}
        policy={{
          allowed: true,
          onAllowedChange: (allowed: boolean) => {
            changes.push(allowed);
          },
          description: "Turning it off stops every connected agent at once.",
        }}
        endpoint="https://acme.example.com/mcp"
      />
    ));
    await settle();
    expect(screen.getByLabelText<HTMLInputElement>("Connect at").value).toBe(
      "https://acme.example.com/mcp",
    );
    expect(screen.getByText("No applications connected")).toBeDefined();
    await user.click(screen.getByRole("switch", { name: "Applications may connect" }));
    await waitFor(() => expect(changes).toEqual([false]));
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

describe("access lists on the server", () => {
  afterEach(() => viewport(1024));

  test("are hydrated in place", async () => {
    viewport(375);
    const result = await hydrates(`
      import { ActiveSessionsList, ConnectedAppsList } from "<arc>";
      const NOW = "2026-11-26T12:00:00Z";
      export function Page() {
        return (
          <div>
            <ActiveSessionsList now={NOW} onRevoke={() => {}} sessions={[
              { id: "a", client: "Firefox on macOS", lastActiveAt: NOW, current: true },
              { id: "b", client: "Safari on iPhone", device: "phone", lastActiveAt: "2026-11-25T12:00:00Z" },
            ]} />
            <ConnectedAppsList now={NOW} onDisconnect={() => {}} apps={[
              { id: "c", name: "Claude Code", connectedAt: "2026-10-01T00:00:00Z", scopes: ["checks:read"] },
            ]} />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("Claude Code");
    result.unmount();
  });
});
