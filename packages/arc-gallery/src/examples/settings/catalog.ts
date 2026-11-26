import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "settings",
  title: "Settings",
  description:
    "Settings pages, sections and rows that apply at once, plan-locked features, notification preferences, calendar feeds, a danger zone and member invitations.",
  examples: [
    {
      id: "settings-layout",
      title: "Settings page",
      description:
        "Sections in a side navigation, each with its own form whose Save waits for a change, one with a footer of its own, and a danger zone that asks first. On a narrow screen the list comes first.",
      covers: ["SettingsLayout", "SettingsSection", "DangerZone"],
    },
    {
      id: "setting-rows",
      title: "Setting rows and plan locks",
      description:
        "Switches that apply at once and flip back with the reason when refused, a select row with its save state, a row locked by plan with a way to lift it, modules that turn on and off together, a read-only section and a feature the plan leaves out.",
      covers: ["SettingRow", "FeatureToggles", "PlanGate", "SettingsSection"],
    },
    {
      id: "notification-preferences",
      title: "Notification preferences",
      description:
        "Kinds of notice by channel, a row per group that sets them all, a channel that cannot be used yet, a locked kind, and delays per urgency with a saved value the list no longer offers.",
      covers: ["PreferenceMatrix"],
    },
    {
      id: "calendar-feed",
      title: "Calendar feeds",
      description:
        "A feed to copy and open in Google, Apple or Outlook, one shown only once and replaced after a confirmation, and one not made yet.",
      covers: ["CalendarFeed"],
    },
    {
      id: "account-theme",
      title: "Theme on the account",
      description:
        "The theme saved to the reader's account and restored from it, winning once it loads, with a failed save kept on this device.",
      covers: ["useThemeAccountSync", "ThemeToggle"],
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
