import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "settings",
  title: "Settings",
  description: "Settings pages, sections, a danger zone and member invitations.",
  examples: [
    {
      id: "settings-layout",
      title: "Settings page",
      description:
        "Sections in a side navigation, each with its own form whose Save waits for a change, one with a footer of its own, and a danger zone that asks first. On a narrow screen the list comes first.",
      covers: ["SettingsLayout", "SettingsSection", "DangerZone"],
    },
    {
      id: "member-invite",
      title: "Invite members",
      description:
        "Several addresses at once with a role, checked as typed, and the ones the server refuses kept with why.",
      covers: ["MemberInvite"],
    },
    {
      id: "pending-invites",
      title: "Pending invitations",
      description: "Resend or revoke, an expired invitation marked, and an empty list.",
      covers: ["PendingInvites"],
    },
    {
      id: "invite-links",
      title: "Invite links",
      description:
        "Links to copy, with their uses and expiry, made with a role and limits, and deactivated after a confirmation.",
      covers: ["InviteLinks"],
    },
  ],
};
