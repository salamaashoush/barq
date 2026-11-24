import { createSignal } from "@barqjs/core";
import { type InviteLink, InviteLinks } from "@barqjs/arc";

import { NOW } from "../../data/operations.ts";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

const START: InviteLink[] = [
  {
    id: "l1",
    url: "https://acme.example.com/join/7f3k29xd",
    role: "member",
    uses: 4,
    maxUses: 25,
    expiresAt: "2026-12-24T00:00:00Z",
  },
  { id: "l2", url: "https://acme.example.com/join/q81mp0zr", role: "admin", uses: 1, maxUses: 1 },
];

export default function InviteLinksExample() {
  const [links, setLinks] = createSignal(START);
  let next = 3;

  return (
    <InviteLinks
      links={links()}
      roles={ROLES}
      now={NOW}
      onCreate={async (draft) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        const id = `l${next++}`;
        const expiresAt =
          draft.expiresInDays === undefined
            ? undefined
            : new Date(new Date(NOW).getTime() + draft.expiresInDays * 86_400_000).toISOString();
        setLinks((all) => [
          ...all,
          {
            id,
            url: `https://acme.example.com/join/${id}x9q2`,
            role: draft.role,
            uses: 0,
            maxUses: draft.maxUses,
            expiresAt,
          },
        ]);
      }}
      onDeactivate={async (link) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        setLinks((all) => all.filter((each) => each.id !== link.id));
      }}
    />
  );
}
