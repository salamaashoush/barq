import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "notifications",
  title: "Notifications",
  description: "A notification centre fed live from the server, toasts and presence.",
  examples: [
    {
      id: "notification-center",
      title: "Notification centre",
      description:
        "The bell with its unread count, fed by a server-sent event stream: a new notification arrives every few seconds. Actions, mark read and mark all read.",
      covers: ["NotificationCenter", "useNotifications", "NotificationAction"],
    },
    {
      id: "notification-feed",
      title: "Notification feed",
      description:
        "The feed on a page: All and Unread filters, grouped by day, by source or not at all, loading, empty and Load more.",
      covers: ["NotificationFeed", "useNotifications", "EmptyState"],
    },
    {
      id: "toasts",
      title: "Toasts",
      description:
        "Every tone, a loading toast that becomes a success in place, one with an Undo action, and a promise.",
      covers: ["toast", "Toaster"],
    },
    {
      id: "presence",
      title: "Presence",
      description:
        "Who is online, away, not to be disturbed or offline, the status they set until it lapses, and who is typing, from one presence store.",
      covers: [
        "PresenceProvider",
        "createPresenceStore",
        "PresenceStatus",
        "PresenceDot",
        "usePresence",
        "useTyping",
        "PersonAvatar",
      ],
    },
  ],
};
