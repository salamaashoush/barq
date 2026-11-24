import { createSignal } from "@barqjs/core";
import { EmptyState, Grid, type PendingInvite, PendingInvites, toast } from "@barqjs/arc";
import { MailOpen } from "@barqjs/lucide/icons/mail-open";

import { NOW } from "../../data/operations.ts";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "billing", label: "Billing" },
];

const START: PendingInvite[] = [
  {
    id: "i1",
    email: "maya@example.com",
    role: "admin",
    invitedAt: "2026-11-22T10:00:00Z",
    expiresAt: "2026-11-29T10:00:00Z",
    invitedBy: "Salama",
  },
  {
    id: "i2",
    email: "jonas@example.com",
    role: "member",
    invitedAt: "2026-11-23T15:30:00Z",
    expiresAt: "2026-11-30T15:30:00Z",
    invitedBy: "Lina",
  },
  {
    id: "i3",
    email: "nour@example.com",
    role: "billing",
    invitedAt: "2026-11-01T09:00:00Z",
    expiresAt: "2026-11-08T09:00:00Z",
    invitedBy: "Salama",
    expired: true,
  },
];

export default function PendingInvitesExample() {
  const [invites, setInvites] = createSignal(START);

  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
      <PendingInvites
        invites={invites()}
        roles={ROLES}
        now={NOW}
        onResend={async (invite) => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          setInvites((all) =>
            all.map((each) =>
              each.id === invite.id
                ? { ...each, expired: false, invitedAt: NOW, expiresAt: "2026-12-01T09:00:00Z" }
                : each,
            ),
          );
          toast.success(`Sent a new invitation to ${invite.email}`);
        }}
        onRevoke={async (invite) => {
          await new Promise((resolve) => setTimeout(resolve, 400));
          setInvites((all) => all.filter((each) => each.id !== invite.id));
        }}
      />
      <PendingInvites
        invites={[]}
        roles={ROLES}
        now={NOW}
        empty={
          <EmptyState
            icon={<MailOpen />}
            heading="No invitations waiting"
            description="Everyone you invited has joined."
          />
        }
      />
    </Grid>
  );
}
