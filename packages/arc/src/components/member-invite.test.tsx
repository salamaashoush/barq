import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import {
  type InviteDraft,
  type InviteLinkDraft,
  InviteLinks,
  MemberInvite,
  type PendingInvite,
  PendingInvites,
} from "./member-invite.tsx";

const HERE = import.meta.dir;
const NOW = new Date("2026-05-01T12:00:00Z");
const ROLES = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

const INVITES: PendingInvite[] = [
  {
    id: "i1",
    email: "alex@example.com",
    role: "admin",
    invitedAt: "2026-05-01T10:00:00Z",
    invitedBy: "Salama Ashoush",
  },
  {
    id: "i2",
    email: "sam@example.com",
    role: "member",
    invitedAt: "2026-04-01T10:00:00Z",
    expired: true,
  },
];

afterEach(() => destroyAnnouncer());

function emails(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name: "Email addresses" });
}

function chips(): string[] {
  return [...document.querySelectorAll('[data-slot="member-invite"] [role="row"]')].map(
    (row) => row.textContent ?? "",
  );
}

describe("MemberInvite", () => {
  test("addresses become chips, a pasted list splits, and a malformed one stays with why", async () => {
    render(() => <MemberInvite roles={ROLES} onInvite={() => {}} />);
    emails().focus();
    await user.keyboard("alex@example.com,");
    await settle();
    await user.keyboard("not-an-email ");
    await settle();
    expect(chips().some((one) => one.includes("alex@example.com"))).toBe(true);
    expect(screen.getAllByText("not-an-email is not an email address").length).toBeGreaterThan(0);
    expect(emails().value).toBe("not-an-email");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Send hands over the addresses and the role; refused ones stay with the reason", async () => {
    const sent: InviteDraft[] = [];
    render(() => (
      <MemberInvite
        roles={ROLES}
        onInvite={async (draft) => {
          sent.push(draft);
          return { rejected: [{ email: "sam@example.com", reason: "already a member" }] };
        }}
      />
    ));
    emails().focus();
    await user.keyboard("alex@example.com sam@example.com ");
    await settle();
    await user.click(screen.getByRole("button", { name: /Role/ }));
    await settle();
    await user.click(screen.getByRole("option", { name: "Admin" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Send invites" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ emails: ["alex@example.com", "sam@example.com"], role: "admin" });
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(chips()[0]).toContain("sam@example.com");
    expect(screen.getAllByText(/already a member/).length).toBeGreaterThan(0);
  });

  test("with no address, Send says to add one", async () => {
    const sent: InviteDraft[] = [];
    render(() => <MemberInvite roles={ROLES} onInvite={(draft) => void sent.push(draft)} />);
    await user.click(screen.getByRole("button", { name: "Send invites" }));
    await waitFor(() =>
      expect(screen.getAllByText("Add at least one email address").length).toBeGreaterThan(0),
    );
    expect(sent).toHaveLength(0);
  });
});

describe("PendingInvites", () => {
  test("each invitation with its role and age, an expired one said so; Resend is pending", async () => {
    let finish: () => void = () => {};
    const resent: string[] = [];
    render(() => (
      <PendingInvites
        invites={INVITES}
        roles={ROLES}
        now={NOW}
        onResend={(invite) => {
          resent.push(invite.id);
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        }}
        onRevoke={() => {}}
      />
    ));
    const rows = within(screen.getByRole("grid", { name: "Pending invitations" })).getAllByRole(
      "row",
    );
    expect(rows[0]?.textContent).toContain("Admin · invited by Salama Ashoush");
    expect(rows[1]?.textContent).toContain("Expired");
    const resend = screen.getByRole("button", {
      name: "Resend the invitation to alex@example.com",
    });
    expect(wears(resend, touch.target)).toBe(true);
    await user.click(resend);
    await settle();
    expect(resent).toEqual(["i1"]);
    expect(resend.getAttribute("aria-disabled")).toBe("true");
    finish();
    await waitFor(() => expect(resend.getAttribute("aria-disabled")).toBeNull());
    await settle();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Revoke asks first, and a failure says so", async () => {
    const revoked: string[] = [];
    render(() => (
      <>
        <ConfirmHost />
        <PendingInvites
          invites={INVITES}
          roles={ROLES}
          onRevoke={async (invite) => {
            revoked.push(invite.id);
            throw new Error("no");
          }}
        />
      </>
    ));
    await user.click(
      screen.getByRole("button", { name: "Revoke the invitation to sam@example.com" }),
    );
    await settle();
    const dialog = screen.getByRole("alertdialog", {
      name: "Revoke the invitation to sam@example.com?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revoked).toEqual(["i2"]));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("That did not work. Try again."),
    );
  });

  test("an empty list says so", () => {
    render(() => <PendingInvites invites={[]} roles={ROLES} />);
    expect(screen.getByText("No pending invitations")).toBeDefined();
  });
});

describe("InviteLinks", () => {
  test("each link to copy with its uses and expiry; a new one from its role, uses and days", async () => {
    const made: InviteLinkDraft[] = [];
    render(() => (
      <InviteLinks
        now={NOW}
        roles={ROLES}
        links={[
          {
            id: "l1",
            url: "https://example.com/join/abc",
            role: "member",
            uses: 3,
            maxUses: 10,
            expiresAt: "2026-05-08T12:00:00Z",
          },
          { id: "l2", url: "https://example.com/join/xyz", role: "admin", uses: 1 },
        ]}
        onCreate={(draft) => void made.push(draft)}
        onDeactivate={() => {}}
      />
    ));
    const rows = within(screen.getByRole("grid", { name: "Invite links" })).getAllByRole("row");
    expect(rows[0]?.textContent).toContain("Member · 3 of 10 uses");
    expect(rows[1]?.textContent).toContain("Never expires");
    expect(within(rows[0] as HTMLElement).getByRole("button", { name: "Copy link" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() =>
      expect(made).toEqual([{ role: "member", maxUses: undefined, expiresInDays: 7 }]),
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("runs right to left, the link itself left to right", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <InviteLinks
          roles={ROLES}
          links={[{ id: "l", url: "https://example.com/j", role: "member", uses: 2 }]}
        />
      </Arabic>
    ));
    expect(
      document.querySelector('[data-slot="invite-links"]')?.closest("[dir=rtl]"),
    ).not.toBeNull();
    expect(screen.getByText("https://example.com/j").tagName.toLowerCase()).toBe("span");
  });

  test("takes a class per part", () => {
    render(() => (
      <PendingInvites
        class="mine"
        invites={INVITES}
        roles={ROLES}
        classes={{ root: "r", meta: "m" }}
      />
    ));
    const root = document.querySelector('[data-slot="pending-invites"]');
    expect(root?.classList.contains("r")).toBe(true);
    expect(root?.classList.contains("mine")).toBe(true);
    expect(document.querySelector(".m")).not.toBeNull();
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { PendingInvites } from "${HERE}/member-invite.tsx";
      export function Page() {
        return (
          <PendingInvites
            now={new Date("2026-05-01T12:00:00Z")}
            roles={[{ value: "member", label: "Member" }]}
            invites={[{ id: "a", email: "alex@example.com", role: "member", invitedAt: "2026-05-01T10:00:00Z" }]}
          />
        );
      }
    `);
    expect(result.container.textContent).toContain("alex@example.com");
    result.unmount();
  });
});
